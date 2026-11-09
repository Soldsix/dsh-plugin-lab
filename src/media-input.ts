/** Browser-selected files become inline source assets without local paths or silent input edits. */
/** Explicit upload limits mirror the owner profile's source and storage capacities. */
export interface UploadLimits{readonly maxMediaItemBytes:number;readonly maxMediaBytes:number;readonly maxMediaReferences:number;readonly maxRecordBytes:number}
/** Sanitized local errors preserve the original case draft. */
export class MediaInputProblem extends Error{constructor(readonly reason:'invalid-source'|'invalid-target'|'capacity'|'source-changed'){super(reason)}}
function record(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)}
function parsed(source:string):Record<string,unknown>{try{const value:unknown=JSON.parse(source);if(record(value)&&Array.isArray(value['stages']))return value}catch(error){/* The unchanged editor retains its invalid draft. */}throw new MediaInputProblem('invalid-source')}
function inputs(value:Record<string,unknown>):Record<string,unknown>[]{
 const stages=value['stages'];if(!Array.isArray(stages))throw new MediaInputProblem('invalid-source')
 const result:Record<string,unknown>[]=[]
 for(const stage of stages){if(!record(stage)||!Array.isArray(stage['inputs']))throw new MediaInputProblem('invalid-source');for(const input of stage['inputs']){if(!record(input)||typeof input['id']!=='string')throw new MediaInputProblem('invalid-source');result.push(input)}}
 return result
}
/** @param source - current editor text. @returns declared input choices, or no choices while the draft is invalid. */
export function mediaTargets(source:string):readonly {id:string;label:string}[]{
 try{return inputs(parsed(source)).map(value=>({id:String(value['id']),label:[value['id'],value['actor'],value['conversation']].filter(value=>typeof value==='string').join(' · ')}))}catch(error){return[]}
}
function base64(bytes:Uint8Array):string{
 let value=''
 for(let offset=0;offset<bytes.length;offset+=32768)value+=String.fromCharCode(...bytes.subarray(offset,offset+32768))
 return btoa(value)
}
/** @param source - immutable editor snapshot. @param target - one exact declared input ID. @param files - browser-selected file objects. @param limits - explicit profile capacities. @returns updated JSON retaining original text, stages and fields, or a failure without modifying the draft. */
export async function attachMediaFiles(source:string,target:string,files:readonly File[],limits:UploadLimits):Promise<string>{
 const value=parsed(source),matches=inputs(value).filter(value=>value['id']===target);if(matches.length!==1)throw new MediaInputProblem('invalid-target')
 const entry=matches[0]!,assets=value['assets']??[],media=entry['media']??[]
 if(!Array.isArray(assets)||!Array.isArray(media))throw new MediaInputProblem('invalid-source')
 const ids=new Set<string>();let total=0
 for(const asset of assets){
  if(!record(asset)||typeof asset['id']!=='string'||typeof asset['base64']!=='string'||asset['base64'].length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(asset['base64'])||ids.has(asset['id']))throw new MediaInputProblem('invalid-source')
  ids.add(asset['id']);total+=asset['base64'].length/4*3-(asset['base64'].endsWith('==')?2:asset['base64'].endsWith('=')?1:0)
 }
 if(assets.length+files.length>limits.maxMediaReferences)throw new MediaInputProblem('capacity')
 for(const file of files){if(file.size===0||file.size>limits.maxMediaItemBytes||!file.name||file.name.length>255||/[\\/:\u0000-\u001f\u007f]/u.test(file.name))throw new MediaInputProblem('capacity');total+=file.size}
 if(total>limits.maxMediaBytes)throw new MediaInputProblem('capacity')
 let serial=assets.length
 for(const file of files){
  let id:string;do{id='media'+serial++}while(ids.has(id));ids.add(id)
  const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.byteLength!==file.size)throw new MediaInputProblem('invalid-source')
  const textMime=file.type==='text/html'||/\.html?$/i.test(file.name)?'text/html':file.type==='application/json'||/\.json$/i.test(file.name)?'application/json':file.type==='text/plain'||/\.txt$/i.test(file.name)?'text/plain':undefined
  assets.push({id,fileName:file.name,base64:base64(bytes),...textMime?{textMime}:{}})
  const type=file.type.startsWith('image/')?'image':file.type.startsWith('audio/')?'audio':file.type.startsWith('video/')?'video':'file';media.push({type,asset:id})
 }
 value['assets']=assets;entry['media']=media
 const result=JSON.stringify(value,null,2);if(new TextEncoder().encode(result).byteLength>limits.maxRecordBytes)throw new MediaInputProblem('capacity')
 return result
}
