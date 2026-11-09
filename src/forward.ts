/** Optional forward resolver preserves complete graphs and originals in synthetic lab reports. */
import type {Context} from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {z as json} from 'zod'
import {identifier,scopeKey,sameScope,accountKey,type MessageId,type ForwardId,type ConversationScope,type InboundMessage,type MessagePart,type AttachmentId} from 'dsh-im-kit'
import type {ImMediaRuntime} from 'dsh-media-kit/im'
import type {ForwardRuntime,ForwardNode,ForwardDocument,PreparedId} from 'dsh-qq-forward'
import type {ContentProvider,ContentInput,ContentArtifact} from './content.ts'
import {contentProviderId} from './content.ts'
import {jsonSchema} from './content-schema.ts'
import {LabError} from './errors.ts'
import type {} from './index.ts'
import type {} from 'dsh-qq-forward'

const alias=json.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),nodeSchema=json.strictObject({actor:alias.optional(),name:json.string().min(1).max(256).optional(),sourceId:alias.optional(),parts:json.array(json.unknown())}),sourceSchema=json.strictObject({nodes:json.array(json.unknown()).min(1),resources:json.array(json.strictObject({id:alias,nodes:json.array(json.unknown()).min(1)})).optional()})
const partSchema=json.discriminatedUnion('type',[
 json.strictObject({type:json.literal('text'),text:json.string()}),json.strictObject({type:json.literal('mention'),actor:alias}),
 ...(['image','audio','video','file'] as const).map(type=>json.strictObject({type:json.literal(type),asset:alias})),
 json.strictObject({type:json.literal('forward'),resource:alias}),json.strictObject({type:json.literal('inline-forward'),node:json.unknown()}),
 json.strictObject({type:json.literal('reply-input'),input:alias}),json.strictObject({type:json.literal('reply-node'),node:alias}),
])
interface Source{readonly scope:ConversationScope;readonly root:MessageId;readonly resource:ForwardId;readonly resources:ReadonlyMap<ForwardId,readonly ForwardNode[]>}

/**
 * Resolve only synthetic forward resources through the installed production forward core.
 * @param core - separately installed retained forward service.
 * @param media - current optional lab-owned original service.
 * @param provider - configured local resolver identity.
 * @returns one resolver factory without a live transport or private source lookup.
 */
