/** Independently mounted local IM capture runtime; enabled state requires a dedicated profile. */
import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from 'dsh-im-kit/cordis'
import {ImRuntime} from 'dsh-im-kit'
import {Config,resolveConfig} from './config.ts'
import {LabEngine} from './engine.ts'
export {Config,resolveConfig}
export type * from './types.ts'
export type {ReportStream} from './report-stream.ts'
/** Native plugin identity. */
export const name='plugin-lab'
/** A profile supplies the neutral storage location; model consumers are optional and independent. */
export const inject=['profileContext']
declare module '@deepseek-ai/cordis'{interface Context{readonly imLab:LabEngine}}

/**
 * Mount a local capture provider without replacing an existing live transport.
 * @param ctx - dedicated DSH profile context.
 * @param config - parsed operator settings; disabled state opens no files.
 * @returns completion after reversible runtime installation.
 */
export async function apply(ctx:Context,config:Config):Promise<void>{
 const spec=resolveConfig(config,ctx.profileContext.dir);if(!spec)return
 if(ctx.get('im'))throw new Error('Local lab requires a dedicated profile without another IM provider')
 const im=new ImRuntime();ctx.effect(()=>()=>im.close())
 const engine=await LabEngine.open(spec,im);ctx.effect(()=>()=>engine.close())
 ctx.effect(()=>ctx.provide('im',im));ctx.effect(()=>ctx.provide('imLab',engine))
}
