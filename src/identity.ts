/** Stable content comparison ignores object insertion order without changing original text. */
import {createHash} from 'node:crypto'
import {scopeKey,identifier,type AccountRef,type ConversationScope,type MessagePart,type OutboundMessage} from 'dsh-im-kit'
import type {Scenario,RunId,Conversation} from './types.ts'
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
/**
 * Compare every source field in protocol order while preserving array order and raw text.
 * @param scenario - complete validated or persisted source case.
 * @returns deterministic idempotency digest independent of object insertion order.
 */
export function scenarioFingerprint(scenario:Scenario):string{return hash([scenario.title,scenario.actors,scenario.conversations.map(value=>[value.id,value.kind]),...scenario.assets===undefined?[]:[['assets',scenario.assets.map(value=>[value.id,value.fileName,value.base64,value.textMime??null,value.unclassified??null])]],scenario.stages.map(stage=>stage.inputs.map(value=>[value.id,value.actor,value.conversation,value.text,value.directed,value.mentionActor??null,...value.replyTo===undefined?[]:[['replyTo',value.replyTo]],...value.media===undefined?[]:[['media',value.media.map(item=>[item.type,item.asset])]],...value.replyToOutput===undefined?[]:[['replyToOutput',value.replyToOutput.stage,value.replyToOutput.index]],...value.card===undefined?[]:[['card',value.card.format,value.card.content]]]))])}
function part(value:MessagePart):readonly unknown[]{
 switch(value.type){
  case'text':return[value.type,value.text]
  case'mention':return[value.type,value.userId]
  case'reply':return[value.type,value.messageId]
  case'image':case'audio':case'video':return[value.type,value.attachmentId]
  case'file':return[value.type,value.attachmentId,value.name]
  case'forward':return[value.type,value.resourceId]
  case'card':return[value.type,value.format,value.content]
  case'unsupported':return[value.type,value.segmentType]
  default:{const unreachable:never=value;throw new Error('Unknown local output part: '+String(unreachable))}
 }
}
/**
 * Compare exact structured output independently of object insertion order.
 * @param message - complete scoped output under one operation identity.
 * @returns content digest; a changed field under the same operation is a conflict.
 */
export function outputFingerprint(message:OutboundMessage):string{return hash([scopeKey(message.scope),message.parts.map(part)])}

/** @param namespace - profile-owned tenant name. @param runId - validated case identity. @returns the complete synthetic account without a live QQ identifier. */
export function labAccount(namespace:string,runId:RunId):AccountRef{return{tenantId:identifier('im.tenant',namespace),networkId:identifier('im.network','im-lab'),accountId:identifier('im.account','lab-run/'+runId)}}
/** @param namespace - profile-owned tenant. @param runId - case identity. @param conversation - declared synthetic conversation. @returns its exact run-scoped message/media destination. */
export function labScope(namespace:string,runId:RunId,conversation:Conversation):ConversationScope{return{account:labAccount(namespace,runId),kind:conversation.kind,peerId:identifier('im.peer','lab-peer/'+runId+'/'+conversation.id)}}
