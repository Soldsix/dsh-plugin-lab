/** Check portable metadata, paired documentation and a deliberate publication allowlist. */
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {readFile,readdir} from 'node:fs/promises'
import {resolve,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parse} from 'yaml'

/**
 * Refuse private dependencies and standalone application launchers.
 * @param manifest - candidate public package metadata.
 */
export function verifyManifest(manifest){
 assert.equal(manifest.name,'dsh-plugin-lab');assert.equal(manifest.type,'module');assert.equal(manifest.license,'MIT');assert.ok(!manifest.bin)
 assert.equal(manifest.engines?.dsh,'0.2.2-rc.1');assert.equal(manifest.dependencies?.['dsh-im-kit'],'https://github.com/Soldsix/dsh-im-kit/releases/download/v0.2.1/dsh-im-kit-0.2.1.tgz');assert.equal(manifest.dependencies?.['dsh-media-kit'],'https://github.com/Soldsix/dsh-media-kit/releases/download/v0.2.0/dsh-media-kit-0.2.0.tgz');assert.equal(manifest.dsh?.bundle?.patch,'./cordis.patch.yml')
 assert.equal(manifest.exports?.['.']?.import,'./dist/index.js');assert.equal(manifest.exports?.['./control']?.import,'./dist/control.js');assert.equal(manifest.exports?.['./client']?.default,'./dist/client.js');assert.equal(manifest.dsh?.client?.platform,'web')
 assert.equal(manifest.exports?.['./job-delivery']?.import,'./dist/job-delivery.js');assert.equal(manifest.peerDependencies?.['dsh-job-delivery'],'0.2.0-development');assert.equal(manifest.peerDependenciesMeta?.['dsh-job-delivery']?.optional,true)
 for(const section of ['dependencies','peerDependencies','devDependencies'])for(const [key,value]of Object.entries(manifest[section]??{}))assert.ok(!/^(?:file:|link:|workspace:|[a-z]:[\\/]|[\\/])/i.test(value),'Nonportable dependency '+key)
}
/**
 * Check line-aligned package pages and their shared explicit anchors.
 * @param english - English package reference.
 * @param chinese - Chinese counterpart.
 */
export function verifyPair(english,chinese){
 for(const text of [english,chinese]){assert.match(text,/^kind: "package-bundle"$/m);assert.match(text,/^description: ".+"$/m)}
 const englishLines=english.split(/\r?\n/u),chineseLines=chinese.split(/\r?\n/u)
 assert.equal(englishLines.length,chineseLines.length)
 const headings=['概要','目录','后台工作','当前用法与范围','原生所有者页面','用例示例','媒体原件','存储与取消','模型体验','已知限制与待完成工作']
 assert.deepEqual(chineseLines.filter(line=>line.startsWith('## ')),headings.map(heading=>'## '+heading))
 assert.deepEqual(englishLines.flatMap((line,index)=>line.startsWith('## ')?[index]:[]),chineseLines.flatMap((line,index)=>line.startsWith('## ')?[index]:[]))
 const summary=englishLines.join('\n').split('## Summary\n')[1];assert.ok(summary,'Missing summary')
 assert.ok(summary.split('\n## ')[0].trim().split(/\s+/).length<=100)
 const anchors=text=>[...text.matchAll(/<a id="([^"]+)">/g)].map(item=>item[1]);assert.deepEqual(anchors(english),anchors(chinese))
}
/**
 * Exclude fixture evidence, local data and uncompiled source from the published archive.
 * @param paths - npm's actual dry-run file list.
 */
