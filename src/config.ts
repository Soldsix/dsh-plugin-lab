/** Explicit deployment limits are resolved before creating a local capture provider. */
import z from '@deepseek-ai/schemastery'
import {isAbsolute,join} from 'node:path'
import type {Config as Settings} from './config-fields.ts'
import {resolveNativeStorage,type NativeStorageSpec} from 'dsh-media-kit/dsh-attachments'
import {configRevision} from './config-revision.ts'

/** Operator settings contain no credentials, production account or live destination. */
export interface Config extends Settings{}
/** Native schema exposes every limit in profile configuration. */
export const Config:z<Config>=z.object({
 enabled:z.boolean().default(false),mediaEnabled:z.boolean().default(false),
 maxMediaItemBytes:z.number().min(1024).max(67108864).step(1).default(8388608),maxMediaBytes:z.number().min(1024).max(1073741824).step(1).default(67108864),maxMediaReferences:z.number().min(1).max(8192).step(1).default(512),maxMediaOperations:z.number().min(1).max(256).step(1).default(32),maxMediaDimension:z.number().min(1).max(32768).step(1).default(8192),maxMediaPixels:z.number().min(1).max(268435456).step(1).default(67108864),mediaChunkBytes:z.number().min(1024).max(1048576).step(1).default(65536),allowedMediaMimeTypes:z.string().default('image/png,image/jpeg,image/gif,image/webp,audio/wav,audio/ogg,audio/mpeg,audio/mp4,video/mp4,video/webm,text/plain,text/html,application/json,application/pdf,application/octet-stream'),namespace:z.string().default('im-lab'),dataPath:z.string().default(''),
 maxConcurrentRuns:z.number().min(1).max(32).step(1).default(2),maxStages:z.number().min(1).max(4096).step(1).default(128),
 maxInputs:z.number().min(1).max(8192).step(1).default(512),maxInputsPerStage:z.number().min(1).max(128).step(1).default(32),maxTextChars:z.number().min(1).max(1048576).step(1).default(32768),
 maxActors:z.number().min(1).max(512).step(1).default(64),maxConversations:z.number().min(1).max(256).step(1).default(32),
 maxRecordBytes:z.number().min(1024).max(67108864).step(1).default(8388608),maxReportBytes:z.number().min(1024).max(268435456).step(1).default(33554432),
 runTimeoutMs:z.number().min(100).max(3600000).step(1).default(300000),
 listPageSize:z.number().min(1).max(200).step(1).default(40),
})
/** Enabled runtime settings have an absolute owned report directory. */
export interface Spec extends Config{readonly dataPath:string;readonly operatorRevision:string}
/**
 * Validate self-contained relationships without filesystem access.
 * @param config - schema-parsed deployment settings.
 */
export function validateConfig(config:Config):void{
 if(!/^[a-z][a-z0-9_-]{0,63}$/.test(config.namespace))throw new Error('Invalid lab namespace')
 if(config.dataPath&&!isAbsolute(config.dataPath))throw new Error('Lab dataPath must be absolute')
 if(config.maxInputsPerStage>config.maxInputs)throw new Error('Lab stage capacity exceeds total input capacity')
 if(config.maxMediaItemBytes>config.maxMediaBytes)throw new Error('Lab media item capacity exceeds total original capacity')
 mediaStorage(config)
 if(config.maxRecordBytes>config.maxReportBytes)throw new Error('Lab record limit exceeds report limit')
}
/**
 * Validate relationships and resolve the profile-local report directory.
 * @param config - schema-parsed deployment settings.
 * @param profileDir - absolute profile directory supplied by DSH.
 * @returns enabled settings, or null without opening files when disabled.
 */
export function resolveConfig(config:Config,profileDir:string):Spec|null{
 validateConfig(config)
 if(!config.enabled)return null
 if(!isAbsolute(profileDir))throw new Error('Lab requires an absolute profile directory')
 return{...config,dataPath:config.dataPath||join(profileDir,'data',config.namespace),operatorRevision:configRevision(config)}
}

/** @param config - parsed deployment capacities. @returns explicit original inspection and stream limits without opening storage. */
export function mediaStorage(config:Config):NativeStorageSpec{return resolveNativeStorage({chunkBytes:config.mediaChunkBytes,maxReadBytes:config.maxMediaItemBytes,inspection:{maxBytes:config.maxMediaItemBytes,maxDetectorBuffer:config.maxMediaItemBytes,maxWidth:config.maxMediaDimension,maxHeight:config.maxMediaDimension,maxPixels:config.maxMediaPixels,allowedMimeTypes:config.allowedMediaMimeTypes.split(',').map(value=>value.trim())}})}
