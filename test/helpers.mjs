import {mkdir,mkdtemp} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {ImRuntime} from 'dsh-im-kit'
import {Config,resolveConfig} from '../dist/config.js'
import {LabEngine} from '../dist/engine.js'

export const root=fileURLToPath(new URL('../',import.meta.url)),runId='synthetic-local-run-0001'
export async function area(){const parent=join(root,'.test-artifacts','unit');await mkdir(parent,{recursive:true});return mkdtemp(join(parent,'case-'))}
export function scenario(patch={}){return{title:'Synthetic conversation',actors:['alice','bob'],conversations:[{id:'lounge',kind:'group'}],stages:[{inputs:[{id:'first',actor:'alice',conversation:'lounge',text:'hello\n完整原文',directed:true}]}],...patch}}
export async function setup(t,patch={}){
 const directory=await area(),spec=resolveConfig(Config({enabled:true,...patch}),directory),im=new ImRuntime(),engine=await LabEngine.open(spec,im)
 t.after(async()=>{await engine.close();await im.close()})
 return{directory,spec,im,engine}
}
export function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
export const signal=()=>new AbortController().signal