export function forwardContentProvider(core:ForwardRuntime,media:()=>ImMediaRuntime|undefined,provider='qq-forward'):ContentProvider{
 return{id:contentProviderId(provider),open(request){
  const account=request.scopes[0]?.scope.account
  if(!account||account.networkId!=='im-lab'||account.accountId!=='lab-run/'+request.runId||request.scopes.some(value=>accountKey(value.scope.account)!==accountKey(account)||value.scope.peerId!=='lab-peer/'+request.runId+'/'+value.conversation))throw new LabError('content-unavailable')
  const sources=new Map<string,Source>(),messages=new Map<string,InboundMessage>(),key=(scope:ConversationScope,id:string)=>JSON.stringify([scopeKey(scope),id])
  const allowed=(scope:ConversationScope)=>request.scopes.some(value=>sameScope(value.scope,scope))
  const release=core.register({account,async read(value,signal){if(signal.aborted)throw new LabError('cancelled');const source=sources.get(key(value.scope,value.rootMessageId)),nodes=source?.resources.get(value.resourceId);return source&&nodes?{status:'resolved',nodes}:{status:'failed',code:'not-found'}},async message(scope,id,signal){if(signal.aborted)throw new LabError('cancelled');const value=messages.get(key(scope,id));return value?{claimedSender:{id:value.senderId},sourceMessageId:value.messageId,sentAt:value.sentAt,parts:value.parts}:null},async dispose(){sources.clear();messages.clear()}})
  let closed=false,closing:Promise<void>|undefined
  return{
   async input(value,input,signal){
    if(closed||!allowed(input.scope))throw new LabError('content-invalid');const source=sourceSchema.parse(value),resources=new Map<ForwardId,readonly ForwardNode[]>(),resource=(id:string)=>identifier('im.forward',input.messageId+'/resource/'+id),message=(id:string)=>identifier('im.message',input.messageId+'/node/'+id);let count=0
    const convert=async(value:unknown,depth:number):Promise<ForwardNode>=>{
     if(signal.aborted)throw new LabError('cancelled');if(depth>core.config.maxInlineDepth||++count>core.config.maxNodes)throw new LabError('content-limit')
     const node=nodeSchema.parse(value);if(node.parts.length>core.config.maxPartsPerNode)throw new LabError('content-limit')
     const parts:ForwardNode['parts'][number][]=[]
     for(const raw of node.parts){const part=partSchema.parse(raw)
      if(part.type==='text'){if(part.text.length>core.config.maxTextChars)throw new LabError('content-limit');parts.push(part)}
      else if(part.type==='mention')parts.push({type:'mention',userId:input.actorId(part.actor)})
      else if(part.type==='forward')parts.push({type:'forward',resourceId:resource(part.resource)})
      else if(part.type==='reply-input')parts.push({type:'reply',messageId:identifier('im.message','lab-in/'+request.runId+'/'+part.input)})
      else if(part.type==='reply-node')parts.push({type:'reply',messageId:message(part.node)})
      else if(part.type==='inline-forward')parts.push({type:'inline-forward',node:await convert(part.node,depth+1)})
      else parts.push(await input.media(part.type,part.asset))
     }
     return{claimedSender:{id:input.actorId(node.actor??input.input.actor),...node.name?{name:node.name}:{}},...node.sourceId?{sourceMessageId:message(node.sourceId)}:{},parts}
    }
    const root=identifier('im.forward',input.messageId+'/root'),rootNodes:ForwardNode[]=[]
    for(const node of source.nodes)rootNodes.push(await convert(node,1));resources.set(root,rootNodes)
    if((source.resources?.length??0)+1>core.config.maxResources)throw new LabError('content-limit')
    for(const entry of source.resources??[]){const id=resource(entry.id);if(resources.has(id))throw new LabError('content-invalid');const nodes:ForwardNode[]=[];for(const node of entry.nodes)nodes.push(await convert(node,1));resources.set(id,nodes)}
    const sourceKey=key(input.scope,input.messageId);if(sources.has(sourceKey))throw new LabError('content-invalid');sources.set(sourceKey,{scope:input.scope,root:input.messageId,resource:root,resources});return[{type:'forward',resourceId:root}]
   },
   async observe(message,signal){if(closed||signal.aborted)throw new LabError('cancelled');if(!allowed(message.scope))throw new LabError('content-invalid');messages.set(key(message.scope,message.messageId),structuredClone(message))},
   async capture(message,partIndex,signal):Promise<ContentArtifact|null>{
    if(closed||!allowed(message.scope))throw new LabError('content-invalid');const part=message.parts[partIndex];if(part?.type!=='forward')return null
    let document:ForwardDocument;const originals:ContentArtifact['originals'][number][]=[]
    if(/^fw-[a-f0-9]{64}$/.test(part.resourceId)){
     const id=json.string().regex(/^fw-[a-f0-9]{64}$/).transform(value=>value as PreparedId).parse(part.resourceId),record=core.inspect(message.scope,id);document=record.document
     for(const asset of record.assets)originals.push({sourceId:asset.originalId,original:await core.readOriginal(message.scope,id,asset.originalId,signal)})
    }else{
     const source=[...sources.values()].find(value=>sameScope(value.scope,message.scope)&&value.resource===part.resourceId);if(!source)return null
     document=await core.read({scope:message.scope,rootMessageId:source.root,resourceId:source.resource},signal)
     const ids=new Set<AttachmentId>(),nodes=[...document.resources.flatMap(value=>value.nodes),...document.messages.flatMap(value=>value.node?[value.node]:[])];let index=0
     while(index<nodes.length){const node=nodes[index++]!;for(const part of node.parts){if(part.type==='inline-forward')nodes.push(part.node);else if('attachmentId'in part)ids.add(part.attachmentId)}}
     for(const id of ids){const service=media();if(!service)throw new LabError('media-unavailable');originals.push({sourceId:id,original:await service.read(message.scope,id,signal)})}
    }
    return{format:'qq-forward',version:1,complete:document.complete,document:jsonSchema.parse(JSON.parse(JSON.stringify(document))),originals}
   },
   close(){closed=true;return closing??=release()},
  }
 }}
}
/** Optional resolver remains disabled until the operator selects it. */
export const Config=z.object({enabled:z.boolean().default(false),provider:z.string().default('qq-forward')})
/** Optional native resolver identity. */
export const name='plugin-lab-forward'
/** Actual retained forward service and isolated lab are independently installed. */
export const inject=['imLab','imForward']
/** @param ctx - dedicated lab profile capabilities. @param config - explicit activation and resolver identity. */
export function apply(ctx:Context,config:ReturnType<typeof Config>):void{contentProviderId(config.provider);if(!config.enabled)return;ctx.effect(()=>ctx.imLab.registerContent(forwardContentProvider(ctx.imForward,()=>ctx.get('imMedia'),config.provider)))}
