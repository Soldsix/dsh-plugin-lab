/** Browser-safe background identities, metadata and trusted Host extension types. */
import type {Branded} from '@deepseek-ai/dsh-brand'
import type {ConversationScope} from 'dsh-im-kit'
import type {RunId} from './types.ts'
/** Installed provider identity, independent of model or transport names. */
export type BackgroundProviderId=Branded<'im-lab.background-provider'>
/** Opaque task identity local to one provider and run. */
export type BackgroundTaskId=Branded<'im-lab.background-task'>
/** Typed task outcomes retain pending and uncertain classifications. */
export type BackgroundState='queued'|'running'|'completed'|'failed'|'uncertain'|'cancelled'
/** Body-free task observations preserve all delivery classifications. */
export interface BackgroundTask{readonly id:BackgroundTaskId;readonly conversation:string;readonly execution:BackgroundState;readonly outputs:Readonly<Record<'pending'|'sending'|'accepted'|'failed'|'uncertain'|'cancelled',number>>}
/** Exact synthetic conversations admitted by this run. */
export interface BackgroundRequest{readonly runId:RunId;readonly scopes:readonly {readonly conversation:string;readonly scope:ConversationScope}[];readonly maxTasks:number}
/** One run owns observations and cancellation until all producer and transport resources settle. */
export interface BackgroundRun{
 /** @param signal - run cancellation and deadline. @returns newly observed tasks after their work settles; each task identity appears once per run. */settle(signal:AbortSignal):Promise<readonly BackgroundTask[]>
 /** @returns cleanup after cancelling and joining unfinished owned work; no source is replayed. */close():Promise<void>
}
/** The installed provider supplies the actual asynchronous work implementation. */
export interface BackgroundProvider{readonly id:BackgroundProviderId;/** @param request - exact synthetic scopes and declared capacity. @returns a run lease before any input is dispatched. */open(request:BackgroundRequest):BackgroundRun}
