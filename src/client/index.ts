/** Owner bundle page and app-wide feedback share the native DSH Client services. */
import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import {createSnapshotStore} from '@deepseek-ai/dsh-client-store'
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol/types'
import {controlRemote} from './remote.ts'
import {en,zh,type LocaleKey} from './locales.ts'
import {LabPage,NoticeHost,PageProblem,type Notice,type NoticeFace,type PageFace} from './page.tsx'
import styles from './style.css'
declare module '@deepseek-ai/dsh-client-ui-slots'{interface LocaleNamespaceMap{/** Owner lab settings and local observations. */imLab:LocaleKey}}
/** Native services required by the Web bundle page. */
export const inject=['remote','locale','slots']
function unwrap<T>(result:RemoteResult<T>):T{if(result.ok)return result.value;throw new PageProblem(result.error.code==='im-lab/control'?result.error.details.reason:'unavailable')}
/**
 * Mount the local lab configuration page with strict native Remote descriptors.
 * @param ctx - Client Cordis scope with native gateway, locale and slots.
 * @returns completion after namespace descriptors have been mounted.
 */
export async function apply(ctx:Context):Promise<void>{
 await ctx.remote.$mount(controlRemote)
 ctx.effect(()=>ctx.locale.register('imLab',{en,zh}))
 ctx.effect(()=>{const element=document.createElement('style');element.dataset['imLab']='true';element.textContent=styles;document.head.append(element);return()=>element.remove()})
 const notice=createSnapshotStore<Notice|null>(null);let serial=0
 ctx.inject(['remote.imLabControl'],child=>{
  const face:PageFace={read:async()=>unwrap(await child.remote.imLabControl.describe()),save:async request=>unwrap(await child.remote.imLabControl.save(request)),restart:async request=>unwrap(await child.remote.imLabControl.restart(request)),start:async request=>unwrap(await child.remote.imLabControl.start(request)),cancel:async request=>unwrap(await child.remote.imLabControl.cancel(request)),list:async request=>unwrap(await child.remote.imLabControl.list(request)),inspect:async request=>unwrap(await child.remote.imLabControl.inspect(request)),notify:(text,success)=>notice.set({id:++serial,text,success})}
  child.slots.inject('plugins.bundle.config',()=>child.slots.register({name:'plugins.bundle.config',key:'dsh-plugin-lab',locale:'imLab',inject:()=>face},LabPage))
 })
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'im-lab.notice',inject:():NoticeFace=>({hooks:{notice},dismiss:id=>{if(notice.getSnapshot()?.id===id)notice.set(null)}})},NoticeHost))
}
