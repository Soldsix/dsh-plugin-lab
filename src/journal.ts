/** Append-only local evidence retains source cases and never replays unfinished runs. */
import {mkdir,lstat,open,readdir,opendir} from 'node:fs/promises'
import type {FileHandle} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {ReadableStream} from 'node:stream/web'
import {join} from 'node:path'
import {z} from 'zod'
import type {Spec} from './config.ts'
import type {RunId,Scenario,JournalEvent,StoredRun,RunResult,Capture,RunPage} from './types.ts'
import type {ReportStream} from './report-stream.ts'
import {mediaScope} from 'dsh-media-kit/scoped-native'
import {scopeKey} from 'dsh-im-kit'
import {eventSchema,runIdSchema} from './schema.ts'
import {LabError} from './errors.ts'
import {scenarioFingerprint,labScope} from './identity.ts'
import {backgroundFailure,type BackgroundProviderId} from './background.ts'

const marker=z.object({application:z.literal('dsh-plugin-lab'),schema:z.literal(1),namespace:z.string()}).strict()
const isCode=(error:unknown,code:string)=>typeof error==='object'&&error!==null&&'code'in error&&error.code===code

/**
 * Count opaque attachments that have not been materialized as final bytes.
 * @param capture - structured local output, unchanged from the messaging consumer.
 * @returns media references requiring a separate byte-resolution adapter.
 */
export function unresolvedMedia(capture:Capture):number{return capture.parts.filter((part,index)=>['image','audio','video','file','forward'].includes(part.type)&&!capture.originals?.some(value=>value.partIndex===index&&'attachmentId'in part&&value.attachmentId===part.attachmentId)).length}

/**
 * Derive lifecycle counts without treating a captured reply as a quality verdict.
 * @param runId - immutable run identity.
 * @param events - validated ordered events.
 * @returns persisted terminal result, or an unfinished observation with no automatic replay.
 */
export function summarize(runId:RunId,events:readonly JournalEvent[]):RunResult{
 let inputCount=0,consumerFailures=0,unhandledInputs=0,captureCount=0,media=0
 for(const event of events){
  if(event.type==='input')inputCount++
  if(event.type==='dispatch'){consumerFailures+=event.report.failed;if(event.report.accepted===0&&event.report.failed===0)unhandledInputs++}
  if(event.type==='capture'){captureCount++;media+=unresolvedMedia(event.capture)}
  if(event.type==='ended')return event.result
 }
 return{runId,phase:'unfinished',replayed:false,inputCount,consumerFailures,unhandledInputs,captureCount,unresolvedMedia:media,failure:null}
}

async function boundedText(path:string,maxBytes:number):Promise<string>{
 const info=await lstat(path)
 if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw new LabError('journal-invalid')
 if(info.size>maxBytes)throw new LabError('journal-limit')
 const file=await open(path,'r')
 try{
  const buffer=Buffer.alloc(info.size);let offset=0
  while(offset<buffer.length){const read=await file.read(buffer,offset,buffer.length-offset,offset);if(read.bytesRead===0)throw new LabError('journal-unavailable');offset+=read.bytesRead}
  if((await file.stat()).size!==info.size)throw new LabError('journal-unavailable')
  return new TextDecoder('utf-8',{fatal:true}).decode(buffer)
 }finally{await file.close()}
}

