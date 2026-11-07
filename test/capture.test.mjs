import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ImRuntime,identifier} from 'dsh-im-kit'
import {Config,resolveConfig} from '../dist/config.js'
import {RunJournal} from '../dist/journal.js'
import {CaptureTransport} from '../dist/capture.js'
import {area,scenario,runId,signal} from './helpers.mjs'

async function fixture(t,patch={}){
 const spec=resolveConfig(Config({enabled:true,...patch}),await area());await RunJournal.initialize(spec)
 const {journal}=await RunJournal.claim(spec,runId,scenario())
 const account={tenantId:identifier('im.tenant','synthetic-lab'),networkId:identifier('im.network','im-lab'),accountId:identifier('im.account','lab-run/'+runId)}
 const transport=new CaptureTransport(account,runId,scenario(),journal),im=new ImRuntime(),release=im.register(transport)
 t.after(async()=>{await release();await im.close();await journal.close()})
 const scope={account,kind:'group',peerId:identifier('im.peer','lab-peer/'+runId+'/lounge')}
 return{spec,journal,transport,im,scope}
}
test('duplicate concurrent output operations capture once and tolerate object insertion order',async t=>{
 const {im,scope,journal}=await fixture(t),operationId=identifier('im.operation','synthetic-output-once')
 const message={scope,operationId,parts:[{type:'text',text:'unchanged output'}]}
 const first=im.send(message,signal()),second=im.send({parts:[{text:'unchanged output',type:'text'}],operationId,scope:{peerId:scope.peerId,kind:scope.kind,account:{accountId:scope.account.accountId,networkId:scope.account.networkId,tenantId:scope.account.tenantId}}},signal())
 assert.deepEqual(await first,await second);assert.equal(journal.snapshot().filter(event=>event.type==='capture').length,1)
 assert.deepEqual(await im.send({...message,parts:[{type:'text',text:'changed'}]},signal()),{status:'failed',code:'rejected'})
})
test('capture refuses undeclared peers and accounts while retaining opaque media without a byte-verification claim',async t=>{
 const {im,scope,journal,transport}=await fixture(t),message={scope,operationId:identifier('im.operation','media-reference'),parts:[{type:'image',attachmentId:identifier('im.attachment','synthetic-opaque-image')}]}
 assert.equal((await im.send(message,signal())).status,'accepted')
 const capture=journal.snapshot().find(event=>event.type==='capture').capture;assert.deepEqual(capture.parts,message.parts)
 assert.equal(await transport.availability({...scope,peerId:identifier('im.peer','undeclared')},signal()),'disabled')
 assert.deepEqual(await transport.send({...message,scope:{...scope,account:{...scope.account,accountId:identifier('im.account','outside')}}},signal()),{status:'failed',code:'permission-denied'})
})
test('a bounded journal capture failure remains uncertain and repeated operations do not append again',async t=>{
 const {im,scope,journal,transport}=await fixture(t,{maxRecordBytes:1024}),message={scope,operationId:identifier('im.operation','over-budget-capture'),parts:[{type:'text',text:'x'.repeat(2048)}]}
 assert.deepEqual(await im.send(message,signal()),{status:'uncertain',code:'provider-error'});assert.equal(transport.failure(),'journal-limit')
 assert.deepEqual(await im.send(message,signal()),{status:'uncertain',code:'provider-error'})
 assert.equal(journal.snapshot().filter(event=>event.type==='capture').length,0)
})
