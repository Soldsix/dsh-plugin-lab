/** Owner control remains mounted while the dedicated local runtime is disabled. */
import type {Context} from '@deepseek-ai/cordis'
import type {Entry} from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import {Remote,RemoteError,TypertRemoteService,principalOf} from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-config-editor'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from './index.ts'
import {Config as RuntimeConfig,validateConfig} from './config.ts'
import {isConfigKey} from './config-fields.ts'
import type {Config as Settings} from './config-fields.ts'
import {configRevision} from './config-revision.ts'
import {LabError} from './errors.ts'
import {saveSchema,restartSchema,startSchema,runSchema,listSchema} from './control-codecs.ts'
import type {ControlSnapshot,ControlFailure,InspectResponse,CancelResponse} from './control-types.ts'
import type {RunAdmission,RunPage,RunResult} from './types.ts'

/** Page refresh and bounded previews do not limit the authoritative report export. */
export interface ControlConfig{readonly targetEntryId:string;readonly statusRefreshMs:number;readonly previewCaptures:number;readonly previewChars:number}
/** Native controls edit exactly one lab runtime row. */
export const Config:z<ControlConfig>=z.object({targetEntryId:z.string().default('plugin-lab-runtime'),statusRefreshMs:z.number().min(250).max(60000).step(1).default(3000),previewCaptures:z.number().min(1).max(200).step(1).default(20),previewChars:z.number().min(1).max(32768).step(1).default(2048)})
declare module '@deepseek-ai/cordis'{interface Context{readonly imLabControl:LabControl}}

const problem=(reason:ControlFailure)=>new RemoteError('im-lab/control','Local lab operation could not complete',{reason})
function settings(value:unknown):Settings{
 try{
  if(typeof value!=='object'||!value||Array.isArray(value)||Object.keys(value).some(key=>!isConfigKey(key)))throw problem('config-invalid')
  const parsed:Settings=z.resolve(value,RuntimeConfig,{})[0];validateConfig(parsed);return parsed
 }catch(error){throw problem('config-invalid')}
}
function decode<T>(schema:{parse(value:unknown):T},value:unknown):T{try{return schema.parse(value)}catch(error){throw problem('request-invalid')}}
function sanitized(error:unknown):RemoteError<'im-lab/control'>{
 if(error instanceof LabError&&['capacity','source-conflict','journal-unavailable','journal-limit','journal-invalid','invalid-scenario','closed','cancelled'].includes(error.code))return problem(error.code as ControlFailure)
 return problem('apply-failed')
}

