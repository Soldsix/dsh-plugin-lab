/** Owner media views and native download routes preserve bytes and join teardown. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {setTimeout as delay} from 'node:timers/promises'
import {Context} from '@deepseek-ai/cordis'
import {identifier} from 'dsh-im-kit'
import Control,{Config as ControlConfig} from '../dist/control.js'
import {inspectSchema} from '../dist/control-codecs.js'
import {setupMedia,asset,source,png} from './media-helpers.mjs'
import {deferred,signal} from './helpers.mjs'
async function mount(t,state,patch={}){
 const ctx=new Context(),routes=[],entry={options:{id:'plugin-lab-runtime',name:'dsh-plugin-lab',config:state.config},disabled:false,fiber:{config:state.config,effectiveConfig:state.config,state:2,async restart(){}}},editor={entries:()=>[entry],configuration:()=>[{entry}],async edit(_target,change){entry.options.config=change(entry.options.config);entry.fiber.effectiveConfig=entry.options.config}}
 const fixture=ctx.plugin({name:'media-owner-fixture',apply(ctx){ctx.effect(()=>ctx.provide('configEditor',editor));ctx.effect(()=>ctx.provide('imLab',state.engine));ctx.effect(()=>ctx.provide('connection',{fetch:{register(route){routes.push(route);return async()=>{routes.splice(routes.indexOf(route),1)}}}}))}});await fixture.await();const fiber=ctx.plugin(Control,ControlConfig(patch));await fiber.await();t.after(async()=>{await fiber.dispose();await fixture.dispose()});return{control:ctx.imLabControl,routes,fiber,editor}
}
function echo(state){state.im.subscribe(async(message,abort)=>{await state.im.send({scope:message.scope,operationId:identifier('im.operation','echo/'+message.messageId),parts:message.parts.filter(part=>['image','file'].includes(part.type))},abort)},()=>true)}
test('owner preview omits native references and downloads exact image and HTML bytes',async t=>{
 const state=await setupMedia(t),{control,routes}=await mount(t,state,{previewCaptures:1});echo(state);const input=source({assets:[asset(),asset('html',Buffer.from('<html>synthetic</html>'),"owner's.html",{textMime:'text/html'})]});input.stages[0].inputs[0].media.push({type:'file',asset:'html'})
 const runId='media-download-case-0001';await state.engine.run({runId,scenario:input},signal());const observed=await control.inspect({runId});assert.equal(inspectSchema.safeParse(observed).success,true);assert.equal(observed.originals.length,1);assert.equal(observed.omittedOriginals,1);assert.ok(!JSON.stringify(observed).includes('sha256:'))
 const route=routes.find(route=>route.path==='/api/im-lab-media'),saved=await state.engine.inspect(runId),grants=saved.events.filter(event=>event.type==='media-grant')
 for(const [index,{grant}]of grants.entries()){const response=await route.fetch(new Request('http://localhost/api/im-lab-media?runId='+runId+'&attachmentId='+grant.reference));assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(input.assets[index].base64,'base64'));assert.equal(response.headers.get('content-security-policy'),"default-src 'none'; sandbox");assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(response.headers.get('content-disposition').startsWith(index===0?'inline;':'attachment;'));if(index===1)assert.ok(response.headers.get('content-disposition').includes('%27'))}
 for(const query of ['runId=../outside&attachmentId='+grants[0].grant.reference,'runId='+runId+'&attachmentId='+grants[0].grant.reference+'&path=private','runId='+runId+'&attachmentId=x','runId='+runId+'&attachmentId='+grants[0].grant.reference+'&attachmentId='+grants[0].grant.reference])assert.equal((await route.fetch(new Request('http://localhost/api/im-lab-media?'+query))).status,400)
 assert.equal((await route.fetch(new Request('http://localhost/api/im-lab-media?runId=missing-download-case-0001&attachmentId='+grants[0].grant.reference))).status,404)
})
test('media download admission blocks edits and route teardown aborts and joins an active read',async t=>{
 let delayed=false;const entered=deferred(),aborted=deferred(),finish=deferred(),state=await setupMedia(t,{},store=>({saveFileStream:store.saveFileStream.bind(store),async *readFileStream(ref,abort){if(delayed){entered.resolve();await new Promise(resolve=>{if(abort.aborted)resolve();else abort.addEventListener('abort',resolve,{once:true})});aborted.resolve();await finish.promise}yield*store.readFileStream(ref,abort)}}));echo(state)
 const {control,routes,fiber}=await mount(t,state),runId='media-download-case-0001';await state.engine.run({runId,scenario:source()},signal());const observed=await control.inspect({runId}),snapshot=await control.describe(),route=routes.find(route=>route.path==='/api/im-lab-media');delayed=true
 const response=route.fetch(new Request('http://localhost/api/im-lab-media?runId='+runId+'&attachmentId='+observed.originals[0].attachmentId));await entered.promise;await assert.rejects(control.save({revision:snapshot.revision,patch:{enabled:false}}),error=>error.details.reason==='busy')
 let disposed=false;const closing=Promise.resolve(fiber.dispose()).then(()=>{disposed=true}),guard=new AbortController()
 try{await Promise.race([aborted.promise,delay(5000,undefined,{signal:guard.signal}).then(()=>{throw Error('Download scope did not abort')})]);assert.equal(disposed,false)}finally{guard.abort();finish.resolve()}
 assert.equal((await response).status,404);await closing;assert.equal(disposed,true)
})

test('an in-flight settings edit refuses new media downloads until the edit settles',async t=>{
 const state=await setupMedia(t),{control,routes,editor}=await mount(t,state),entered=deferred(),finish=deferred();echo(state);const runId='media-download-case-0001';await state.engine.run({runId,scenario:source()},signal());const observed=await control.inspect({runId}),snapshot=await control.describe(),original=editor.edit.bind(editor),url='http://localhost/api/im-lab-media?runId='+runId+'&attachmentId='+observed.originals[0].attachmentId
 editor.edit=async(...args)=>{entered.resolve();await finish.promise;return original(...args)};const saving=control.save({revision:snapshot.revision,patch:{maxConcurrentRuns:3}})
 try{await entered.promise;assert.equal((await routes.find(route=>route.path==='/api/im-lab-media').fetch(new Request(url))).status,409)}finally{finish.resolve();await saving}
 const response=await routes.find(route=>route.path==='/api/im-lab-media').fetch(new Request(url));assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png)
})
