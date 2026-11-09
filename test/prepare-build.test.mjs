/** A fresh source checkout can prepare its package destination without retained build state. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {copyFile,mkdir,mkdtemp,stat,writeFile,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
test('clean checkout preparation creates the archive destination and preserves source data',async()=>{
 const area=fileURLToPath(new URL('../.test-artifacts/prepare-build/',import.meta.url));await mkdir(area,{recursive:true});const root=await mkdtemp(join(area,'case-'))
 await mkdir(join(root,'scripts'));await mkdir(join(root,'dist'));await mkdir(join(root,'evidence'))
 await writeFile(join(root,'dist','old.js'),'old synthetic build\n');await writeFile(join(root,'evidence','source.txt'),'retained synthetic source\n')
 await copyFile(fileURLToPath(new URL('../scripts/prepare-build.mjs',import.meta.url)),join(root,'scripts','prepare-build.mjs'))
 await promisify(execFile)(process.execPath,[join(root,'scripts','prepare-build.mjs')],{cwd:root,windowsHide:true})
 assert.equal((await stat(join(root,'artifacts'))).isDirectory(),true);await assert.rejects(stat(join(root,'dist')),error=>error.code==='ENOENT');assert.equal(await readFile(join(root,'evidence','source.txt'),'utf8'),'retained synthetic source\n')
})