export function verifyFiles(paths){
 const exact=['LICENSE','README.md','README.zh.md','README.i18n.yaml','package.json','cordis.patch.yml']
 for(const path of paths)assert.ok(exact.includes(path)||/^dist\/(?:client\/)?[a-z][a-z-]*\.(?:js|d\.ts)$/.test(path),'Unexpected public file '+path)
 for(const path of [...exact,'dist/index.js','dist/index.d.ts','dist/control.js','dist/control.d.ts','dist/client.js','dist/client/index.d.ts'])assert.ok(paths.includes(path),'Missing public file '+path)
}
/** @param paths - actual packed file identities. @param sourcePaths - current source modules. */
export function verifyCompiledSources(paths,sourcePaths){
 const owned=new Set(sourcePaths)
 for(const path of paths){if(!path.startsWith('dist/')||path==='dist/client.js')continue;const source=path.replace(/^dist\//,'src/').replace(/(?:\.d\.ts|\.js)$/,'.ts');assert.ok(owned.has(source)||owned.has(source.replace(/\.ts$/,'.tsx')),'Stale build output: '+path)}
}
/** @param english - versioned migration page. @param chinese - line-paired translated page. */
export function verifyGuide(english,chinese){
 for(const text of[english,chinese]){assert.match(text,/^kind: upgrade-guide$/m);assert.match(text,/^description: ".+"$/m);assert.equal([...text.matchAll(/^# /gm)].length,1)}
 assert.match(english,/^## Change$/m);assert.match(english,/^## Migration$/m);assert.match(chinese,/^## 变更$/m);assert.match(chinese,/^## 迁移$/m)
 assert.equal(english.split(/\r?\n/u).length,chinese.split(/\r?\n/u).length);assert.ok(english.trim().split(/\s+/u).length<=500)
}
/**
 * Refuse machine locations, credential-like literals and unsafe cast shortcuts without printing them.
 * @param text - UTF-8 source or publication text.
 * @param label - safe file identity for failures.
 */
export function verifyText(text,label){
 assert.ok(!/[c-f]:[\\/](?:users|个人|项目工作区)[\\/]/i.test(text),'Private machine path in '+label)
 assert.ok(!/\bsk-[a-z0-9]{20,}\b/i.test(text),'Credential-like literal in '+label);assert.ok(!/\bas unknown\b/.test(text),'Unknown assertion in '+label)
 assert.ok(/\r?\n$/u.test(text)&&!/(?:\r?\n){2}$/u.test(text),'Trailing newline in '+label)
}
async function sources(directory){const paths=[];for(const item of await readdir(directory,{withFileTypes:true})){const path=resolve(directory,item.name);if(item.isDirectory())paths.push(...await sources(path));else if(/\.tsx?$/.test(item.name))paths.push(path)}return paths}
async function main(){
 const root=fileURLToPath(new URL('../',import.meta.url)),manifest=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));verifyManifest(manifest)
 verifyPair(await readFile(resolve(root,'README.md'),'utf8'),await readFile(resolve(root,'README.zh.md'),'utf8'))
 const guide=resolve(root,'docs/upgrade-guide/v0.1.0-development/background-capture');verifyGuide(await readFile(resolve(guide,'guide.md'),'utf8'),await readFile(resolve(guide,'guide.zh.md'),'utf8'))
 const patch=parse(await readFile(resolve(root,'cordis.patch.yml'),'utf8'));assert.deepEqual(patch,[{insert:[{id:'plugin-lab-control',name:'dsh-plugin-lab/control'},{id:'plugin-lab-job-delivery',name:'dsh-plugin-lab/job-delivery',disabled:true},{id:'plugin-lab-runtime',name:'dsh-plugin-lab',config:{enabled:false}}]}])
 for(const path of await sources(resolve(root,'src'))){const text=await readFile(path,'utf8');verifyText(text,path);assert.ok(text.startsWith('/**'),'Module documentation missing')}
 assert.match(await readFile(resolve(root,'dist/client.js'),'utf8'),/Copyright \(c\) 2025 Colin McDonnell/)
 assert.ok(process.env.npm_execpath,'Run through npm run check')
 const deadline=AbortSignal.timeout(60000),child=spawn(process.execPath,[process.env.npm_execpath,'pack','--dry-run','--ignore-scripts','--json'],{cwd:root,signal:deadline,windowsHide:true,stdio:['ignore','pipe','pipe']})
 let stdout='',stderr='',failure;child.stdout.on('data',data=>{stdout+=data});child.stderr.on('data',data=>{stderr+=data});child.once('error',error=>{failure=error})
 const [code,signal]=await new Promise(resolve=>child.once('close',(...values)=>resolve(values)));if(failure)throw failure;assert.equal(deadline.aborted,false);assert.equal(signal,null);assert.equal(code,0,stderr)
 const pack=JSON.parse(stdout);assert.equal(pack.length,1);const paths=pack[0].files.map(file=>file.path);verifyFiles(paths)
 verifyCompiledSources(paths,(await sources(resolve(root,'src'))).map(path=>relative(root,path).replaceAll('\\','/')))
 for(const path of paths)verifyText(await readFile(resolve(root,path),'utf8'),path)
 console.log(JSON.stringify({package:manifest.name,passed:true,packedFiles:paths.length,checks:['portable-manifest','paired-documents','disabled-bundle','source-and-artifact-hygiene','artifact-allowlist']}))
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main()
