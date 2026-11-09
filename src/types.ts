/** Synthetic scenario identities and persisted observations; no live destination is accepted. */
import type {Branded} from '@deepseek-ai/dsh-brand'
import type {DispatchReport,MessagePart} from 'dsh-im-kit'

/** Operator-chosen idempotency identity for one local run. */
export type RunId=Branded<'im-lab.run'>
/** Local aliases are resolved to run-prefixed authenticated identities. */
export interface Conversation{readonly id:string;readonly kind:'group'|'private'}
/** One synthetic input; mentions of another actor never become a bot mention. */
export interface ScenarioInput{readonly id:string;readonly actor:string;readonly conversation:string;readonly text:string;readonly directed:boolean;readonly mentionActor?:string|undefined;readonly replyTo?:string|undefined;readonly replyToOutput?:{readonly stage:number;readonly index:number}|undefined;readonly card?:{readonly format:'json'|'xml';readonly content:string}|undefined}
/** Inputs in one stage enter concurrently; the next stage waits for their consumers to settle. */
export interface ScenarioStage{readonly inputs:readonly ScenarioInput[]}
/** Complete original test case is retained before admitting its first input. */
export interface Scenario{readonly title:string;readonly actors:readonly string[];readonly conversations:readonly Conversation[];readonly stages:readonly ScenarioStage[]}
/** A local observation without a semantic quality verdict. */
export interface Capture{readonly operationId:string;readonly conversation:string;readonly kind:'group'|'private';readonly parts:readonly MessagePart[];readonly messageId:string}
/** Terminal lifecycle, separate from assertions about reply correctness. */
export type RunPhase='completed'|'cancelled'|'failed'|'unfinished'
/** Stable errors exclude provider messages, paths and member content. */
export type FailureCode='capacity'|'cancelled'|'consumer-failed'|'no-consumer'|'journal-unavailable'|'journal-limit'|'journal-invalid'|'invalid-scenario'|'source-conflict'|'closed'
/** Persisted counts never describe an accepted local capture as QQ phone verification. */
export interface RunResult{readonly runId:RunId;readonly phase:RunPhase;readonly replayed:boolean;readonly inputCount:number;readonly consumerFailures:number;readonly unhandledInputs:number;readonly captureCount:number;readonly unresolvedMedia:number;readonly failure:FailureCode|null}
/** Admission acknowledges durable source retention, independently of later computation. */
export interface RunAdmission{readonly runId:RunId;readonly replayed:boolean}
/** Lexically paged stored identities require no source-body reads. */
export interface RunPage{readonly runIds:readonly RunId[];readonly next:RunId|null}
/** Metadata survives page navigation while the runtime remains active. */
export interface EngineStatus{readonly active:number;readonly activeRunIds:readonly RunId[];readonly stopping:boolean;readonly lastFailure:{readonly runId:RunId;readonly code:FailureCode}|null}
/** Events retain original inputs and structured output independently of UI lifetime. */
export type JournalEvent=
 |{readonly type:'created';readonly schema:1;readonly runId:RunId;readonly scenario:Scenario;readonly fingerprint:string;readonly time:number}
 |{readonly type:'input';readonly inputId:string;readonly time:number}
 |{readonly type:'dispatch';readonly inputId:string;readonly report:DispatchReport;readonly time:number}
 |{readonly type:'capture';readonly capture:Capture;readonly time:number}
 |{readonly type:'ended';readonly result:RunResult;readonly time:number}
/** Read-only view of an immutable request and its observed local events. */
export interface StoredRun{readonly created:Extract<JournalEvent,{type:'created'}>;readonly events:readonly JournalEvent[];readonly result:RunResult;readonly incompleteTail:boolean}
