/** Browser-safe structured source and retained content identities. */
import type {Branded} from '@deepseek-ai/dsh-brand'
import type {AttachmentId} from 'dsh-im-kit'
/** Profile-local installed resolver identity. */
export type ContentProviderId=Branded<'im-lab.content-provider'>
/** JSON documents retain arrays and object keys without executing source text. */
export type JsonValue=null|boolean|number|string|readonly JsonValue[]|{readonly[key:string]:JsonValue}
/** A source extension is owned by one explicitly installed resolver. */
export interface ContentSource{readonly provider:ContentProviderId;readonly value:JsonValue}
/** Complete source document plus a mapping to independently retained original bytes. */
export interface CapturedContent{readonly messageId:string;readonly conversation:string;readonly partIndex:number;readonly provider:ContentProviderId;readonly format:string;readonly version:number;readonly complete:boolean;readonly document:JsonValue;readonly originals:readonly{readonly sourceId:string;readonly attachmentId:AttachmentId}[]}
