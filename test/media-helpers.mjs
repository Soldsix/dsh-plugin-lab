/** Native media fixtures use only synthetic data and isolated profile storage. */
import {Context} from '@deepseek-ai/cordis'
import NativeStore from '@deepseek-ai/dsh-attachment-local'
import {ImRuntime} from 'dsh-im-kit'
import {ImMediaRuntime,resolveImMedia} from 'dsh-media-kit/im'
import {Config,resolveConfig} from '../dist/config.js'
import {LabEngine} from '../dist/engine.js'
import {area} from './helpers.mjs'
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/1UAAAAASUVORK5CYII=','base64')
export const asset=(id='pixel',bytes=png,fileName='pixel.jpg',extra={})=>({id,base64:Buffer.from(bytes).toString('base64'),fileName,...extra})
export function source(patch={}){return{title:'Native local media',actors:['alice','bob'],conversations:[{id:'lounge',kind:'group'}],assets:[asset()],stages:[{inputs:[{id:'first',actor:'alice',conversation:'lounge',text:'',directed:true,media:[{type:'image',asset:'pixel'}]}]}],...patch}}
export async function setupMedia(t,patch={},wrap=value=>value){
 const directory=await area(),ctx=new Context(),fiber=ctx.plugin(NativeStore,NativeStore.Config({dshHome:directory}));await fiber.await()
 const config=Config({enabled:true,mediaEnabled:true,...patch}),spec=resolveConfig(config,directory),im=new ImRuntime(),runtime=new ImMediaRuntime(resolveImMedia({maxProviders:spec.maxConcurrentRuns,maxPendingPerProvider:spec.maxMediaOperations})),attachments=wrap(ctx.get('attachments')),services={runtime,attachments},engine=await LabEngine.open(spec,im,services)
 t.after(async()=>{await engine.close();await im.close();await runtime.close();await fiber.dispose()});return{engine,im,runtime,attachments,spec,directory,services,config}
}
