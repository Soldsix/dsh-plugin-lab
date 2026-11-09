/** Verify the owned output location and create the package destination without deleting files. */
import {realpath,mkdir} from 'node:fs/promises'
import {resolve,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const root=await realpath(fileURLToPath(new URL('../',import.meta.url))),output=resolve(root,'dist')
try{assert.equal(relative(root,await realpath(output)),'dist','Build output must not redirect outside this repository')}catch(error){if(error.code!=='ENOENT')throw error}
await mkdir(resolve(root,'artifacts'),{recursive:true})
