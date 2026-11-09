/** Strict native JSON codecs are independent of Host source reflection. */
import * as z from 'zod/mini'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {MediaDigest} from 'dsh-media-kit'
import {identifier} from 'dsh-im-kit'
import {CONFIG_FIELDS,type Config,type ConfigKey} from './config-fields.ts'
import type {ControlSnapshot,SaveRequest,RestartRequest,StartRequest,RunRequest,ListRequest,CancelResponse,InspectResponse,MediaPreview} from './control-types.ts'
import type {RunId,RunAdmission,RunPage,RunResult} from './types.ts'

const revision=z.string().check(z.regex(/^[a-f0-9]{64}$/)),counter=z.int().check(z.nonnegative())
const id=z.pipe(z.string().check(z.regex(/^[a-z0-9][a-z0-9_-]{15,79}$/)),z.transform(value=>brandString<RunId>(value)))
const failure=z.enum(['capacity','cancelled','consumer-failed','no-consumer','journal-unavailable','journal-limit','journal-invalid','invalid-scenario','source-conflict','closed','media-unavailable','media-invalid','media-failed','background-failed','background-unresolved','background-unavailable','background-limit','content-unavailable','content-invalid','content-limit'])
const config=z.strictObject({enabled:z.boolean(),mediaEnabled:z.boolean(),maxMediaItemBytes:z.int(),maxMediaBytes:z.int(),maxMediaReferences:z.int(),maxMediaOperations:z.int(),maxMediaDimension:z.int(),maxMediaPixels:z.int(),mediaChunkBytes:z.int(),allowedMediaMimeTypes:z.string(),namespace:z.string(),dataPath:z.string(),maxContentProviders:z.int(),maxContentPerInput:z.int(),maxArtifactsPerCapture:z.int(),maxBackgroundProviders:z.int(),maxBackgroundTasks:z.int(),requiredBackgroundProviders:z.string(),maxConcurrentRuns:z.int(),maxStages:z.int(),maxInputs:z.int(),maxInputsPerStage:z.int(),maxTextChars:z.int(),maxActors:z.int(),maxConversations:z.int(),maxRecordBytes:z.int(),maxReportBytes:z.int(),runTimeoutMs:z.int(),listPageSize:z.int()} satisfies {[Key in keyof Config]:z.ZodMiniType<Config[Key]>})
/** Only declared fields can be saved; undefined values do not erase profile settings. */
export const saveSchema:z.ZodMiniType<SaveRequest>=z.strictObject({revision,patch:z.pipe(z.partial(config),z.transform(value=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined)) as Partial<Config>))})
/** Restart selects no different entry or data root. */
export const restartSchema:z.ZodMiniType<RestartRequest>=z.strictObject({revision})
/** Scenario content receives full Host referent and capacity validation before admission. */
export const startSchema:z.ZodMiniType<StartRequest>=z.strictObject({revision,runId:id,scenario:z.unknown()})
/** A safe exact report identity; paths and live destinations are rejected. */
export const runSchema=z.strictObject({runId:id}) satisfies z.ZodMiniType<RunRequest>
/** The optional cursor comes from a preceding page. */
export const listSchema:z.ZodMiniType<ListRequest>=z.strictObject({after:z.optional(id)})
/** Durable admission is separate from model completion. */
export const admissionSchema:z.ZodMiniType<RunAdmission>=z.strictObject({runId:id,replayed:z.boolean()})
/** A bounded directory page with an optional continuation. */
export const pageSchema:z.ZodMiniType<RunPage>=z.strictObject({runIds:z.array(id),next:z.nullable(id)})
/** Cancellation reports only whether it found active work. */
export const cancelSchema:z.ZodMiniType<CancelResponse>=z.strictObject({requested:z.boolean()})
/** Local lifecycle counts cannot be interpreted as model correctness. */
export const resultSchema:z.ZodMiniType<RunResult>=z.strictObject({runId:id,phase:z.enum(['completed','cancelled','failed','unfinished']),replayed:z.boolean(),inputCount:counter,consumerFailures:counter,unhandledInputs:counter,captureCount:counter,unresolvedMedia:counter,failure:z.nullable(failure)})
/** Owner media views contain scoped handles and bounded labels, never native storage references. */
export const mediaPreviewSchema:z.ZodMiniType<MediaPreview>=z.strictObject({attachmentId:z.pipe(z.string().check(z.regex(/^mr_[A-Za-z0-9_-]{43}$/)),z.transform(value=>identifier('im.attachment',value))),fileName:z.string(),mime:z.string(),bytes:counter,sha256:z.pipe(z.string().check(z.regex(/^[a-f0-9]{64}$/)),z.transform(value=>brandString<MediaDigest>(value))),width:z.optional(counter),height:z.optional(counter)})
/** Explicit preview truncation never changes the report file. */
export const inspectSchema:z.ZodMiniType<InspectResponse>=z.strictObject({result:resultSchema,active:z.boolean(),incompleteTail:z.boolean(),omittedCaptures:counter,omittedContents:counter,contents:z.array(z.strictObject({conversation:z.string(),messageId:z.string(),partIndex:counter,provider:z.string(),format:z.string(),version:counter,complete:z.boolean(),text:z.string(),truncated:z.boolean(),originals:counter})),originals:z.array(mediaPreviewSchema),omittedOriginals:counter,captures:z.array(z.strictObject({conversation:z.string(),kind:z.enum(['group','private']),text:z.string(),truncated:z.boolean(),nonTextParts:counter}))})
/** Native settings and status are parsed before browser state changes. */
export const snapshotSchema:z.ZodMiniType<ControlSnapshot>=z.strictObject({config,revision,appliedRevision:z.nullable(revision),entryActive:z.boolean(),entryDisabled:z.boolean(),overriddenFields:z.array(z.enum(Object.keys(CONFIG_FIELDS) as [ConfigKey,...ConfigKey[]])),refreshMs:z.int().check(z.minimum(250),z.maximum(60000)),downloads:z.boolean(),runtime:z.nullable(z.strictObject({active:counter,activeRunIds:z.array(id),backgroundProviders:z.array(z.pipe(z.string(),z.transform(value=>brandString<import('./background-types.ts').BackgroundProviderId>(value)))),contentProviders:z.array(z.pipe(z.string(),z.transform(value=>brandString<import('./content-types.ts').ContentProviderId>(value)))),stopping:z.boolean(),lastFailure:z.nullable(z.strictObject({runId:id,code:failure}))}))})
