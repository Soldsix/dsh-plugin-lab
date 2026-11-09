/** Stage scheduling uses installed IM consumers and keeps each synthetic run's scope independent. */
import {ImRuntime,identifier,type AccountRef,type InboundMessage} from 'dsh-im-kit'
import {z} from 'zod'
import type {Spec} from './config.ts'
import type {RunId,Scenario,ScenarioInput,RunResult,FailureCode,StoredRun,RunAdmission,EngineStatus,RunPage} from './types.ts'
import type {ReportStream} from './report-stream.ts'
import {runIdSchema,parseScenario} from './schema.ts'
import {LabError,failureCode} from './errors.ts'
import {RunJournal,summarize} from './journal.ts'
import {CaptureTransport} from './capture.ts'
import {scenarioFingerprint} from './identity.ts'

const request=z.object({runId:runIdSchema,scenario:z.unknown()}).strict()
interface Active{readonly digest:string;readonly controller:AbortController;readonly done:Promise<RunResult>;readonly admission:Promise<RunAdmission>}

/** The engine never implements a second model runner or sends a live QQ request. */
export class LabEngine{
 private readonly lifetime=new AbortController()
 private readonly active=new Map<RunId,Active>()
 private readonly journals=new Map<RunId,RunJournal>()
 private lastFailure:EngineStatus['lastFailure']=null
 private stopping:Promise<void>|undefined
 private constructor(private readonly config:Spec,private readonly im:ImRuntime){}
 /**
  * Initialize a marked report store before admitting any run.
  * @param config - resolved limits and local evidence directory.
  * @param im - caller-owned IM runtime; only run-prefixed accounts are registered.
  * @returns ready engine without registering a model or messaging consumer.
  */
 static async open(config:Spec,im:ImRuntime):Promise<LabEngine>{await RunJournal.initialize(config);return new LabEngine(config,im)}
 /** Actual parsed operator revision, before profile-local storage resolution. */
 get configRevision():string{return this.config.operatorRevision}
 /** @returns active identities, shutdown state and safe failure metadata without source bodies. */
 status():EngineStatus{return{active:this.active.size,activeRunIds:[...this.active.keys()],stopping:this.lifetime.signal.aborted,lastFailure:this.lastFailure}}
 /**
  * Submit owner JSON through installed consumers, retaining the original complete case.
  * @param value - strict run identity and synthetic scenario, never live destinations.
  * @param signal - cancellation of this run only.
  * @returns lifecycle counts without a semantic quality or real QQ delivery claim.
  */
 run(value:unknown,signal:AbortSignal):Promise<RunResult>{
  return this.prepare(value,signal).entry.done
 }
 /**
  * Admit durable source while letting owned work continue across page navigation.
  * @param value - strict source request and run identity.
  * @param signal - task lifetime owned by the caller, independent of a short RPC call.
  * @returns acknowledgement after source durability; completion is inspected separately.
  */
 async start(value:unknown,signal:AbortSignal):Promise<RunAdmission>{const prepared=this.prepare(value,signal),admitted=await prepared.entry.admission;return{...admitted,replayed:prepared.shared||admitted.replayed}}
 private prepare(value:unknown,signal:AbortSignal):{entry:Active;shared:boolean}{
  if(this.lifetime.signal.aborted)throw new LabError('closed')
  let runId:RunId,scenario:Scenario
  try{const parsed=request.parse(value);runId=parsed.runId;scenario=parseScenario(parsed.scenario,this.config)}catch(error){throw new LabError('invalid-scenario')}
  const digest=scenarioFingerprint(scenario),existing=this.active.get(runId)
  if(existing){if(existing.digest!==digest)throw new LabError('source-conflict');return{entry:{...existing,done:existing.done.then(result=>({...result,replayed:true}))},shared:true}}
  if(this.active.size>=this.config.maxConcurrentRuns)throw new LabError('capacity')
  const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal,this.lifetime.signal,AbortSignal.timeout(this.config.runTimeoutMs)])
  let accept!:(value:RunAdmission)=>void,rejectAdmission!:(error:unknown)=>void
  const admission=new Promise<RunAdmission>((resolve,reject)=>{accept=resolve;rejectAdmission=reject})
  void admission.catch((_error:unknown)=>{/* run() observes failure through done; start() observes admission. */})
  const done=Promise.resolve().then(()=>this.execute(runId,scenario,combined,accept)).catch(error=>{rejectAdmission(error);throw error})
  const entry:Active={digest,controller,done,admission};this.active.set(runId,entry)
  void done.then(result=>{if(result.phase==='failed'&&result.failure)this.lastFailure={runId,code:result.failure};this.active.delete(runId)},error=>{this.lastFailure={runId,code:failureCode(error)};this.active.delete(runId)})
  return{entry,shared:false}
 }
 /**
  * Cancel one run without changing its siblings or automatically replaying it.
  * @param id - external run identity.
  * @returns whether an active run received cancellation.
  */
 cancel(id:unknown):boolean{
  const parsed=runIdSchema.safeParse(id);if(!parsed.success)throw new LabError('invalid-scenario')
  const value=this.active.get(parsed.data);value?.controller.abort();return Boolean(value)
 }
 /**
  * Inspect only one named evidence file without restoring its work.
  * @param id - external run identity.
  * @returns stored source, local observations and an explicit unfinished-tail state.
  */
 async inspect(id:unknown):Promise<StoredRun>{
  const parsed=runIdSchema.safeParse(id);if(!parsed.success)throw new LabError('invalid-scenario')
  const journal=this.journals.get(parsed.data)
  if(journal){const events=journal.snapshot(),created=events[0];if(!created||created.type!=='created')throw new LabError('journal-unavailable');return{created,events,result:summarize(parsed.data,events),incompleteTail:false}}
  return RunJournal.read(this.config,parsed.data)
 }
 /**
  * Join existing work without admitting or replaying any input.
  * @param id - exact local run identity.
  * @returns active completion, or a retained terminal/unfinished observation.
  */
 async wait(id:unknown):Promise<RunResult>{const parsed=runIdSchema.safeParse(id);if(!parsed.success)throw new LabError('invalid-scenario');const active=this.active.get(parsed.data);return active?active.done:(await this.inspect(parsed.data)).result}
 /**
  * List stored report identities without loading their contents.
  * @param after - optional validated lexical cursor.
  * @returns one bounded page; unchanged source files are not replayed.
  */
 list(after:unknown=undefined):Promise<RunPage>{const parsed=after===undefined?undefined:runIdSchema.safeParse(after);if(parsed&&!parsed.success)throw new LabError('invalid-scenario');return RunJournal.list(this.config,parsed?.data)}
 /**
  * Export exact report bytes after local work settles.
  * @param id - exact external run identity.
  * @param signal - owner request/runtime cancellation.
  * @returns original bounded report snapshot; active local writers are refused.
  */
 export(id:unknown,signal:AbortSignal):Promise<ReportStream>{const parsed=runIdSchema.safeParse(id);if(!parsed.success)throw new LabError('invalid-scenario');if(this.active.has(parsed.data))throw new LabError('capacity');return RunJournal.export(this.config,parsed.data,signal)}
 private message(runId:RunId,scenario:Scenario,input:ScenarioInput,account:AccountRef):InboundMessage{
  const conversation=scenario.conversations.find(value=>value.id===input.conversation)!
  const user=(alias:string)=>identifier('im.user','lab-actor/'+runId+'/'+alias)
  const now=Date.now()
  return{scope:{account,kind:conversation.kind,peerId:identifier('im.peer','lab-peer/'+runId+'/'+conversation.id)},messageId:identifier('im.message','lab-in/'+runId+'/'+input.id),senderId:user(input.actor),sentAt:now,receivedAt:now,directedToBot:input.directed,
   parts:[...input.replyTo?[{type:'reply' as const,messageId:identifier('im.message','lab-in/'+runId+'/'+input.replyTo)}]:[],...input.directed?[{type:'mention' as const,userId:identifier('im.user',account.accountId)}]:[],...input.mentionActor?[{type:'mention' as const,userId:user(input.mentionActor)}]:[],{type:'text',text:input.text},...input.card?[{type:'card' as const,format:input.card.format,content:input.card.content}]:[]]}
 }
 private async execute(runId:RunId,scenario:Scenario,signal:AbortSignal,admitted:(value:RunAdmission)=>void):Promise<RunResult>{
  const claim=await RunJournal.claim(this.config,runId,scenario)
  if(!claim.created){admitted({runId,replayed:true});return{...claim.stored.result,replayed:true}}
  admitted({runId,replayed:false});this.journals.set(runId,claim.journal)
  const journal=claim.journal,account:AccountRef={tenantId:identifier('im.tenant',this.config.namespace),networkId:identifier('im.network','im-lab'),accountId:identifier('im.account','lab-run/'+runId)}
  const provider=new CaptureTransport(account,runId,scenario,journal)
  let release:(()=>Promise<void>)|undefined,failure:FailureCode|null=null
  try{
   signal.throwIfAborted();release=this.im.register(provider)
   for(const stage of scenario.stages){
    signal.throwIfAborted()
    const settled=await Promise.allSettled(stage.inputs.map(async input=>{
     signal.throwIfAborted();await journal.append({type:'input',inputId:input.id,time:Date.now()});signal.throwIfAborted()
     const report=await this.im.publish(this.message(runId,scenario,input,account),signal)
     await journal.append({type:'dispatch',inputId:input.id,report,time:Date.now()})
    }))
    for(const outcome of settled)if(outcome.status==='rejected')failure??=signal.aborted?'cancelled':failureCode(outcome.reason)
    if(failure)break
   }
  }catch(error){failure=signal.aborted?'cancelled':failureCode(error)}
  finally{try{if(release)await release()}catch(error){failure??=failureCode(error)}}
  try{
   const counts=summarize(runId,journal.snapshot())
   failure??=provider.failure()??(counts.consumerFailures?'consumer-failed':counts.unhandledInputs?'no-consumer':null)
   if(signal.aborted)failure='cancelled'
   const result:RunResult={...counts,phase:failure==='cancelled'?'cancelled':failure?'failed':'completed',failure}
   await journal.append({type:'ended',result,time:Date.now()});return result
  }catch(error){throw error instanceof LabError?error:new LabError('journal-unavailable')}
  finally{try{await journal.close()}finally{this.journals.delete(runId)}}
 }
 /** @returns completion after aborting and joining every active run; the caller still owns IM shutdown. */
 close():Promise<void>{if(this.stopping)return this.stopping;this.lifetime.abort();return this.stopping=(async()=>{await Promise.allSettled([...this.active.values()].map(value=>value.done))})()}
}
