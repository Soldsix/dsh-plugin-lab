import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {verifyManifest,verifyFiles,verifyPair,verifyText} from '../scripts/verify-package.mjs'
test('publication gates refuse private dependencies, launchers and fixture evidence',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));verifyManifest(manifest)
 assert.throws(()=>verifyManifest({...manifest,bin:'dist/index.js'}))
 assert.throws(()=>verifyManifest({...manifest,dependencies:{...manifest.dependencies,'dsh-im-kit':'^0.2.1'}}))
 assert.throws(()=>verifyManifest({...manifest,dependencies:{hidden:'file:../production'}}))
 assert.throws(()=>verifyFiles(['data/history.sqlite3']))
 assert.throws(()=>verifyText('synthetic location C:/Users/example/data\n','negative control'))
 assert.throws(()=>verifyText('const value = input as unknown\n','negative control'))
 const english=await readFile(new URL('../README.md',import.meta.url),'utf8'),chinese=await readFile(new URL('../README.zh.md',import.meta.url),'utf8');verifyPair(english,chinese);verifyPair(english.replace(/\r?\n/gu,'\r\n'),chinese.replace(/\r?\n/gu,'\r\n'));assert.throws(()=>verifyPair(english.replace('## Summary','## Missing'),chinese));assert.throws(()=>verifyPair(english,chinese+'extra\n'))
})
