import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,appendFile,mkdir,link} from 'node:fs/promises'
import {join} from 'node:path'
import {Config,resolveConfig} from '../dist/config.js'
import {RunJournal} from '../dist/journal.js'
import {area,runId,scenario} from './helpers.mjs'

test('foreign report directories and linked files are refused without replacing data',async()=>{
 const directory=await area(),dataPath=join(directory,'foreign');await mkdir(dataPath);await writeFile(join(dataPath,'keep.txt'),'original synthetic data')
 const spec=resolveConfig(Config({enabled:true,dataPath}),directory)
 await assert.rejects(RunJournal.initialize(spec));assert.equal(await readFile(join(dataPath,'keep.txt'),'utf8'),'original synthetic data')
 const own=resolveConfig(Config({enabled:true}),directory);await RunJournal.initialize(own)
 const other=join(directory,'linked-source.jsonl');await writeFile(other,'synthetic non-journal bytes\n');await link(other,join(own.dataPath,runId+'.jsonl'))
 await assert.rejects(RunJournal.read(own,runId),error=>error.code==='journal-invalid');assert.equal(await readFile(other,'utf8'),'synthetic non-journal bytes\n')
})
test('the complete source is durable and detached before append completion; matching identity is not readmitted',async()=>{
 const spec=resolveConfig(Config({enabled:true}),await area());await RunJournal.initialize(spec)
 const source=scenario(),pending=RunJournal.claim(spec,runId,source);source.stages[0].inputs[0].text='later mutation'
 const first=await pending;assert.equal(first.created,true)
 const original=await RunJournal.read(spec,runId);assert.equal(original.created.scenario.stages[0].inputs[0].text,'hello\n完整原文')
 const event={type:'input',inputId:'first',time:1},append=first.journal.append(event);event.inputId='mutated';await append
 assert.equal(first.journal.snapshot()[1].inputId,'first');await first.journal.close()
 const repeated=await RunJournal.claim(spec,runId,scenario());assert.equal(repeated.created,false);assert.equal(repeated.stored.result.phase,'unfinished')
 await assert.rejects(RunJournal.claim(spec,runId,scenario({title:'different original'})),error=>error.code==='source-conflict')
})
test('an unfinished final line remains intact and visible without repair or replay',async()=>{
 const spec=resolveConfig(Config({enabled:true}),await area());await RunJournal.initialize(spec)
 const claimed=await RunJournal.claim(spec,runId,scenario());await claimed.journal.close()
 const path=join(spec.dataPath,runId+'.jsonl');await appendFile(path,'{"type":"capture"')
 const before=await readFile(path),stored=await RunJournal.read(spec,runId)
 assert.equal(stored.incompleteTail,true);assert.equal(stored.result.phase,'unfinished');assert.deepEqual(await readFile(path),before)
})
test('record capacity refuses oversized sources before creating a run',async()=>{
 const spec=resolveConfig(Config({enabled:true,maxRecordBytes:1024}),await area());await RunJournal.initialize(spec)
 const source=scenario();source.stages[0].inputs[0].text='x'.repeat(2048)
 await assert.rejects(RunJournal.claim(spec,runId,source),error=>error.code==='journal-limit')
 await assert.rejects(readFile(join(spec.dataPath,runId+'.jsonl')),error=>error.code==='ENOENT')
})
test('readable original cases do not depend on object key insertion order',async()=>{
 const spec=resolveConfig(Config({enabled:true}),await area());await RunJournal.initialize(spec)
 const original=scenario(),reordered={stages:original.stages,conversations:original.conversations,actors:original.actors,title:original.title}
 const claim=await RunJournal.claim(spec,runId,reordered);await claim.journal.close()
 assert.equal((await RunJournal.read(spec,runId)).created.scenario.title,original.title)
 assert.equal((await RunJournal.claim(spec,runId,original)).created,false)
})
test('tampered terminal counts cannot label an unexecuted case completed',async()=>{
 const spec=resolveConfig(Config({enabled:true}),await area());await RunJournal.initialize(spec)
 const {journal}=await RunJournal.claim(spec,runId,scenario())
 await journal.append({type:'ended',time:2,result:{runId,phase:'completed',replayed:false,inputCount:0,consumerFailures:0,unhandledInputs:0,captureCount:0,unresolvedMedia:0,failure:null}});await journal.close()
 await assert.rejects(RunJournal.read(spec,runId),error=>error.code==='journal-invalid')
})
