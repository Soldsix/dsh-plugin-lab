/** Run-scoped originals use the shared media service and retain native grants in the owner journal. */
import {scopeKey,type AccountRef,type AttachmentId,type ConversationScope,type MessagePart} from 'dsh-im-kit'
import {inspectOriginal,createUnclassifiedOriginal,mediaProvider,mediaSource,type OriginalMedia} from 'dsh-media-kit'
import type {ImMediaRuntime} from 'dsh-media-kit/im'
import {NativeImMediaProvider} from 'dsh-media-kit/im-native'
import {resolveReferences} from 'dsh-media-kit/scoped-native'
import type {VerbatimAttachmentStore} from 'dsh-media-kit/dsh-attachments'
import type {Spec} from './config.ts'
import {mediaStorage} from './config.ts'
import {LabError,mediaFailure} from './errors.ts'
import type {Scenario,ScenarioInput,CapturedOriginal} from './types.ts'
import type {RunJournal} from './journal.ts'

/** Native services are supplied by the isolated profile, never copied from production. */
export interface LabMediaServices{readonly runtime?:ImMediaRuntime|undefined;readonly attachments:VerbatimAttachmentStore}
/** One run owns one account provider; independent cases retain separate grants and cancellation. */
export class RunMedia{
 readonly provider:NativeImMediaProvider
 private readonly imports=new Map<string,Promise<{reference:AttachmentId;original:OriginalMedia}>>()
 /** @param config - explicit run capacities. @param services - profile-owned native capabilities. @param account - synthetic run identity. @param scenario - retained source. @param journal - durable run writer. */
 constructor(private readonly config:Spec,private readonly services:LabMediaServices&{readonly runtime:ImMediaRuntime},account:AccountRef,private readonly scenario:Scenario,journal:RunJournal){
  this.provider=new NativeImMediaProvider({account,attachments:services.attachments,storage:mediaStorage(config),references:resolveReferences({maxReferences:config.maxMediaReferences,maxOriginalBytes:config.maxMediaBytes,maxLeases:config.maxMediaOperations,maxConcurrentReads:config.maxMediaOperations}),restoredGrants:[],journal:{append:async(grant,signal)=>{if(signal.aborted)throw new LabError('cancelled');await journal.append({type:'media-grant',grant,time:Date.now()})}}})
 }
 private original(scope:ConversationScope,assetId:string,signal:AbortSignal):Promise<{reference:AttachmentId;original:OriginalMedia}>{
  const key=JSON.stringify([scopeKey(scope),assetId]),existing=this.imports.get(key);if(existing)return existing
  const task=(async()=>{
   const asset=this.scenario.assets?.find(value=>value.id===assetId);if(!asset)throw new LabError('invalid-scenario')
   const request={bytes:Buffer.from(asset.base64,'base64'),fileName:asset.fileName,source:{provider:mediaProvider('im-lab'),id:mediaSource(asset.id),kind:'fixture' as const}},policy=mediaStorage(this.config)
   const original=asset.unclassified?await createUnclassifiedOriginal(policy.inspection,request,signal):await inspectOriginal(policy.inspection,{...request,...asset.textMime?{textMime:asset.textMime}:{}},signal)
   return{original,reference:await this.services.runtime.store(scope,original,signal)}
  })().catch(error=>{throw mediaFailure(error)})
  this.imports.set(key,task);return task
 }
 /** @param scope - synthetic authenticated conversation. @param input - validated source references. @param signal - complete run lifetime. @returns actual scoped attachment parts after preserving original bytes. */
 async parts(scope:ConversationScope,input:ScenarioInput,signal:AbortSignal):Promise<readonly MessagePart[]>{
  const parts:MessagePart[]=[]
  for(const item of input.media??[]){
   const {reference,original}=await this.original(scope,item.asset,signal),descriptor=original.descriptor
   if(item.type!=='file'&&!(descriptor.detectedBy==='unclassified'&&item.type==='audio')&&!descriptor.mime.startsWith(item.type+'/'))throw new LabError('media-invalid')
   parts.push(item.type==='file'?{type:'file',attachmentId:reference,name:descriptor.fileName}:{type:item.type,attachmentId:reference})
  }
  return parts
 }
}
/** @param runtime - common media service. @param scope - exact output destination. @param parts - structured output. @param signal - capture lifetime. @returns metadata only after complete bytes and native receipts have been verified. */
export async function materialize(runtime:ImMediaRuntime,scope:ConversationScope,parts:readonly MessagePart[],signal:AbortSignal):Promise<readonly CapturedOriginal[]>{
 const originals:CapturedOriginal[]=[]
 try{
  for(const [partIndex,part] of parts.entries()){
   if(part.type!=='image'&&part.type!=='audio'&&part.type!=='video'&&part.type!=='file')continue
   const original=await runtime.read(scope,part.attachmentId,signal),d=original.descriptor
   if(part.type!=='file'&&!(d.detectedBy==='unclassified'&&part.type==='audio')&&!d.mime.startsWith(part.type+'/'))throw new LabError('media-invalid')
   originals.push({partIndex,attachmentId:part.attachmentId,fileName:d.fileName,mime:d.mime,bytes:d.byteLength,sha256:d.sha256,...d.image?{width:d.image.width,height:d.image.height}:{}})
  }
  return originals
 }catch(error){throw mediaFailure(error)}
}
