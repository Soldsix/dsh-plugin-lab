import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {identifier} from 'dsh-im-kit'
import {RunJournal} from '../dist/journal.js'
import {setup,scenario,runId,signal,deferred} from './helpers.mjs'

test('stages use actual consumers, preserve source before work, and capture exact structured replies',async t=>{
 const {engine,im,spec}=await setup(t);let calls=0
 im.subscribe(async(message,abort)=>{
  calls++;const stored=await RunJournal.read(spec,runId);assert.equal(stored.created.scenario.stages[0].inputs[0].text,'hello\n完整原文')
  const receipt=await im.send({scope:message.scope,operationId:identifier('im.operation','reply-'+message.messageId),parts:[{type:'reply',messageId:message.messageId},{type:'text',text:'完整输出\nsecond line'}]},abort)
  assert.equal(receipt.status,'accepted')
 },()=>true)
 const result=await engine.run({runId,scenario:scenario()},signal())
 assert.equal(result.phase,'completed');assert.equal(calls,1);assert.equal(result.captureCount,1)
 const stored=await engine.inspect(runId),capture=stored.events.find(event=>event.type==='capture').capture
 assert.equal(capture.parts[1].text,'完整输出\nsecond line');assert.ok(capture.parts[0].messageId.startsWith('lab-in/'+runId+'/'))
 const repeated=await engine.run({runId,scenario:scenario()},signal());assert.equal(repeated.replayed,true);assert.equal(calls,1)
 await assert.rejects(async()=>engine.run({runId,scenario:scenario({title:'changed'})},signal()),error=>error.code==='source-conflict')
 const persisted=await readFile(join(spec.dataPath,runId+'.jsonl'),'utf8');assert.ok(!persisted.includes('reasoning'))
})
test('15 actors and parallel conversations retain stage barriers and run-prefixed attribution',async t=>{
 const {engine,im}=await setup(t);const actors=Array.from({length:15},(_,i)=>'actor'+i),first=new Set(),scopes=new Set()
 im.subscribe(async(message,abort)=>{
  const text=message.parts.find(part=>part.type==='text').text
  if(text==='second stage')assert.equal(first.size,15)
  else first.add(message.senderId)
  scopes.add(JSON.stringify(message.scope));assert.ok(message.senderId.startsWith('lab-actor/'+runId+'/'))
  await im.send({scope:message.scope,operationId:identifier('im.operation','op-'+message.messageId),parts:[{type:'mention',userId:message.senderId},{type:'text',text}]},abort)
 },()=>true)
 const source=scenario({actors,conversations:[{id:'one',kind:'group'},{id:'two',kind:'group'},{id:'dm',kind:'private'}],stages:[{inputs:actors.map((actor,index)=>({id:'input'+index,actor,conversation:index%2?'one':'two',text:'first stage '+index,directed:index%3===0}))},{inputs:[{id:'followup',actor:'actor14',conversation:'dm',text:'second stage',directed:false}]}]})
 const result=await engine.run({runId,scenario:source},signal());assert.equal(result.inputCount,16);assert.equal(result.captureCount,16);assert.equal(scopes.size,3)
 const stored=await engine.inspect(runId),outputs=stored.events.filter(event=>event.type==='capture');assert.equal(new Set(outputs.map(event=>event.capture.messageId)).size,16)
})
test('missing and failing consumers produce explicit failures without leaking exceptions',async t=>{
 const {engine,im,spec}=await setup(t)
 const missing=await engine.run({runId,scenario:scenario()},signal());assert.equal(missing.failure,'no-consumer');assert.equal(missing.unhandledInputs,1)
 im.subscribe(async()=>{throw Error('synthetic-private-diagnostic')},()=>true)
 const failed=await engine.run({runId:'synthetic-local-run-0002',scenario:scenario()},signal());assert.equal(failed.failure,'consumer-failed');assert.equal(failed.consumerFailures,1)
 assert.ok(!(await readFile(join(spec.dataPath,'synthetic-local-run-0002.jsonl'),'utf8')).includes('synthetic-private-diagnostic'))
})
test('parallel runs with the same aliases remain isolated and cancelling one leaves its sibling active',async t=>{
 const {engine,im}=await setup(t),entered=deferred(),otherEntered=deferred(),finishOther=deferred();let calls=0
 im.subscribe(async(message,abort)=>{
  calls++;const text=message.parts.find(part=>part.type==='text').text
  if(text==='hold one'){entered.resolve();await new Promise(resolve=>{if(abort.aborted)resolve();else abort.addEventListener('abort',resolve,{once:true})});return}
  otherEntered.resolve();await finishOther.promise
  await im.send({scope:message.scope,operationId:identifier('im.operation','sibling-output'),parts:[{type:'text',text:'sibling done'}]},abort)
 },()=>true)
 const source=text=>{const value=scenario();value.stages[0].inputs[0].text=text;return value}
 const first=engine.run({runId,scenario:source('hold one')},signal()),second=engine.run({runId:'synthetic-local-run-0002',scenario:source('hold two')},signal())
 await Promise.all([entered.promise,otherEntered.promise]);assert.equal(engine.status().active,2);assert.equal(engine.cancel(runId),true)
 assert.equal((await first).phase,'cancelled');assert.equal(engine.status().active,1)
 finishOther.resolve();assert.equal((await second).captureCount,1);assert.equal(calls,2)
})
test('capacity refuses a new run before admission, while repeated active identity joins one computation',async t=>{
 const {engine,im,spec}=await setup(t,{maxConcurrentRuns:1}),entered=deferred(),finish=deferred();let calls=0
 im.subscribe(async()=>{calls++;entered.resolve();await finish.promise},()=>true)
 const first=engine.run({runId,scenario:scenario()},signal());await entered.promise
 const duplicate=engine.run({runId,scenario:scenario()},signal())
 await assert.rejects(async()=>engine.run({runId:'synthetic-local-run-0002',scenario:scenario()},signal()),error=>error.code==='capacity')
 await assert.rejects(readFile(join(spec.dataPath,'synthetic-local-run-0002.jsonl')),error=>error.code==='ENOENT')
 finish.resolve();assert.equal((await first).phase,'completed');assert.equal((await duplicate).replayed,true);assert.equal(calls,1)
})
test('closing aborts and joins owned consumers while retained unfinished cases are never replayed',async t=>{
 const {engine,im,spec}=await setup(t),entered=deferred(),claimed=await RunJournal.claim(spec,'synthetic-local-run-0003',scenario());await claimed.journal.close()
 let calls=0;im.subscribe(async(_message,abort)=>{calls++;entered.resolve();await new Promise(resolve=>{if(abort.aborted)resolve();else abort.addEventListener('abort',resolve,{once:true})})},()=>true)
 const old=await engine.run({runId:'synthetic-local-run-0003',scenario:scenario()},signal());assert.equal(old.phase,'unfinished');assert.equal(old.replayed,true);assert.equal(calls,0)
 const current=engine.run({runId,scenario:scenario()},signal());await entered.promise;await engine.close();assert.equal((await current).phase,'cancelled');assert.equal(engine.status().active,0)
 await assert.rejects(async()=>engine.run({runId:'synthetic-local-run-0004',scenario:scenario()},signal()),error=>error.code==='closed')
})
test('journal failure retains original input and never regenerates an unfinished attempt',async t=>{
 const {engine,im}=await setup(t,{maxRecordBytes:1024});let calls=0
 im.subscribe(async(message,abort)=>{calls++;await im.send({scope:message.scope,operationId:identifier('im.operation','oversized-result'),parts:[{type:'text',text:'x'.repeat(2048)}]},abort)},()=>true)
 await assert.rejects(engine.run({runId,scenario:scenario()},signal()),error=>error.code==='journal-limit')
 const stored=await engine.inspect(runId);assert.equal(stored.created.scenario.stages[0].inputs[0].text,'hello\n完整原文');assert.equal(stored.result.phase,'unfinished')
 const replay=await engine.run({runId,scenario:scenario()},signal());assert.equal(replay.replayed,true);assert.equal(calls,1)
})
