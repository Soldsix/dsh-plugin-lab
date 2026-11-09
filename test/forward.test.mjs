/** Complete forward graphs use published providers, native originals and the normal IM capture path. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {identifier} from 'dsh-im-kit'
import {LabEngine} from '../dist/engine.js'
import {RunJournal} from '../dist/journal.js'
import {scenarioFingerprint} from '../dist/identity.js'
import {runId,signal,deferred} from './helpers.mjs'
import {forwardContentProvider} from '../dist/forward.js'
import * as Delivery from 'dsh-job-delivery'
import NativeJobs from '@deepseek-ai/dsh-jobs-local'
import {createJobDeliveryObserver} from '../dist/job-delivery.js'
import {forward,source,gif} from './forward-helpers.mjs'
import {png} from './media-helpers.mjs'
const options={timeout:30000}
function echo(f,{prepare=false}={}){let seen=0;const release=f.im.subscribe(async(message,abort)=>{const part=message.parts.find(value=>value.type==='forward');if(!part)return;seen++;let id=part.resourceId;if(prepare){const value=await f.core.prepare({scope:message.scope,operationId:'prepared-'+message.messageId,input:{kind:'source',rootMessageId:message.messageId,resourceId:id}},abort);id=identifier('im.forward',value.id)}const result=await f.im.send({scope:message.scope,operationId:identifier('im.operation','output-'+message.messageId),parts:[{type:'text',text:'COMPLETE_FORWARD_OUTPUT'},{type:'forward',resourceId:id}]},abort);assert.equal(result.status,'accepted')},()=>true);return{get seen(){return seen},release}}

test('nested source, cached quote, PNG, GIF and file originals are captured completely without a transport',options,async t=>{
 const f=await forward(t),consumer=echo(f),result=await f.engine.run({runId,scenario:source()},signal());assert.equal(result.phase,'completed');assert.equal(result.captureCount,1);assert.equal(result.unresolvedMedia,0);assert.equal(consumer.seen,1)
 const stored=await f.engine.inspect(runId);assert.equal(stored.created.schema,3);assert.deepEqual(stored.created.contentProviders,['qq-forward']);const event=stored.events.find(value=>value.type==='content').content,graph=event.document;assert.equal(event.complete,true);assert.equal(event.partIndex,1);assert.equal(event.originals.length,3);assert.equal(graph.resources.length,2);assert.equal(graph.messages.length,2);assert.equal(graph.resources[0].nodes[0].parts[0].text,'FORWARD_EXACT <script>never execute</script>');assert.ok(graph.messages.some(value=>value.node.parts.some(part=>part.type==='text'&&part.text==='QUOTED_INPUT_EXACT')))
 const originals=await Promise.all(event.originals.map(async item=>Buffer.from((await f.engine.readMedia(runId,item.attachmentId,signal())).copyBytes())));assert.ok(originals.some(value=>value.equals(png)));assert.ok(originals.some(value=>value.equals(gif)));assert.ok(originals.some(value=>value.toString()==='EXACT_HTML_ORIGINAL'));assert.equal(f.core.status().providers,0)
 const before=await readFile(join(f.spec.dataPath,runId+'.jsonl'));assert.equal((await f.engine.run({runId,scenario:source()},signal())).replayed,true);assert.equal(consumer.seen,1);assert.deepEqual(await readFile(join(f.spec.dataPath,runId+'.jsonl')),before)
})

test('prepared forwards retain full graphs and lab-owned originals after all forward resolvers stop',options,async t=>{
 const f=await forward(t);echo(f,{prepare:true});const result=await f.engine.run({runId,scenario:source()},signal());assert.equal(result.phase,'completed');assert.equal(f.core.status().retained,1);const stored=await f.engine.inspect(runId),content=stored.events.find(value=>value.type==='content').content;assert.equal(content.complete,true);assert.equal(result.unresolvedMedia,0)
 await f.release();await f.engine.close();await f.core.close();const fresh=await LabEngine.open(f.spec,f.im,f.services);try{assert.equal((await fresh.inspect(runId)).result.unresolvedMedia,0);for(const item of content.originals)assert.ok((await fresh.readMedia(runId,item.attachmentId,signal())).descriptor.byteLength>0);assert.deepEqual(await fresh.run({runId,scenario:source()},signal()),{...result,replayed:true})}finally{await fresh.close()}
})

test('concurrent runs preserve root grants and reject foreign original mappings',options,async t=>{
 const f=await forward(t,{maxConcurrentRuns:3});echo(f);const ids=[runId,'synthetic-local-run-0002','synthetic-local-run-0003'],results=await Promise.all(ids.map(runId=>f.engine.run({runId,scenario:source()},signal())));assert.ok(results.every(value=>value.phase==='completed'&&value.unresolvedMedia===0));const reports=await Promise.all(ids.map(id=>f.engine.inspect(id))),contents=reports.map(value=>value.events.find(event=>event.type==='content').content);assert.equal(new Set(contents.map(value=>JSON.stringify(value.document.scope))).size,3)
 await assert.rejects(f.engine.readMedia(ids[0],contents[1].originals[0].attachmentId,signal()),error=>error.code==='media-invalid')
 const path=join(f.spec.dataPath,ids[0]+'.jsonl'),original=await readFile(path,'utf8'),events=original.trim().split('\n').map(JSON.parse);events.find(value=>value.type==='content').content.originals[0].attachmentId=contents[1].originals[0].attachmentId;try{await writeFile(path,events.map(value=>JSON.stringify(value)).join('\n')+'\n');await assert.rejects(f.engine.inspect(ids[0]),error=>error.code==='journal-invalid')}finally{await writeFile(path,original)}
})

test('missing nested resources remain explicit and cannot count as complete media',options,async t=>{
 const f=await forward(t);echo(f);const input=source();input.stages[1].inputs[0].content[0].value.resources=[];const result=await f.engine.run({runId,scenario:input},signal());assert.equal(result.captureCount,1);assert.equal(result.unresolvedMedia,1);const content=(await f.engine.inspect(runId)).events.find(value=>value.type==='content').content;assert.equal(content.complete,false);assert.ok(content.document.problems.some(value=>value.code==='not-found'))
})

test('provider source identity changes conflict while property order does not change its fingerprint',options,async t=>{
 const f=await forward(t);echo(f);const input=source(),changed=source();changed.stages[1].inputs[0].content[0].value.nodes[0].parts[0].text='CHANGED_SOURCE';assert.notEqual(scenarioFingerprint(input),scenarioFingerprint(changed));const reordered=structuredClone(input),value=reordered.stages[1].inputs[0].content[0].value;reordered.stages[1].inputs[0].content[0].value={resources:value.resources,nodes:value.nodes};assert.equal(scenarioFingerprint(input),scenarioFingerprint(reordered));await f.engine.run({runId,scenario:input},signal());await assert.rejects(f.engine.run({runId,scenario:changed},signal()),error=>error.code==='source-conflict')
})

test('legacy headers reject new source extensions and cannot claim new content events',options,async t=>{
 const f=await forward(t);echo(f);await f.engine.run({runId,scenario:source()},signal());const path=join(f.spec.dataPath,runId+'.jsonl'),original=await readFile(path,'utf8'),events=original.trim().split('\n').map(JSON.parse);events[0].schema=2;delete events[0].contentProviders;try{await writeFile(path,events.map(value=>JSON.stringify(value)).join('\n')+'\n');await assert.rejects(RunJournal.read(f.spec,runId),error=>error.code==='journal-invalid')}finally{await writeFile(path,original)}
})

test('actual native job delivery settles complete forward capture before a later input quotes it',options,async t=>{
 const f=await forward(t);f.ctx.provide('im',f.im);f.ctx.provide('storageDomain',f.domains);const jobs=f.ctx.plugin(NativeJobs,{});await jobs.await();const delivery=f.ctx.plugin(Delivery,Delivery.Config({enabled:true,namespace:'lab_forward_delivery'}));await delivery.await();const queue=f.ctx.jobDelivery
 const stop=queue.register({id:Delivery.providerId('forward-fixture'),maxConcurrent:4,async run(request,context){const prepared=await f.core.prepare({scope:request.scope,operationId:'background-'+request.operationId,input:{kind:'source',rootMessageId:request.payload.root,resourceId:request.payload.resource}},context.signal);await context.checkpoint(Delivery.outputId('forward'),[{type:'forward',resourceId:identifier('im.forward',prepared.id)}])}}),observe=f.engine.registerBackground(createJobDeliveryObserver(queue));let quoted=0
 f.im.subscribe(async(message,abort)=>{const part=message.parts.find(value=>value.type==='forward');if(part){await queue.submit({scope:message.scope,actorId:message.senderId,operationId:identifier('im.operation','queued-'+message.messageId),provider:Delivery.providerId('forward-fixture'),payload:{root:message.messageId,resource:part.resourceId}},abort);return}if(message.messageId.endsWith('/follow')){quoted++;assert.equal(message.parts.find(value=>value.type==='reply').messageId,'lab-out/'+runId+'/1')}},()=>true)
 try{const input=source();input.stages.push({inputs:[{id:'follow',actor:'alice',conversation:'lounge',text:'quote complete background forward',directed:true,replyToOutput:{stage:1,index:0}}]});const result=await f.engine.run({runId,scenario:input},signal());assert.equal(result.phase,'completed');assert.equal(result.unresolvedMedia,0);assert.equal(quoted,1);const report=await f.engine.inspect(runId);assert.equal(report.events.filter(value=>value.type==='content').length,1);assert.equal(report.events.find(value=>value.type==='background'&&value.tasks.length).tasks[0].outputs.accepted,1)}finally{await observe();await stop();await delivery.dispose();await jobs.dispose()}
})

test('resolver removal aborts and joins the active case while another case keeps working',options,async t=>{
 const f=await forward(t);await f.release();const entered=deferred(),aborted=deferred(),cleanup=deferred(),base=forwardContentProvider(f.core,()=>f.runtime);let closing=false
 const remove=f.engine.registerContent({id:base.id,open(request){const run=base.open(request);return{...run,async observe(message,abort){if(request.runId===runId&&message.messageId.endsWith('/quoted')){entered.resolve();abort.addEventListener('abort',()=>aborted.resolve(),{once:true});await cleanup.promise}return run.observe(message,abort)},async close(){closing=true;await run.close()}}}});echo(f)
 try{const first=f.engine.run({runId,scenario:source()},signal());await entered.promise;let removed=false;const removal=remove().then(()=>{removed=true});await aborted.promise;assert.equal(removed,false);assert.equal(f.core.status().providers,1);const replacement=f.engine.registerContent(base);try{const sibling=await f.engine.run({runId:'synthetic-local-run-0002',scenario:source()},signal());assert.equal(sibling.phase,'completed');assert.equal(removed,false)}finally{await replacement()}cleanup.resolve();assert.equal((await first).phase,'cancelled');await removal;assert.equal(closing,true);assert.equal(f.core.status().providers,0)}finally{cleanup.resolve()}
})

test('unknown resolvers and source authority fail before source publication without leaking errors',options,async t=>{
 const f=await forward(t);let published=0;f.im.subscribe(()=>{published++},()=>true)
 const input=source();input.stages=input.stages.slice(1);input.stages[0].inputs[0].content[0].provider='missing-resolver';const result=await f.engine.run({runId,scenario:input},signal());assert.equal(result.failure,'content-unavailable');assert.equal(published,0);assert.equal((await f.engine.inspect(runId)).created.scenario.stages[0].inputs[0].content[0].provider,'missing-resolver')
 const unsafe=source();unsafe.stages=unsafe.stages.slice(1);unsafe.stages[0].inputs[0].content[0].value.location='SYNTHETIC_PRIVATE_LOCATION';const failed=await f.engine.run({runId:'synthetic-local-run-0002',scenario:unsafe},signal());assert.equal(failed.failure,'content-invalid');assert.equal(published,0)
})

test('content metadata cannot be forged onto text parts or undeclared providers',options,async t=>{
 const f=await forward(t);echo(f);await f.engine.run({runId,scenario:source()},signal());const path=join(f.spec.dataPath,runId+'.jsonl'),original=await readFile(path,'utf8')
 try{for(const mutate of[events=>{events.find(value=>value.type==='content').content.partIndex=0},events=>{events[0].contentProviders=[]},events=>{events.find(value=>value.type==='content').content.originals.push(events.find(value=>value.type==='content').content.originals[0])}]){const events=original.trim().split('\n').map(JSON.parse);mutate(events);await writeFile(path,events.map(value=>JSON.stringify(value)).join('\n')+'\n');await assert.rejects(f.engine.inspect(runId),error=>error.code==='journal-invalid')}}finally{await writeFile(path,original)}
})

test('released generation-two reports remain byte-identical and replay no inputs after the reader upgrade',options,async t=>{
 const f=await forward(t),id='native-background-quote-0001',bytes=await readFile(new URL('./fixtures/journal-v2.jsonl',import.meta.url)),path=join(f.spec.dataPath,id+'.jsonl');await writeFile(path,bytes);let calls=0;f.im.subscribe(()=>{calls++},()=>true);const report=await f.engine.inspect(id);assert.equal(report.created.schema,2);assert.equal(report.result.phase,'completed');assert.equal((await f.engine.run({runId:id,scenario:report.created.scenario},signal())).replayed,true);assert.equal(calls,0);assert.deepEqual(await readFile(path),bytes)
})

test('simultaneous conversations under one account retain their own quotes and originals',options,async t=>{
 const f=await forward(t);echo(f,{prepare:true});const input=source(),left=structuredClone(input.stages[1].inputs[0]),right=structuredClone(left);input.conversations.push({id:'other',kind:'group'});const q=structuredClone(input.stages[0].inputs[0]);q.id='quotedOther';q.conversation='other';q.text='OTHER_CONVERSATION_QUOTE';input.stages[0].inputs.push(q);right.id='forwardedOther';right.conversation='other';right.content[0].value.nodes[0].parts[3].input='quotedOther';input.stages[1].inputs=[left,right]
 const result=await f.engine.run({runId,scenario:input},signal());assert.equal(result.phase,'completed');assert.equal(result.captureCount,2);assert.equal(result.unresolvedMedia,0);const content=(await f.engine.inspect(runId)).events.filter(value=>value.type==='content').map(value=>value.content);assert.equal(new Set(content.map(value=>value.document.scope.account.accountId)).size,1);assert.equal(new Set(content.map(value=>value.document.scope.peerId)).size,2);for(const value of content){const serialized=JSON.stringify(value.document);assert.equal(serialized.includes('OTHER_CONVERSATION_QUOTE'),value.conversation==='other');assert.equal(serialized.includes('QUOTED_INPUT_EXACT'),value.conversation==='lounge')}
})

test('a forward cannot use a quoted source from another conversation',options,async t=>{
 const f=await forward(t);echo(f);const input=source();input.conversations.push({id:'other',kind:'group'});input.stages[1].inputs[0].conversation='other';const result=await f.engine.run({runId,scenario:input},signal());assert.equal(result.unresolvedMedia,1);const content=(await f.engine.inspect(runId)).events.find(value=>value.type==='content').content;assert.equal(content.complete,false);assert.ok(content.document.problems.some(value=>value.kind==='message'&&value.code==='not-found'));assert.equal(JSON.stringify(content.document).includes('QUOTED_INPUT_EXACT'),false)
})
