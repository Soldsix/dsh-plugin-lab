/** Durable structured content keeps native receipts outside provider documents. */
import {z} from 'zod'
import {identifier} from 'dsh-im-kit'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {ContentProviderId,ContentSource,CapturedContent,JsonValue} from './content-types.ts'
/** Installed source resolver identity accepts no location or account authority. */
export const contentProviderSchema=z.string().regex(/^[a-z][a-z0-9._-]{0,79}$/).transform(value=>brandString<ContentProviderId>(value))
/** Provider data must be finite JSON before persistence or dispatch. */
export const jsonSchema:z.ZodType<JsonValue>=z.json()
/** Synthetic source extensions retain the complete provider input. */
export const contentSourceSchema:z.ZodType<ContentSource>=z.strictObject({provider:contentProviderSchema,value:jsonSchema})
/** Captured artifacts refer only to run-owned media handles. */
export const capturedContentSchema:z.ZodType<CapturedContent>=z.strictObject({messageId:z.string().min(1).max(256),conversation:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),partIndex:z.number().int().nonnegative().safe(),provider:contentProviderSchema,format:z.string().regex(/^[a-z][a-z0-9._-]{0,79}$/),version:z.number().int().positive().safe(),complete:z.boolean(),document:jsonSchema,originals:z.array(z.strictObject({sourceId:z.string().min(1).max(256),attachmentId:z.string().transform(value=>identifier('im.attachment',value))}))})
