/** Inline originals traverse real IM consumers and remain downloadable after the case closes. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import sharp from 'sharp'
import gifenc from 'gifenc'
import {ImRuntime,identifier,scopeKey} from 'dsh-im-kit'
import {inspectOriginal,mediaProvider,mediaSource} from 'dsh-media-kit'
import {mediaStorage,Config,resolveConfig} from '../dist/config.js'
import {parseScenario} from '../dist/schema.js'
import {LabEngine} from '../dist/engine.js'
import {labScope,scenarioFingerprint} from '../dist/identity.js'
import {setupMedia,png,asset,source} from './media-helpers.mjs'
import {area,signal,deferred} from './helpers.mjs'
const runId='native-media-local-0001',op=message=>identifier('im.operation','media-output/'+message.messageId)

test('image-only input, generated media output and downloads retain the exact original bytes without replay',async t=>{
 const {engine,im,runtime,spec,services}=await setupMedia(t);let calls=0,generated
 im.subscribe(async(message,abort)=>{
  calls++;const input=message.parts.find(part=>part.type==='image'),original=await runtime.read(message.scope,input.attachmentId,abort);assert.deepEqual(original.copyBytes(),new Uint8Array(png))
  generated=await inspectOriginal(mediaStorage(spec).inspection,{bytes:Buffer.from('<!doctype html><title>synthetic generated file</title>'),textMime:'text/html',fileName:'animation.html',source:{provider:mediaProvider('fixture'),id:mediaSource('generated-html'),kind:'generated'}},abort)
  const file=await runtime.store(message.scope,generated,abort),receipt=await im.send({scope:message.scope,operationId:op(message),parts:[{type:'image',attachmentId:input.attachmentId},{type:'file',attachmentId:file,name:'animation.html'}]},abort);assert.equal(receipt.status,'accepted')
 },()=>true)
 const input=source(),result=await engine.run({runId,scenario:input},signal());assert.equal(result.phase,'completed');assert.equal(result.unresolvedMedia,0)
 const saved=await engine.inspect(runId),capture=saved.events.find(event=>event.type==='capture').capture;assert.equal(capture.originals.length,2);assert.deepEqual(saved.created.scenario,input);assert.equal(saved.events.filter(event=>event.type==='media-grant').length,2)
 assert.deepEqual((await engine.readMedia(runId,capture.originals[0].attachmentId,signal())).copyBytes(),new Uint8Array(png));assert.deepEqual((await engine.readMedia(runId,capture.originals[1].attachmentId,signal())).copyBytes(),generated.copyBytes())
 assert.equal((await engine.run({runId,scenario:input},signal())).replayed,true);assert.equal(calls,1);await engine.close();const reopened=await LabEngine.open(spec,im,services);t.after(()=>reopened.close());assert.deepEqual((await reopened.readMedia(runId,capture.originals[0].attachmentId,signal())).copyBytes(),new Uint8Array(png))
})
test('4K images, complete animated GIFs and WAV containers pass through the same input and output path',async t=>{
 const {engine,im,runtime}=await setupMedia(t),bytes=await sharp({create:{width:3840,height:2160,channels:4,background:'#4283b7'}}).png().toBuffer(),gif=gifenc.GIFEncoder(),palette=[[255,0,0],[0,0,255]]
 gif.writeFrame(new Uint8Array(64).fill(0),8,8,{palette,delay:100,repeat:0});gif.writeFrame(new Uint8Array(64).fill(1),8,8,{palette,delay:100});gif.finish()
 const wav=Buffer.alloc(52);wav.write('RIFF',0);wav.writeUInt32LE(44,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(8,40)
 const assets=[asset('high',bytes,'source.webp'),asset('animated',gif.bytes(),'motion.png'),asset('voice',wav,'sound.mp3')],seen=[]
 im.subscribe(async(message,abort)=>{const parts=message.parts.filter(part=>['image','audio'].includes(part.type));for(const [index,part]of parts.entries()){const original=await runtime.read(message.scope,part.attachmentId,abort);assert.deepEqual(Buffer.from(original.copyBytes()),Buffer.from(assets[index].base64,'base64'));if(index===0)assert.deepEqual(original.descriptor.image,{width:3840,height:2160});if(index===1)assert.equal((await sharp(original.copyBytes(),{animated:true}).metadata()).pages,2)}await im.send({scope:message.scope,operationId:op(message),parts},abort);seen.push(...parts)},()=>true)
 const input=source({assets});input.stages[0].inputs[0].media=[{type:'image',asset:'high'},{type:'image',asset:'animated'},{type:'audio',asset:'voice'}];const result=await engine.run({runId,scenario:input},signal());assert.equal(result.phase,'completed');assert.equal(result.unresolvedMedia,0)
 for(const [index,part]of seen.entries())assert.deepEqual(Buffer.from((await engine.readMedia(runId,part.attachmentId,signal())).copyBytes()),Buffer.from(assets[index].base64,'base64'))
})
test('three parallel cases and fifteen actors keep media and capture destinations isolated',async t=>{
 const {engine,im,runtime,spec}=await setupMedia(t,{maxConcurrentRuns:3}),actors=Array.from({length:15},(_,i)=>'actor'+i),arrived=deferred();let entered=0
 im.subscribe(async(message,abort)=>{if(++entered===2)arrived.resolve();await arrived.promise;const part=message.parts.find(part=>part.type==='image');assert.deepEqual((await runtime.read(message.scope,part.attachmentId,abort)).copyBytes(),new Uint8Array(png));await assert.rejects(runtime.read({...message.scope,kind:'private'},part.attachmentId,abort),error=>error.code==='not-found');await im.send({scope:message.scope,operationId:op(message),parts:[part]},abort)},()=>true)
 const input=source({actors,conversations:[{id:'one',kind:'group'},{id:'two',kind:'group'}],stages:[{inputs:actors.map((actor,index)=>({id:'m'+index,actor,conversation:index%2?'one':'two',text:'',directed:true,media:[{type:'image',asset:'pixel'}]}))}]})
 const ids=['parallel-media-case-0001','parallel-media-case-0002','parallel-media-case-0003'],results=await Promise.all(ids.map(id=>engine.run({runId:id,scenario:input},signal())));assert.ok(results.every(result=>result.phase==='completed'&&result.captureCount===15&&result.unresolvedMedia===0));assert.equal(entered,45)
 const saved=await engine.inspect(ids[0]),ref=saved.events.find(event=>event.type==='capture').capture.originals[0].attachmentId;await assert.rejects(engine.readMedia(ids[1],ref,signal()),error=>error.code==='media-invalid');assert.equal(runtime.status().providers,0);assert.equal(runtime.status().pending,0)
 assert.notEqual(scopeKey(labScope(spec.namespace,ids[0],input.conversations[0])),scopeKey(labScope(spec.namespace,ids[1],input.conversations[0])))
})
test('media source validation rejects invalid encodings, references and source authority before execution',async t=>{
 const {spec,engine}=await setupMedia(t)
 for(const patch of [{base64:'not base64'},{base64:'AAAA='},{fileName:'../secret.png'},{hostPath:'forbidden'},{textMime:'text/html',unclassified:true}]){const input=source();Object.assign(input.assets[0],patch);assert.throws(()=>parseScenario(input,spec))}
 const missing=source();missing.stages[0].inputs[0].media[0].asset='missing';assert.throws(()=>parseScenario(missing,spec));const duplicate=source();duplicate.assets.push({...duplicate.assets[0]});assert.throws(()=>parseScenario(duplicate,spec))
 const changed=source();changed.assets[0].fileName='different.png';assert.notEqual(scenarioFingerprint(changed),scenarioFingerprint(source()))
 assert.throws(()=>parseScenario(source(),{...spec,maxMediaItemBytes:32}));assert.throws(()=>parseScenario(source(),{...spec,maxMediaBytes:32}))
 const unsupported=source();unsupported.assets[0].base64=Buffer.from('plain text').toString('base64');const result=await engine.run({runId,scenario:unsupported},signal());assert.equal(result.failure,'media-invalid');assert.deepEqual((await engine.inspect(runId)).created.scenario,unsupported)
})
test('disabled media and missing native services fail explicitly without admitting a case',async t=>{
 const {engine,spec}=await setupMedia(t,{mediaEnabled:false});await assert.rejects(async()=>engine.run({runId,scenario:source()},signal()),error=>error.code==='media-unavailable');await assert.rejects(readFile(join(spec.dataPath,runId+'.jsonl')),error=>error.code==='ENOENT')
 const im=new ImRuntime();t.after(()=>im.close());await assert.rejects(LabEngine.open({...spec,mediaEnabled:true},im),error=>error.code==='media-unavailable')
})
test('forged capture metadata or foreign grants cannot be downloaded as verified media',async t=>{
 const {engine,im,spec}=await setupMedia(t);im.subscribe(async(message,abort)=>{await im.send({scope:message.scope,operationId:op(message),parts:message.parts.filter(part=>part.type==='image')},abort)},()=>true)
 await engine.run({runId,scenario:source()},signal());const path=join(spec.dataPath,runId+'.jsonl'),text=await readFile(path,'utf8'),events=text.trim().split('\n').map(line=>JSON.parse(line)),capture=events.find(value=>value.type==='capture'),ref=capture.capture.originals[0].attachmentId
 capture.capture.originals[0].sha256='0'.repeat(64);await writeFile(path,events.map(value=>JSON.stringify(value)).join('\n')+'\n');await assert.rejects(engine.readMedia(runId,ref,signal()),error=>error.code==='journal-invalid')
 const restored=text.trim().split('\n').map(line=>JSON.parse(line));restored.find(value=>value.type==='media-grant').grant.scope=JSON.stringify(['foreign','im-lab','other','group','room']);await writeFile(path,restored.map(value=>JSON.stringify(value)).join('\n')+'\n');await assert.rejects(engine.readMedia(runId,ref,signal()),error=>error.code==='journal-invalid')
})
test('unknown outbound references fail without an accepted capture or provider error disclosure',async t=>{
 const {engine,im}=await setupMedia(t);im.subscribe(async(message,abort)=>{const result=await im.send({scope:message.scope,operationId:op(message),parts:[{type:'image',attachmentId:identifier('im.attachment','mr_'+'x'.repeat(43))}]},abort);assert.notEqual(result.status,'accepted')},()=>true)
 const result=await engine.run({runId,scenario:source()},signal());assert.equal(result.phase,'failed');assert.equal(result.failure,'media-failed');assert.equal(result.captureCount,0)
})

test('a slow media import does not block another conversation in the same stage',async t=>{
 const entered=deferred(),finish=deferred(),chatDone=deferred();let imports=0;const state=await setupMedia(t,{},store=>({async saveFileStream(request){if(++imports===1){entered.resolve();await finish.promise}return store.saveFileStream(request)},readFileStream:store.readFileStream.bind(store)}))
 state.im.subscribe(async(message,abort)=>{const text=message.parts.find(part=>part.type==='text')?.text;if(text==='parallel chat'){await entered.promise;await state.im.send({scope:message.scope,operationId:op(message),parts:[{type:'text',text:'chat continued'}]},abort);chatDone.resolve()}else await state.im.send({scope:message.scope,operationId:op(message),parts:message.parts.filter(part=>part.type==='image')},abort)},()=>true)
 const input=source({conversations:[{id:'image',kind:'group'},{id:'chat',kind:'group'}],stages:[{inputs:[{id:'picture',actor:'alice',conversation:'image',text:'',directed:true,media:[{type:'image',asset:'pixel'}]},{id:'text',actor:'bob',conversation:'chat',text:'parallel chat',directed:true}]}]}),pending=state.engine.run({runId,scenario:input},signal())
 try{await entered.promise;await chatDone.promise;assert.equal(state.engine.status().active,1);assert.equal((await state.engine.inspect(runId)).result.captureCount,1)}finally{finish.resolve()}
 const result=await pending;assert.equal(result.phase,'completed');assert.equal(result.captureCount,2);assert.equal(result.unresolvedMedia,0)
})
test('cancelling an import joins its late storage completion without starving another case or replaying work',async t=>{
 const entered=deferred(),finish=deferred(),caller=new AbortController();let imports=0;const state=await setupMedia(t,{},store=>({async saveFileStream(request){if(++imports===1){entered.resolve();await finish.promise}return store.saveFileStream(request)},readFileStream:store.readFileStream.bind(store)}))
 state.im.subscribe(async(message,abort)=>{await state.im.send({scope:message.scope,operationId:op(message),parts:message.parts.filter(part=>part.type==='image')},abort)},()=>true)
 const first=state.engine.run({runId,scenario:source()},caller.signal);let completed=false;void first.then(()=>{completed=true})
 try{await entered.promise;caller.abort();const sibling=await state.engine.run({runId:'native-media-sibling-0002',scenario:source()},signal());assert.equal(sibling.phase,'completed');assert.equal(completed,false)}finally{finish.resolve()}
 assert.equal((await first).phase,'cancelled');assert.equal((await state.engine.run({runId,scenario:source()},signal())).replayed,true);assert.equal(imports,2);assert.deepEqual((await state.engine.inspect(runId)).created.scenario,source());assert.equal(state.runtime.status().providers,0)
})

test('disabling new media capture preserves read-only downloads of retained originals',async t=>{
 const {engine,im,runtime,spec,attachments}=await setupMedia(t);im.subscribe(async(message,abort)=>{await im.send({scope:message.scope,operationId:op(message),parts:message.parts.filter(part=>part.type==='image')},abort)},()=>true)
 await engine.run({runId,scenario:source()},signal());const saved=await engine.inspect(runId),reference=saved.events.find(event=>event.type==='capture').capture.originals[0].attachmentId;await engine.close();const readOnly=await LabEngine.open({...spec,mediaEnabled:false},im,{attachments});t.after(()=>readOnly.close());assert.deepEqual((await readOnly.readMedia(runId,reference,signal())).copyBytes(),new Uint8Array(png));await assert.rejects(async()=>readOnly.run({runId:'media-disabled-new-0002',scenario:source()},signal()),error=>error.code==='media-unavailable');assert.equal(runtime.status().providers,0)
})
