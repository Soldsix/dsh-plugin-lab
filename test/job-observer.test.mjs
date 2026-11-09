/** Actual installed background jobs traverse the same durable outputs and local capture as Host consumers. */
import test from 'node:test'
import assert from 'node:assert/strict'
import gifenc from 'gifenc'
import {identifier} from 'dsh-im-kit'
import {providerId,outputId} from 'dsh-job-delivery'
import {createJobDeliveryObserver} from '../dist/job-delivery.js'
import {labScope} from '../dist/identity.js'
import {setupJobs} from './job-observer-helpers.mjs'
import {scenario,signal,runId,deferred} from './helpers.mjs'
import {source,asset,png} from './media-helpers.mjs'
const producer=providerId('synthetic-generator')
const enqueue=(job,message,payload,abort)=>job.submit({scope:message.scope,actorId:message.senderId,operationId:identifier('im.operation','queued/'+message.messageId),provider:producer,payload},abort)

test('admission-only consumers preserve background output before another participant quotes it',async t=>{
 const {engine,im,job,spec}=await setupJobs(t),entered=deferred(),finish=deferred();let calls=0,followups=0
 job.register({id:producer,maxConcurrent:2,async run(request,context){calls++;entered.resolve();await finish.promise;await context.checkpoint(outputId('original'),[{type:'text',text:'BACKGROUND_EXACT_ORIGINAL'}])}})
 im.subscribe(async(message,abort)=>{if(message.messageId.endsWith('/first')){await enqueue(job,message,{text:'synthetic immutable input'},abort);return}followups++;assert.equal(message.parts.find(part=>part.type==='reply').messageId,'lab-out/'+runId+'/1');await im.send({scope:message.scope,operationId:identifier('im.operation','followup'),parts:[{type:'text',text:'QUOTED_EXACT_ORIGINAL'}]},abort)},()=>true)
 const input=scenario({stages:[scenario().stages[0],{inputs:[{id:'follow',actor:'bob',conversation:'lounge',text:'quote it',directed:true,replyToOutput:{stage:0,index:0}}]}]})
 try{
  const pending=engine.run({runId,scenario:input},signal());await entered.promise;assert.equal(followups,0);finish.resolve();const result=await pending;assert.equal(result.phase,'completed');assert.equal(result.captureCount,2);assert.equal(followups,1)
  const report=await engine.inspect(runId),observed=report.events.filter(event=>event.type==='background');assert.equal(observed[0].tasks[0].outputs.accepted,1);assert.equal(observed[0].tasks[0].execution,'completed');assert.deepEqual(observed[1].tasks,[])
  assert.equal((await engine.run({runId,scenario:input},signal())).replayed,true);assert.equal(calls,1);assert.equal(job.status().running,0);assert.equal(job.status().sending,0);assert.equal(job.list(labScope(spec.namespace,runId,{id:'lounge',kind:'group'})).length,1)
 }finally{finish.resolve()}
})

test('three cases and fifteen actors complete once with native tasks and isolated originals',async t=>{
 const {engine,im,job}=await setupJobs(t,{maxConcurrentRuns:3}),actors=Array.from({length:15},(_,index)=>'actor'+index);let calls=0
 job.register({id:producer,maxConcurrent:4,async run(request,context){calls++;await context.checkpoint(outputId('original'),[{type:'text',text:request.payload.text}])}})
 im.subscribe((message,abort)=>enqueue(job,message,{text:message.messageId},abort),()=>true)
 const input=scenario({actors,conversations:[{id:'one',kind:'group'},{id:'two',kind:'group'},{id:'three',kind:'private'}],stages:[{inputs:actors.map((actor,index)=>({id:'m'+index,actor,conversation:['one','two','three'][index%3],text:'queue work',directed:true}))}]})
 const ids=['jobs-parallel-local-0001','jobs-parallel-local-0002','jobs-parallel-local-0003'],results=await Promise.all(ids.map(id=>engine.run({runId:id,scenario:input},signal())))
 assert.ok(results.every(result=>result.phase==='completed'&&result.captureCount===15));assert.equal(calls,45)
 for(const id of ids){const report=await engine.inspect(id),tasks=report.events.find(event=>event.type==='background').tasks;assert.equal(tasks.length,15);for(const event of report.events.filter(event=>event.type==='capture'))assert.ok(event.capture.parts[0].text.includes('/'+id+'/'))}
 assert.equal(job.status().running,0);assert.equal(job.status().sending,0)
})

