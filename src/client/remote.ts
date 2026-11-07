/** Explicit Client codecs for the native owner control namespace. */
import type {RemoteResult,TypertRemoteContribution} from '@deepseek-ai/dsh-typert-protocol/types'
import type {ControlSnapshot,SaveRequest,RestartRequest,StartRequest,RunRequest,ListRequest,CancelResponse,InspectResponse} from '../control-types.ts'
import type {RunAdmission,RunPage} from '../types.ts'
import {saveSchema,restartSchema,startSchema,runSchema,listSchema,snapshotSchema,admissionSchema,pageSchema,cancelSchema,inspectSchema} from '../control-codecs.ts'

declare module '@deepseek-ai/dsh-typert-protocol/types'{interface TypertRemoteNamespaceMap{
 /** Owner-only configuration and synthetic scenario lifecycle. */
 imLabControl:{describe():Promise<RemoteResult<ControlSnapshot>>;save(request:SaveRequest):Promise<RemoteResult<ControlSnapshot>>;restart(request:RestartRequest):Promise<RemoteResult<ControlSnapshot>>;start(request:StartRequest):Promise<RemoteResult<RunAdmission>>;cancel(request:RunRequest):Promise<RemoteResult<CancelResponse>>;list(request:ListRequest):Promise<RemoteResult<RunPage>>;inspect(request:RunRequest):Promise<RemoteResult<InspectResponse>>}
}}
/** Calls and replies are strictly parsed before entering browser state. */
export const controlRemote:TypertRemoteContribution={package:'dsh-plugin-lab',descriptors:['describe','save','restart','start','cancel','list','inspect'].map(method=>({
 id:`imLabControl/${method}`,service:'imLabControl',namespace:'imLabControl',method,invocation:{kind:'direct'},
 parameters:method==='describe'?[]:[{name:'request',wire:'request',source:'json',codec:{mode:'strict',typeSymbol:`dsh-plugin-lab#${method}Request`,create:()=>method==='save'?saveSchema:method==='restart'?restartSchema:method==='start'?startSchema:method==='list'?listSchema:runSchema}}],
 result:{mode:'strict',typeSymbol:`dsh-plugin-lab#${method}Response`,create:()=>method==='start'?admissionSchema:method==='cancel'?cancelSchema:method==='list'?pageSchema:method==='inspect'?inspectSchema:snapshotSchema},
}))}
