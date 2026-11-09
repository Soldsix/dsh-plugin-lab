/** Published forward code and real native domains compose with run-owned lab media. */
import {Context} from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonBackend from '@deepseek-ai/dsh-storage-json'
import {DomainFacility} from '@deepseek-ai/dsh-storage-domain'
import {ForwardRuntime,Config as ForwardConfig} from 'dsh-qq-forward'
import {forwardContentProvider} from '../dist/forward.js'
import {setupMedia,asset,png} from './media-helpers.mjs'
import {join} from 'node:path'
export const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')
export async function forward(t,patch={}){
 const f=await setupMedia(t,patch),ctx=new Context(),storage=ctx.plugin(Storage);await storage.await();const backend=ctx.plugin(JsonBackend,{root:join(f.directory,'forward-storage')});await backend.await();const domains=new DomainFacility(ctx,{backend:'json'}),core=await ForwardRuntime.open(ForwardConfig({enabled:true,namespace:'synthetic_forward'}),{storage:domains,attachments:f.attachments,media:()=>f.runtime})
 t.after(async()=>{await core.close();await domains.closeAll();await backend.dispose();await storage.dispose()});const release=f.engine.registerContent(forwardContentProvider(core,()=>f.runtime));return{...f,ctx,domains,core,release}
}
export function source(){return{title:'Complete synthetic forward',actors:['alice','bob'],conversations:[{id:'lounge',kind:'group'}],assets:[asset('pixel',png,'original.jpg'),asset('motion',gif,'original.gif'),asset('file',Buffer.from('EXACT_HTML_ORIGINAL'),'original.html',{textMime:'text/html'})],stages:[{inputs:[{id:'quoted',actor:'alice',conversation:'lounge',text:'QUOTED_INPUT_EXACT',directed:false}]},{inputs:[{id:'forwarded',actor:'bob',conversation:'lounge',text:'Read and send this complete forward',directed:true,content:[{provider:'qq-forward',value:{nodes:[{actor:'alice',sourceId:'inner',parts:[{type:'text',text:'FORWARD_EXACT <script>never execute</script>'},{type:'image',asset:'pixel'},{type:'forward',resource:'child'},{type:'reply-input',input:'quoted'}]},{actor:'bob',parts:[{type:'reply-node',node:'inner'}]}],resources:[{id:'child',nodes:[{actor:'bob',parts:[{type:'image',asset:'motion'},{type:'file',asset:'file'}]}]}]}}]}]}]}}
