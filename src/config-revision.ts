/** Revision covers parsed settings before profile-local paths are resolved. */
import {createHash} from 'node:crypto'
import {CONFIG_FIELDS,type Config} from './config-fields.ts'
/**
 * Hash every setting in registry order.
 * @param config - schema-parsed operator settings.
 * @returns opaque revision for optimistic native editing.
 */
export function configRevision(config:Config):string{return createHash('sha256').update(JSON.stringify(Object.keys(CONFIG_FIELDS).map(key=>[key,config[key as keyof Config]]))).digest('hex')}
