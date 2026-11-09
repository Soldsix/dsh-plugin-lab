/** Install independent archives in a fresh SDK profile and test the real native Chat path. */
import assert from 'node:assert/strict'
import {pnpmScript} from './pnpm.mjs'
import {requiredProfilePeers} from './profile-peers.mjs'
import {releaseInputs} from '../release-spec.mjs'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {mkdtemp,mkdir,readFile,writeFile,copyFile,realpath} from 'node:fs/promises'
import {join,basename,relative,isAbsolute} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {setTimeout as delay} from 'node:timers/promises'
import {verifyInstalledArchive} from './verify-installed.mjs'

const root=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv
const argument=name=>{const index=args.indexOf(name);assert.ok(index>=0&&args[index+1],'Required '+name);return args[index+1]}
const library=await realpath(argument('--im-kit-archive')),chat=await realpath(argument('--chat-archive')),media=await realpath(argument('--media-archive')),job=await realpath(argument('--job-archive')),forward=await realpath(join(root,'.test-artifacts/release-inputs/dsh-qq-forward-0.1.0-development.tgz')),manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
const runs=join(root,'.test-artifacts','native');await mkdir(runs,{recursive:true})
const resume=args.indexOf('--resume-run'),resumed=resume>=0,area=resumed?await realpath(args[resume+1]):await mkdtemp(join(runs,'install-'))
const owned=relative(runs,area);assert.ok(!owned.startsWith('..')&&!isAbsolute(owned),'Resume target escaped owned native-test directory')
const attempt=await mkdtemp(join(area,'attempt-')),home=join(area,'home'),profile='plugin-lab-native',profileRoot=join(home,'profiles',profile),archives=[]
for(const source of[library,chat,join(root,'artifacts',manifest.name+'-'+manifest.version+'.tgz'),media,job,forward]){const path=join(attempt,basename(source));await copyFile(source,path);archives.push({path,name:basename(source),sha256:createHash('sha256').update(await readFile(path)).digest('hex')})}
for(const [index,name]of[[0,'dsh-im-kit'],[1,'dsh-qq-chat'],[3,'dsh-media-kit'],[4,'dsh-job-delivery'],[5,'dsh-qq-forward']])assert.equal(archives[index].sha256,releaseInputs.find(input=>input.name===name).sha256,'Public input integrity differs')
await writeFile(join(attempt,'inputs.json'),JSON.stringify(archives.map(({name,sha256})=>({name,sha256})),null,2)+'\n')
const captures=[];let active=0,peak=0,holds=0,parallelArrivals=0,releaseParallel
const parallel=new Promise(resolve=>{releaseParallel=resolve})
function marker(data){for(const message of[...data.messages??[]].reverse())if(message.role==='user')for(const block of[...typeof message.content==='string'?[{text:message.content}]:Array.isArray(message.content)?message.content:[]].reverse()){const found=typeof block.text==='string'&&block.text.match(/LAB_(?:PARALLEL_[AB]|FIFTEEN_\d+|AFTER_CANCEL|CARD_SEED|CARD_QUESTION|OUTPUT_SEED|OUTPUT_FOLLOW|FIRST|FOLLOW|HOLD)\b/);if(found)return found[0]}return'none'}
const server=createServer(async(request,response)=>{
 if(request.url==='/fixture/status'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({requests:captures.length,active,holds}));return}
 if(request.url?.endsWith('/models')){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({object:'list',data:[{id:'deepseek-flash',object:'model',owned_by:'fixture',input_modalities:['text'],output_modalities:['text'],api_capabilities:{anthropic_messages:{}}}]}));return}
 if(!request.url?.endsWith('/messages')){response.statusCode=404;response.end();return}
 let raw='';for await(const chunk of request)raw+=chunk
 const data=JSON.parse(raw),current=marker(data);captures.push(data);const serial=captures.length
 active++;peak=Math.max(peak,active);if(current==='LAB_HOLD')holds++
 const closed=new AbortController();response.once('close',()=>closed.abort())
 try{
  response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'})
  if(current.startsWith('LAB_PARALLEL_')){parallelArrivals++;if(parallelArrivals===2)releaseParallel();await Promise.race([parallel,new Promise((_,reject)=>closed.signal.addEventListener('abort',()=>reject(Error('closed')),{once:true}))])}
  if(current==='LAB_HOLD')await delay(30000,undefined,{signal:closed.signal})
  const send=(type,payload)=>response.write('event: '+type+'\ndata: '+JSON.stringify({type,...payload})+'\n\n')
  send('message_start',{message:{id:'lab-fixture-'+serial,type:'message',role:'assistant',model:data.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}})
  send('content_block_start',{index:0,content_block:{type:'thinking',thinking:'',signature:''}})
  send('content_block_delta',{index:0,delta:{type:'thinking_delta',thinking:'SYNTHETIC_NOT_PUBLIC'}})
  send('content_block_delta',{index:0,delta:{type:'signature_delta',signature:'synthetic-local-signature'}});send('content_block_stop',{index:0})
  send('content_block_start',{index:1,content_block:{type:'text',text:''}});send('content_block_delta',{index:1,delta:{type:'text_delta',text:'LAB_REPLY_'+serial}});send('content_block_stop',{index:1})
  send('message_delta',{delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:10}});send('message_stop',{});response.end()
 }catch(error){if(!closed.signal.aborted)response.destroy(error)}finally{active--;if(current==='LAB_HOLD')holds--}
})
server.listen(0,'127.0.0.1');await once(server,'listening');server.unref()
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/KEY|SECRET|TOKEN|PASSWORD/i.test(key)))
await mkdir(join(attempt,'temp'),{recursive:true})
Object.assign(env,{NPM_CONFIG_CACHE:join(root,'.npm-cache'),DSH_HOME:home,TEMP:join(attempt,'temp'),TMP:join(attempt,'temp'),DSH_PRIMARY_RUNTIME:'',DSH_SYSTEM_PROMPT:'Synthetic local Lab acceptance. No private persona or skills.',DEEPSEEK_API_KEY:'synthetic-loopback-only',DEEPSEEK_BASE_URL:'http://127.0.0.1:'+server.address().port+'/anthropic'})
const dsh=join(root,'node_modules','@deepseek-ai','dsh','lib','bin.js'),commands=[]
async function run(argv,cwd){
 const deadline=AbortSignal.timeout(300000),child=spawn(process.execPath,argv,{cwd,env,windowsHide:true,signal:deadline,stdio:['ignore','pipe','pipe']})
 await writeFile(join(attempt,'setup-live.json'),JSON.stringify({pid:child.pid,startedAt:new Date().toISOString()})+'\n')
 let stdout='',stderr='',failure;child.stdout.on('data',data=>{stdout+=data});child.stderr.on('data',data=>{stderr+=data});child.once('error',error=>{failure=error})
 const [code,signal]=await new Promise(resolve=>child.once('close',(...values)=>resolve(values)))
 commands.push({argv,code,signal,timedOut:deadline.aborted,stdout,stderr});await writeFile(join(attempt,'installation.json'),JSON.stringify(commands,null,2)+'\n')
 if(failure)throw failure;assert.equal(code,0,(stderr+"\n"+stdout).slice(-1800));return stdout
}
if(!resumed){const composition=await run([dsh,'--profile',profile,'--from-default-profile','sdk','--dump-config'],area);assert.ok(!composition.includes('@deepseek-ai/dsh-agent-preset-registry'),'SDK template now supplies a registry; update the fixture explicitly')}
const profileManifest=JSON.parse(await readFile(join(profileRoot,'package.json'),'utf8'));profileManifest.pnpm={...profileManifest.pnpm,overrides:{...manifest.overrides,...Object.fromEntries([0,3].map(index=>[releaseInputs.find(input=>input.file===archives[index].name).name,'file:'+archives[index].path.replaceAll('\\','/')]))}};await writeFile(join(profileRoot,'package.json'),JSON.stringify(profileManifest,null,2)+'\n')
await writeFile(join(profileRoot,'.npmrc'),'package-import-method=hardlink\nstore-dir='+join(root,'.test-artifacts','pnpm-store').replaceAll('\\','/')+'\ncache-dir='+join(root,'.test-artifacts','pnpm-cache').replaceAll('\\','/')+'\n')
const pnpm=await pnpmScript(root)
const peerNames=['@deepseek-ai/cordis@~4.1.0','@deepseek-ai/cordis-plugin-loader@~1.1.0','@deepseek-ai/schemastery@~3.19.0',...['agent','agent-preset-registry','app-boot','brand','llm','session','session-persistence','tools','scope','config-editor','typert-protocol','llm-deepseek-api-key','client-connection'].map(name=>'@deepseek-ai/dsh-'+name+'@0.2.2-rc.1')]
await run([pnpm,'add',archives[0].path,archives[3].path,'@deepseek-ai/dsh@0.2.2-rc.1',...peerNames,'--ignore-scripts'],profileRoot)
await run([dsh,'plugin','--profile',profile,'add',archives[4].path,'--ignore-scripts'],area);await run([dsh,'plugin','--profile',profile,'add',archives[1].path,'--ignore-scripts'],area);await run([dsh,'plugin','--profile',profile,'add',archives[2].path,'--ignore-scripts'],area);await run([dsh,'plugin','--profile',profile,'add',archives[5].path,'--ignore-scripts'],area)
for(;;){const missing=await requiredProfilePeers(profileRoot);if(!missing.length)break;await run([pnpm,'add',...missing,'--ignore-scripts'],profileRoot)}
const installedFiles={forward:await verifyInstalledArchive(archives[5].path,join(profileRoot,'node_modules','dsh-qq-forward'),join(attempt,'forward-installed-files.json')),job:await verifyInstalledArchive(archives[4].path,join(profileRoot,'node_modules','dsh-job-delivery'),join(attempt,'job-installed-files.json')),media:await verifyInstalledArchive(archives[3].path,join(profileRoot,'node_modules','dsh-media-kit'),join(attempt,'media-installed-files.json')),chat:await verifyInstalledArchive(archives[1].path,join(profileRoot,'node_modules','dsh-qq-chat'),join(attempt,'chat-installed-files.json')),lab:await verifyInstalledArchive(archives[2].path,join(profileRoot,'node_modules','dsh-plugin-lab'),join(attempt,'lab-installed-files.json'))}
await copyFile(fileURLToPath(new URL('./native-probe.mjs',import.meta.url)),join(profileRoot,'lab-native-probe.mjs'))
await copyFile(fileURLToPath(new URL('./media-fixture.mjs',import.meta.url)),join(profileRoot,'lab-media-fixture.mjs'))
await copyFile(fileURLToPath(new URL('./background-fixture.mjs',import.meta.url)),join(profileRoot,'lab-background-fixture.mjs'))
await copyFile(fileURLToPath(new URL('./forward-fixture.mjs',import.meta.url)),join(profileRoot,'lab-forward-fixture.mjs'));await copyFile(join(root,'examples/forward.case.json'),join(profileRoot,'forward.case.json'))
const overlay=[
 {id:'qq-forward',config:{enabled:true,namespace:'lab_forward_'+basename(attempt).toLowerCase().replaceAll('-','_')}},
 {id:'plugin-lab-forward',disabled:false,config:{enabled:true}},
 {id:'job-delivery',config:{enabled:true,namespace:'lab_background_'+basename(attempt).toLowerCase().replaceAll('-','_')}},
 {id:'plugin-lab-job-delivery',disabled:false},
 {id:'plugin-lab-runtime',config:{enabled:true,mediaEnabled:true,requiredBackgroundProviders:'job-delivery',namespace:'lab-'+basename(attempt).toLowerCase(),dataPath:join(attempt,'lab-data')}},
 {id:'qq-chat-runtime',config:{enabled:true,namespace:'lab-chat-'+basename(attempt).toLowerCase(),databasePath:join(attempt,'chat-state.sqlite3'),workspacePath:join(attempt,'workspace'),presetId:'lab-native-fixture',provider:'deepseek-official',model:'deepseek-flash',reasoningEffort:'off',maxTokens:128}},
 {id:'session-telemetry-otel',disabled:true},
 {insert:[{id:'lab-forward-fixture',name:pathToFileURL(join(profileRoot,'lab-forward-fixture.mjs')).href,config:{sourcePath:join(profileRoot,'forward.case.json')}},{id:'lab-background-fixture',name:pathToFileURL(join(profileRoot,'lab-background-fixture.mjs')).href},{id:'lab-media-fixture',name:pathToFileURL(join(profileRoot,'lab-media-fixture.mjs')).href},{id:'lab-preset-registry',name:'@deepseek-ai/dsh-agent-preset-registry',config:{default:'lab-native-fixture'}},{id:'lab-preset-fixture',name:'@deepseek-ai/dsh-agent-preset',config:{id:'lab-native-fixture',plugins:[]}},{id:'lab-native-probe',name:pathToFileURL(join(profileRoot,'lab-native-probe.mjs')).href,config:{resultPath:join(attempt,'result.json'),statusUrl:'http://127.0.0.1:'+server.address().port+'/fixture/status'}}]},
]
await writeFile(join(profileRoot,'cordis.patch.yml'),JSON.stringify(overlay,null,2)+'\n')
const profileDsh=join(profileRoot,'node_modules','@deepseek-ai','dsh','lib','bin.js'),child=spawn(process.execPath,[profileDsh,'--profile',profile],{cwd:area,env,windowsHide:true,stdio:['pipe','pipe','pipe']})
let stdoutBytes=0,stderrBytes=0,exitCode,result;child.stdout.on('data',data=>{stdoutBytes+=data.length});child.stderr.on('data',data=>{stderrBytes+=data.length})
const exit=once(child,'close').then(([code,signal])=>{exitCode=code;return{code,signal}})
try{
 const deadline=Date.now()+90000
 while(Date.now()<deadline){try{result=JSON.parse(await readFile(join(attempt,'result.json'),'utf8'));break}catch(error){if(error.code!=='ENOENT')throw error}assert.equal(exitCode,undefined,'SDK exited before the Lab probe');await delay(30)}
 assert.ok(result,'Lab native probe timed out');assert.equal(result.passed,true,JSON.stringify(result.error));assert.equal(captures.length,25);assert.ok(peak>=2)
 assert.ok(JSON.stringify(captures[1].messages).includes('LAB_FIRST')&&JSON.stringify(captures[1].messages).includes('LAB_REPLY_1'))
 const quoted=captures.find(data=>marker(data)==='LAB_CARD_QUESTION');assert.ok(quoted,'Native card model turn was not captured');const quotedRequest=JSON.stringify(quoted.messages);assert.ok(quotedRequest.includes('SYNTHETIC_PLATFORM_CARD')&&quotedRequest.includes('lab-in/native-lab-quoted-card-0001/seed'),'Native card or quote was lost before the model')
 const outputFollow=captures.find(data=>marker(data)==='LAB_OUTPUT_FOLLOW');assert.ok(outputFollow,'Generated output quote model turn was not captured');assert.ok(JSON.stringify(outputFollow.messages).includes('lab-out/native-lab-output-quote-0001/1'),'Generated bot message ID was lost before the model')
 for(const data of captures){const current=marker(data),match=current.match(/^LAB_FIFTEEN_(\d+)$/);if(!match)continue;const group=Number(match[1])%3;const all=JSON.stringify(data.messages);for(const seen of all.matchAll(/LAB_FIFTEEN_(\d+)\b/g))assert.equal(Number(seen[1])%3,group,'Native group context crossed conversations')}
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'shutdown',params:{}})+'\n')
 const shutdown=new AbortController();try{const stopped=await Promise.race([exit,delay(15000,undefined,{signal:shutdown.signal}).then(()=>{throw Error('Lab native shutdown timed out')})]);assert.deepEqual(stopped,{code:0,signal:null})}finally{shutdown.abort()}
 await writeFile(join(attempt,'summary.json'),JSON.stringify({passed:true,checks:result.checks,archives:archives.map(({name,sha256})=>({name,sha256})),installedFiles,nativeAdapterRequests:captures.length,peak,normalShutdown:true,realQqMessagesSent:0,realModelApiRequests:0,semanticQualityVerified:false},null,2)+'\n')
 console.log(JSON.stringify({area,attempt,passed:true,checks:result.checks,nativeAdapterRequests:captures.length,peak,realQqMessagesSent:0}))
}finally{
 if(exitCode===undefined){child.stdin.end();const fallback=setTimeout(()=>child.kill(),5000);await exit;clearTimeout(fallback)}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
 await writeFile(join(attempt,'process.json'),JSON.stringify({exitCode,stdoutBytes,stderrBytes,rawProcessOutputPersisted:false},null,2)+'\n')
 await writeFile(join(attempt,'model-metadata.json'),JSON.stringify({requests:captures.length,active,peak,markers:captures.map(marker),messageCounts:captures.map(data=>data.messages.length)},null,2)+'\n')
}
