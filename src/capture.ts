/** One run-scoped transport fsyncs exact structured output instead of contacting QQ. */
import {accountKey,identifier,type AccountRef,type ConversationScope,type OutboundMessage,type DeliveryReceipt,type ImTransport,type Availability} from 'dsh-im-kit'
import type {ImMediaRuntime} from 'dsh-media-kit/im'
import {materialize} from './media.ts'
import type {RunId,Scenario,Capture,FailureCode} from './types.ts'
import {RunJournal} from './journal.ts'
import {failureCode} from './errors.ts'
import {outputFingerprint} from './identity.ts'
import type {RunContent} from './content.ts'

/** Capture provider owns no account credentials, connection or live network endpoint. */
export class CaptureTransport implements ImTransport{
 private readonly peers=new Map<string,{id:string;kind:'group'|'private'}>()
 private readonly operations=new Map<string,{fingerprint:string;promise:Promise<DeliveryReceipt>}>()
 private readonly captured:Pick<Capture,'messageId'|'conversation'>[]=[]
 private closed=false
 private serial=0
 private lastFailure:FailureCode|null=null
 constructor(readonly account:AccountRef,private readonly runId:RunId,scenario:Scenario,private readonly journal:RunJournal,private readonly media?:ImMediaRuntime,private readonly content?:RunContent){
  for(const conversation of scenario.conversations)this.peers.set('lab-peer/'+runId+'/'+conversation.id,{id:conversation.id,kind:conversation.kind})
 }
 /** @returns the last sanitized capture failure, independently of listener completion. */
 failure():FailureCode|null{return this.lastFailure}
 /** @returns detached message identities in durable capture order, without message bodies. */
 messages():readonly Pick<Capture,'messageId'|'conversation'>[]{return this.captured.map(value=>({...value}))}
 /**
  * Check only destinations declared in this run's original source case.
  * @param scope - normalized destination supplied by the consumer.
  * @param signal - request cancellation.
  * @returns local availability without contacting a remote account.
  */
 async availability(scope:ConversationScope,signal:AbortSignal):Promise<Availability>{return!signal.aborted&&!this.closed&&accountKey(scope.account)===accountKey(this.account)&&this.peers.get(scope.peerId)?.kind===scope.kind?'available':'disabled'}
 /**
  * Persist one output once; identical operation replays share the original receipt.
  * @param message - complete structured output from the normal messaging consumer.
  * @param signal - cancellation before capture prevents admission.
  * @returns accepted local capture, never QQ server or phone verification.
  */
 send(message:OutboundMessage,signal:AbortSignal):Promise<DeliveryReceipt>{
  if(signal.aborted)return Promise.resolve({status:'failed',code:'cancelled'})
  const peer=this.peers.get(message.scope.peerId)
  if(this.closed||accountKey(message.scope.account)!==accountKey(this.account)||peer?.kind!==message.scope.kind)return Promise.resolve({status:'failed',code:'permission-denied'})
  const fingerprint=outputFingerprint(message),existing=this.operations.get(message.operationId)
  if(existing)return existing.fingerprint===fingerprint?existing.promise:Promise.resolve({status:'failed',code:'rejected'})
  const capture:Capture={operationId:message.operationId,conversation:peer.id,kind:peer.kind,parts:structuredClone(message.parts),messageId:'lab-out/'+this.runId+'/'+(++this.serial)}
  const promise=(async():Promise<DeliveryReceipt>=>{
   try{await this.content?.capture(message,capture.messageId,signal);const originals=this.media?await materialize(this.media,message.scope,message.parts,signal):undefined;const retained:Capture={...capture,...originals?{originals}: {}};await this.journal.append({type:'capture',capture:retained,time:Date.now()});this.captured.push({messageId:capture.messageId,conversation:capture.conversation});return{status:'accepted',messageIds:[identifier('im.message',capture.messageId)]}}
   catch(error){this.lastFailure=failureCode(error);throw error}
  })()
  this.operations.set(message.operationId,{fingerprint,promise});return promise
 }
 /** @returns completion after all admitted local captures settle; no network client is closed. */
 async dispose():Promise<void>{this.closed=true;await Promise.allSettled([...this.operations.values()].map(value=>value.promise))}
}
