import test from 'node:test'
import assert from 'node:assert/strict'
import {Context} from '@deepseek-ai/cordis'
import {identifier} from 'dsh-im-kit'
import Control,{Config as ControlConfig} from '../dist/control.js'
import {Config} from '../dist/config.js'
import {configRevision} from '../dist/config-revision.js'
import {CONFIG_FIELDS} from '../dist/config-fields.js'
import {draftPatch} from '../dist/config-draft.js'
import {saveSchema,startSchema,snapshotSchema,inspectSchema} from '../dist/control-codecs.js'
import {setup,scenario,runId,deferred} from './helpers.mjs'

const rejected=reason=>error=>error.code==='im-lab/control'&&error.details.reason===reason&&!error.message.includes('private-fixture-error')
async function mount(t,patch={}){
 const state=await setup(t),ctx=new Context(),writes=[],routes=[]
 const entry={options:{id:'plugin-lab-runtime',name:'dsh-plugin-lab',config:{enabled:true}},disabled:false,fiber:{config:{enabled:false},effectiveConfig:Config({enabled:true}),state:2,restarts:0,async restart(){this.restarts++}}}
 const editor={entries:()=>[entry],configuration:()=>[{entry,override:{maxConcurrentRuns:2}}],async edit(target,change){assert.equal(target,entry);const raw=change(entry.options.config);writes.push(raw);entry.options.config=raw;entry.fiber.effectiveConfig=Config(raw)}}
 const fixture=ctx.plugin({name:'lab-control-fixture',apply(ctx){ctx.effect(()=>ctx.provide('configEditor',editor));ctx.effect(()=>ctx.provide('imLab',state.engine));ctx.effect(()=>ctx.provide('connection',{fetch:{register(route){routes.push(route);return async()=>{routes.splice(routes.indexOf(route),1)}}}}))}})
 await fixture.await()
 const fiber=ctx.plugin(Control,ControlConfig(patch));await fiber.await()
 t.after(async()=>{await fiber.dispose();await fixture.dispose()})
 return{...state,ctx,control:ctx.imLabControl,entry,writes,routes,fiber}
}
test('native controller reads effective settings and revisions independently of disabled raw expressions',async t=>{
 const {control,entry}=await mount(t),state=await control.describe()
 assert.equal(state.config.enabled,true);assert.equal(state.appliedRevision,state.revision);assert.equal(state.downloads,true);assert.deepEqual(state.overriddenFields,['maxConcurrentRuns'])
 state.config.namespace='changed';assert.equal(entry.fiber.effectiveConfig.namespace,'im-lab')
 assert.deepEqual(Object.keys(CONFIG_FIELDS).sort(),Object.keys(state.config).sort());assert.equal(snapshotSchema.safeParse(state).success,true)
})
test('revision and cross-field validation reject invalid edits without profile writes',async t=>{
 const {control,writes,entry}=await mount(t),initial=await control.describe()
 const saved=await control.save({revision:initial.revision,patch:{maxConcurrentRuns:3}});assert.equal(saved.config.maxConcurrentRuns,3);assert.equal(writes.length,1)
 await assert.rejects(control.save({revision:initial.revision,patch:{enabled:false}}),rejected('revision-conflict'))
 await assert.rejects(control.save({revision:saved.revision,patch:{maxRecordBytes:8192,maxReportBytes:4096}}),rejected('config-invalid'))
 await assert.rejects(async()=>control.save({revision:saved.revision,patch:{hiddenKey:'private-fixture-error'}}),rejected('request-invalid'))
 assert.equal(writes.length,1);assert.equal(configRevision(entry.fiber.effectiveConfig),saved.revision)
})
test('short start calls survive caller navigation while active cases refuse edits and explicit cancellation joins work',async t=>{
 const {control,engine,im,fiber}=await mount(t),entered=deferred(),finished=deferred()
 im.subscribe(async(_message,signal)=>{entered.resolve();await new Promise(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true})});finished.resolve()},()=>true)
 const state=await control.describe(),admission=await control.start({revision:state.revision,runId,scenario:scenario()})
 assert.equal(admission.replayed,false);await entered.promise;assert.equal(engine.status().active,1)
 await assert.rejects(control.save({revision:state.revision,patch:{enabled:false}}),rejected('busy'))
 await assert.rejects(control.restart({revision:state.revision}),rejected('busy'))
 assert.equal((await control.cancel({runId})).requested,true);await finished.promise;assert.equal((await engine.wait(runId)).phase,'cancelled')
 const second='synthetic-control-run-0002';await control.start({revision:state.revision,runId:second,scenario:scenario()})
 await fiber.dispose();assert.equal((await engine.wait(second)).phase,'cancelled');assert.equal(engine.status().active,0);assert.equal(engine.status().lastFailure,null)
})
test('bounded text previews disclose truncation and full authenticated-route output retains exact bytes',async t=>{
 const {control,engine,im,routes}=await mount(t,{previewCaptures:1,previewChars:4})
 im.subscribe(async(message,signal)=>{for(const suffix of ['one','two'])await im.send({scope:message.scope,operationId:identifier('im.operation',suffix),parts:[{type:'text',text:'complete-public-output-'+suffix}]},signal)},()=>true)
 const state=await control.describe();await control.start({revision:state.revision,runId,scenario:scenario()});await engine.wait(runId)
 const observed=await control.inspect({runId});assert.equal(observed.captures[0].text,'comp');assert.equal(observed.captures[0].truncated,true);assert.equal(observed.omittedCaptures,1);assert.equal(inspectSchema.safeParse(observed).success,true)
 assert.deepEqual((await control.list({})).runIds,[runId])
 const response=await routes[0].fetch(new Request('http://localhost/api/im-lab-report?runId='+runId)),text=await response.text()
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(text.includes('complete-public-output-two'));assert.equal(Number(response.headers.get('content-length')),Buffer.byteLength(text))
 for(const query of ['runId=../outside','runId='+runId+'&path=private','runId='+runId+'&runId='+runId])assert.equal((await routes[0].fetch(new Request('http://localhost/api/im-lab-report?'+query))).status,400)
})
test('browser drafts and codecs reject extra authority and retain edits without truncating sources',()=>{
 const baseline=Config({});assert.deepEqual(draftPatch({maxConcurrentRuns:'3',dataPath:'x\ny'},baseline),{ok:true,patch:{maxConcurrentRuns:3,dataPath:'x\ny'}})
 for(const raw of ['','1.5','NaN','9007199254740993'])assert.deepEqual(draftPatch({maxInputs:raw},baseline),{ok:false,field:'maxInputs'})
 const revision='a'.repeat(64),source={revision,runId,scenario:scenario()}
 assert.equal(startSchema.safeParse({...source,liveGroup:'90000123'}).success,false);assert.equal(saveSchema.safeParse({revision,patch:{credential:'synthetic-only'}}).success,false)
 assert.deepEqual(startSchema.parse(source).scenario,scenario())
})
