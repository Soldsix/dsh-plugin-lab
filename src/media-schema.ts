/** Persisted media grants and verified output metadata are parsed before observation or download. */
import {z} from 'zod'
import {brandString} from '@deepseek-ai/dsh-brand'
import {identifier} from 'dsh-im-kit'
import type {MediaDigest} from 'dsh-media-kit'
import {mediaScope,mediaReference,type MediaGrant} from 'dsh-media-kit/scoped-native'
import {parseNativeOriginal} from 'dsh-media-kit/dsh-attachments'
import type {CapturedOriginal} from './types.ts'

/** Complete receipts retain the native format and remain Host-only journal data. */
export const grantSchema:z.ZodType<MediaGrant>=z.unknown().transform((value,ctx)=>{
 const parsed=z.strictObject({version:z.literal(1),reference:z.string(),scope:z.string(),stored:z.unknown()}).safeParse(value)
 if(parsed.success){try{return{version:1 as const,reference:mediaReference(parsed.data.reference),scope:mediaScope(parsed.data.scope),stored:parseNativeOriginal(parsed.data.stored)}}catch(error){/* The durable parser reports one stable validation failure. */}}
 ctx.addIssue({code:'custom',message:'Invalid retained media grant'});return z.NEVER
})
/** Metadata refers to one exact structured output part, not a generated preview. */
export const originalSchema:z.ZodType<CapturedOriginal>=z.strictObject({partIndex:z.number().int().nonnegative(),attachmentId:z.string().transform(value=>identifier('im.attachment',value)),fileName:z.string().min(1).max(255),mime:z.string().min(1),bytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/).transform(value=>brandString<MediaDigest>(value)),width:z.number().int().positive().optional(),height:z.number().int().positive().optional()})
