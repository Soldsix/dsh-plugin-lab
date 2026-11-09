/** Installed background observers keep local capture alive until their owned work settles. */
import {brandString} from '@deepseek-ai/dsh-brand'
import {z} from 'zod'
import type {FailureCode} from './types.ts'
import type {BackgroundProviderId,BackgroundTaskId,BackgroundTask} from './background-types.ts'
export type * from './background-types.ts'
/** @param value - installed provider name. @returns validated opaque identity. */
export function backgroundProviderId(value:string):BackgroundProviderId{return brandString<BackgroundProviderId>(z.string().regex(/^[a-z][a-z0-9._-]{0,79}$/).parse(value))}
/** @param value - stable provider task identity. @returns bounded opaque reference, never a filename. */
export function backgroundTaskId(value:string):BackgroundTaskId{return brandString<BackgroundTaskId>(z.string().min(1).max(256).parse(value))}
/** @param tasks - complete observed task outcomes. @returns lifecycle failure without interpreting model content. */
export function backgroundFailure(tasks:readonly BackgroundTask[]):FailureCode|null{
 if(tasks.some(task=>task.execution==='queued'||task.execution==='running'||task.execution==='uncertain'||task.outputs.pending||task.outputs.sending||task.outputs.uncertain))return'background-unresolved'
 if(tasks.some(task=>task.execution==='failed'||task.execution==='cancelled'||task.outputs.failed||task.outputs.cancelled))return'background-failed'
 return null
}
