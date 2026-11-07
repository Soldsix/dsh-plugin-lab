/** Host-only report download owns an open descriptor until close or cancellation. */
import type {ReadableStream} from 'node:stream/web'
/** Original report bytes, separate from browser preview metadata. */
export interface ReportStream{readonly size:number;readonly body:ReadableStream<Uint8Array>;readonly done:Promise<void>}
