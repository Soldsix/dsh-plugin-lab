/** Real API runs traverse installed Lab, IM, Chat and native DSH agents without external writes. */
import assert from 'node:assert/strict'
import {writeFile,rename} from 'node:fs/promises'
import {setImmediate as nextTurn} from 'node:timers/promises'
import {credentialRef} from '@deepseek-ai/dsh-credentials'
export const inject=['imLab','imLabControl','qqChat','credentials']
export function apply(ctx,config){
 const lifetime=new AbortController(),codes=[]
 ctx.on('qq-chat/diagnostic',({stage,error})=>codes.push({stage,code:typeof error?.code==='string'&&/^[A-Z0-9_:-]{1,80}$/.test(error.code)?error.code:'PROVIDER_OR_RUNTIME_ERROR'}))
 const work=nextTurn().then(async()=>{
  const checks=[],outputs=[],started=performance.now()
  const record=async value=>{await writeFile(config.resultPath+'.tmp',JSON.stringify(value,null,2)+'\n');await rename(config.resultPath+'.tmp',config.resultPath)}
  try{
   const credential=await ctx.credentials.describe(credentialRef('DEEPSEEK_API_KEY'))
   if(!credential.configured){await record({passed:false,reason:'credential-unavailable',checks,realQqMessagesSent:0});return}
   assert.equal(ctx.qqChat.status().transportAttached,true)
   const runId='real-lab-context-0001',texts=['本次验收口令是“蓝鲸84”。请记住，只回复“记住了”。','刚才的验收口令是什么？只回答口令。','再写一次刚才的口令，再计算287乘43。只给出口令和计算结果。']
   const scenario={title:'Real local conversation recall',actors:['alice'],conversations:[{id:'lounge',kind:'group'}],stages:texts.map((text,index)=>({inputs:[{id:'message'+index,actor:'alice',conversation:'lounge',text,directed:index===0}]}))}
   const state=await ctx.imLabControl.describe(),admitted=await ctx.imLabControl.start({revision:state.revision,runId,scenario})
   assert.equal(admitted.replayed,false);const result=await ctx.imLab.wait(runId)
   const stored=await ctx.imLab.inspect(runId)
   outputs.push(...stored.events.filter(event=>event.type==='capture').map(event=>({conversation:event.capture.conversation,parts:event.capture.parts})))
   if(result.phase!=='completed'||result.captureCount!==3){await record({passed:false,reason:'model-attempt-not-completed',checks,result,outputs,diagnosticCodes:codes,realQqMessagesSent:0});return}
   checks.push('three-real-native-model-turns-captured-through-installed-lab-and-chat')
   const text=outputs.map(value=>value.parts.filter(part=>part.type==='text').map(part=>part.text).join(''))
   assert.ok(text[1].includes('蓝鲸84'));assert.ok(text[2].includes('蓝鲸84')&&text[2].replaceAll(',','').includes('12341'))
   checks.push('real-native-session-recall-and-arithmetic-observed')
   assert.equal((await ctx.imLabControl.start({revision:state.revision,runId,scenario})).replayed,true)
   assert.equal((await ctx.imLab.inspect(runId)).result.captureCount,3)
   checks.push('repeated-admission-does-not-republish-original-inputs')
   const exported=await ctx.imLab.export(runId,lifetime.signal),report=await new Response(exported.body).text();await exported.done
   assert.ok(report.includes('蓝鲸84'));assert.equal(report.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(event=>event.type==='capture').length,3)
   checks.push('full-report-contains-original-case-and-all-final-public-replies')
   await record({passed:true,checks,result,outputs,elapsedMs:Math.round(performance.now()-started),completedModelTurns:3,modelRoute:{provider:'deepseek-official',model:'deepseek-flash'},realQqMessagesSent:0,bilibiliWrites:0,qualityScope:'Basic text, recall and arithmetic only; no comparative intelligence or media-quality claim.'})
  }catch(error){await record({passed:false,reason:'REAL_LAB_ACCEPTANCE_FAILED',checks,outputs,diagnosticCodes:codes,realQqMessagesSent:0})}
 })
 ctx.effect(()=>async()=>{lifetime.abort();await work})
}
