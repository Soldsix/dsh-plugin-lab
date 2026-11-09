import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {verifyManifest,verifyFiles,verifyPair,verifyText,verifyCompiledSources,verifyGuide} from '../scripts/verify-package.mjs'
test('publication gates refuse private dependencies, launchers and fixture evidence',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));verifyManifest(manifest)
 assert.throws(()=>verifyManifest({...manifest,bin:'dist/index.js'}))
 assert.throws(()=>verifyManifest({...manifest,dependencies:{...manifest.dependencies,'dsh-im-kit':'^0.2.1'}}))
 assert.throws(()=>verifyManifest({...manifest,dependencies:{hidden:'file:../production'}}))
 assert.throws(()=>verifyFiles(['data/history.sqlite3']))
 assert.throws(()=>verifyText('synthetic location C:/Users/example/data\n','negative control'))
 assert.throws(()=>verifyText('const value = input as unknown\n','negative control'))
 const english=await readFile(new URL('../README.md',import.meta.url),'utf8'),chinese=await readFile(new URL('../README.zh.md',import.meta.url),'utf8');verifyPair(english,chinese);verifyPair(english.replace(/\r?\n/gu,'\r\n'),chinese.replace(/\r?\n/gu,'\r\n'));assert.throws(()=>verifyPair(english.replace('## Summary','## Missing'),chinese));assert.throws(()=>verifyPair(english,chinese+'extra\n'));assert.throws(()=>verifyPair(english,chinese.replace('## 概要','## 后台工作')))
})

test('upgrade pages retain paired migration instructions and a bounded current-state description',async()=>{
 const base=new URL('../docs/upgrade-guide/v0.1.0-development/background-capture/',import.meta.url),english=await readFile(new URL('guide.md',base),'utf8'),chinese=await readFile(new URL('guide.zh.md',base),'utf8');verifyGuide(english,chinese)
 assert.throws(()=>verifyGuide(english.replace('## Migration','## Missing'),chinese));assert.throws(()=>verifyGuide(english,chinese+'extra\n'));assert.throws(()=>verifyGuide(english.replace('## Change','## Change\n'+' extra'.repeat(501)),chinese))
})

test('retained build files cannot enter a package after their source module is removed',()=>{
 const paths=['dist/index.js','dist/index.d.ts','dist/client.js','dist/client/index.d.ts'],source=['src/index.ts','src/client/index.ts'];verifyCompiledSources(paths,source)
 assert.throws(()=>verifyCompiledSources([...paths,'dist/removed-module.js'],source));assert.throws(()=>verifyCompiledSources([...paths,'dist/removed-module.d.ts'],source))
})
