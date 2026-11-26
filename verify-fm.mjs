import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const host=process.env.FM_EMU || 'http://127.0.0.1:8195';
const browser=await chromium.launch({channel:'chrome'});
try {
  const context=await browser.newContext();
  for(const file of ['fm_library.js','vendor/companion/companion.js','vendor/fm1ports.js']){
    await context.route(host+'/'+file,async route=>route.fulfill({body:await readFile(file),contentType:'text/javascript'}));
  }
  const page=await context.newPage();
  await page.goto(host);
  await page.locator('#go').click();
  async function check(operation) {
    return page.evaluate(async operation=>{
      const {emuAccess}=await import('./parts/port_client.js');
      const {Companion}=await import('./vendor/companion/companion.js');
      const {updateLibrary}=await import('./fm_library.js');
      const access=emuAccess();
      for(let i=0;!access.outputs.size&&i<100;i++)await new Promise(r=>setTimeout(r,100));
      const input=[...access.inputs.values()][0],output=[...access.outputs.values()][0];
      const client=new Companion(input,output);
      const files=await client.files();
      const live=files.find(f=>f.name==='library-v2');
      const id='00000000-0000-4000-a000-000000000001';
      function part(index,last=1) {
        const bytes=[0,0,0,0,0,0,0,0,64,0,160,0,0,0,0,0,0,last,index,120,0,0,0,4,96,0,1,...new TextEncoder().encode('Part '+index),0,0,0,145,8,181,10,48,55,59,64,1,0,0,0,67,109,97,106,55,0];
        bytes[0]=bytes.length;
        return Uint8Array.from(bytes);
      }
      try {
        if(operation==='initial') {
          const legacy=files.find(f=>f.name==='usb-song-v1');
          await client.write(legacy.index,Uint8Array.of(69,83,48,49,0,120,0,1,0,0));
          await updateLibrary(input,output,id,[part(0),part(1)],()=>true);
          await updateLibrary(input,output,id.slice(0,-1)+'2',[part(0,2)],()=>true);
        } else if(operation==='replace')await updateLibrary(input,output,id,[part(0)],()=>true);
        else if(operation==='compact'){
          // Replace both legacy parts by one 72-bar Cmaj7 chart on the song-only endpoint.
          const head=part(0).slice(0,27);
          head[24]=0;head[25]=27;head[26]=0;
          const name=new TextEncoder().encode('72 bars');
          const sequence=Array.from({length:72},(_,i)=>[i?96:0,0]).flat();
          const record=Uint8Array.of(...head,...name,0,72,0,1,0,145,88,171,48,55,59,64,67,109,97,106,55,0,...sequence);
          new DataView(record.buffer).setUint16(0,record.length,true);
          const slot=files.find(f=>f.name==='song-upsert');
          await client.write(slot.index,record);
          const read=await client.read(slot.index);
          if(read.length!==record.length || !read.every((x,i)=>x===record[i]))throw Error('single-song readback');
          record[record.length-1]=2;
          let refused=false;try{await client.write(slot.index,record);}catch{refused=true;}
          if(!refused || (await client.read(slot.index)).at(-1)!==0)throw Error('malformed song replaced live data');
        }
        else if(operation==='delete')await updateLibrary(input,output,id,[],()=>true);
        const data=await client.read(live.index);
        const entries=[];
        for(let i=4;i<data.length;i+=data[i]+256*data[i+1]) entries.push([data[i+17],data[i+18]]);
        return entries;
      } finally {client.close();}
    },operation);
  }
  assert.deepEqual(await check('initial'),[[1,0],[1,1],[2,0]]);
  // The raw-flash emulator persists changed sectors on its two-second timer.
  await page.waitForTimeout(2500);
  await page.reload();await page.locator('#go').click();
  assert.deepEqual(await check('reboot'),[[1,0],[1,1],[2,0]]);
  assert.deepEqual(await check('replace'),[[2,0],[1,0]]);
  assert.deepEqual(await check('compact'),[[2,0],[1,0]]);
  assert.deepEqual(await check('delete'),[[2,0]]);
  console.log('FM-1 emulator: legacy write, multipart upload, reboot, replacement and deletion passed');
} finally {await browser.close();}
