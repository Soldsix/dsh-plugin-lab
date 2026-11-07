/** Stable operator errors never include filesystem paths or provider content. */
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
export function failureCode(error:unknown):FailureCode{return error instanceof LabError?error.code:'journal-unavailable'}
