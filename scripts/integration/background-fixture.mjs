/** Synthetic admission-only consumer uses the installed durable queue and normal original-media path. */
import assert from 'node:assert/strict'
import {identifier} from 'dsh-im-kit'
import {providerId,outputId} from 'dsh-job-delivery'
export const inject=['im','imLab','jobDelivery']
export function apply(ctx){
 const id=providerId('lab-background-fixture');let enter,finish
 const entered=new Promise(resolve=>{enter=resolve}),cleanup=new Promise(resolve=>{finish=resolve})
 ctx.provide('labBackgroundFixture',{entered,finish})
 ctx.effect(()=>ctx.jobDelivery.register({id,maxConcurrent:4,async run(request,context){
  if(request.payload.text==='LAB_BACKGROUND_HOLD'){enter();await new Promise(resolve=>context.signal.addEventListener('abort',resolve,{once:true}));await cleanup;return}
  await context.checkpoint(outputId('original'),request.payload.parts.length?request.payload.parts:[{type:'text',text:request.payload.text==='LAB_BACKGROUND_FOLLOW'?'LAB_BACKGROUND_QUOTED':'LAB_BACKGROUND_READY'}])
 }}))
 ctx.effect(()=>ctx.im.subscribe(async(message,signal)=>{
  const text=message.parts.find(part=>part.type==='text')?.text
  if(text==='LAB_BACKGROUND_FOLLOW')assert.ok(message.parts.find(part=>part.type==='reply'))
  await ctx.jobDelivery.submit({scope:message.scope,actorId:message.senderId,operationId:identifier('im.operation','background/'+message.messageId),provider:id,payload:{text,parts:message.parts.filter(part=>['image','audio','video','file'].includes(part.type))}},signal)
 },message=>message.scope.account.networkId==='im-lab'&&message.parts.some(part=>part.type==='text'&&part.text.startsWith('LAB_BACKGROUND_'))))
 ctx.effect(()=>()=>finish())
}