/** Native owner operations share the runtime and never create an alternate model runner. */
export class LabControl extends TypertRemoteService{
 static inject=['configEditor']
 static Config=Config
 private readonly lifetime=new AbortController()
 private readonly downloads=new Set<Promise<void>>()
 private readonly runs=new Set<Promise<RunResult>>()
 private tail:Promise<void>=Promise.resolve()
 private downloadMounted=false
 constructor(ctx:Context,private readonly config:ControlConfig){
  super(ctx,'imLabControl')
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(config.targetEntryId))throw new Error('targetEntryId must name a profile row')
  ctx.effect(()=>async()=>{this.lifetime.abort();await this.tail;await Promise.allSettled([...this.downloads,...this.runs])})
  ctx.inject(['connection'],child=>child.effect(()=>{
   const dispose=child.connection.fetch.register({path:'/api/im-lab-report',methods:['GET'],requestBody:'buffered',fetch:request=>this.download(request)})
   this.downloadMounted=true
   return async()=>{this.downloadMounted=false;await dispose()}
  }))
 }
 private owner():void{if(principalOf(this.ctx.invocation))throw problem('forbidden');if(this.lifetime.signal.aborted||this.ctx.invocation?.signal.aborted)throw problem('cancelled')}
 private target():Entry{
  const entries=this.ctx.configEditor.entries(),entry=entries.find(value=>value.options.id===this.config.targetEntryId)
  if(!entry||entry.options.name!=='dsh-plugin-lab'||!entry.fiber||entries.some(value=>value!==entry&&value.options.name==='dsh-plugin-lab'))throw problem('entry-unavailable')
  return entry
 }
 private snapshot():ControlSnapshot{
  const entry=this.target(),config=settings(entry.fiber?.effectiveConfig),runtime=this.ctx.get('imLab'),layers=this.ctx.configEditor.configuration().find(value=>value.entry===entry)
  return{config:structuredClone(config),revision:configRevision(config),appliedRevision:runtime?.configRevision??null,entryActive:entry.fiber?.state===2,entryDisabled:entry.disabled,overriddenFields:Object.keys(layers?.override??{}).filter(isConfigKey),refreshMs:this.config.statusRefreshMs,downloads:this.downloadMounted,runtime:runtime?.status()??null}
 }
 private runtime(){const runtime=this.ctx.get('imLab');if(!runtime)throw problem('runtime-unavailable');return runtime}
 private serial<T>(operation:()=>Promise<T>):Promise<T>{
  this.owner();const done=this.tail.then(()=>{if(this.lifetime.signal.aborted)throw problem('cancelled');return operation()})
  this.tail=done.then(()=>{},()=>{});return done
 }
 /** @returns saved settings and runtime metadata without reading any case bodies. */
 @Remote
 describe():Promise<ControlSnapshot>{return this.serial(async()=>this.snapshot())}
 /**
  * Save only declared fields when no local run or report stream is active.
  * @param request - expected revision and partial parsed fields.
  * @returns settings observed after the normal profile edit.
  */
 @Remote
 save(request:unknown):Promise<ControlSnapshot>{
  this.owner();const edit=decode(saveSchema,request)
  return this.serial(async()=>{
   const entry=this.target(),current=settings(entry.fiber?.effectiveConfig)
   if(configRevision(current)!==edit.revision)throw problem('revision-conflict')
   if(this.ctx.get('imLab')?.status().active||this.downloads.size)throw problem('busy')
   settings({...current,...edit.patch})
   let conflict=false
   try{await this.ctx.configEditor.edit(entry,raw=>{if(configRevision(settings(entry.fiber?.effectiveConfig))!==edit.revision){conflict=true;throw problem('revision-conflict')}return{...raw,...edit.patch}})}catch(error){throw problem(conflict?'revision-conflict':'apply-failed')}
   return this.snapshot()
  })
 }
 /**
  * Restart saved settings without clearing the report directory.
  * @param request - current revision, with no changed fields.
  * @returns freshly observed configuration and runtime state.
  */
 @Remote
 restart(request:unknown):Promise<ControlSnapshot>{
  this.owner();const edit=decode(restartSchema,request)
  return this.serial(async()=>{
   const entry=this.target(),config=settings(entry.fiber?.effectiveConfig)
   if(configRevision(config)!==edit.revision)throw problem('revision-conflict')
   if(this.ctx.get('imLab')?.status().active||this.downloads.size)throw problem('busy')
   if(!config.enabled||entry.disabled)throw problem('runtime-unavailable')
   try{await entry.fiber?.restart()}catch(error){throw problem('apply-failed')}
   return this.snapshot()
  })
 }
 /**
  * Start one durable case without tying its lifetime to the current browser page.
  * @param request - saved revision, unique identity and strict synthetic case.
  * @returns durable admission; completion is a separate inspection.
  */
 @Remote
 start(request:unknown):Promise<RunAdmission>{
  this.owner();const edit=decode(startSchema,request)
  return this.serial(async()=>{
   const state=this.snapshot(),runtime=this.runtime()
   if(edit.revision!==state.revision)throw problem('revision-conflict')
   if(!state.config.enabled||!state.entryActive||state.entryDisabled||runtime.configRevision!==edit.revision)throw problem('runtime-unavailable')
   try{
    const admission=await runtime.start({runId:edit.runId,scenario:edit.scenario},this.lifetime.signal),done=runtime.wait(edit.runId)
    this.runs.add(done);void done.then(()=>this.runs.delete(done),()=>this.runs.delete(done));return admission
   }catch(error){throw sanitized(error)}
  })
 }
 /**
  * Cancel one named run, leaving concurrent cases untouched.
  * @param request - local run identity.
  * @returns whether an active run received the cancellation.
  */
 @Remote
 cancel(request:unknown):CancelResponse{this.owner();const edit=decode(runSchema,request);try{return{requested:this.runtime().cancel(edit.runId)}}catch(error){throw sanitized(error)}}
 /**
  * Page report identities without loading their bodies.
  * @param request - optional lexical cursor.
  * @returns bounded report identities and the next cursor.
  */
 @Remote
 async list(request:unknown):Promise<RunPage>{this.owner();const edit=decode(listSchema,request);try{return await this.runtime().list(edit.after)}catch(error){throw sanitized(error)}}
 /**
  * Inspect lifecycle and a bounded public-output preview.
  * @param request - exact local report identity.
  * @returns explicit truncation counts; the downloadable report retains all original records.
  */
 @Remote
 async inspect(request:unknown):Promise<InspectResponse>{
  this.owner();const edit=decode(runSchema,request)
  try{
   const runtime=this.runtime(),active=runtime.status().activeRunIds.includes(edit.runId),stored=await runtime.inspect(edit.runId),all=stored.events.filter(event=>event.type==='capture')
   return{result:stored.result,active,incompleteTail:stored.incompleteTail,omittedCaptures:Math.max(0,all.length-this.config.previewCaptures),captures:all.slice(0,this.config.previewCaptures).map(({capture})=>{
    const text=capture.parts.filter(part=>part.type==='text').map(part=>part.text).join('\n')
    return{conversation:capture.conversation,kind:capture.kind,text:text.slice(0,this.config.previewChars),truncated:text.length>this.config.previewChars,nonTextParts:capture.parts.filter(part=>part.type!=='text').length}
   })}
  }catch(error){throw sanitized(error)}
 }
 private async download(request:Request):Promise<Response>{
  const params=new URL(request.url).searchParams
  if([...params.keys()].some(key=>key!=='runId')||params.getAll('runId').length!==1)return new Response(null,{status:400})
  const parsed=runSchema.safeParse({runId:params.get('runId')});if(!parsed.success)return new Response(null,{status:400})
  try{
   const exported=await this.runtime().export(parsed.data.runId,AbortSignal.any([request.signal,this.lifetime.signal]))
   this.downloads.add(exported.done);void exported.done.then(()=>this.downloads.delete(exported.done),()=>this.downloads.delete(exported.done))
   return new Response(exported.body,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Content-Length':String(exported.size),'Content-Disposition':`attachment; filename="${parsed.data.runId}.jsonl"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}})
  }catch(error){return new Response(null,{status:error instanceof LabError&&error.code==='capacity'?409:404})}
 }
}
export default LabControl
