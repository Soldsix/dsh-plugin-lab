/** Browser-safe owner operations; local receipts never claim delivery to QQ. */
import type {Config,ConfigKey} from './config-fields.ts'
import type {RunId,RunResult,EngineStatus} from './types.ts'
import type {} from '@deepseek-ai/dsh-typert-protocol/types'

/** Saved configuration and independently observed runtime status. */
export interface ControlSnapshot{readonly config:Config;readonly revision:string;readonly appliedRevision:string|null;readonly entryActive:boolean;readonly entryDisabled:boolean;readonly overriddenFields:readonly ConfigKey[];readonly refreshMs:number;readonly downloads:boolean;readonly runtime:EngineStatus|null}
/** A revision-checked patch of declared lab settings. */
export interface SaveRequest{readonly revision:string;readonly patch:Partial<Config>}
/** Restart the saved runtime without removing reports. */
export interface RestartRequest{readonly revision:string}
/** Durable admission is independent of browser navigation. */
export interface StartRequest{readonly revision:string;readonly runId:RunId;readonly scenario:unknown}
/** Named local report, never a path or live destination. */
export interface RunRequest{readonly runId:RunId}
/** Optional lexical cursor from the previous report page. */
export interface ListRequest{readonly after?:RunId|undefined}
/** Cancellation acknowledges the request, not completed computation. */
export interface CancelResponse{readonly requested:boolean}
/** Bounded text preview; original structured parts remain in the downloadable report. */
export interface CapturePreview{readonly conversation:string;readonly kind:'group'|'private';readonly text:string;readonly truncated:boolean;readonly nonTextParts:number}
/** Lifecycle and preview do not assert model quality or media byte verification. */
export interface InspectResponse{readonly result:RunResult;readonly active:boolean;readonly incompleteTail:boolean;readonly captures:readonly CapturePreview[];readonly omittedCaptures:number}
/** Stable operation errors contain no native path or upstream response text. */
export type ControlFailure='forbidden'|'cancelled'|'request-invalid'|'config-invalid'|'revision-conflict'|'entry-unavailable'|'runtime-unavailable'|'busy'|'apply-failed'|'invalid-scenario'|'capacity'|'source-conflict'|'journal-unavailable'|'journal-limit'|'journal-invalid'|'closed'
declare module '@deepseek-ai/dsh-typert-protocol/types'{interface RemoteErrorDetailsMap{
 /** Owner-safe lab control failure. */
 'im-lab/control':{readonly reason:ControlFailure}
}}
