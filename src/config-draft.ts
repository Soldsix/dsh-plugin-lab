/** Unsaved browser edits remain intact during metadata polling and failed saves. */
import {CONFIG_FIELDS,isConfigKey,type Config,type ConfigKey} from './config-fields.ts'
/** Raw form values before operator confirmation. */
export type FormDraft=Partial<Record<ConfigKey,string|boolean>>
/** Changed typed fields, or the first invalid number/boolean representation. */
export type DraftResult={readonly ok:true;readonly patch:Partial<Config>}|{readonly ok:false;readonly field:ConfigKey}
/**
 * Convert raw native input values without changing the saved revision.
 * @param draft - editable text or switch values.
 * @param baseline - parsed fields from the operator's starting revision.
 * @returns changed fields, or an invalid field without a partial save.
 */
export function draftPatch(draft:FormDraft,baseline:Config):DraftResult{
 const patch:Record<string,string|number|boolean>={}
 for(const [key,raw]of Object.entries(draft)){
  if(!isConfigKey(key))continue
  let value:string|number|boolean
  if(CONFIG_FIELDS[key]==='boolean'){if(typeof raw!=='boolean')return{ok:false,field:key};value=raw}
  else{if(typeof raw!=='string')return{ok:false,field:key};if(CONFIG_FIELDS[key]==='number'){if(!/^-?\d+$/.test(raw.trim())||!Number.isSafeInteger(Number(raw)))return{ok:false,field:key};value=Number(raw)}else value=raw}
  if(value!==baseline[key])patch[key]=value
 }
 return{ok:true,patch:patch as Partial<Config>}
}
