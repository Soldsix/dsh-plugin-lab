/** Subsequent stages quote actual locally captured bot replies without foreign targets. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {identifier,scopeKey} from 'dsh-im-kit'
import {parseScenario} from '../dist/schema.js'
import {scenarioFingerprint} from '../dist/identity.js'
import {setup,scenario,runId,signal} from './helpers.mjs'
function source(){return scenario({conversations:[{id:'lounge',kind:'group'},{id:'other',kind:'group'}],stages:[{inputs:[{id:'a',actor:'alice',conversation:'lounge',text:'first',directed:true},{id:'b',actor:'bob',conversation:'other',text:'first',directed:true}]},{inputs:[{id:'follow',actor:'bob',conversation:'lounge',text:'I disagree with that answer',directed:false,replyToOutput:{stage:0,index:1}}]}]})}
test('output quotes select an earlier captured message in the same run and conversation',async t=>{
 const {engine,im}=await setup(t),sent=new Map();let calls=0
 im.subscribe(async(message,abort)=>{
  calls++;const key=scopeKey(message.scope),reply=message.parts.find(part=>part.type==='reply')
  if(reply){assert.equal(reply.messageId,sent.get(key)[1]);return}
  const receipts=[];for(let i=0;i<2;i++){const receipt=await im.send({scope:message.scope,operationId:identifier('im.operation',message.messageId+'-'+i),parts:[{type:'text',text:'bot answer '+i}]},abort);assert.equal(receipt.status,'accepted');receipts.push(receipt.messageIds[0])}sent.set(key,receipts)
 },()=>true)
 const input=source(),result=await engine.run({runId,scenario:input},signal());assert.equal(result.phase,'completed');assert.equal(result.captureCount,4);assert.equal(calls,3)
 const stored=await engine.inspect(runId);assert.deepEqual(stored.created.scenario,input)
 assert.equal((await engine.run({runId,scenario:input},signal())).replayed,true);assert.equal(calls,3)
 const changed=source();changed.stages[1].inputs[0].replyToOutput.index=0;assert.notEqual(scenarioFingerprint(changed),scenarioFingerprint(input));await assert.rejects(async()=>engine.run({runId,scenario:changed},signal()),error=>error.code==='source-conflict')
})
test('output quote validation rejects simultaneous or ambiguous source selectors',async t=>{
 const {spec}=await setup(t)
 for(const quote of [{stage:1,index:0},{stage:2,index:0},{stage:-1,index:0},{stage:0,index:-1},{stage:0,index:0.5},{stage:0,index:0,peer:'foreign'}]){const input=source();input.stages[1].inputs[0].replyToOutput=quote;assert.throws(()=>parseScenario(input,spec))}
 const both=source();both.stages[1].inputs[0].replyTo='a';assert.throws(()=>parseScenario(both,spec))
})
test('a missing output fails the run before publishing the dependent input',async t=>{
 const {engine,im}=await setup(t);let calls=0;im.subscribe(async()=>{calls++},()=>true)
 const input=source(),result=await engine.run({runId,scenario:input},signal());assert.equal(result.phase,'failed');assert.equal(result.failure,'invalid-scenario');assert.equal(calls,2);assert.equal(result.captureCount,0)
 const stored=await engine.inspect(runId);assert.deepEqual(stored.created.scenario,input)
})
