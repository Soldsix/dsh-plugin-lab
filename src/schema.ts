/** Strict scenario and file parsers reject destination authority and ambiguous identities. */
import {z} from 'zod'
import {brandString} from '@deepseek-ai/dsh-brand'
import {identifier} from 'dsh-im-kit'
import type {Spec} from './config.ts'
import type {RunId,Scenario,JournalEvent} from './types.ts'

const alias=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/)
/** Run identities are safe single filenames, never operator-supplied paths. */
export const runIdSchema=z.string().regex(/^[a-z0-9][a-z0-9_-]{15,79}$/).transform(value=>brandString<RunId>(value))
const input=z.object({id:alias,actor:alias,conversation:alias,text:z.string().min(1),directed:z.boolean(),mentionActor:alias.optional()}).strict()
/** Pure scenario representation before deployment-specific limits and referent checks. */
export const scenarioSchema=z.object({title:z.string().min(1).max(200),actors:z.array(alias).min(1),conversations:z.array(z.object({id:alias,kind:z.enum(['group','private'])}).strict()).min(1),stages:z.array(z.object({inputs:z.array(input).min(1)}).strict()).min(1)}).strict()

/**
 * Validate an external test case before opening its journal or publishing messages.
 * @param value - owner request JSON, with no live account or destination fields.
 * @param config - parsed deployment bounds.
 * @returns complete validated scenario without dropping or truncating input.
 */
export function parseScenario(value:unknown,config:Spec):Scenario{
 const scenario=scenarioSchema.parse(value)
 const actors=new Set(scenario.actors),conversations=new Set(scenario.conversations.map(value=>value.id)),inputs=new Set<string>()
 if(actors.size!==scenario.actors.length||conversations.size!==scenario.conversations.length)throw new Error('Duplicate lab alias')
 if(actors.size>config.maxActors||conversations.size>config.maxConversations||scenario.stages.length>config.maxStages)throw new Error('Lab scenario exceeds configured capacity')
 let count=0
 for(const stage of scenario.stages){
  if(stage.inputs.length>config.maxInputsPerStage)throw new Error('Lab stage exceeds configured capacity')
  for(const entry of stage.inputs){
   if(inputs.has(entry.id)||!actors.has(entry.actor)||!conversations.has(entry.conversation)||(entry.mentionActor&&!actors.has(entry.mentionActor)))throw new Error('Lab scenario reference is invalid')
   if(entry.text.length>config.maxTextChars||!entry.text.trim())throw new Error('Lab input exceeds configured limit')
   inputs.add(entry.id);count++
  }
 }
 if(count>config.maxInputs)throw new Error('Lab scenario exceeds input capacity')
 return scenario
}

const part=z.discriminatedUnion('type',[
 z.object({type:z.literal('text'),text:z.string()}).strict(),
 z.object({type:z.literal('mention'),userId:z.string().transform(value=>identifier('im.user',value))}).strict(),
 z.object({type:z.literal('reply'),messageId:z.string().transform(value=>identifier('im.message',value))}).strict(),
 ...(['image','audio','video'] as const).map(type=>z.object({type:z.literal(type),attachmentId:z.string().transform(value=>identifier('im.attachment',value))}).strict()),
 z.object({type:z.literal('file'),attachmentId:z.string().transform(value=>identifier('im.attachment',value)),name:z.string()}).strict(),
 z.object({type:z.literal('forward'),resourceId:z.string().transform(value=>identifier('im.forward',value))}).strict(),
 z.object({type:z.literal('card'),format:z.enum(['json','xml']),content:z.string()}).strict(),
 z.object({type:z.literal('unsupported'),segmentType:z.string()}).strict(),
])
const result=z.object({runId:runIdSchema,phase:z.enum(['completed','cancelled','failed','unfinished']),replayed:z.boolean(),inputCount:z.number().int().nonnegative(),consumerFailures:z.number().int().nonnegative(),unhandledInputs:z.number().int().nonnegative(),captureCount:z.number().int().nonnegative(),unresolvedMedia:z.number().int().nonnegative(),failure:z.enum(['capacity','cancelled','consumer-failed','no-consumer','journal-unavailable','journal-limit','journal-invalid','invalid-scenario','source-conflict','closed']).nullable()}).strict()
/** File events have a fixed monotonic schema and validate before becoming operator observations. */
export const eventSchema:z.ZodType<JournalEvent>=z.discriminatedUnion('type',[
 z.object({type:z.literal('created'),schema:z.literal(1),runId:runIdSchema,scenario:scenarioSchema,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),time:z.number().int().nonnegative()}).strict(),
 z.object({type:z.literal('input'),inputId:alias,time:z.number().int().nonnegative()}).strict(),
 z.object({type:z.literal('dispatch'),inputId:alias,report:z.object({accepted:z.number().int().nonnegative(),failed:z.number().int().nonnegative()}).strict(),time:z.number().int().nonnegative()}).strict(),
 z.object({type:z.literal('capture'),capture:z.object({operationId:z.string().min(1),conversation:alias,kind:z.enum(['group','private']),parts:z.array(part),messageId:z.string().min(1)}).strict(),time:z.number().int().nonnegative()}).strict(),
 z.object({type:z.literal('ended'),result,time:z.number().int().nonnegative()}).strict(),
])
