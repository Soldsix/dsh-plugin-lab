/** Installed forward handling resolves synthetic sources and captures prepared output through normal IM. */
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {identifier} from 'dsh-im-kit'
export const inject=['im','imForward']
export async function apply(ctx,config){
 const source=JSON.parse(await readFile(config.sourcePath,'utf8'));for(const stage of source.stages)for(const input of stage.inputs)input.directed=false
 let calls=0
 ctx.effect(()=>ctx.provide('labForwardFixture',{source:()=>structuredClone(source),calls:()=>calls}))
 ctx.effect(()=>ctx.im.subscribe(async(message,signal)=>{const part=message.parts.find(value=>value.type==='forward');if(!part)return;calls++;const prepared=await ctx.imForward.prepare({scope:message.scope,operationId:'fixture-forward/'+message.messageId,input:{kind:'source',rootMessageId:message.messageId,resourceId:part.resourceId}},signal);const receipt=await ctx.im.send({scope:message.scope,operationId:identifier('im.operation','fixture-forward/'+message.messageId),parts:[{type:'forward',resourceId:identifier('im.forward',prepared.id)}]},signal);assert.equal(receipt.status,'accepted')},message=>message.scope.account.networkId==='im-lab'&&message.parts.some(value=>value.type==='forward')))
}
