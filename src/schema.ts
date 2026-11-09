/** Strict scenario and file parsers reject destination authority and ambiguous identities. */
import {z} from 'zod'
import {brandString} from '@deepseek-ai/dsh-brand'
import {identifier} from 'dsh-im-kit'
import {grantSchema,originalSchema} from './media-schema.ts'
import type {Spec} from './config.ts'
import type {RunId,Scenario,JournalEvent} from './types.ts'

const alias=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/)
/** Run identities are safe single filenames, never operator-supplied paths. */
export const runIdSchema=z.string().regex(/^[a-z0-9][a-z0-9_-]{15,79}$/).transform(value=>brandString<RunId>(value))
const input=z.object({id:alias,actor:alias,conversation:alias,text:z.string(),directed:z.boolean(),mentionActor:alias.optional(),replyTo:alias.optional(),replyToOutput:z.object({stage:z.number().int().nonnegative().safe(),index:z.number().int().nonnegative().safe()}).strict().optional(),media:z.array(z.object({type:z.enum(['image','audio','video','file']),asset:alias}).strict()).min(1).optional(),card:z.object({format:z.enum(['json','xml']),content:z.string().min(1)}).strict().optional()}).strict()
/** Pure scenario representation before deployment-specific limits and referent checks. */
export const scenarioSchema=z.object({title:z.string().min(1).max(200),assets:z.array(z.object({id:alias,fileName:z.string().min(1).max(255).refine(value=>!/[\\/:\u0000-\u001f\u007f]/u.test(value)&&value!=='.'&&value!=='..'),base64:z.string().min(1),textMime:z.enum(['text/plain','text/html','application/json']).optional(),unclassified:z.boolean().optional()}).strict()).optional(),actors:z.array(alias).min(1),conversations:z.array(z.object({id:alias,kind:z.enum(['group','private'])}).strict()).min(1),stages:z.array(z.object({inputs:z.array(input).min(1)}).strict()).min(1)}).strict()

/**
 * Validate an external test case before opening its journal or publishing messages.
 * @param value - owner request JSON, with no live account or destination fields.
 * @param config - parsed deployment bounds.
 * @returns complete validated scenario without dropping or truncating input.
 */
export function parseScenario(value:unknown,config:Spec):Scenario{
 const scenario=scenarioSchema.parse(value)
 const actors=new Set(scenario.actors),conversations=new Set(scenario.conversations.map(value=>value.id)),inputs=new Set<string>(),priorConversations=new Map<string,string>()
 if(actors.size!==scenario.actors.length||conversations.size!==scenario.conversations.length)throw new Error('Duplicate lab alias')
 if(actors.size>config.maxActors||conversations.size>config.maxConversations||scenario.stages.length>config.maxStages)throw new Error('Lab scenario exceeds configured capacity')
 const assets=new Set<string>();let sourceBytes=0
 for(const asset of scenario.assets??[]){
  if(assets.has(asset.id)||assets.size>=config.maxMediaReferences||asset.unclassified&&asset.textMime)throw new Error('Invalid lab media source')
  if(asset.base64.length>Math.ceil(config.maxMediaItemBytes/3)*4||asset.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/u.test(asset.base64))throw new Error('Invalid lab media encoding')
  const bytes=Buffer.from(asset.base64,'base64');sourceBytes+=bytes.byteLength
  if(bytes.toString('base64')!==asset.base64||bytes.byteLength===0||bytes.byteLength>config.maxMediaItemBytes||sourceBytes>config.maxMediaBytes)throw new Error('Lab media source exceeds configured capacity')
  assets.add(asset.id)
 }
 let count=0
 for(const [stageIndex,stage] of scenario.stages.entries()){
  if(stage.inputs.length>config.maxInputsPerStage)throw new Error('Lab stage exceeds configured capacity')
  for(const entry of stage.inputs){
   if(inputs.has(entry.id)||!actors.has(entry.actor)||!conversations.has(entry.conversation)||(entry.mentionActor&&!actors.has(entry.mentionActor)))throw new Error('Lab scenario reference is invalid')
   if(entry.text.length+(entry.card?.content.length??0)>config.maxTextChars||(!entry.text.trim()&&!entry.card&&!entry.media?.length))throw new Error('Lab input exceeds configured limit')
   if(entry.media&&(entry.media.length>config.maxMediaReferences||entry.media.some(value=>!assets.has(value.asset))))throw new Error('Lab media source reference is invalid')
   if(entry.replyToOutput&&(entry.replyTo!==undefined||entry.replyToOutput.stage>=stageIndex))throw new Error('Lab output quote must select only an earlier stage')
   if(entry.replyTo&&priorConversations.get(entry.replyTo)!==entry.conversation)throw new Error('Lab quote must target an input from an earlier stage in the same conversation')
   inputs.add(entry.id);count++
  }
  for(const entry of stage.inputs)priorConversations.set(entry.id,entry.conversation)
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
const result=z.object({runId:runIdSchema,phase:z.enum(['completed','cancelled','failed','unfinished']),replayed:z.boolean(),inputCount:z.number().int().nonnegative(),consumerFailures:z.number().int().nonnegative(),unhandledInputs:z.number().int().nonnegative(),captureCount:z.number().int().nonnegative(),unresolvedMedia:z.number().int().nonnegative(),failure:z.enum(['capacity','cancelled','consumer-failed','no-consumer','journal-unavailable','journal-limit','journal-invalid','invalid-scenario','source-conflict','closed','media-unavailable','media-invalid','media-failed']).nullable()}).strict()
/** File events have a fixed monotonic schema and validate before becoming operator observations. */
export const eventSchema:z.ZodType<JournalEvent>=z.discriminatedUnion('type',[
 z.object({type:z.literal('created'),schema:z.literal(1),runId:runIdSchema,scenario:scenarioSchema,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),time:z.number().int().nonnegative()}).strict(),
 z.object({type:z.literal('input'),inputId:alias,time:z.number().int().nonnegative()}).strict(),
 z.object({type:z.literal('dispatch'),inputId:alias,report:z.object({accepted:z.number().int().nonnegative(),failed:z.number().int().nonnegative()}).strict(),time:z.number().int().nonnegative()}).strict(),
 z.object({type:z.literal('capture'),capture:z.object({operationId:z.string().min(1),conversation:alias,kind:z.enum(['group','private']),parts:z.array(part),messageId:z.string().min(1),originals:z.array(originalSchema).optional()}).strict(),time:z.number().int().nonnegative()}).strict(),
 z.object({type:z.literal('media-grant'),grant:grantSchema,time:z.number().int().nonnegative()}).strict(),
 z.object({type:z.literal('ended'),result,time:z.number().int().nonnegative()}).strict(),
])
