/** Probe only synthetic local Lab runs through the installed Chat bundle and native agent. */
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {setTimeout as delay} from 'node:timers/promises'
export const inject=['imMedia','im','imLab','qqChat','imLabControl','configEditor','typertGateway','remoteAccess','connection']
const source=(text,directed=true)=>({title:'Synthetic native Lab case',actors:['alice'],conversations:[{id:'lounge',kind:'group'}],stages:[{inputs:[{id:'first',actor:'alice',conversation:'lounge',text,directed}]}]})
export function apply(ctx,config){const work=probe(ctx,config);ctx.effect(()=>async()=>{await work})}
async function probe(ctx,config){
 const checks=[]
 try{
  const ready=Date.now()+10000;while(!ctx.qqChat.status().transportAttached){assert.ok(Date.now()<ready,'Chat did not attach to the local lab');await delay(20)}
  const firstId='native-lab-context-0001',scenario=source('LAB_FIRST')
  scenario.stages.push({inputs:[{id:'followup',actor:'alice',conversation:'lounge',text:'LAB_FOLLOW',directed:false}]})
  const first=await ctx.imLab.run({runId:firstId,scenario},new AbortController().signal)
  assert.equal(first.phase,'completed');assert.equal(first.captureCount,2)
  const original=await ctx.imLab.inspect(firstId),outputs=original.events.filter(event=>event.type==='capture')
  assert.deepEqual(outputs.map(event=>event.capture.parts.filter(part=>part.type==='text').map(part=>part.text).join('')),['LAB_REPLY_1','LAB_REPLY_2'])
  checks.push('installed-lab-publishes-through-native-chat-and-captures-final-public-output')
  const replay=await ctx.imLab.run({runId:firstId,scenario},new AbortController().signal);assert.equal(replay.replayed,true)
  checks.push('repeated-lab-run-does-not-submit-another-model-turn')
  const peer={id:'lab-owner-fixture',ctx,principal:{kind:'owner'},signal:new AbortController().signal,interactions:'none',async dispose(){}}
  const invoke=(method,args={},caller=peer)=>ctx.typertGateway.invoke({namespace:'imLabControl',method,args,peer:caller,signal:peer.signal})
  const saved=await invoke('describe');assert.equal(saved.appliedRevision,saved.revision)
  assert.equal((await invoke('inspect',{request:{runId:firstId}})).result.captureCount,2)
  assert.ok((await invoke('list',{request:{}})).runIds.includes(firstId))
  const repeated=await invoke('start',{request:{revision:saved.revision,runId:firstId,scenario}});assert.equal(repeated.replayed,true)
  checks.push('installed-native-owner-control-inspects-lists-and-replays-without-new-model-work')
  ctx.effect(()=>ctx.remoteAccess.registerPolicy('lab-test-guest',{bindings:()=>[{resource:{kind:'global'},role:{name:'qa-lab',resource:'global',actions:['describe','save','restart','start','cancel','list','inspect'].map(method=>'imLabControl/'+method)}}]}))
  const guest={...peer,id:'lab-guest-fixture',principal:{kind:'lab-test-guest'}}
  for(const [method,args]of [['describe',{}],['save',{request:{revision:saved.revision,patch:{enabled:false}}}],['restart',{request:{revision:saved.revision}}],['start',{request:{revision:saved.revision,runId:firstId,scenario}}],['cancel',{request:{runId:firstId}}],['list',{request:{}}],['inspect',{request:{runId:firstId}}]])await assert.rejects(invoke(method,args,guest),error=>error.code==='im-lab/control'&&error.details.reason==='forbidden')
  checks.push('all-seven-native-owner-operations-reject-non-owner-even-with-global-policy')
  const handler=ctx.connection.createSharedFetchHandler('/api'),reportUrl='http://localhost/api/im-lab-report?runId='+firstId
  const denied=await handler.fetch(new Request(reportUrl),guest);assert.equal(denied.status,403)
  const allowed=await handler.fetch(new Request(reportUrl),peer);assert.equal(allowed.status,200);assert.ok((await allowed.text()).includes('LAB_REPLY_2'))
  checks.push('native-connection-authenticates-streaming-report-downloads-before-dispatch')
  await assert.rejects(invoke('save',{request:{revision:'0'.repeat(64),patch:{enabled:false}}}),error=>error.details?.reason==='revision-conflict')
  await assert.rejects(invoke('start',{request:{revision:saved.revision,runId:'native-lab-invalid-0001',scenario:{...scenario,liveDestination:'90000123'}}}),error=>error.details?.reason==='invalid-scenario')
  checks.push('native-revisions-and-scenario-authority-validation-before-admission')
  const simultaneous=await Promise.all(['A','B'].map((label,index)=>ctx.imLab.run({runId:'native-lab-parallel-000'+index,scenario:source('LAB_PARALLEL_'+label)},new AbortController().signal)))
  assert.ok(simultaneous.every(value=>value.phase==='completed'&&value.captureCount===1))
  checks.push('parallel-lab-runs-use-independent-native-conversations')
  const actors=Array.from({length:15},(_,index)=>'actor'+index)
  const many={title:'15 synthetic native participants',actors,conversations:[{id:'one',kind:'group'},{id:'two',kind:'group'},{id:'three',kind:'group'}],stages:[{inputs:actors.map((actor,index)=>({id:'message'+index,actor,conversation:['one','two','three'][index%3],text:'LAB_FIFTEEN_'+index,directed:true}))}]}
  const fifteen=await ctx.imLab.run({runId:'native-lab-fifteen-0001',scenario:many},new AbortController().signal)
  assert.equal(fifteen.phase,'completed');assert.equal(fifteen.captureCount,15)
  checks.push('fifteen-synthetic-actors-traverse-real-chat-queues-and-persist-captures')
  const holdId='native-lab-cancelled-0001',admitted=await invoke('start',{request:{revision:saved.revision,runId:holdId,scenario:source('LAB_HOLD')}})
  assert.equal(admitted.runId,holdId);const held=ctx.imLab.wait(holdId)
  const deadline=Date.now()+10000
  while(true){const state=await(await fetch(config.statusUrl)).json();if(state.holds>0)break;assert.ok(Date.now()<deadline,'Native held request did not start');await delay(20)}
  await assert.rejects(invoke('restart',{request:{revision:saved.revision}}),error=>error.details?.reason==='busy')
  assert.equal((await invoke('cancel',{request:{runId:holdId}})).requested,true);assert.equal((await held).phase,'cancelled')
  const cancelled=await ctx.imLab.inspect(holdId);assert.equal(cancelled.result.captureCount,0)
  const after=await ctx.imLab.run({runId:'native-lab-after-cancel-0001',scenario:source('LAB_AFTER_CANCEL')},new AbortController().signal)
  assert.equal(after.phase,'completed');assert.equal(after.captureCount,1)
  checks.push('lab-cancellation-joins-native-model-and-following-run-recovers')
  assert.equal(ctx.imLab.status().active,0)
  const quoted={title:'Native quoted platform card',actors:['alice','bob'],conversations:[{id:'lounge',kind:'group'}],stages:[{inputs:[{id:'seed',actor:'alice',conversation:'lounge',text:'LAB_CARD_SEED',directed:true}]},{inputs:[{id:'question',actor:'bob',conversation:'lounge',text:'LAB_CARD_QUESTION',directed:true,replyTo:'seed',card:{format:'json',content:'{"title":"SYNTHETIC_PLATFORM_CARD","url":"https://example.invalid/video"}'}}]}]}
  const quotedId='native-lab-quoted-card-0001',quotedResult=await ctx.imLab.run({runId:quotedId,scenario:quoted},new AbortController().signal)
  assert.equal(quotedResult.phase,'completed');assert.equal(quotedResult.captureCount,2)
  assert.deepEqual((await ctx.imLab.inspect(quotedId)).created.scenario,quoted)
  assert.equal((await ctx.imLab.run({runId:quotedId,scenario:quoted},new AbortController().signal)).replayed,true)
  checks.push('native-consumer-receives-original-platform-card-and-a-prior-message-quote-without-duplicate-model-calls')
  const outputId='native-lab-output-quote-0001',seen=[]
  const unsubscribe=ctx.im.subscribe(async message=>{seen.push(message)},message=>message.scope.account.accountId==='lab-run/'+outputId)
  const outputCase={title:'Quote actual generated reply',actors:['alice','bob'],conversations:[{id:'lounge',kind:'group'}],stages:[{inputs:[{id:'seed',actor:'alice',conversation:'lounge',text:'LAB_OUTPUT_SEED',directed:true}]},{inputs:[{id:'challenge',actor:'bob',conversation:'lounge',text:'LAB_OUTPUT_FOLLOW',directed:true,replyToOutput:{stage:0,index:0}}]}]}
  try{
   const result=await ctx.imLab.run({runId:outputId,scenario:outputCase},new AbortController().signal);assert.equal(result.phase,'completed');assert.equal(result.captureCount,2)
   const saved=await ctx.imLab.inspect(outputId),generated=saved.events.filter(event=>event.type==='capture');assert.equal(seen[1].parts.find(part=>part.type==='reply').messageId,generated[0].capture.messageId)
   assert.equal((await ctx.imLab.run({runId:outputId,scenario:outputCase},new AbortController().signal)).replayed,true);assert.equal(seen.length,2)
  }finally{await unsubscribe()}
  checks.push('generated-output-quote-reaches-native-chat-with-exact-receipt-id-and-no-replay')
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/1UAAAAASUVORK5CYII=','base64'),wav=Buffer.alloc(52)
  wav.write('RIFF',0);wav.writeUInt32LE(44,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(8,40)
  const mediaId='native-lab-media-case-0001',mediaCase={title:'Native original media',actors:['alice'],conversations:[{id:'lounge',kind:'group'}],assets:[{id:'pixel',fileName:'fixture.jpg',base64:png.toString('base64')},{id:'voice',fileName:'voice.mp3',base64:wav.toString('base64')}],stages:[{inputs:[{id:'input',actor:'alice',conversation:'lounge',text:'LAB_MEDIA_FIXTURE',directed:false,media:[{type:'image',asset:'pixel'},{type:'audio',asset:'voice'}]}]}]}
  const mediaResult=await ctx.imLab.run({runId:mediaId,scenario:mediaCase},new AbortController().signal);assert.equal(mediaResult.phase,'completed');assert.equal(mediaResult.captureCount,1);assert.equal(mediaResult.unresolvedMedia,0)
  const mediaView=await invoke('inspect',{request:{runId:mediaId}});assert.equal(mediaView.originals.length,3);assert.ok(!JSON.stringify(mediaView).includes('sha256:'))
  for(const [index,original]of mediaView.originals.entries()){
   const url='http://localhost/api/im-lab-media?runId='+mediaId+'&attachmentId='+original.attachmentId;assert.equal((await handler.fetch(new Request(url),guest)).status,403)
   const response=await handler.fetch(new Request(url),peer);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());if(index===0)assert.deepEqual(bytes,png);else if(index===1)assert.deepEqual(bytes,wav);else{assert.ok(bytes.toString().includes('LAB_GENERATED_FILE'));assert.ok(response.headers.get('content-disposition').startsWith('attachment;'))}
  }
  assert.equal((await ctx.imLab.run({runId:mediaId,scenario:mediaCase},new AbortController().signal)).replayed,true);assert.equal(ctx.imMedia.status().providers,0);assert.equal(ctx.imMedia.status().pending,0)
  checks.push('native-media-inputs-and-generated-output-retain-verbatim-bytes-with-owner-only-downloads-and-no-model-call-or-replay')
  const exported=await ctx.imLab.export(firstId,new AbortController().signal),report=await new Response(exported.body).text();await exported.done
  assert.ok(report.includes('LAB_REPLY_1')&&report.includes('LAB_REPLY_2'))
  checks.push('native-full-report-export-retains-all-structured-captures')
  await writeFile(config.resultPath,JSON.stringify({passed:true,checks,realQqMessagesSent:0,realModelApiRequests:0,modelBackend:'native Messages adapter to controlled loopback HTTP',semanticQualityVerified:false},null,2)+'\n')
 }catch(error){await writeFile(config.resultPath,JSON.stringify({passed:false,checks,error:{message:error.message,stack:error.stack},realQqMessagesSent:0,realModelApiRequests:0},null,2)+'\n')}
}