/** Open journal owns one exclusive new file and joins all append work on close. */
export class RunJournal{
 private tail:Promise<void>=Promise.resolve()
 private stopping:Promise<void>|undefined
 private fault:LabError|undefined
 private bytes=0
 private readonly records:JournalEvent[]=[]
 private constructor(readonly runId:RunId,private readonly file:FileHandle,private readonly config:Spec){}
 /**
  * Initialize only a marked local evidence directory.
  * @param config - resolved namespace and report bounds.
  * @returns completion without modifying an unmarked nonempty directory.
  */
 static async initialize(config:Spec):Promise<void>{
  try{
   await mkdir(config.dataPath,{recursive:true,mode:0o700})
   const info=await lstat(config.dataPath)
   if(!info.isDirectory()||info.isSymbolicLink())throw new LabError('journal-invalid')
   const path=join(config.dataPath,'.lab-root.json')
   let file:FileHandle
   try{
    if((await readdir(config.dataPath)).some(name=>name!=='.lab-root.json')){
     const parsed=marker.parse(JSON.parse(await boundedText(path,config.maxRecordBytes)))
     if(parsed.namespace!==config.namespace)throw new LabError('journal-invalid')
     return
    }
    file=await open(path,'wx',0o600)
   }catch(error){
    if(!isCode(error,'EEXIST'))throw error
    const parsed=marker.parse(JSON.parse(await boundedText(path,config.maxRecordBytes)))
    if(parsed.namespace!==config.namespace)throw new LabError('journal-invalid')
    return
   }
   try{await file.writeFile(JSON.stringify({application:'dsh-plugin-lab',schema:1,namespace:config.namespace})+'\n');await file.sync()}finally{await file.close()}
  }catch(error){throw error instanceof LabError?error:new LabError('journal-unavailable')}
 }
 /**
  * Retain a complete source case before publishing its first message.
  * @param config - initialized local directory and bounded record sizes.
  * @param runId - validated filename-safe run identity.
  * @param scenario - fully validated immutable source case.
  * @returns a new exclusive writer, or existing evidence without resubmitting it.
  */
 static async claim(config:Spec,runId:RunId,scenario:Scenario,backgroundProviders:readonly BackgroundProviderId[]=[]):Promise<{created:true;journal:RunJournal}|{created:false;stored:StoredRun}>{
  const original=structuredClone(scenario)
  const header:Extract<JournalEvent,{type:'created'}>={type:'created',schema:2,runId,scenario:original,fingerprint:scenarioFingerprint(original),time:Date.now(),backgroundProviders:[...backgroundProviders],requiredBackgroundProviders:[...config.backgroundRequirements]}
  if(Buffer.byteLength(JSON.stringify(header)+'\n')>config.maxRecordBytes)throw new LabError('journal-limit')
  const path=join(config.dataPath,runId+'.jsonl')
  let file:FileHandle
  try{file=await open(path,'wx',0o600)}catch(error){
   if(!isCode(error,'EEXIST'))throw new LabError('journal-unavailable')
   const stored=await RunJournal.read(config,runId)
   if(stored.created.fingerprint!==header.fingerprint)throw new LabError('source-conflict')
   return{created:false,stored}
  }
  const journal=new RunJournal(runId,file,config)
  try{await journal.append(header);return{created:true,journal}}catch(error){await journal.close();throw error}
 }
 /**
  * Read one named local run without repairing or replaying its file.
  * @param config - report directory and bounded input size.
  * @param runId - exact validated run identity.
  * @returns validated events and an explicit incomplete-tail flag.
  */
 static async read(config:Spec,runId:RunId):Promise<StoredRun>{
  try{
   runIdSchema.parse(runId)
   const text=await boundedText(join(config.dataPath,runId+'.jsonl'),config.maxReportBytes),lines=text.split('\n'),incompleteTail=!text.endsWith('\n')
   lines.pop()
   const events=lines.map(line=>eventSchema.parse(JSON.parse(line)))
   if(incompleteTail&&events.at(-1)?.type==='ended')throw new LabError('journal-invalid')
   const created=events[0]
   if(!created||created.type!=='created'||created.runId!==runId||created.fingerprint!==scenarioFingerprint(created.scenario))throw new LabError('journal-invalid')
   const validInputs=new Set(created.scenario.stages.flatMap(stage=>stage.inputs.map(input=>input.id))),inputs=new Set<string>(),dispatches=new Set<string>(),operations=new Set<string>(),grants=new Map<string,Extract<JournalEvent,{type:'media-grant'}>['grant']>()
   const backgroundStages=new Set<string>(),backgroundTasks=new Set<string>();let backgroundProblem=false
   if(created.schema===2&&(new Set(created.backgroundProviders).size!==created.backgroundProviders.length||new Set(created.requiredBackgroundProviders).size!==created.requiredBackgroundProviders.length))throw new LabError('journal-invalid')
   for(let index=1;index<events.length;index++){
    const event=events[index]!
    if(event.type==='created')throw new LabError('journal-invalid')
    if(event.type==='input'){if(!validInputs.has(event.inputId)||inputs.has(event.inputId))throw new LabError('journal-invalid');inputs.add(event.inputId)}
    if(event.type==='dispatch'){if(!inputs.has(event.inputId)||dispatches.has(event.inputId))throw new LabError('journal-invalid');dispatches.add(event.inputId)}
    if(event.type==='background'){
     const key=event.provider+'/'+event.stage,stage=created.scenario.stages[event.stage]
     if(created.schema!==2||!created.backgroundProviders.includes(event.provider)||!stage||backgroundStages.has(key)||stage.inputs.some(input=>!dispatches.has(input.id)))throw new LabError('journal-invalid')
     for(const task of event.tasks){const taskKey=event.provider+'/'+task.id;if(backgroundTasks.has(taskKey)||!created.scenario.conversations.some(conversation=>conversation.id===task.conversation))throw new LabError('journal-invalid');backgroundTasks.add(taskKey)}
     backgroundStages.add(key);backgroundProblem||=backgroundFailure(event.tasks)!==null
    }
    if(event.type==='media-grant'){
     if(grants.has(event.grant.reference)||!created.scenario.conversations.some(conversation=>mediaScope(scopeKey(labScope(config.namespace,runId,conversation)))===event.grant.scope))throw new LabError('journal-invalid')
     grants.set(event.grant.reference,event.grant)
    }
    if(event.type==='capture'){
     const conversation=created.scenario.conversations.find(value=>value.id===event.capture.conversation)
     if(!conversation||conversation.kind!==event.capture.kind||operations.has(event.capture.operationId))throw new LabError('journal-invalid')
     const indexes=new Set<number>()
     for(const original of event.capture.originals??[]){
      const part=event.capture.parts[original.partIndex],grant=grants.get(original.attachmentId),descriptor=grant?.stored.descriptor
      if(indexes.has(original.partIndex)||!part||!('attachmentId'in part)||part.attachmentId!==original.attachmentId||!grant||grant.scope!==mediaScope(scopeKey(labScope(config.namespace,runId,conversation)))||descriptor?.sha256!==original.sha256||descriptor.fileName!==original.fileName||descriptor.mime!==original.mime||descriptor.byteLength!==original.bytes||descriptor.image?.width!==original.width||descriptor.image?.height!==original.height)throw new LabError('journal-invalid')
      indexes.add(original.partIndex)
     }
     operations.add(event.capture.operationId)
    }
    if(event.type==='ended'){
     if(index!==events.length-1||event.result.runId!==runId||event.result.replayed||event.result.phase==='unfinished')throw new LabError('journal-invalid')
     const counted=summarize(runId,events.slice(0,index))
     for(const key of['inputCount','consumerFailures','unhandledInputs','captureCount','unresolvedMedia'] as const)if(counted[key]!==event.result[key])throw new LabError('journal-invalid')
     if(event.result.phase==='completed'&&(event.result.failure!==null||inputs.size!==validInputs.size||dispatches.size!==validInputs.size||counted.consumerFailures||counted.unhandledInputs))throw new LabError('journal-invalid')
     if(event.result.phase==='completed'&&created.schema===2&&(backgroundProblem||created.requiredBackgroundProviders.some(provider=>!created.backgroundProviders.includes(provider))||backgroundStages.size!==created.scenario.stages.length*created.backgroundProviders.length))throw new LabError('journal-invalid')
     if(event.result.phase==='cancelled'&&event.result.failure!=='cancelled')throw new LabError('journal-invalid')
     if(event.result.phase==='failed'&&(event.result.failure===null||event.result.failure==='cancelled'))throw new LabError('journal-invalid')
    }
   }
   return{created,events,result:summarize(runId,events),incompleteTail}
  }catch(error){throw error instanceof LabError?error:new LabError('journal-invalid')}
 }
 /**
  * Page stored identities without reading case or reply bodies.
  * @param config - initialized report root and page bound.
  * @param after - optional lexical cursor from the preceding page.
  * @returns a bounded page and the next cursor, or null at the end.
  */
 static async list(config:Spec,after:RunId|undefined):Promise<RunPage>{
  try{
   const ids:RunId[]=[],directory=await opendir(config.dataPath)
   for await(const entry of directory){
    if(!entry.isFile()||!entry.name.endsWith('.jsonl'))continue
    const parsed=runIdSchema.safeParse(entry.name.slice(0,-6));if(!parsed.success||after!==undefined&&parsed.data<=after)continue
    ids.push(parsed.data);ids.sort();if(ids.length>config.listPageSize+1)ids.pop()
   }
   const more=ids.length>config.listPageSize;if(more)ids.pop()
   return{runIds:ids,next:more?ids.at(-1)??null:null}
  }catch(error){throw new LabError('journal-unavailable')}
 }
 /**
  * Export an exact bounded file snapshot through a cancellable native stream.
  * @param config - initialized report root and byte bound.
  * @param runId - exact validated run filename, never a path.
  * @param signal - owner request/runtime lifetime.
  * @returns original bytes and descriptor-settlement ownership; no JSON repair is performed.
  */
 static async export(config:Spec,runId:RunId,signal:AbortSignal):Promise<ReportStream>{
  let file:FileHandle|undefined
  try{
   runIdSchema.parse(runId);signal.throwIfAborted()
   const path=join(config.dataPath,runId+'.jsonl'),info=await lstat(path)
   if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw new LabError('journal-invalid')
   if(info.size>config.maxReportBytes)throw new LabError('journal-limit')
   file=await open(path,'r');const opened=await file.stat()
   if(!opened.isFile()||opened.ino!==info.ino||opened.dev!==info.dev||opened.nlink!==1||opened.size!==info.size)throw new LabError('journal-invalid')
   signal.throwIfAborted()
   if(info.size===0){await file.close();return{size:0,body:new ReadableStream<Uint8Array>({start(controller){controller.close()}}),done:Promise.resolve()}}
   const stream=file.createReadStream({start:0,end:info.size-1,autoClose:true,signal})
   const done=new Promise<void>((resolve,reject)=>{stream.once('close',resolve);stream.once('error',reject)})
   void done.catch((_error:unknown)=>{/* The caller observes stream failure through body and done. */})
   return{size:info.size,body:Readable.toWeb(stream),done}
  }catch(error){if(file)await file.close();throw signal.aborted?new LabError('cancelled'):error instanceof LabError?error:new LabError('journal-unavailable')}
 }
 /**
  * Append and fsync one event before reporting its local acceptance.
  * @param event - typed evidence; source cases and captured parts are never truncated.
  * @returns completion after prior appends and this record reach the filesystem.
  */
 append(event:JournalEvent):Promise<void>{
  if(this.stopping)return Promise.reject(new LabError('closed'))
  const record=eventSchema.parse(structuredClone(event)),line=JSON.stringify(record)+'\n',size=Buffer.byteLength(line)
  const operation=this.tail.then(async()=>{
   if(this.fault)throw this.fault
   if(size>this.config.maxRecordBytes||this.bytes+size>this.config.maxReportBytes)throw new LabError('journal-limit')
   await this.file.writeFile(line);await this.file.sync();this.bytes+=size;this.records.push(record)
  }).catch(error=>{this.fault=error instanceof LabError?error:new LabError('journal-unavailable');throw this.fault})
  this.tail=operation.catch(()=>{})
  return operation
 }
 /** @returns a detached point-in-time event projection owned by the current writer. */
 snapshot():readonly JournalEvent[]{return structuredClone(this.records)}
 /** @returns completion after every append and the exclusive file handle are joined. */
 close():Promise<void>{return this.stopping??=(async()=>{await this.tail;await this.file.close()})()}
}
