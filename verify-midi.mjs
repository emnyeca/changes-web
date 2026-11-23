import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {messages,sendPatterns} from './midi.js';
const bytes=await readFile('../digitone-syx-toolkit/src/digitone_syx_toolkit/resources/digitone2/BASE_EMPTY.syx');
for(const count of [1,2]) {
  const sent=[];
  const output={state:'connected',open:async()=>{},send:data=>sent.push({data,time:performance.now()})};
  const input=Buffer.concat(Array(count).fill(bytes));
  await sendPatterns(output,messages(input),new AbortController().signal);
  assert.deepEqual(Buffer.concat(sent.map(e=>e.data)),input);
  assert.equal(sent.length,count);
  if(count>1) assert.ok(sent[1].time-sent[0].time>=45);
  console.log(count,'pattern(s)',sent.map(e=>e.data.length));
}
let sent=0;
const port={state:'connected',open:async()=>{},send(){sent++;this.state='disconnected';}};
await assert.rejects(sendPatterns(port,messages(Buffer.concat([bytes,bytes])),new AbortController().signal),/disconnected/);
assert.equal(sent,1);
assert.throws(()=>messages(Buffer.concat([bytes,bytes.subarray(0,-1)])),/Invalid/);