test('PNG, animated GIF and WAV originals stay byte-identical through retained task checkpoints',async t=>{
 const {engine,im,job,runtime}=await setupJobs(t),gif=gifenc.GIFEncoder(),palette=[[255,0,0],[0,255,0],[0,0,255]]
 for(let index=0;index<3;index++)gif.writeFrame(new Uint8Array([index,index,index,index]),2,2,{palette,delay:100});gif.finish()
 const wav=Buffer.alloc(52);wav.write('RIFF',0);wav.writeUInt32LE(44,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(8,40)
 const originals=[png,Buffer.from(gif.bytes()),wav],assets=[asset('pixel',png),asset('motion',originals[1],'motion.gif'),asset('voice',wav,'voice.wav')]
 job.register({id:producer,maxConcurrent:2,async run(request,context){await context.checkpoint(outputId('original'),request.payload.parts)}})
 im.subscribe(async(message,abort)=>{const parts=message.parts.filter(part=>['image','audio'].includes(part.type));for(const [index,part]of parts.entries())assert.deepEqual(Buffer.from((await runtime.read(message.scope,part.attachmentId,abort)).copyBytes()),originals[index]);await enqueue(job,message,{parts},abort)},()=>true)
 const result=await engine.run({runId,scenario:source({assets,stages:[{inputs:[{id:'first',actor:'alice',conversation:'lounge',text:'',directed:true,media:[{type:'image',asset:'pixel'},{type:'image',asset:'motion'},{type:'audio',asset:'voice'}]}]}]})},signal());assert.equal(result.phase,'completed');assert.equal(result.captureCount,1);assert.equal(result.unresolvedMedia,0)
 const capture=(await engine.inspect(runId)).events.find(event=>event.type==='capture').capture;assert.equal(capture.originals.length,3)
 for(const [index,part]of capture.parts.entries())assert.deepEqual(Buffer.from((await engine.readMedia(runId,part.attachmentId,signal())).copyBytes()),originals[index])
})

test('cancel joins actual producer cleanup and lets another conversation finish',async t=>{
 const {engine,im,job}=await setupJobs(t),entered=deferred(),aborted=deferred(),finish=deferred();let calls=0
 job.register({id:producer,maxConcurrent:2,async run(request,context){calls++;if(request.payload.hold){entered.resolve();await new Promise(resolve=>context.signal.addEventListener('abort',resolve,{once:true}));aborted.resolve();await finish.promise}else await context.checkpoint(outputId('original'),[{type:'text',text:'sibling completed'}])}})
 im.subscribe((message,abort)=>enqueue(job,message,{hold:message.scope.account.accountId==='lab-run/'+runId},abort),()=>true)
 try{
  let done=false;const pending=engine.run({runId,scenario:scenario()},signal()).then(result=>{done=true;return result});await entered.promise;engine.cancel(runId);await aborted.promise;assert.equal(done,false)
  const sibling=await engine.run({runId:'jobs-sibling-local-0002',scenario:scenario()},signal());assert.equal(sibling.phase,'completed');assert.equal(done,false);finish.resolve();assert.equal((await pending).phase,'cancelled');assert.equal(calls,2);assert.equal(job.status().running,0)
 }finally{finish.resolve()}
})

test('uncertain producer outcomes fail the case without retries or false completion',async t=>{
 const {engine,im,job}=await setupJobs(t);let calls=0
 job.register({id:producer,maxConcurrent:1,async run(request,context){calls++;await context.checkpoint(outputId('original'),[{type:'text',text:'retained partial'}]);throw Error('SYNTHETIC_UPSTREAM_UNKNOWN')}})
 im.subscribe((message,abort)=>enqueue(job,message,{},abort),()=>true)
 const result=await engine.run({runId,scenario:scenario()},signal());assert.equal(result.phase,'failed');assert.equal(result.failure,'background-unresolved');assert.equal(calls,1);assert.equal(result.captureCount,1)
 const report=await engine.inspect(runId);assert.equal(report.events.find(event=>event.type==='background').tasks[0].execution,'uncertain');assert.ok(!JSON.stringify(report).includes('UPSTREAM_UNKNOWN'))
})

test('task capacity failure cancels all admitted tasks and releases exact-scope subscriptions',async t=>{
 const {engine,im,job}=await setupJobs(t,{maxBackgroundTasks:1});let calls=0
 job.register({id:producer,maxConcurrent:2,async run(request,context){calls++;await new Promise(resolve=>context.signal.addEventListener('abort',resolve,{once:true}))}})
 im.subscribe(async(message,abort)=>{await enqueue(job,message,{},abort);await job.submit({scope:message.scope,actorId:message.senderId,operationId:identifier('im.operation','extra/'+message.messageId),provider:producer,payload:{}},abort)},()=>true)
 const result=await engine.run({runId,scenario:scenario()},signal());assert.equal(result.failure,'background-limit');assert.equal(job.status().running,0);assert.ok(calls<=2)
 const scoped=job.list(labScope(engine.config.namespace,runId,{id:'lounge',kind:'group'}));assert.equal(scoped.length,2);assert.ok(scoped.every(task=>task.execution==='cancelled'))
})

test('live scopes and preexisting synthetic tasks are refused without reading bodies or cancelling them',async t=>{
 const {job,spec}=await setupJobs(t),observer=createJobDeliveryObserver(job),scope=labScope(spec.namespace,runId,{id:'lounge',kind:'group'}),request={runId,scopes:[{conversation:'lounge',scope}],maxTasks:10}
 const originalList=job.list.bind(job);let reads=0;job.list=(scope)=>{reads++;return originalList(scope)}
 for(const changed of[{...scope,account:{...scope.account,networkId:'qq'}},{...scope,account:{...scope.account,accountId:'lab-run/another-case'}},{...scope,peerId:'foreign-peer'}])assert.throws(()=>observer.open({...request,scopes:[{conversation:'lounge',scope:changed}]}),error=>error.code==='background-unavailable')
 assert.equal(reads,0)
 const equivalent={...scope,peerId:'lab-peer/'+runId+'/other',account:{accountId:scope.account.accountId,networkId:scope.account.networkId,tenantId:scope.account.tenantId}},lease=observer.open({...request,scopes:[...request.scopes,{conversation:'other',scope:equivalent}]});assert.deepEqual(await lease.settle(signal()),[]);await lease.close()
 const admitted=await job.submit({scope,actorId:identifier('im.user','synthetic-owner'),operationId:identifier('im.operation','preexisting'),provider:producer,payload:{}},signal());assert.throws(()=>observer.open(request),error=>error.code==='background-unavailable')
 assert.equal(job.list(scope)[0].cancelRequested,false);await job.cancel(scope,admitted.id)
})
