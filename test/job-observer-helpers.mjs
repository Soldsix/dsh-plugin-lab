/** Installed public job service, real native registry and isolated JSON domain; no live transport. */
import {join} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as Domain from '@deepseek-ai/dsh-storage-domain'
import Jobs from '@deepseek-ai/dsh-jobs-local'
import * as Delivery from 'dsh-job-delivery'
import {createJobDeliveryObserver} from '../dist/job-delivery.js'
import {setupMedia} from './media-helpers.mjs'
export async function setupJobs(t,patch={}){
 const state=await setupMedia(t,{requiredBackgroundProviders:'job-delivery',...patch}),ctx=new Context(),fibers=[]
 const mount=async(plugin,config)=>{const fiber=ctx.plugin(plugin,config);fibers.push(fiber);await fiber.await();return fiber}
 t.after(async()=>{for(const fiber of fibers.reverse())await fiber.dispose()})
 await mount(Storage);await mount(JsonStorage,{root:join(state.directory,'task-storage')});await mount(Domain,{backend:'json'});await mount(Jobs,Jobs.Config({maxConcurrentJobsPerOwner:16}))
 ctx.effect(()=>ctx.provide('im',state.im));await mount(Delivery,Delivery.Config({enabled:true,namespace:'lab_fixture_tasks'}))
 state.engine.registerBackground(createJobDeliveryObserver(ctx.jobDelivery))
 return{...state,ctx,job:ctx.jobDelivery}
}
