/** Synthetic media consumer exercises the normal messaging and original-store interfaces. */
import assert from 'node:assert/strict'
import {identifier} from 'dsh-im-kit'
import {inspectOriginal,resolveInspection,mediaProvider,mediaSource} from 'dsh-media-kit'
export const inject=['im','imMedia']
export function apply(ctx){ctx.effect(()=>ctx.im.subscribe(async(message,signal)=>{
 const parts=message.parts.filter(part=>['image','audio','video','file'].includes(part.type));assert.ok(parts.length)
 for(const part of parts){const original=await ctx.imMedia.read(message.scope,part.attachmentId,signal);assert.ok(original.copyBytes().byteLength>0)}
 const policy=resolveInspection({maxBytes:1048576,maxDetectorBuffer:1048576,maxWidth:8192,maxHeight:8192,maxPixels:67108864,allowedMimeTypes:['text/html']}),file=await inspectOriginal(policy,{bytes:Buffer.from('<!doctype html><title>LAB_GENERATED_FILE</title>'),textMime:'text/html',fileName:'generated.html',source:{provider:mediaProvider('lab-fixture'),id:mediaSource('generated-file'),kind:'generated'}},signal),reference=await ctx.imMedia.store(message.scope,file,signal)
 const sent=await ctx.im.send({scope:message.scope,operationId:identifier('im.operation','synthetic-media/'+message.messageId),parts:[...parts,{type:'file',attachmentId:reference,name:'generated.html'}]},signal);assert.equal(sent.status,'accepted')
},message=>message.scope.account.networkId==='im-lab'&&message.parts.some(part=>part.type==='text'&&part.text==='LAB_MEDIA_FIXTURE')))}
