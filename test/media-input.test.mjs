/** Browser uploads preserve exact file bytes and target one synthetic input. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {attachMediaFiles,mediaTargets} from '../dist/media-input.js'
const limits={maxMediaItemBytes:200000,maxMediaBytes:400000,maxMediaReferences:5,maxRecordBytes:1000000},source=()=>({title:'Uploads',actors:['alice','bob'],conversations:[{id:'one',kind:'group'},{id:'two',kind:'private'}],stages:[{inputs:[{id:'a',actor:'alice',conversation:'one',text:'first\noriginal',directed:true},{id:'b',actor:'bob',conversation:'two',text:'second',directed:false}]}]})
test('browser files retain complete large bytes and only change the selected input',async()=>{
 const input=source(),raw=JSON.stringify(input),bytes=Uint8Array.from({length:100000},(_,i)=>i%256),file=new File([bytes],'picture.png',{type:'image/png'}),html=new File(['<html>synthetic original</html>'],"owner's.html",{type:'text/html'})
 const result=JSON.parse(await attachMediaFiles(raw,'b',[file,html],limits));assert.deepEqual(result.stages[0].inputs[0],input.stages[0].inputs[0]);assert.equal(result.stages[0].inputs[1].text,'second');assert.deepEqual(result.stages[0].inputs[1].media,[{type:'image',asset:'media0'},{type:'file',asset:'media1'}]);assert.deepEqual(Buffer.from(result.assets[0].base64,'base64'),Buffer.from(bytes));assert.equal(result.assets[1].textMime,'text/html');assert.equal(result.assets[1].fileName,"owner's.html")
 assert.equal(raw,JSON.stringify(input));assert.deepEqual(mediaTargets(raw).map(value=>value.id),['a','b']);assert.deepEqual(mediaTargets('{broken'),[])
})
test('upload capacity, duplicate targets and invalid source fail without a partial returned draft',async()=>{
 const raw=JSON.stringify(source()),file=new File([new Uint8Array(100)],'safe.bin')
 for(const settings of [{...limits,maxMediaItemBytes:20},{...limits,maxMediaBytes:20},{...limits,maxMediaReferences:0},{...limits,maxRecordBytes:20}])await assert.rejects(attachMediaFiles(raw,'a',[file],settings),error=>error.reason==='capacity')
 await assert.rejects(attachMediaFiles('{broken','a',[file],limits),error=>error.reason==='invalid-source');await assert.rejects(attachMediaFiles(raw,'missing',[file],limits),error=>error.reason==='invalid-target')
 const duplicate=source();duplicate.stages[0].inputs[1].id='a';await assert.rejects(attachMediaFiles(JSON.stringify(duplicate),'a',[file],limits),error=>error.reason==='invalid-target');assert.equal(raw,JSON.stringify(source()))
})
test('new asset IDs avoid collisions and preserve original unknown fields for Host validation',async()=>{
 const input=source();input.assets=[{id:'media1',fileName:'old.wav',base64:'AAAA'}];input.authority='Host must reject this';const result=JSON.parse(await attachMediaFiles(JSON.stringify(input),'a',[new File(['audio'],'new.wav',{type:'audio/wav'})],limits));assert.equal(result.assets[1].id,'media2');assert.equal(result.authority,input.authority);assert.deepEqual(result.assets[0],input.assets[0]);assert.deepEqual(result.stages[0].inputs[0].media,[{type:'audio',asset:'media2'}])
})
