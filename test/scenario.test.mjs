import {test} from 'node:test'
import assert from 'node:assert/strict'
import {join} from 'node:path'
import {Config,resolveConfig} from '../dist/config.js'
import {parseScenario,runIdSchema} from '../dist/schema.js'
import {area,scenario} from './helpers.mjs'

test('disabled configuration performs path resolution without creating a report directory',async()=>{
 const directory=await area()
 assert.equal(resolveConfig(Config({}),directory),null)
 for(const invalid of[{dataPath:'relative'}, {namespace:'../escape'}, {maxInputs:1,maxInputsPerStage:2},{maxRecordBytes:2048,maxReportBytes:1024}])assert.throws(()=>resolveConfig(Config(invalid),directory))
 assert.equal(resolveConfig(Config({enabled:true}),directory).dataPath,join(directory,'data','im-lab'))
 for(const value of['../escape','short','synthetic/run/name'])assert.throws(()=>runIdSchema.parse(value))
})
test('scenario parser preserves original text while rejecting extra authority and invalid references',async()=>{
 const spec=resolveConfig(Config({enabled:true}),await area()),source=scenario(),parsed=parseScenario(source,spec)
 source.stages[0].inputs[0].text='changed after parsing'
 assert.equal(parsed.stages[0].inputs[0].text,'hello\n完整原文')
 for(const invalid of[{...scenario(),accountId:'real-account'},scenario({actors:['alice','alice']}),scenario({stages:[{inputs:[{id:'first',actor:'outsider',conversation:'lounge',text:'hello',directed:true}]}]}),scenario({stages:[{inputs:[{id:'first',actor:'alice',conversation:'elsewhere',text:'hello',directed:true}]}]}),scenario({stages:[{inputs:[{id:'first',actor:'alice',conversation:'lounge',text:' ',directed:true}]}]})])assert.throws(()=>parseScenario(invalid,spec))
 const duplicate=scenario();duplicate.stages.push(structuredClone(duplicate.stages[0]));assert.throws(()=>parseScenario(duplicate,spec))
 assert.throws(()=>parseScenario(scenario(),{...spec,maxTextChars:2}))
})
