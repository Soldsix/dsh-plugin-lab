/** Download fixed public release inputs and verify their exact published hashes. */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
const directory=new URL('../.test-artifacts/release-inputs/',import.meta.url);await mkdir(directory,{recursive:true})
const inputs=[['dsh-im-kit','0.2.1','48686023b7307e3296d403994ad5cfb5cc7bfa7e4be5ef423af934b5286c40f0'],['dsh-qq-chat','0.2.1','e0c69e9c8412b5135849fb0fb475c1da69ea500a80b274c3fd00316f88e50191'],['dsh-media-kit','0.2.0','4a25348e260a23c5c43148cc224e1c8dfcfebc8382bae5bed1769ea7bb10d3bf']]
for(const [name,version,sha256] of inputs){
 const target=new URL(name+'-'+version+'.tgz',directory);let bytes
 try{bytes=await readFile(target)}catch(error){if(error.code!=='ENOENT')throw error;const response=await fetch('https://github.com/Soldsix/'+name+'/releases/download/v'+version+'/'+name+'-'+version+'.tgz',{signal:AbortSignal.timeout(90000)});assert.equal(response.ok,true,'Public release input download failed');bytes=new Uint8Array(await response.arrayBuffer())}
 assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256,'Public release input hash mismatch')
 await writeFile(target,bytes);console.log(JSON.stringify({name,sha256,file:fileURLToPath(target)}))
}
