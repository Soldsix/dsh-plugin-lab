/** Stage completion includes observed background work and keeps capture alive through joined teardown. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {identifier} from 'dsh-im-kit'
import {backgroundProviderId,backgroundTaskId} from '../dist/background.js'
import {LabError} from '../dist/errors.js'
import {labScope} from '../dist/identity.js'
import {setup,scenario,runId,signal,deferred} from './helpers.mjs'

const task=(id='task-a',execution='completed',outputs={})=>({id:backgroundTaskId(id),conversation:'lounge',execution,outputs:{pending:0,sending:0,accepted:0,failed:0,uncertain:0,cancelled:0,...outputs}})
const send=(im,scope,operation,text)=>im.send({scope,operationId:identifier('im.operation',operation),parts:[{type:'text',text}]},signal())

test('the next stage can quote a background output after admission-only consumers return',async t=>{
 const {engine,im}=await setup(t,{requiredBackgroundProviders:'fixture'}),finish=deferred(),waiting=deferred();let work,settles=0,closed=false,second=0
 engine.registerBackground({id:backgroundProviderId('fixture'),open(request){assert.equal(request.scopes[0].scope.account.networkId,'im-lab');return{async settle(){settles++;if(work){waiting.resolve();await work;work=undefined;return[task('generated','completed',{accepted:1})]}return[]},async close(){closed=true;await work}}}})
 im.subscribe(async message=>{
  if(message.messageId.endsWith('/first')){work=(async()=>{await finish.promise;const receipt=await send(im,message.scope,'background-output','EXACT_BACKGROUND_ORIGINAL');assert.equal(receipt.status,'accepted')})();return}
  second++;assert.equal(message.parts.find(part=>part.type==='reply')?.messageId,'lab-out/'+runId+'/1');await send(im,message.scope,'followup-output','quoted the completed background output')
 },()=>true)
 const source=scenario({stages:[scenario().stages[0],{inputs:[{id:'follow',actor:'bob',conversation:'lounge',text:'quote that output',directed:true,replyToOutput:{stage:0,index:0}}]}]})
 try{
  const done=engine.run({runId,scenario:source},signal());await waiting.promise;assert.equal(second,0);assert.equal((await engine.inspect(runId)).result.phase,'unfinished');finish.resolve();const result=await done
  assert.equal(result.phase,'completed');assert.equal(result.captureCount,2);assert.equal(second,1);assert.equal(closed,true);assert.equal(settles,2)
  const report=await engine.inspect(runId);assert.equal(report.created.schema,3);assert.deepEqual(report.created.backgroundProviders,['fixture']);assert.deepEqual(report.events.filter(event=>event.type==='background').map(event=>[event.stage,event.tasks.length]),[[0,1],[1,0]])
 }finally{finish.resolve()}
})

test('a missing required observer retains the original and fails before dispatching input',async t=>{
 const {engine,im}=await setup(t,{requiredBackgroundProviders:'fixture'});let inputs=0;im.subscribe(()=>{inputs++},()=>true)
 const result=await engine.run({runId,scenario:scenario()},signal());assert.equal(result.phase,'failed');assert.equal(result.failure,'background-unavailable');assert.equal(result.inputCount,0);assert.equal(inputs,0)
 const report=await engine.inspect(runId);assert.deepEqual(report.created.requiredBackgroundProviders,['fixture']);assert.deepEqual(report.created.backgroundProviders,[]);assert.equal(report.created.scenario.stages[0].inputs[0].text,'hello\n完整原文')
})

test('uncertain background outcomes cannot be forged into a completed report',async t=>{
 const {engine,im,spec}=await setup(t);im.subscribe(()=>{},()=>true)
 engine.registerBackground({id:backgroundProviderId('fixture'),open(){return{async settle(){return[task('unknown','uncertain',{uncertain:1})]},async close(){}}}})
 const result=await engine.run({runId,scenario:scenario()},signal());assert.equal(result.phase,'failed');assert.equal(result.failure,'background-unresolved')
 const path=join(spec.dataPath,runId+'.jsonl'),original=await readFile(path,'utf8'),events=original.trim().split('\n').map(JSON.parse);events.at(-1).result.phase='completed';events.at(-1).result.failure=null;await writeFile(path,events.map(event=>JSON.stringify(event)).join('\n')+'\n')
 await assert.rejects(engine.inspect(runId),error=>error.code==='journal-invalid');await writeFile(path,original);assert.equal((await engine.inspect(runId)).result.failure,'background-unresolved')
})

test('repeated provider task identities fail without appending contradictory observations',async t=>{
 const {engine,im}=await setup(t);im.subscribe(()=>{},()=>true);engine.registerBackground({id:backgroundProviderId('fixture'),open(){return{async settle(){return[task()]},async close(){}}}})
 const result=await engine.run({runId,scenario:scenario({stages:[scenario().stages[0],{inputs:[{id:'next',actor:'bob',conversation:'lounge',text:'next',directed:true}]}]})},signal())
 assert.equal(result.failure,'background-unavailable');assert.equal((await engine.inspect(runId)).events.filter(event=>event.type==='background').length,1)
})

test('task and registration limits fail explicitly and failed setup still closes prior observers',async t=>{
 const {engine,im}=await setup(t,{maxBackgroundTasks:1,maxBackgroundProviders:2});im.subscribe(()=>{},()=>true);let closed=0
 const release=engine.registerBackground({id:backgroundProviderId('fixture'),open(){return{async settle(){return[task('one'),task('two')]},async close(){closed++}}}})
 assert.throws(()=>engine.registerBackground({id:backgroundProviderId('fixture'),open(){throw Error('unused')}}),error=>error.code==='background-unavailable')
 const result=await engine.run({runId,scenario:scenario()},signal());assert.equal(result.failure,'background-limit');assert.equal(closed,1);await release()
 engine.registerBackground({id:backgroundProviderId('a'),open(){return{async settle(){return[]},async close(){closed++}}}});engine.registerBackground({id:backgroundProviderId('b'),open(){throw Error('SYNTHETIC_PRIVATE_EXCEPTION')}})
 assert.throws(()=>engine.registerBackground({id:backgroundProviderId('c'),open(){throw Error('unused')}}),error=>error.code==='background-limit')
 const failed=await engine.run({runId:'synthetic-local-run-0002',scenario:scenario()},signal());assert.equal(failed.failure,'background-unavailable');assert.equal(closed,2);assert.ok(!JSON.stringify(await engine.inspect('synthetic-local-run-0002')).includes('PRIVATE_EXCEPTION'))
})

test('cancel waits for observer cleanup while capturing late output and another case stays independent',async t=>{
 const {engine,im,spec}=await setup(t),entered=deferred(),closing=deferred(),finish=deferred();let ownerScope
 engine.registerBackground({id:backgroundProviderId('fixture'),open(request){const held=request.runId===runId;if(held)ownerScope=request.scopes[0].scope;return{async settle(abort){if(!held)return[];entered.resolve();await new Promise(resolve=>abort.addEventListener('abort',resolve,{once:true}));throw new LabError('cancelled')},async close(){if(held){closing.resolve();await finish.promise}}}}})
 im.subscribe(()=>{},()=>true)
 try{
  let done=false;const first=engine.run({runId,scenario:scenario()},signal()).then(result=>{done=true;return result});await entered.promise;engine.cancel(runId);await closing.promise;assert.equal(done,false)
  assert.equal((await send(im,ownerScope,'late-output','late accepted original')).status,'accepted')
  const other=await engine.run({runId:'synthetic-local-run-0002',scenario:scenario()},signal());assert.equal(other.phase,'completed');assert.equal(done,false)
  finish.resolve();const result=await first;assert.equal(result.phase,'cancelled');assert.equal(result.captureCount,1);assert.equal((await send(im,labScope(spec.namespace,runId,{id:'lounge',kind:'group'}),'after-close','should not capture')).status,'failed')
 }finally{finish.resolve()}
})

test('released schema-one evidence stays byte-identical and never dispatches inputs again',async t=>{
 const {engine,im,spec}=await setup(t),bytes=await readFile(new URL('./fixtures/journal-v1.jsonl',import.meta.url)),path=join(spec.dataPath,'legacy-synthetic-run-0001.jsonl');await writeFile(path,bytes);let inputs=0;im.subscribe(()=>{inputs++},()=>true)
 const stored=await engine.inspect('legacy-synthetic-run-0001');assert.equal(stored.created.schema,1);assert.equal(stored.result.phase,'completed')
 const replay=await engine.run({runId:'legacy-synthetic-run-0001',scenario:stored.created.scenario},signal());assert.equal(replay.replayed,true);assert.equal(inputs,0);assert.deepEqual(await readFile(path),bytes)
})

test('observer disposal joins its admitted case and a new case refuses the missing requirement',async t=>{
 const {engine,im}=await setup(t,{requiredBackgroundProviders:'fixture'}),entered=deferred(),closing=deferred(),finish=deferred();im.subscribe(()=>{},()=>true)
 const release=engine.registerBackground({id:backgroundProviderId('fixture'),open(){return{async settle(abort){entered.resolve();await new Promise(resolve=>abort.addEventListener('abort',resolve,{once:true}));throw new LabError('cancelled')},async close(){closing.resolve();await finish.promise}}}})
 try{
  const first=engine.run({runId,scenario:scenario()},signal());await entered.promise;let disposed=false;const removal=release().then(()=>{disposed=true});await closing.promise;assert.equal(disposed,false);assert.deepEqual(engine.status().backgroundProviders,[])
  const next=await engine.run({runId:'synthetic-local-run-0002',scenario:scenario()},signal());assert.equal(next.failure,'background-unavailable');assert.equal(next.inputCount,0);finish.resolve();await removal;assert.equal((await first).phase,'cancelled')
 }finally{finish.resolve()}
})

test('a completed report must contain every declared stage background observation',async t=>{
 const {engine,im,spec}=await setup(t,{requiredBackgroundProviders:'fixture'});im.subscribe(()=>{},()=>true);engine.registerBackground({id:backgroundProviderId('fixture'),open(){return{async settle(){return[]},async close(){}}}})
 assert.equal((await engine.run({runId,scenario:scenario()},signal())).phase,'completed')
 const path=join(spec.dataPath,runId+'.jsonl'),bytes=await readFile(path,'utf8'),events=bytes.trim().split('\n').map(JSON.parse).filter(event=>event.type!=='background');await writeFile(path,events.map(event=>JSON.stringify(event)).join('\n')+'\n');await assert.rejects(engine.inspect(runId),error=>error.code==='journal-invalid');await writeFile(path,bytes)
})
