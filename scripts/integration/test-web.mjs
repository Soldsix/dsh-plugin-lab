/** Install independent archives in a fresh SDK profile and test the real native Chat path. */
import assert from 'node:assert/strict'
import sharp from 'sharp'
import gifenc from 'gifenc'
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
const library=await realpath(argument('--im-kit-archive')),chat=await realpath(argument('--chat-archive')),media=await realpath(argument('--media-archive')),job=await realpath(argument('--job-archive')),manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
const runs=join(root,'.test-artifacts','native-web');await mkdir(runs,{recursive:true})
const resume=args.indexOf('--resume-run'),resumed=resume>=0,area=resumed?await realpath(args[resume+1]):await mkdtemp(join(runs,'install-'))
const owned=relative(runs,area);assert.ok(!owned.startsWith('..')&&!isAbsolute(owned),'Resume target escaped owned native-test directory')
const attempt=await mkdtemp(join(area,'attempt-')),home=join(area,'home'),profile='plugin-lab-web',profileRoot=join(home,'profiles',profile),archives=[]
for(const source of[library,chat,join(root,'artifacts',manifest.name+'-'+manifest.version+'.tgz'),media,job]){const path=join(attempt,basename(source));await copyFile(source,path);archives.push({path,name:basename(source),sha256:createHash('sha256').update(await readFile(path)).digest('hex')})}
for(const [index,name]of[[0,'dsh-im-kit'],[1,'dsh-qq-chat'],[3,'dsh-media-kit'],[4,'dsh-job-delivery']])assert.equal(archives[index].sha256,releaseInputs.find(input=>input.name===name).sha256,'Public input integrity differs')
await writeFile(join(attempt,'inputs.json'),JSON.stringify(archives.map(({name,sha256})=>({name,sha256})),null,2)+'\n')
const captures=[];let active=0,peak=0,holds=0,parallelArrivals=0,releaseParallel
const parallel=new Promise(resolve=>{releaseParallel=resolve})
function marker(data){for(const message of[...data.messages??[]].reverse())if(message.role==='user')for(const block of[...typeof message.content==='string'?[{text:message.content}]:Array.isArray(message.content)?message.content:[]].reverse()){const found=typeof block.text==='string'&&block.text.match(/LAB_(?:PARALLEL_[AB]|FIFTEEN_\d+|AFTER_CANCEL|FIRST|FOLLOW|HOLD)\b/);if(found)return found[0]}return'none'}
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
if(!resumed)await run([dsh,'--profile',profile,'--from-default-profile','web','--dump-config'],area)
const profileManifest=JSON.parse(await readFile(join(profileRoot,'package.json'),'utf8'));profileManifest.pnpm={...profileManifest.pnpm,overrides:{...manifest.overrides,...Object.fromEntries([0,3].map(index=>[releaseInputs.find(input=>input.file===archives[index].name).name,'file:'+archives[index].path.replaceAll('\\','/')]))}};await writeFile(join(profileRoot,'package.json'),JSON.stringify(profileManifest,null,2)+'\n')
await writeFile(join(profileRoot,'.npmrc'),'package-import-method=hardlink\nstore-dir='+join(root,'.test-artifacts','pnpm-store').replaceAll('\\','/')+'\ncache-dir='+join(root,'.test-artifacts','pnpm-cache').replaceAll('\\','/')+'\n')
const pnpm=await pnpmScript(root)
const peerNames=['@deepseek-ai/cordis@~4.1.0','@deepseek-ai/cordis-plugin-loader@~1.1.0','@deepseek-ai/schemastery@~3.19.0',...['agent','agent-preset-registry','app-boot','brand','llm','session','session-persistence','tools','scope','config-editor','typert-protocol','llm-deepseek-api-key','client-connection'].map(name=>'@deepseek-ai/dsh-'+name+'@0.2.2-rc.1')]
await run([pnpm,'add',archives[0].path,archives[3].path,'@deepseek-ai/dsh@0.2.2-rc.1',...peerNames,'--ignore-scripts'],profileRoot)
await run([dsh,'plugin','--profile',profile,'add',archives[4].path,'--ignore-scripts'],area);await run([dsh,'plugin','--profile',profile,'add',archives[1].path,'--ignore-scripts'],area);await run([dsh,'plugin','--profile',profile,'add',archives[2].path,'--ignore-scripts'],area)
for(;;){const missing=await requiredProfilePeers(profileRoot);if(!missing.length)break;await run([pnpm,'add',...missing,'--ignore-scripts'],profileRoot)}
const installedFiles={job:await verifyInstalledArchive(archives[4].path,join(profileRoot,'node_modules','dsh-job-delivery'),join(attempt,'job-installed-files.json')),media:await verifyInstalledArchive(archives[3].path,join(profileRoot,'node_modules','dsh-media-kit'),join(attempt,'media-installed-files.json')),chat:await verifyInstalledArchive(archives[1].path,join(profileRoot,'node_modules','dsh-qq-chat'),join(attempt,'chat-installed-files.json')),lab:await verifyInstalledArchive(archives[2].path,join(profileRoot,'node_modules','dsh-plugin-lab'),join(attempt,'lab-installed-files.json'))}
const browserIndex=args.indexOf('--browser-cache')
process.env.PLAYWRIGHT_BROWSERS_PATH=browserIndex>=0?await realpath(args[browserIndex+1]):process.env.PLAYWRIGHT_BROWSERS_PATH??join(root,'.test-artifacts','browsers')
const {chromium}=await import('playwright')
await copyFile(fileURLToPath(new URL('./media-fixture.mjs',import.meta.url)),join(profileRoot,'lab-media-fixture.mjs'))
await copyFile(fileURLToPath(new URL('./background-fixture.mjs',import.meta.url)),join(profileRoot,'lab-background-fixture.mjs'))
const overlay=[
 {id:'job-delivery',config:{enabled:true,namespace:'lab_background_'+basename(attempt).toLowerCase().replaceAll('-','_')}},
 {id:'plugin-lab-job-delivery',disabled:false},
 {id:'plugin-lab-runtime',config:{enabled:false,requiredBackgroundProviders:'job-delivery',namespace:'lab-'+basename(attempt).toLowerCase(),dataPath:join(attempt,'lab-data')}},
 {id:'plugin-lab-control',config:{statusRefreshMs:250}},
 {id:'qq-chat-runtime',config:{enabled:true,namespace:'lab-chat-'+basename(attempt).toLowerCase(),databasePath:join(attempt,'chat-state.sqlite3'),workspacePath:join(attempt,'workspace'),presetId:'lab-web-fixture',provider:'deepseek-official',model:'deepseek-flash',reasoningEffort:'off',maxTokens:128}},
 {id:'session-title-llm',disabled:true},{id:'session-telemetry-otel',disabled:true},
 {insert:[{id:'lab-background-fixture',name:pathToFileURL(join(profileRoot,'lab-background-fixture.mjs')).href},{id:'lab-media-fixture',name:pathToFileURL(join(profileRoot,'lab-media-fixture.mjs')).href},{id:'lab-preset-fixture',name:'@deepseek-ai/dsh-agent-preset',config:{id:'lab-web-fixture',plugins:[]}}]},
]
await writeFile(join(profileRoot,'cordis.patch.yml'),JSON.stringify(overlay,null,2)+'\n')
const profileDsh=join(profileRoot,'node_modules','@deepseek-ai','dsh','lib','bin.js'),child=spawn(process.execPath,[profileDsh,'--profile',profile,'--host','127.0.0.1','--port','0','--no-open'],{cwd:area,env,windowsHide:true,stdio:['pipe','pipe','pipe']})
let stdout='',stderr='',exitCode,context,page
const errors=[],consoleErrors=[],checks=[],exit=once(child,'close').then(([code,signal])=>{exitCode=code;return{code,signal}})
const ready=new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('Isolated Lab Web did not report ready')),60000)
 const inspect=()=>{const match=(stdout+'\n'+stderr).match(/http:\/\/127\.0\.0\.1:\d+[^\s\u001b]*/);if(match){clearTimeout(timer);resolve(match[0])}}
 child.stdout.on('data',chunk=>{stdout+=chunk;inspect()});child.stderr.on('data',chunk=>{stderr+=chunk;inspect()})
 void exit.then(()=>{clearTimeout(timer);reject(Error('Lab Web exited before ready: '+stderr.slice(-800)))})
})
const until=async predicate=>{const limit=Date.now()+15000;while(!await predicate()){assert.ok(Date.now()<limit,'Web observation timed out');await delay(20)}}
const scenario=text=>({title:'Synthetic Web case',actors:['alice'],conversations:[{id:'lounge',kind:'group'}],stages:[{inputs:[{id:'first',actor:'alice',conversation:'lounge',text,directed:true}]}]})
try{
 const login=await ready,origin=new URL(login).origin
 context=await chromium.launchPersistentContext(join(attempt,'browser-profile'),{headless:true,viewport:{width:1280,height:1000},locale:'zh-CN',colorScheme:'light',downloadsPath:join(attempt,'downloads'),env:{...env,PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH}})
 await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort()})
 page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(20000)
 page.on('pageerror',error=>errors.push(error.message));page.on('console',entry=>{if(['error','warning'].includes(entry.type()))consoleErrors.push(entry.text().slice(0,1000))})
 await page.goto(login,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/^继续$|^Continue$/}).click()
 const open=async()=>{await page.getByRole('button',{name:/^插件$|^Plugins$/}).first().click();await page.getByText('dsh-plugin-lab',{exact:true}).first().click()}
 await open();const form=page.locator('.imlab-page'),source=form.getByLabel(/^用例 JSON$|^Scenario JSON$/),reports=form.getByLabel(/^选择报告$|^Choose a report$/)
 await form.getByText(/^未启用$|^Disabled$/).waitFor();assert.equal(captures.length,0);checks.push('native-page-loads-while-runtime-disabled-without-model-probe')
 await form.getByRole('switch',{name:/启用实验室运行时|Enable lab runtime/}).click();await form.getByRole('button',{name:/^保存$|^Save$/}).click();await form.getByText(/^已应用保存的配置$|^Saved settings active$/).waitFor();assert.equal(captures.length,0)
 checks.push('native-save-enables-dedicated-local-runtime')
 await form.getByLabel(/^并发用例数$|^Concurrent cases$/).fill('0');await form.getByRole('button',{name:/^保存$|^Save$/}).click();await page.getByText(/^请检查配置值与容量关系$|^Check the configuration values and limits$/).waitFor();assert.equal(await form.getByLabel(/^并发用例数$|^Concurrent cases$/).inputValue(),'0');await form.getByRole('button',{name:/放弃修改|Discard edits/}).click()
 await form.getByLabel(/^并发用例数$|^Concurrent cases$/).fill('3');await form.getByRole('button',{name:/^刷新$|^Refresh$/}).click();await form.getByText(/开始新用例前请保存|Save or discard edits/).waitFor();assert.equal(await form.getByLabel(/^并发用例数$|^Concurrent cases$/).inputValue(),'3');await form.getByRole('button',{name:/放弃修改|Discard edits/}).click();checks.push('invalid-save-and-status-poll-retain-unsaved-drafts')
 await source.fill('{invalid');await form.getByRole('button',{name:/开始新用例|Start new case/}).click();await form.getByText(/用例 JSON 格式不正确|Scenario JSON is invalid/).waitFor();assert.equal(captures.length,0)
 const first=scenario('LAB_FIRST');first.stages.push({inputs:[{id:'follow',actor:'alice',conversation:'lounge',text:'LAB_FOLLOW',directed:false}]})
 await source.fill(JSON.stringify(first,null,2));await form.getByRole('button',{name:/开始新用例|Start new case/}).click();await form.getByText('LAB_REPLY_2',{exact:true}).waitFor();assert.equal(captures.length,2);assert.ok(captures.every(value=>!value.tools?.length));const firstId=await reports.inputValue()
 checks.push('native-synthetic-stages-use-chat-model-and-capture-public-replies')
 const downloadEvent=page.waitForEvent('download');await form.getByRole('link',{name:/下载完整原始报告|Download full original report/}).click();const downloaded=await downloadEvent,bytes=await readFile(await downloaded.path());assert.deepEqual(bytes,await readFile(join(attempt,'lab-data',firstId+'.jsonl')));assert.ok(bytes.includes(Buffer.from('LAB_REPLY_1'))&&bytes.includes(Buffer.from('LAB_REPLY_2')));assert.ok(!bytes.includes(Buffer.from('SYNTHETIC_NOT_PUBLIC')));checks.push('native-owner-route-downloads-exact-original-jsonl-without-reasoning')
 await source.fill(JSON.stringify({...scenario('invalid'),liveDestination:'90000123'}));await form.getByRole('button',{name:/开始新用例|Start new case/}).click();await form.getByText(/请检查用例别名、输入及容量限制|Check the scenario aliases/).waitFor();assert.equal(captures.length,2);checks.push('scenario-cannot-choose-a-live-messaging-destination')
 await source.fill(JSON.stringify(scenario('LAB_HOLD')));await form.getByRole('button',{name:/开始新用例|Start new case/}).click();await until(()=>captures.length===3&&holds===1);const heldId=await reports.inputValue()
 await page.reload({waitUntil:'domcontentloaded'});await open();await form.getByText(/运行中的用例：1|Active cases: 1/).waitFor();await reports.selectOption(heldId);assert.equal(holds,1);assert.equal(captures.length,3);checks.push('admitted-case-survives-browser-reload-without-replay')
 await source.fill(JSON.stringify(scenario('LAB_AFTER_CANCEL')));await form.getByRole('button',{name:/开始新用例|Start new case/}).click();await form.getByText('LAB_REPLY_4',{exact:true}).waitFor();assert.equal(holds,1);assert.ok(peak>=2);const secondId=await reports.inputValue();checks.push('held-case-does-not-block-another-conversation')
 await reports.selectOption(heldId);await form.getByRole('button',{name:/取消用例|Cancel case/}).click();await form.getByText(/执行状态：已取消|Lifecycle: cancelled/).waitFor();await until(()=>active===0);assert.equal(captures.length,4);checks.push('explicit-cancel-joins-http-and-preserves-report')
 await form.locator('details').first().locator('summary').click();await form.getByRole('switch',{name:/^启用媒体原件$|^Enable original media$/}).click();await form.getByRole('button',{name:/^保存$|^Save$/}).click();await form.getByText(/^已应用保存的配置$|^Saved settings active$/).waitFor()
 const mediaCase={title:'Native browser originals',actors:['alice'],conversations:[{id:'lounge',kind:'group'}],stages:[{inputs:[{id:'image',actor:'alice',conversation:'lounge',text:'LAB_MEDIA_FIXTURE',directed:false}]}]};await source.fill(JSON.stringify(mediaCase))
 const png=await sharp({create:{width:3840,height:2160,channels:4,background:'#2468ad'}}).png().toBuffer(),gif=gifenc.GIFEncoder(),palette=[[255,0,0],[0,0,255]];gif.writeFrame(new Uint8Array(64).fill(0),8,8,{palette,delay:100,repeat:0});gif.writeFrame(new Uint8Array(64).fill(1),8,8,{palette,delay:100});gif.finish()
 const samples=4000,wav=Buffer.alloc(44+samples*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i*Math.PI*2*440/8000)*8000),44+i*2)
 const files=[{name:'original-4k.png',mimeType:'image/png',buffer:png},{name:'motion.gif',mimeType:'image/gif',buffer:Buffer.from(gif.bytes())},{name:'voice.wav',mimeType:'audio/wav',buffer:wav}]
 await page.evaluate(()=>{const original=File.prototype.arrayBuffer,state={entered:false,release:()=>{},restore:()=>{File.prototype.arrayBuffer=original}};window.__labUploadGate=state;File.prototype.arrayBuffer=function(){if(this.name==='delayed.png')return new Promise(resolve=>{state.entered=true;state.release=()=>resolve(original.call(this))});return original.call(this)}})
 try{await form.getByLabel(/^添加原始文件$|^Add original files$/).setInputFiles([{name:'delayed.png',mimeType:'image/png',buffer:png}]);await until(()=>page.evaluate(()=>window.__labUploadGate.entered));const changed=JSON.stringify({...mediaCase,title:'Newer editor draft'});await source.fill(changed);await page.evaluate(()=>window.__labUploadGate.release());await form.getByText(/读取文件期间草稿已变化|The draft changed while reading files/).waitFor();assert.equal(await source.inputValue(),changed)}finally{await page.evaluate(()=>{window.__labUploadGate.restore();delete window.__labUploadGate})}
 checks.push('file-read-race-retains-the-newer-case-draft');await source.fill(JSON.stringify(mediaCase))
 await form.getByLabel(/^添加原始文件$|^Add original files$/).setInputFiles(files);await until(async()=>JSON.parse(await source.inputValue()).assets?.length===3);const uploaded=JSON.parse(await source.inputValue());assert.equal(uploaded.stages[0].inputs[0].text,'LAB_MEDIA_FIXTURE');assert.deepEqual(uploaded.stages[0].inputs[0].media.map(value=>value.type),['image','image','audio']);for(const [index,asset]of uploaded.assets.entries())assert.deepEqual(Buffer.from(asset.base64,'base64'),files[index].buffer)
 await form.getByRole('button',{name:/开始新用例|Start new case/}).click();await form.getByText(/执行状态：已完成|Lifecycle: completed/).waitFor();await until(async()=>await form.locator('.imlab-original').count()===4);const mediaId=await reports.inputValue();assert.equal(captures.length,4)
 const image=form.locator('.imlab-original img').first();await until(async()=>await image.evaluate(element=>element.complete&&element.naturalWidth===3840&&element.naturalHeight===2160));const audio=form.locator('.imlab-original audio');await audio.evaluate(element=>{element.muted=true;element.load()});await until(async()=>await audio.evaluate(element=>element.readyState>=3&&element.duration>0))
 const links=form.getByRole('link',{name:/^下载原件$|^Download original$/});assert.equal(await links.count(),4)
 for(let i=0;i<3;i++){const href=await links.nth(i).getAttribute('href'),response=await context.request.get(origin+href);assert.equal(response.status(),200);assert.deepEqual(await response.body(),files[i].buffer);assert.equal(Number(response.headers()['content-length']),files[i].buffer.length)}
 const originalDownload=page.waitForEvent('download');await links.nth(3).click();const generated=await originalDownload;assert.ok((await readFile(await generated.path(),'utf8')).includes('LAB_GENERATED_FILE'))
 await form.locator('.imlab-originals').scrollIntoViewIfNeeded();await page.screenshot({path:join(attempt,'media-originals.png')});checks.push('browser-selected-4k-gif-and-wav-originals-traverse-native-consumer-preview-decode-and-exact-downloads')
 await form.getByRole('switch',{name:/^启用媒体原件$|^Enable original media$/}).click();await form.getByRole('button',{name:/^保存$|^Save$/}).click();await until(async()=>await form.getByRole('button',{name:/^刷新$|^Refresh$/}).isEnabled());await form.getByText(/^已应用保存的配置$|^Saved settings active$/).waitFor();assert.equal(await form.getByLabel(/^添加原始文件$|^Add original files$/).isDisabled(),true)
 const retainedUrl=await form.getByRole('link',{name:/^下载原件$|^Download original$/}).first().getAttribute('href'),retainedResponse=await context.request.get(origin+retainedUrl);assert.equal(retainedResponse.status(),200);assert.deepEqual(await retainedResponse.body(),png);assert.equal(captures.length,4);checks.push('disabling-new-media-keeps-retained-original-downloads')
 await form.getByRole('switch',{name:/^启用媒体原件$|^Enable original media$/}).click();await form.getByRole('button',{name:/^保存$|^Save$/}).click();await until(async()=>await form.getByRole('button',{name:/^刷新$|^Refresh$/}).isEnabled());await form.getByText(/^已应用保存的配置$|^Saved settings active$/).waitFor()
 await page.reload({waitUntil:'domcontentloaded'});await open();await reports.selectOption(mediaId);await until(async()=>await form.locator('.imlab-original').count()===4);assert.equal(captures.length,4);checks.push('original-media-report-survives-reload-without-another-model-call')
 const background=scenario('LAB_BACKGROUND_TEXT');background.stages[0].inputs[0].directed=false;background.actors.push('bob');background.stages.push({inputs:[{id:'follow',actor:'bob',conversation:'lounge',text:'LAB_BACKGROUND_FOLLOW',directed:false,replyToOutput:{stage:0,index:0}}]});await source.fill(JSON.stringify(background));await form.getByRole('button',{name:/开始新用例|Start new case/}).click();await form.getByText('LAB_BACKGROUND_QUOTED',{exact:true}).waitFor();assert.equal(captures.length,4);const backgroundId=await reports.inputValue();const events=(await readFile(join(attempt,'lab-data',backgroundId+'.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(events[0].schema,2);assert.ok(events[0].backgroundProviders.includes('job-delivery'));assert.equal(events.filter(event=>event.type==='background').length,2);assert.ok(events.filter(event=>event.type==='background').every(event=>event.tasks.length===1&&event.tasks[0].outputs.accepted===1));checks.push('native-web-case-waits-real-background-jobs-and-quotes-their-captured-output');await page.screenshot({path:join(attempt,'background-output.png')})
 await reports.selectOption(secondId);await form.getByText('LAB_REPLY_4',{exact:true}).waitFor();await page.setViewportSize({width:1280,height:1700});await form.evaluate(element=>element.scrollIntoView({block:'start'}));await page.screenshot({path:join(attempt,'light.png'),fullPage:true});await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:join(attempt,'dark.png'),fullPage:true})
 await page.getByRole('button',{name:/^收起侧边栏$|^Collapse sidebar$/}).click();await page.setViewportSize({width:520,height:1700});await form.evaluate(element=>element.scrollIntoView({block:'start'}));assert.ok(await form.evaluate(element=>element.scrollWidth<=element.clientWidth+2));assert.ok(await form.evaluate(element=>[...element.querySelectorAll('input,select,textarea')].filter(item=>item.getClientRects().length).every(item=>{const rect=item.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth})));await page.screenshot({path:join(attempt,'narrow.png'),fullPage:true});checks.push('native-light-dark-and-narrow-layout')
 await form.getByRole('button',{name:/^重启运行时$|^Restart runtime$/}).click();await page.getByText(/^实验室运行时已重启$|^Lab runtime restarted$/).waitFor();await until(async()=>await reports.locator('option').filter({hasText:firstId}).count()>0);await reports.selectOption(firstId);await form.getByText('LAB_REPLY_2',{exact:true}).waitFor();assert.equal(captures.length,4)
 await form.getByRole('switch',{name:/启用实验室运行时|Enable lab runtime/}).click();await form.getByRole('button',{name:/^保存$|^Save$/}).click();await form.getByText(/^未启用$|^Disabled$/).waitFor();checks.push('native-restart-retains-reports-and-disabled-runtime-keeps-controls')
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[])
 await writeFile(join(attempt,'result.json'),JSON.stringify({passed:true,checks,installedFilesVerified:installedFiles,nativeAdapterRequests:captures.length,peak,clientErrors:errors,consoleErrors,realQqMessagesSent:0,realModelApiRequests:0},null,2)+'\n');console.log(JSON.stringify({area,attempt,passed:true,checks,nativeAdapterRequests:captures.length,realQqMessagesSent:0}))
}catch(error){if(page)await page.screenshot({path:join(attempt,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(join(attempt,'result.json'),JSON.stringify({passed:false,checks,error:{message:error.message,stack:error.stack},clientErrors:errors,consoleErrors},null,2)+'\n');throw error}
finally{
 await context?.close()
 if(exitCode===undefined){child.kill('SIGINT');const fallback=setTimeout(()=>child.kill(),5000);await exit;clearTimeout(fallback)}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
 await writeFile(join(attempt,'process.json'),JSON.stringify({exitCode,stdoutBytes:Buffer.byteLength(stdout),stderrBytes:Buffer.byteLength(stderr),rawProcessOutputPersisted:false},null,2)+'\n')
 await writeFile(join(attempt,'model-metadata.json'),JSON.stringify({requests:captures.length,active,peak,models:captures.map(body=>body.model),messageCounts:captures.map(body=>body.messages.length)},null,2)+'\n')
}
