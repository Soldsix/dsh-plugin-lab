/** Stable operator errors never include filesystem paths or provider content. */
import {MediaError} from 'dsh-media-kit'
import type {FailureCode} from './types.ts'

/** A bounded lab failure with a safe machine-readable code. */
export class LabError extends Error{
 constructor(readonly code:FailureCode){super('Local lab operation failed: '+code)}
}
/**
 * Keep errors inside the declared operator vocabulary.
 * @param error - exception from a filesystem, consumer or lab operation.
 * @returns an existing safe code, or generic journal availability failure.
 */
export function failureCode(error:unknown):FailureCode{return error instanceof LabError?error.code:error instanceof MediaError?mediaFailure(error).code:'journal-unavailable'}

/** @param error - media-library or journal failure. @returns an owner-safe lifecycle failure without source metadata. */
export function mediaFailure(error:unknown):LabError{
 if(error instanceof LabError)return error
 if(error instanceof MediaError){if(error.code==='cancelled'||error.code==='capacity')return new LabError(error.code);if(['invalid-data','unsupported-type','malformed-media','too-large'].includes(error.code))return new LabError('media-invalid')}
 return new LabError('media-failed')
}
