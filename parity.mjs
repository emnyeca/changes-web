import {chromium} from 'playwright-core';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage();
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5186');
  const xml='<score-partwise><part>'+['D','G','C','F'].map((root,i)=>'<measure number="'+(i+1)+'"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><direction><direction-type><rehearsal>'+('AB'[Math.floor(i/2)])+'</rehearsal></direction-type></direction><harmony><root><root-step>'+root+'</root-step></root><kind>dominant</kind></harmony><note><rest/><duration>4</duration></note></measure>').join('')+'</part></score-partwise>';
  const long=[];
  for(let bar=1;bar<=40;bar++)long.push('Dm7','G7b9/B','Cmaj7','F#7alt',bar%10?'|':'||');
  const cases=[{xml,mode:'linear'},{xml,mode:'bundle'},
    {cells:long,mode:'linear',title:'Auto split'},
    {cells:['Dm7','|','G7b9/B','||','Cmaj7','|','F#7alt'],mode:'bundle',transpose:2,
      sections:['A__OCC1'],settings:{bass_track:null,cloud_tracks:[1,1,2,2,3,3],cloud_trigger_policy:'retrigger'}}];
  for (const item of cases) {
    const request={title:'Parity',id:'ef7eb40d-55b1-4e15-a3c6-b62b345c8bad',...item};
    const desktop=spawnSync(process.env.PYTHON || '../changes/.venv/Scripts/python.exe',['-c','import sys,json; from engine import generate; print(json.dumps(generate(json.load(sys.stdin))))'],{
      input:JSON.stringify(request),encoding:'utf8',maxBuffer:20*1024*1024});
    assert.equal(desktop.status,0,desktop.stderr);
    const reply=await page.evaluate(request=>new Promise((resolve,reject)=>{
      const worker=new Worker('./worker.mjs',{type:'module'});
      worker.onerror=e=>reject(Error(e.message));
      worker.onmessage=e=>{worker.terminate();resolve(e.data);};
      worker.postMessage(request);
    }),request);
    assert.ok(!reply.error,reply.error);
    const expected=JSON.parse(desktop.stdout);
    assert.deepEqual(reply.result,expected);
    assert.equal(expected.fm_parts.length,expected.files.length,expected.fm_error);
    if(item.cells===long)assert.deepEqual(expected.plan.patterns.map(p=>[p.global_step_start,p.global_step_end]),[[1,120],[121,160]]);
    console.log(item.mode,expected.timeline.events.length,'events;',expected.files.map(f=>[f.name,Buffer.from(f.data,'base64').length]));
  }
} finally {await browser.close();}
