/** Native owner page keeps case lifetime independent of navigation and short RPC calls. */
import {useEffect,useId,useRef,useState,useMemo,type ReactNode} from 'react'
import {brandString} from '@deepseek-ai/dsh-brand'
import {Button,Input,Switch,Toast} from '@deepseek-ai/dsh-client-ui-primitives'
import type {HostObservable,InjectFace,PropsLocale,PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import {CONFIG_FIELDS,isConfigKey,type ConfigKey} from '../config-fields.ts'
import {draftPatch,type FormDraft} from '../config-draft.ts'
import type {ControlSnapshot,ControlFailure,SaveRequest,RestartRequest,StartRequest,RunRequest,ListRequest,CancelResponse,InspectResponse,MediaPreview} from '../control-types.ts'
import {attachMediaFiles,mediaTargets,MediaInputProblem} from '../media-input.ts'
import type {RunId,RunAdmission,RunPage} from '../types.ts'

/** Sanitized operation failure localized at the native page. */
export class PageProblem extends Error{constructor(readonly reason:ControlFailure|'unavailable'){super(reason)}}
/** Host actions injected through the bundle configuration slot. */
export interface PageFace{readonly read:()=>Promise<ControlSnapshot>;readonly save:(request:SaveRequest)=>Promise<ControlSnapshot>;readonly restart:(request:RestartRequest)=>Promise<ControlSnapshot>;readonly start:(request:StartRequest)=>Promise<RunAdmission>;readonly cancel:(request:RunRequest)=>Promise<CancelResponse>;readonly list:(request:ListRequest)=>Promise<RunPage>;readonly inspect:(request:RunRequest)=>Promise<InspectResponse>;readonly notify:(text:string,success:boolean)=>void}
/** App-wide operation feedback outlives the configuration page. */
export interface Notice{readonly id:number;readonly text:string;readonly success:boolean}
/** Shared feedback subscription and explicit dismissal. */
export interface NoticeFace{readonly hooks:{readonly notice:HostObservable<Notice|null>};readonly dismiss:(id:number)=>void}
/** Native slot presentation, locale and owner actions. */
export type PageProps=PropsRuntime<'plugins.bundle.config'>&PropsLocale<'imLab'>&PageFace

/**
 * Render app-wide transient feedback.
 * @param props - observable notice and dismissal.
 * @returns native Toast, or no output.
 */
export function NoticeHost({useNotice,dismiss}:InjectFace<NoticeFace>):ReactNode{const notice=useNotice(value=>value);return notice?<Toast key={notice.id} text={notice.text} {...notice.success?{tone:'success' as const}:{}} onDone={()=>dismiss(notice.id)}/>:null}
/**
 * Render the native bundle's full configuration page.
 * @param props - native view selection, locale and owner operations.
 * @returns the full page without duplicating it in the bundle summary.
 */
export function LabPage({view,...props}:PageProps):ReactNode{return view==='page'?<ConfigurationPage {...props}/>:null}

const sample=JSON.stringify({title:'Two actors with a follow-up',actors:['alice','bob'],conversations:[{id:'lounge',kind:'group'}],stages:[{inputs:[{id:'first',actor:'alice',conversation:'lounge',text:'Remember the word blue-whale. Reply briefly.',directed:true}]},{inputs:[{id:'second',actor:'bob',conversation:'lounge',text:'alice, shall we have lunch?',directed:false,mentionActor:'alice'},{id:'third',actor:'alice',conversation:'lounge',text:'What word did I ask you to remember?',directed:false}]}]},null,2)

function ConfigurationPage({t,read,save,restart,start,cancel,list,inspect,notify}:PropsLocale<'imLab'>&PageFace):ReactNode{
 const id=useId(),live=useRef(true),editing=useRef(false),writing=useRef(false),readTurn=useRef(0),inspectTurn=useRef(0)
 const [snapshot,setSnapshot]=useState<ControlSnapshot|null>(null),[baseline,setBaseline]=useState<ControlSnapshot|null>(null),[draft,setDraft]=useState<FormDraft>({})
 const [loadFailed,setLoadFailed]=useState(false),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0)
 const [source,setSource]=useState(sample),[uploading,setUploading]=useState(false),[mediaTarget,setMediaTarget]=useState(''),sourceVersion=useRef(0),[caseError,setCaseError]=useState<string|null>(null),[selected,setSelected]=useState<RunId|null>(null),[report,setReport]=useState<InspectResponse|null>(null),[reportError,setReportError]=useState<string|null>(null)
 const [ids,setIds]=useState<readonly RunId[]>([]),[next,setNext]=useState<RunId|null>(null)
 const targets=useMemo(()=>mediaTargets(source),[source]),chosenTarget=targets.some(value=>value.id===mediaTarget)?mediaTarget:targets[0]?.id??''
 const changeSource=(value:string)=>{sourceVersion.current++;setSource(value)}
 async function upload(files:readonly File[]):Promise<void>{
  if(!snapshot||!files.length||!chosenTarget)return
  const version=sourceVersion.current;setUploading(true);setCaseError(null)
  try{const value=await attachMediaFiles(source,chosenTarget,files,snapshot.config);if(!live.current)return;if(sourceVersion.current!==version)throw new MediaInputProblem('source-changed');changeSource(value)}
  catch(error){if(live.current)setCaseError(error instanceof MediaInputProblem?t(`upload.${error.reason}`):t('upload.failed'))}
  finally{if(live.current)setUploading(false)}
 }
 const patch=baseline?draftPatch(draft,baseline.config):null,dirty=patch?.ok===false||Boolean(patch?.ok&&Object.keys(patch.patch).length)
 editing.current=dirty
 const message=(error:unknown)=>error instanceof PageProblem&&error.reason!=='unavailable'?t(`failure.${error.reason}`):t('unavailable')
 function accept(value:ControlSnapshot,reset:boolean):void{setSnapshot(value);if(reset||!editing.current&&!writing.current){setBaseline(value);setDraft({})}}
 useEffect(()=>{live.current=true;return()=>{live.current=false;readTurn.current++;inspectTurn.current++}},[])
 useEffect(()=>{
  let current=true,timer:ReturnType<typeof setTimeout>|undefined
  const poll=async()=>{
   const turn=++readTurn.current
   try{
    const value=await read()
    if(current&&turn===readTurn.current){accept(value,false);setLoadFailed(false)}
    if(current)timer=setTimeout(()=>{void poll()},value.refreshMs)
   }catch(error){if(current&&turn===readTurn.current)setLoadFailed(true)}
  }
  void poll();return()=>{current=false;readTurn.current++;clearTimeout(timer)}
 },[read,refresh])
 useEffect(()=>{
  if(!snapshot?.runtime)return
  let current=true
  void list({}).then(page=>{if(current){setIds(page.runIds);setNext(page.next)}},error=>{if(current)setReportError(message(error))})
  return()=>{current=false}
 },[list,Boolean(snapshot?.runtime),refresh])
 useEffect(()=>{
  if(!selected)return
  let current=true,timer:ReturnType<typeof setTimeout>|undefined
  const poll=async()=>{
   const turn=++inspectTurn.current
   try{
    const value=await inspect({runId:selected})
    if(current&&turn===inspectTurn.current){setReport(value);setReportError(null)}
    if(current&&value.result.phase==='unfinished'&&value.active)timer=setTimeout(()=>{void poll()},snapshot?.refreshMs)
   }catch(error){if(current&&turn===inspectTurn.current)setReportError(message(error))}
  }
  void poll();return()=>{current=false;inspectTurn.current++;clearTimeout(timer)}
 },[inspect,selected,refresh,snapshot?.runtime?.activeRunIds.join('|')])
 async function write(kind:'save'|'restart'):Promise<void>{
  if(writing.current||!baseline||!patch?.ok)return
  writing.current=true;setBusy(true);readTurn.current++
  try{
   const value=kind==='save'?await save({revision:baseline.revision,patch:patch.patch}):await restart({revision:baseline.revision})
   notify(t(kind==='save'?'saved':'restarted'),true);if(live.current){accept(value,true);setLoadFailed(false);setRefresh(value=>value+1)}
  }catch(error){notify(message(error),false)}finally{writing.current=false;if(live.current)setBusy(false)}
 }
 async function runCase():Promise<void>{
  if(uploading||writing.current||dirty||!baseline)return
  let scenario:unknown;try{scenario=JSON.parse(source)}catch(error){setCaseError(t('invalidJson'));return}
  writing.current=true;setBusy(true);setCaseError(null)
  const runId=brandString<RunId>(crypto.randomUUID())
  try{
   const value=await start({revision:baseline.revision,runId,scenario});notify(t(value.replayed?'replayed':'admitted'),true)
   if(live.current){setSelected(value.runId);setReport(null);setRefresh(value=>value+1)}
  }catch(error){if(live.current)setCaseError(message(error))}finally{writing.current=false;if(live.current)setBusy(false)}
 }
 async function cancelCase():Promise<void>{if(!selected)return;try{const value=await cancel({runId:selected});if(value.requested)notify(t('cancelling'),true);if(live.current)setRefresh(value=>value+1)}catch(error){notify(message(error),false)}}
 async function more():Promise<void>{if(!next)return;try{const page=await list({after:next});if(live.current){setIds(value=>[...new Set([...value,...page.runIds])]);setNext(page.next);setReportError(null)}}catch(error){if(live.current)setReportError(message(error))}}
 if(!snapshot||!baseline)return<section className="imlab-page">{loadFailed?<div role="alert"><p>{t('loadFailed')}</p><Button onClick={()=>setRefresh(value=>value+1)}>{t('refresh')}</Button></div>:<span className="imlab-spinner" role="status" aria-label={t('loading')}/>}</section>
 const active=snapshot.runtime?.active??0,applied=snapshot.appliedRevision===snapshot.revision&&snapshot.entryActive&&!snapshot.entryDisabled
 const fields=(Object.keys(CONFIG_FIELDS).filter(isConfigKey))
 function field(key:ConfigKey):ReactNode{
  if(!baseline)return null
  const kind=CONFIG_FIELDS[key],value=draft[key]??baseline.config[key],label=t(`field.${key}`),change=(next:string|boolean)=>setDraft(previous=>({...previous,[key]:next}))
  return<div className="imlab-field" key={key}>{kind==='boolean'?<span>{label}</span>:<label htmlFor={`${id}-${key}`}>{label}</label>}{kind==='boolean'?<Switch label={label} checked={value===true} disabled={busy||active>0} onChange={change}/>:<Input id={`${id}-${key}`} type={kind==='number'?'number':'text'} value={String(value)} disabled={busy||active>0} spellCheck={false} autoComplete="off" aria-invalid={patch?.ok===false&&patch.field===key} onChange={event=>change(event.currentTarget.value)}/>}</div>
 }
 const canStart=applied&&snapshot.config.enabled&&!dirty&&!busy
 return<section className="imlab-page">
  <p className="imlab-help">{t('intro')}</p>
  <section className="imlab-status" aria-live="polite"><strong>{!snapshot.config.enabled?t('disabled'):applied?t('applied'):t('notApplied')}</strong><p>{t('active',{count:active})}</p>{snapshot.runtime&&<p>{t('backgroundObservers',{providers:snapshot.runtime.backgroundProviders.join(', ')||'—'})}</p>}{snapshot.runtime?.lastFailure&&<p>{t('diagnostic',{code:snapshot.runtime.lastFailure.code})}</p>}</section>
  {loadFailed&&<p role="alert">{t('loadFailed')}</p>}
  <form onSubmit={event=>{event.preventDefault();void write('save')}}>
   <fieldset><legend>{t('settings')}</legend>{['enabled','namespace','dataPath','maxConcurrentRuns'].map(key=>field(key as ConfigKey))}</fieldset>
   <details><summary>{t('advanced')}</summary><fieldset>{fields.filter(key=>!['enabled','namespace','dataPath','maxConcurrentRuns'].includes(key)).map(field)}</fieldset></details>
   {dirty&&<p className="imlab-help" role="status">{snapshot.revision===baseline.revision?t('dirty'):t('stale')}</p>}
   {patch?.ok===false&&<p role="alert">{t('failure.config-invalid')}</p>}
   <div className="imlab-actions"><Button type="submit" variant="primary" disabled={busy||active>0||!dirty||!patch?.ok}>{t('save')}</Button><Button type="button" variant="outline" disabled={busy||active>0||dirty||!snapshot.config.enabled} onClick={()=>{void write('restart')}}>{t('restart')}</Button><Button type="button" disabled={busy} onClick={()=>setRefresh(value=>value+1)}>{t('refresh')}</Button><Button type="button" disabled={busy||!dirty} onClick={()=>accept(snapshot,true)}>{t('discard')}</Button></div>
  </form>
  <form className="imlab-case" onSubmit={event=>{event.preventDefault();void runCase()}}><h3>{t('case')}</h3><p className="imlab-help">{t('caseHelp')}</p><label className="imlab-visually-hidden" htmlFor={`${id}-case`}>{t('case')}</label><textarea id={`${id}-case`} rows={14} value={source} disabled={busy} spellCheck={false} onChange={event=>changeSource(event.currentTarget.value)}/><div className="imlab-upload"><label>{t('mediaTarget')}<select value={chosenTarget} disabled={busy||uploading||!targets.length} onChange={event=>setMediaTarget(event.currentTarget.value)}>{targets.map(value=><option key={value.id} value={value.id}>{value.label}</option>)}</select></label><label>{t('mediaFiles')}<input type="file" multiple disabled={busy||uploading||!snapshot.config.mediaEnabled||!chosenTarget} onChange={event=>{const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value='';void upload(files)}}/></label><p className="imlab-help">{t(snapshot.config.mediaEnabled?'mediaUploadHelp':'mediaUploadDisabled')}</p></div><div className="imlab-actions"><Button type="submit" variant="primary" disabled={!canStart||uploading}>{t('run')}</Button></div>{caseError&&<p role="alert">{caseError}</p>}</form>
  <section className="imlab-reports"><h3>{t('report')}</h3><p className="imlab-help">{t('previewHelp')}</p><label htmlFor={`${id}-reports`}>{t('choose')}</label><select id={`${id}-reports`} value={selected??''} onChange={event=>{setSelected(event.currentTarget.value?brandString<RunId>(event.currentTarget.value):null);setReport(null);setReportError(null)}}><option value="">{ids.length?t('choose'):t('empty')}</option>{[...new Set([...ids,...selected?[selected]:[]])].map(value=><option value={value} key={value}>{value}</option>)}</select>
   <div className="imlab-actions"><Button type="button" disabled={!next} onClick={()=>{void more()}}>{t('more')}</Button><Button type="button" disabled={!selected||!snapshot.runtime?.activeRunIds.includes(selected)} onClick={()=>{void cancelCase()}}>{t('cancel')}</Button>{selected&&snapshot.downloads&&!snapshot.runtime?.activeRunIds.includes(selected)&&<a className="imlab-download" href={`/api/im-lab-report?runId=${encodeURIComponent(selected)}`} download>{t('download')}</a>}</div>
   {reportError&&<p role="alert">{reportError}</p>}
   {report&&<section aria-live="polite" className="imlab-output"><p>{t('outcome',{phase:t(`phase.${report.result.phase}`),inputs:report.result.inputCount,captures:report.result.captureCount})}</p>{report.result.failure&&<p>{t('diagnostic',{code:report.result.failure})}</p>}{report.incompleteTail&&<p>{t('incomplete')}</p>}<p>{t('unresolved',{count:report.result.unresolvedMedia})}</p>{report.captures.map((capture,index)=><article key={index}><strong>{capture.conversation}</strong><pre>{capture.text}</pre>{capture.truncated&&<p className="imlab-help">{t('truncated')}</p>}{capture.nonTextParts>0&&<p className="imlab-help">{t('parts',{count:capture.nonTextParts})}</p>}</article>)}{selected&&report.originals.length>0&&<section className="imlab-originals"><h3>{t('originals')}</h3>{report.originals.map(item=><OriginalPreview key={item.attachmentId} item={item} runId={selected} available={snapshot.downloads&&!report.active} t={t}/>)}</section>}{report.omittedOriginals>0&&<p>{t('omittedOriginals',{count:report.omittedOriginals})}</p>}{report.omittedCaptures>0&&<p>{t('omitted',{count:report.omittedCaptures})}</p>}</section>}
  </section>
 </section>
}

function OriginalPreview({item,runId,available,t}:PropsLocale<'imLab'>&{item:MediaPreview;runId:RunId;available:boolean}):ReactNode{
 const [failed,setFailed]=useState(false),url=`/api/im-lab-media?runId=${encodeURIComponent(runId)}&attachmentId=${encodeURIComponent(item.attachmentId)}`
 return <article className="imlab-original"><strong>{item.fileName}</strong><p>{item.mime} · {t('mediaSize',{bytes:item.bytes})}{item.width&&item.height?` · ${item.width} × ${item.height}`:''}</p><code>{item.sha256}</code>{available?<>{!failed&&(item.mime.startsWith('image/')?<img loading="lazy" src={url} alt={item.fileName} onError={()=>setFailed(true)}/>:item.mime.startsWith('audio/')?<audio controls preload="none" src={url} onError={()=>setFailed(true)}/>:item.mime.startsWith('video/')?<video controls preload="none" src={url} onError={()=>setFailed(true)}/>:null)}{failed&&<p role="alert">{t('mediaReadFailed')}</p>}<a className="imlab-download" href={url} download={item.fileName}>{t('downloadOriginal')}</a></>:<p>{t('mediaAfterRun')}</p>}</article>
}
