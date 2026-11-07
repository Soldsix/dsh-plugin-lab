import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {setup,scenario,runId,signal,deferred} from './helpers.mjs'

test('background admission retains the full source and remains inspectable before the consumer finishes',async t=>{
 const {engine,im,spec}=await setup(t),entered=deferred(),finish=deferred();let calls=0
 im.subscribe(async()=>{calls++;entered.resolve();await finish.promise},()=>true)
 const admitted=await engine.start({runId,scenario:scenario()},signal())
 assert.deepEqual(admitted,{runId,replayed:false})
 const disk=await readFile(join(spec.dataPath,runId+'.jsonl'),'utf8')
 assert.equal(JSON.parse(disk.split('\n')[0]).scenario.stages[0].inputs[0].text,'hello\n完整原文')
 await entered.promise
 assert.equal((await engine.inspect(runId)).result.phase,'unfinished')
 assert.deepEqual(engine.status().activeRunIds,[runId])
 assert.deepEqual(await engine.start({runId,scenario:scenario()},signal()),{runId,replayed:true})
 await assert.rejects(async()=>engine.export(runId,signal()),error=>error.code==='capacity')
 const finished=engine.run({runId,scenario:scenario()},signal());finish.resolve()
 assert.equal((await finished).phase,'completed');assert.equal(calls,1)
})
test('listing is bounded and an exact report export never truncates the authoritative file',async t=>{
 const {engine,im,spec}=await setup(t,{listPageSize:2})
 im.subscribe(async()=>{},()=>true)
 const ids=[runId,'synthetic-local-run-0002','synthetic-local-run-0003']
 for(const id of ids)await engine.run({runId:id,scenario:scenario()},signal())
 await writeFile(join(spec.dataPath,'not-a-run.jsonl'),'ignored')
 await mkdir(join(spec.dataPath,'synthetic-local-run-0004.jsonl'))
 const page=await engine.list();assert.deepEqual(page,{runIds:ids.slice(0,2),next:ids[1]})
 assert.deepEqual(await engine.list(page.next),{runIds:[ids[2]],next:null})
 const exported=await engine.export(runId,signal()),reader=exported.body.getReader(),chunks=[]
 for(;;){const item=await reader.read();if(item.done)break;chunks.push(Buffer.from(item.value))}
 await exported.done;const bytes=Buffer.concat(chunks)
 assert.equal(bytes.length,exported.size);assert.deepEqual(bytes,await readFile(join(spec.dataPath,runId+'.jsonl')))
 for(const invalid of ['../outside','SYNTHETIC-LOCAL-RUN-0001'])await assert.rejects(async()=>engine.export(invalid,signal()),error=>error.code==='invalid-scenario')
})
test('cancelled exports release their descriptors and background failures remain visible in safe metadata',async t=>{
 const {engine,spec}=await setup(t)
 await engine.run({runId,scenario:scenario()},signal())
 assert.deepEqual(engine.status().lastFailure,{runId,code:'no-consumer'})
 const abort=new AbortController(),exported=await engine.export(runId,abort.signal)
 abort.abort();await assert.rejects(exported.done);await assert.rejects(exported.body.getReader().read())
 const path=join(spec.dataPath,runId+'.jsonl'),before=await readFile(path)
 await writeFile(path,before);assert.deepEqual(await readFile(path),before)
})
