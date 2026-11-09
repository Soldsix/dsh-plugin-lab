/** Installed structured-content resolvers run only in declared synthetic conversations. */
import {scopeKey,identifier,type ConversationScope,type InboundMessage,type OutboundMessage,type MessagePart,type MessageId,type UserId} from 'dsh-im-kit'
import type {OriginalMedia} from 'dsh-media-kit'
import type {ImMediaRuntime} from 'dsh-media-kit/im'
import type {Spec} from './config.ts'
import type {RunId,ScenarioInput} from './types.ts'
import type {ContentProviderId,JsonValue,CapturedContent} from './content-types.ts'
import {contentProviderSchema,capturedContentSchema} from './content-schema.ts'
import type {RunJournal} from './journal.ts'
import {LabError} from './errors.ts'
export type * from './content-types.ts'
/** @param value - installed resolver name. @returns a validated opaque identity. */
export function contentProviderId(value:string):ContentProviderId{return contentProviderSchema.parse(value)}
/** Exact synthetic scope and asset access for one source message. */
export interface ContentInput{readonly input:ScenarioInput;readonly scope:ConversationScope;readonly messageId:MessageId;readonly actorId:(alias:string)=>UserId;readonly media:(type:'image'|'audio'|'video'|'file',asset:string)=>Promise<MessagePart>}
/** A resolver supplies complete source data; the lab retains its originals itself. */
export interface ContentArtifact{readonly format:string;readonly version:number;readonly complete:boolean;readonly document:JsonValue;readonly originals:readonly{readonly sourceId:string;readonly original:OriginalMedia}[]}
/** One resolver lease closes after every capture and consumer using this run has settled. */
export interface ContentRun{
 /** @param value - exact retained source JSON. @param input - synthetic message and scoped assets. @param signal - complete run lifetime. @returns normalized parts without live account authority. */input(value:JsonValue,input:ContentInput,signal:AbortSignal):Promise<readonly MessagePart[]>
 /** @param message - admitted synthetic input or local output snapshot. @param signal - run lifetime. @returns completion after caching any required quote context. */observe(message:InboundMessage,signal:AbortSignal):Promise<void>
 /** @param message - complete local output. @param partIndex - structured output part. @param signal - capture lifetime. @returns complete artifact, or null when this resolver does not own that part. */capture(message:OutboundMessage,partIndex:number,signal:AbortSignal):Promise<ContentArtifact|null>
 /** @returns completion after cancelling and joining owned source work. */close():Promise<void>
}
/** An installed provider owns one run lease and no live messaging connection. */
export interface ContentProvider{readonly id:ContentProviderId;/** @param request - exact run identity and synthetic scopes. @returns one independently disposable resolver lease. */open(request:{readonly runId:RunId;readonly scopes:readonly{readonly conversation:string;readonly scope:ConversationScope}[]}):ContentRun}
/** Runtime consumer validates extension output and persists artifacts before local acceptance. */
export class RunContent{
 private readonly scopes:Map<string,string>
 /** @param config - declared capture limits. @param entries - run-owned resolver leases. @param scopes - admitted synthetic destinations. @param journal - append-only source owner. @param media - optional scoped original service. */
 constructor(private readonly config:Spec,private readonly entries:readonly{readonly id:ContentProviderId;readonly run:ContentRun}[],scopes:readonly{readonly conversation:string;readonly scope:ConversationScope}[],private readonly journal:RunJournal,private readonly media:ImMediaRuntime|undefined){this.scopes=new Map(scopes.map(value=>[scopeKey(value.scope),value.conversation]))}
 /** @param input - declared source and scoped helpers. @param signal - run lifetime. @returns additional normalized parts through the selected installed providers. */
 async input(input:ContentInput,signal:AbortSignal):Promise<readonly MessagePart[]>{const parts:MessagePart[]=[];for(const source of input.input.content??[]){const entry=this.entries.find(value=>value.id===source.provider);if(!entry)throw new LabError('content-unavailable');try{parts.push(...await entry.run.input(source.value,input,signal))}catch(error){throw error instanceof LabError?error:new LabError('content-invalid')}}return parts}
 /** @param message - complete admitted source snapshot. @param signal - run lifetime. @returns resolver observation without publishing a second input. */
 async observe(message:InboundMessage,signal:AbortSignal):Promise<void>{for(const entry of this.entries)try{await entry.run.observe(structuredClone(message),signal)}catch(error){throw error instanceof LabError?error:new LabError('content-invalid')}}
 /** @param message - local output under its exact run scope. @param id - assigned local message identity. @param signal - capture lifetime. @returns durability of every resolved artifact and original mapping. */
 async capture(message:OutboundMessage,id:string,signal:AbortSignal):Promise<void>{
  const conversation=this.scopes.get(scopeKey(message.scope));if(!conversation)throw new LabError('content-invalid')
  const now=Date.now();await this.observe({scope:message.scope,messageId:identifier('im.message',id),senderId:identifier('im.user',message.scope.account.accountId),sentAt:now,receivedAt:now,directedToBot:false,parts:message.parts},signal)
  const records:CapturedContent[]=[]
  for(const[partIndex,part]of message.parts.entries()){
   if(part.type!=='forward')continue
   const settled=await Promise.allSettled(this.entries.map(async entry=>({id:entry.id,artifact:await entry.run.capture(message,partIndex,signal)})))
   const resolved:{readonly id:ContentProviderId;readonly artifact:ContentArtifact|null}[]=[]
   for(const value of settled){if(value.status==='rejected')throw value.reason instanceof LabError?value.reason:new LabError('content-invalid');resolved.push(value.value)}
   const selected=resolved.filter((value):value is{readonly id:ContentProviderId;readonly artifact:ContentArtifact}=>value.artifact!==null);if(selected.length>1)throw new LabError('content-invalid');const value=selected[0];if(!value)continue
   if(records.length>=this.config.maxArtifactsPerCapture||value.artifact.originals.length>this.config.maxMediaReferences)throw new LabError('content-limit')
   if(new Set(value.artifact.originals.map(item=>item.sourceId)).size!==value.artifact.originals.length)throw new LabError('content-invalid')
   const base={messageId:id,conversation,partIndex,provider:value.id,format:value.artifact.format,version:value.artifact.version,complete:value.artifact.complete,document:value.artifact.document}
   let record:CapturedContent;try{record=capturedContentSchema.parse({...base,originals:[]})}catch(error){throw new LabError('content-invalid')}
   if(Buffer.byteLength(JSON.stringify(record))>this.config.maxRecordBytes)throw new LabError('content-limit')
   const originals:CapturedContent['originals'][number][]=[]
   for(const item of value.artifact.originals){if(!this.media)throw new LabError('media-unavailable');if(signal.aborted)throw new LabError('cancelled');originals.push({sourceId:item.sourceId,attachmentId:await this.media.store(message.scope,item.original,signal)})}
   try{records.push(capturedContentSchema.parse({...record,originals}))}catch(error){throw new LabError('content-invalid')}
  }
  for(const content of records){if(signal.aborted)throw new LabError('cancelled');await this.journal.append({type:'content',content,time:Date.now()})}
 }
}
