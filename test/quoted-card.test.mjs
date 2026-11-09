import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {identifier} from 'dsh-im-kit'
import {parseScenario} from '../dist/schema.js'
import {scenarioFingerprint} from '../dist/identity.js'
import {setup,scenario,runId,signal} from './helpers.mjs'
const quoteScenario=()=>scenario({stages:[{inputs:[{id:'seed',actor:'alice',conversation:'lounge',text:'A shared topic',directed:false}]},{inputs:[{id:'question',actor:'bob',conversation:'lounge',text:'',directed:true,replyTo:'seed',card:{format:'json',content:'{"title":"SYNTHETIC_CARD","url":"https://example.invalid/video"}'}}]}]})

test('quoted cards reach the installed consumer with original content and a run-scoped prior message ID',async t=>{
 const {engine,im}=await setup(t),seen=[]
 im.subscribe(async(message,abort)=>{
  seen.push(message)
  if(seen.length===2){
   assert.equal(message.parts.find(value=>value.type==='reply').messageId,seen[0].messageId)
   assert.deepEqual(message.parts.find(value=>value.type==='card'),{type:'card',...quoteScenario().stages[1].inputs[0].card})
   await im.send({scope:message.scope,operationId:identifier('im.operation','quoted-card-reply'),parts:[{type:'reply',messageId:message.messageId},{type:'text',text:'SYNTHETIC_CARD_ACK'}]},abort)
  }
 },()=>true)
 const source=quoteScenario(),result=await engine.run({runId,scenario:source},signal());assert.equal(result.phase,'completed');assert.equal(result.captureCount,1)
 const stored=await engine.inspect(runId);assert.deepEqual(stored.created.scenario,source)
 assert.equal((await engine.run({runId,scenario:source},signal())).replayed,true);assert.equal(seen.length,2)
 const changed=quoteScenario();changed.stages[1].inputs[0].card.content+=' '
 await assert.rejects(async()=>engine.run({runId,scenario:changed},signal()),error=>error.code==='source-conflict')
})

test('quotes reject absent, concurrent and cross-conversation targets before publishing any input',async t=>{
 const {spec,engine,im}=await setup(t);let calls=0;im.subscribe(async()=>{calls++},()=>true)
 const bad=[]
 const missing=quoteScenario();missing.stages[1].inputs[0].replyTo='missing';bad.push(missing)
 const concurrent=quoteScenario();concurrent.stages=[{inputs:[...concurrent.stages[0].inputs,...concurrent.stages[1].inputs]}];bad.push(concurrent)
 const foreign=quoteScenario();foreign.conversations.push({id:'other',kind:'group'});foreign.stages[1].inputs[0].conversation='other';bad.push(foreign)
 for(const value of bad){assert.throws(()=>parseScenario(value,spec));await assert.rejects(async()=>engine.run({runId,scenario:value},signal()),error=>error.code==='invalid-scenario')}
 assert.equal(calls,0)
 const extra=quoteScenario();extra.stages[1].inputs[0].card.accountId='forbidden-authority';assert.throws(()=>parseScenario(extra,spec))
 assert.throws(()=>parseScenario(quoteScenario(),{...spec,maxTextChars:20}))
 const xml=quoteScenario();xml.stages[1].inputs[0].card={format:'xml',content:'<msg>synthetic original text</msg>'};assert.deepEqual(parseScenario(xml,spec),xml)
})

test('new optional quote and card fields preserve legacy text fingerprints and original field order independence',()=>{
 const source=scenario(),legacy=[source.title,source.actors,source.conversations.map(value=>[value.id,value.kind]),source.stages.map(stage=>stage.inputs.map(value=>[value.id,value.actor,value.conversation,value.text,value.directed,value.mentionActor??null]))]
 assert.equal(scenarioFingerprint(source),createHash('sha256').update(JSON.stringify(legacy)).digest('hex'))
 const card=quoteScenario(),reordered=structuredClone(card),value=card.stages[1].inputs[0].card;reordered.stages[1].inputs[0].card={content:value.content,format:value.format};assert.equal(scenarioFingerprint(card),scenarioFingerprint(reordered))
 const changed=structuredClone(card);delete changed.stages[1].inputs[0].replyTo;assert.notEqual(scenarioFingerprint(card),scenarioFingerprint(changed))
})
