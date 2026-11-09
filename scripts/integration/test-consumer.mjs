/** Install the public archives into a fresh consumer and verify strict NodeNext declarations. */
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdtemp,mkdir,readFile,writeFile,copyFile,realpath} from 'node:fs/promises'
import {join,resolve,relative,isAbsolute,basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
import {verifyInstalledArchive} from './verify-installed.mjs'
const root=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv,index=args.indexOf('--im-kit-archive')
assert.ok(index>=0&&args[index+1],'Pass --im-kit-archive PATH');assert.ok(process.env.npm_execpath,'Run through npm run test:consumer')
const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8')),library=await realpath(args[index+1]),jobIndex=args.indexOf('--job-archive')
assert.ok(jobIndex>=0&&args[jobIndex+1],'Pass --job-archive PATH');const job=await realpath(args[jobIndex+1])
const labIndex=args.indexOf('--lab-archive');assert.ok(labIndex<0||args[labIndex+1],'Pass --lab-archive PATH');const lab=await realpath(labIndex<0?join(root,'artifacts',manifest.name+'-'+manifest.version+'.tgz'):args[labIndex+1])
const runs=join(root,'.test-artifacts','consumer');await mkdir(runs,{recursive:true})
const resume=args.indexOf('--resume-run'),resumed=resume>=0
const area=resumed?await realpath(args[resume+1]):await mkdtemp(join(runs,'run-'))
const owned=relative(runs,area);assert.ok(!owned.startsWith('..')&&!isAbsolute(owned),'Resume target must stay in this repository consumer-test directory')
const attempt=await mkdtemp(join(area,'attempt-')),archives=[]
for(const path of[library,lab,job,join(root,'.test-artifacts/release-inputs/dsh-media-kit-0.2.0.tgz'),join(root,'.test-artifacts/release-inputs/dsh-qq-forward-0.1.0-development.tgz')]){const target=join(attempt,basename(path));await copyFile(path,target);archives.push(target)}
if(!resumed)await writeFile(join(area,'package.json'),JSON.stringify({name:'isolated-plugin-lab-consumer',private:true,type:'module',overrides:manifest.overrides},null,2)+'\n')
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/KEY|SECRET|TOKEN|PASSWORD/i.test(key)))
await mkdir(join(attempt,'temp'),{recursive:true});Object.assign(env,{NPM_CONFIG_CACHE:join(root,'.npm-cache'),TEMP:join(attempt,'temp'),TMP:join(attempt,'temp')})
const records=[]
async function run(argv){
 const timeout=AbortSignal.timeout(300000),child=spawn(process.execPath,argv,{cwd:area,env,windowsHide:true,signal:timeout,stdio:['ignore','pipe','pipe']})
 await writeFile(join(attempt,'setup-live.json'),JSON.stringify({pid:child.pid,startedAt:new Date().toISOString()})+'\n')
 let stdout='',stderr='',failure
 child.stdout.on('data',data=>{stdout+=data});child.stderr.on('data',data=>{stderr+=data});child.once('error',error=>{failure=error})
 const [code,signal]=await new Promise(resolve=>child.once('close',(...values)=>resolve(values)))
 records.push({argv,code,signal,timedOut:timeout.aborted,stdout,stderr});await writeFile(join(attempt,'commands.json'),JSON.stringify(records,null,2)+'\n')
 if(failure)throw failure;assert.equal(timeout.aborted,false);assert.equal(signal,null);assert.equal(code,0,stderr.slice(-1800));return stdout
}
const peers=Object.entries(manifest.peerDependencies).filter(([name])=>!['dsh-im-kit','dsh-job-delivery','dsh-qq-forward'].includes(name)).map(([name,version])=>name+'@'+version)
if(!resumed||args.includes('--reinstall'))await run([process.env.npm_execpath,'install','--ignore-scripts','--no-audit','--no-fund','--package-lock=false','--cache',join(root,'.npm-cache'),...archives,...peers,'@deepseek-ai/dsh@0.2.2-rc.1','@types/node@24.0.0','@types/react@18.3.28','@types/react-dom@18.3.7'])
const installed=await verifyInstalledArchive(archives[1],join(area,'node_modules','dsh-plugin-lab'),join(attempt,'installed-files.json'))
const consumer=join(attempt,'consumer.ts')
await writeFile(consumer,`import z from '@deepseek-ai/schemastery'
import type {Context} from '@deepseek-ai/cordis'
import {Config,type RunAdmission,type RunResult} from 'dsh-plugin-lab'
import type {LabControl} from 'dsh-plugin-lab/control'
import type * as Client from 'dsh-plugin-lab/client'
import {createJobDeliveryObserver} from 'dsh-plugin-lab/job-delivery'
import {forwardContentProvider} from 'dsh-plugin-lab/forward'
import type {ContentProvider} from 'dsh-plugin-lab'
import type {JobDeliveryService} from 'dsh-job-delivery'
const config=z.resolve({enabled:false},Config,{})[0]
const enabled:boolean=config.enabled
const start:Context['imLab']['start']=(value,signal)=>Promise.reject(new Error('type check only'))
const observer=(service:JobDeliveryService)=>createJobDeliveryObserver(service)
type OwnerDescribe=LabControl['describe']
type NativeClient=typeof Client
type Outcome=RunResult['phase']
const content:ContentProvider|undefined=undefined
void enabled;void start;void observer;void forwardContentProvider;void content
export type {OwnerDescribe,NativeClient,Outcome,RunAdmission}
`)
const program=ts.createProgram([consumer],{strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,types:['node'],typeRoots:[join(area,'node_modules','@types')],lib:['lib.es2022.d.ts','lib.dom.d.ts'],skipLibCheck:false,allowImportingTsExtensions:true})
const diagnostics=ts.getPreEmitDiagnostics(program)
await writeFile(join(attempt,'type-diagnostics.txt'),ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>area,getCanonicalFileName:file=>file,getNewLine:()=> '\n'}))
assert.equal(diagnostics.length,0,'Strict consumer declaration check failed; see local type diagnostics')
const compilerLib=resolve(root,'node_modules','typescript','lib'),inputFiles=program.getSourceFiles().map(file=>resolve(file.fileName))
for(const path of inputFiles){
 const owned=relative(area,path),compiler=relative(compilerLib,path)
 assert.ok((!owned.startsWith('..')&&!isAbsolute(owned))||(!compiler.startsWith('..')&&!isAbsolute(compiler)),'Consumer borrowed an ancestor dependency')
}
await writeFile(join(attempt,'runtime.mjs'),`import assert from 'node:assert/strict'
import {Config,resolveConfig,name,inject} from 'dsh-plugin-lab'
import LabControl from 'dsh-plugin-lab/control'
assert.equal(name,'plugin-lab');assert.equal(typeof LabControl,'function')
assert.equal(resolveConfig(Config({}),process.cwd()),null)
assert.ok(inject.includes('profileContext'))
console.log(JSON.stringify({passed:true,startedApplications:0,openedReportStores:0}))
`)
const runtime=JSON.parse((await run([join(attempt,'runtime.mjs')])).trim());assert.equal(runtime.passed,true)
const result={passed:true,archiveSha256:createHash('sha256').update(await readFile(archives[1])).digest('hex'),installedFilesVerified:installed,declarationFiles:inputFiles.length,ancestorDependenciesBorrowed:false,strictDeclarationErrors:0,runtimeSmoke:runtime,realModelApiRequests:0,realQqMessagesSent:0}
await writeFile(join(attempt,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({area,attempt,...result}))
