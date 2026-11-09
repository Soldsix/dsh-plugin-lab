/** Optional installed job observer; only exact synthetic run scopes may be inspected or cancelled. */
import type {Context} from '@deepseek-ai/cordis'
import type {} from 'dsh-job-delivery'
import type {JobDeliveryService,TaskView} from 'dsh-job-delivery'
import {accountKey,scopeKey,sameScope,type ConversationScope} from 'dsh-im-kit'
import {backgroundProviderId,backgroundTaskId,type BackgroundProvider,type BackgroundRequest,type BackgroundTask} from './background.ts'
import {LabError} from './errors.ts'
import type {} from './index.ts'

/** Native optional component identity. */
export const name='plugin-lab-job-delivery'
/** Both services must be installed in the same isolated profile. */
export const inject=['imLab','jobDelivery']

function validateScopes(request:BackgroundRequest):void{
 const accounts=new Set(request.scopes.map(value=>accountKey(value.scope.account)))
 if(accounts.size!==1||new Set(request.scopes.map(value=>scopeKey(value.scope))).size!==request.scopes.length||request.scopes.some(({conversation,scope})=>scope.account.networkId!=='im-lab'||scope.account.accountId!=='lab-run/'+request.runId||scope.peerId!=='lab-peer/'+request.runId+'/'+conversation))throw new LabError('background-unavailable')
}
function unfinished(task:TaskView):boolean{return task.execution==='queued'||task.execution==='running'||task.outputCounts.pending>0||task.outputCounts.sending>0}
function observation(task:TaskView,conversation:string):BackgroundTask{return{id:backgroundTaskId(task.id),conversation,execution:task.execution,outputs:{...task.outputCounts}}}

/**
 * Observe retained metadata and join actual producer/delivery cleanup without reading task bodies.
 * @param service - installed task service in this dedicated lab profile.
 * @returns reversible observer; opening refuses any preexisting work in its synthetic scopes.
 */
export function createJobDeliveryObserver(service:JobDeliveryService):BackgroundProvider{
 return{id:backgroundProviderId('job-delivery'),open(request){
  validateScopes(request)
  const tasks=new Map<TaskView['id'],{readonly scope:ConversationScope;readonly conversation:string}>(),reported=new Set<TaskView['id']>(),releases:(()=>void)[]=[]
  let failure:LabError|undefined,closing:Promise<void>|undefined
  const collect=()=>{for(const {conversation,scope} of request.scopes)for(const task of service.list(scope)){
   if(!sameScope(task.scope,scope))throw new LabError('background-unavailable')
   const previous=tasks.get(task.id);if(previous&&!sameScope(previous.scope,scope))throw new LabError('background-unavailable')
   tasks.set(task.id,{conversation,scope})
  }}
  const scan=()=>{try{collect();if(tasks.size>request.maxTasks)failure=new LabError('background-limit')}catch(error){failure??=new LabError('background-unavailable')}}
  try{
   for(const {scope} of request.scopes)releases.push(service.subscribe(scope,scan))
   collect();if(tasks.size)throw new LabError('background-unavailable')
  }catch(error){for(const release of releases)release();throw new LabError('background-unavailable')}
  return{
   async settle(signal){
    if(closing)throw new LabError('background-unavailable')
    const completed:BackgroundTask[]=[]
    for(;;){
     if(signal.aborted)throw new LabError('cancelled');scan();if(failure)throw failure
     const next=[...tasks].find(([id])=>!reported.has(id));if(!next)return completed
     const [id,{scope,conversation}]=next
     let task:TaskView;try{task=await service.wait(scope,id,signal)}catch(error){throw new LabError(signal.aborted?'cancelled':'background-unavailable')}
     if(!sameScope(task.scope,scope)||task.id!==id)throw new LabError('background-unavailable')
     reported.add(id);completed.push(observation(task,conversation))
    }
   },
   close(){
    if(closing)return closing
    return closing=(async()=>{
     const joined=new Set<TaskView['id']>(),cancelled=new Set<TaskView['id']>();let cleanupFailure=false
     try{
      for(;;){
       try{collect()}catch(error){cleanupFailure=true}
       for(const {scope} of request.scopes)try{for(const task of service.list(scope))if(tasks.has(task.id)&&unfinished(task)&&!cancelled.has(task.id)){
        cancelled.add(task.id);try{await service.cancel(scope,task.id)}catch(error){cleanupFailure=true}
       }}catch(error){cleanupFailure=true}
       const pending=[...tasks].filter(([id])=>!joined.has(id));if(!pending.length)break
       const outcomes=await Promise.allSettled(pending.map(async([id,{scope}])=>{await service.join(scope,id);joined.add(id)}))
       for(const outcome of outcomes)if(outcome.status==='rejected')cleanupFailure=true
       for(const [id] of pending)joined.add(id)
      }
     }finally{for(const release of releases)release()}
     if(cleanupFailure)throw new LabError('background-unavailable')
    })()
   },
  }
 }}
}

/** @param ctx - dedicated profile containing both installed services. @returns reversible observer registration. */
export function apply(ctx:Context):void{ctx.effect(()=>ctx.imLab.registerBackground(createJobDeliveryObserver(ctx.jobDelivery)))}
