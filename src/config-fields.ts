/** Browser-safe deployment fields shared by schema, revision checks and native forms. */
export interface Config{enabled:boolean;namespace:string;dataPath:string;maxConcurrentRuns:number;maxStages:number;maxInputs:number;maxInputsPerStage:number;maxTextChars:number;maxActors:number;maxConversations:number;maxRecordBytes:number;maxReportBytes:number;runTimeoutMs:number;listPageSize:number}
/** Exact editable keys; no credential, account or live endpoint is accepted. */
export const CONFIG_FIELDS={enabled:'boolean',namespace:'text',dataPath:'text',maxConcurrentRuns:'number',maxStages:'number',maxInputs:'number',maxInputsPerStage:'number',maxTextChars:'number',maxActors:'number',maxConversations:'number',maxRecordBytes:'number',maxReportBytes:'number',runTimeoutMs:'number',listPageSize:'number'} as const satisfies Record<keyof Config,string>
/** Native configuration field identity. */
export type ConfigKey=keyof Config
/**
 * Check one external field against declared settings.
 * @param value - candidate JSON key.
 * @returns whether it is an editable lab field.
 */
export function isConfigKey(value:string):value is ConfigKey{return Object.hasOwn(CONFIG_FIELDS,value)}
