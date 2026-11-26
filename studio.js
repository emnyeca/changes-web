import {updateLibrary} from './fm_library.js';
import {Companion,findCompanions} from './vendor/companion/companion.js';
import {messages,sendPatterns,preview} from './midi.js';

function element(tag,text) {
  const node=document.createElement(tag);
  if(text!==undefined) node.textContent=text;
  return node;
}
const defaults={cloud_tracks:[1,2,3,4,5,6],bass_track:7,chord_track:8,cloud_center_midi:60,bass_center_midi:36,chord_center_midi:60,cloud_spread_min:14,cloud_spread_max:16,cloud_average_tolerance:2,cloud_trigger_policy:'hold_until_change',bass_trigger_policy:'hold_until_change',chord_trigger_policy:'retrigger',pattern_change_policy:'auto_song_mode'};
let fmSending=false;
export function studio(root,song,lang,preferences,save,edit) {
  const t=(en,ja)=>lang==='ja'?ja:en;
  let worker,stop,access,controller,generated,closed=false;
  const status=element('p');
  status.setAttribute('role','status');
  const output=element('div');
  const panel=element('section');
  root.append(panel,status,output);
  function button(parent,en,ja,run) {
    const b=element('button',t(en,ja));
    b.onclick=async()=>{
      b.disabled=true;
      try {await run();} catch(error){status.textContent=error.message;} finally{b.disabled=false;}
    };
    parent.append(b);
    return b;
  }
  function field(parent,text,node) {
    const label=element('label',text);
    label.append(node);parent.append(label);
    return node;
  }
  const select=(options,value)=>{
    const s=element('select');
    for(const [v,label] of options) s.add(new Option(label,v));
    s.value=value;
    return s;
  };
  const mode=field(panel,t('Arrangement','分割方式'),select([['linear','Linear / Auto Split'],['bundle','Bundle by Section']],preferences.mode||'linear'));
  const quick=element('section');
  root.querySelector('h2').after(quick);
  const pitchNames='C Db D Eb E F Gb G Ab A Bb B'.split(' ');
  const targetKey=field(quick,t('FM-1 key','FM-1のキー'),select([
    ['',t('Chart key + transpose','譜面のキー＋移調設定')],...pitchNames.map((name,i)=>[String(i),name])
  ],''));
  const transpose=field(panel,t('Transpose (semitones)','移調（半音）'),element('input'));
  transpose.type='number'; transpose.min=-24;transpose.max=24;transpose.value=song.transpose||0;
  const tempo=field(quick,t('Performance BPM','演奏BPM'),element('input'));
  tempo.type='number';tempo.min=1;tempo.max=999;tempo.value=song.tempo||'';tempo.placeholder=t('From chart','譜面のテンポ');
  const devices=field(quick,t('FM-1 device','FM-1本体'),select([],''));
  devices.parentNode.hidden=true;
  const capacity=element('small');
  button(quick,'Send song to FM-1','FM-1に曲を送信',async()=>{
    if(fmSending)throw Error(t('Wait for the current FM-1 transfer.','進行中のFM-1転送が終わるまでお待ちください。'));
    if(!navigator.requestMIDIAccess)throw Error(t('Use Chrome or Edge with Web MIDI','Web MIDI対応のChromeまたはEdgeを使用してください'));
    fmSending=true;
    let client,encoder;
    try{
      status.textContent=t('Finding FM-1…','FM-1を検索中…');
      access=await navigator.requestMIDIAccess({sysex:true});
      const found=(await findCompanions(access)).filter(p=>/^FM-1_9362\d+$/.test(p.hello.identity));
      if(closed)return;
      if(!found.length)throw Error(t('Connect Emiuet Session FM-1 via USB and retry.','FM-1をUSBで接続して再送してください。'));
      let device=found[0];
      if(found.length>1){
        const selected=devices.value;
        devices.replaceChildren(new Option('—',''),...found.map(p=>new Option(p.name,p.input.id)));
        device=found.find(p=>p.input.id===selected);
        devices.parentNode.hidden=false;
        if(!device)throw Error(t('Select an FM-1 and send again.','送信するFM-1を選んで再送してください。'));
        devices.value=selected;
      }else devices.parentNode.hidden=true;
      client=new Companion(device.input,device.output,{timeout:15000});
      const files=await client.files(),slot=files.find(f=>f.name==='song-upsert');
      if(!slot)throw Error(t('Install FM-1 firmware 0.13.0-test or later.','FM-1を0.13.0-test以降に更新してください。'));
      status.textContent=t('Preparing song…','楽曲を生成中…');
      encoder=new Worker(new URL('worker.mjs?fm=13',document.baseURI),{type:'module'});
      const data=await new Promise((resolve,reject)=>{
        encoder.onerror=e=>reject(Error(e.message));
        encoder.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.result);
        encoder.postMessage({...song,action:'fm-song',target_key:targetKey.value,tempo:Number(tempo.value)||undefined,transpose:Number(transpose.value)});
      });
      if(closed)return;
      const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
      status.textContent=t('Saving on FM-1…','FM-1に保存中…');
      await client.write(slot.index,bytes,undefined,{chunk:128});
      const read=await client.read(slot.index);
      if(read.length!==bytes.length || !bytes.every((v,i)=>v===read[i]))throw Error(t('Read-back differs','保存内容の照合に失敗しました'));
      const library=(await client.files()).find(f=>f.name==='library-v2');
      if(library)capacity.textContent=t('Free on FM-1: ','FM-1の空き容量：')+((library.room-library.size)/1024).toFixed(1)+' KiB';
      status.textContent=t('Saved and verified','保存・照合済み');
    }catch(error){
      if(error.code==='busy')throw Error(t('Stop playback and release the keys, then retry.','再生を止め、鍵盤を離して再送してください。'));
      throw error;
    }finally{encoder?.terminate();client?.close();fmSending=false;}
  });
  quick.append(status,capacity);
  quick.oninput=()=>{reset();status.textContent='';};
  const names={cloud_tracks:'Cloud 6声のトラック（0で無効）',bass_track:'Bassトラック',chord_track:'Chordトラック',cloud_center_midi:'Cloud中心音（MIDI）',bass_center_midi:'Bass基準音（MIDI）',chord_center_midi:'Chord中心音（MIDI）',cloud_spread_min:'Cloud最小音程幅',cloud_spread_max:'Cloud最大音程幅',cloud_average_tolerance:'Cloud平均音高の許容幅',cloud_trigger_policy:'Cloudトリガー',bass_trigger_policy:'Bassトリガー',chord_trigger_policy:'Chordトリガー',pattern_change_policy:'パターン遷移'};
  const policies={auto_song_mode:'ソングモード用に自動設定',off:'オフ',hold_until_change:'変化まで保持',retrigger:'毎回発音'};
  const settings={...defaults,...preferences.settings};
  const details=element('details');
  details.append(element('summary',t('Tracks, ranges and triggers','トラック・音域・トリガー')));
  panel.append(details);
  const controls=[];
  for(const [key,value] of Object.entries(settings)) {
    if (!(key in defaults)) continue;
    const input=element('input');
    input.value=Array.isArray(value)?value.map(v=>v??0).join(','):value??0;
    if(key.endsWith('_policy')) {
      const values=key==='pattern_change_policy'?['auto_song_mode','off']:['hold_until_change','retrigger'];
      const policy=field(details,t(key.replaceAll('_',' '),names[key]),select(values.map(v=>[v,t(v.replaceAll('_',' '),policies[v])]),value));
      controls.push([key,policy]);continue;
    }
    field(details,t(key.replaceAll('_',' '),names[key]),input);
    controls.push([key,input]);
  }
  function readSettings() {
    const next={};
    for(const [k,input] of controls) {
      if(k==='cloud_tracks') {
        next[k]=input.value.split(',').map(v=>Number(v)||null);
        if(next[k].length!==6) throw Error(t('Enter six tracks','6声分のトラックを入力してください'));
      } else if(k.endsWith('_policy')) next[k]=input.value;
      else next[k]=k.endsWith('_track')?(Number(input.value)||null):Number(input.value);
    }
    return next;
  }
  function reset() {controller?.abort();stop?.();stop=null;worker?.terminate();worker=null;generated=null;output.replaceChildren();}
  panel.oninput=reset;
  button(panel,'Edit chart','譜面を編集',()=>compute(true));
  button(panel,'Generate','生成',()=>compute(false));
  async function compute(inspect) {
    reset();
    const settings=readSettings();
    if(!inspect)await save({settings,mode:mode.value});
    if(closed)return;
    status.textContent=t('Generating…','生成中…');
    worker=new Worker(new URL('worker.mjs',document.baseURI),{type:'module'});
    worker.onerror=e=>{status.textContent=e.message;};
    worker.onmessage=({data})=>{
      worker.terminate();worker=null;
      if(data.error){status.textContent=data.error;return;}
      if(inspect){status.textContent='';editorFor(data.result,true);return;}
      generated=data.result;
      status.textContent=generated.warnings.join(' ');
      show(settings);
    };
    worker.postMessage({action:inspect?'inspect':'generate',cells:song.cells,tempo:Number(tempo.value)||undefined,midi:song.midi,edits:song.edits,sections:song.sections,transpose:Number(transpose.value),id:song.id,title:song.title,xml:song.xml,settings,mode:mode.value});
  }
  function editorFor(original,open) {
    const editor=element('details');
    editor.append(element('summary',t('Edit chords and sections','コード・セクションを編集')));
    editor.open=open;
    const sections=[...new Set(original.measures.map(m=>m.section_id).filter(Boolean))];
    const boxes=sections.map(section=>{
      const input=field(editor,section,element('input'));input.type='checkbox';input.checked=!song.sections || song.sections.includes(section);return input;
    });
    const symbols=[];
    for(const measure of original.measures){
      for(const event of measure.harmony){
        const input=field(editor,String(measure.number)+' · '+event.offset_quarters,element('input'));
        input.value=event.symbol; symbols.push([event.id,input]);
      }
    }
    button(editor,'Save edits','編集を保存',()=>edit({edits:Object.fromEntries(symbols.map(([id,input])=>[id,input.value.trim()])),sections:boxes.every(b=>b.checked)?null:sections.filter((_,i)=>boxes[i].checked),transpose:Number(transpose.value),tempo:Number(tempo.value)||undefined}));
    output.append(editor);
  }
  function show(routing) {
    const result=generated;
    const grid=root.querySelector('.chart-grid');
    grid.replaceChildren();
    for(const measure of result.song.measures) {
      const cell=element('span',measure.harmony.map(h=>h.symbol).join('  ')||'·');cell.className='bar';grid.append(cell);
    }
    editorFor(result.original,false);
    output.append(element('h3','Harmony Cloud'));
    const graph=element('canvas');
    graph.width=760;graph.height=180;graph.style.maxWidth='100%';
    const ctx=graph.getContext('2d');
    const pitches=result.graph.flat().map(n=>n.note);
    const lo=pitches.reduce((a,b)=>Math.min(a,b),127)-1,hi=pitches.reduce((a,b)=>Math.max(a,b),0)+1;
    for(let voice=1;voice<=6;voice++){
      ctx.beginPath();ctx.strokeStyle=['#254f78','#754996','#bd5829','#008175','#a32c50','#696111'][voice-1];
      let gap=true;
      result.graph.forEach((notes,i)=>{
        const n=notes.find(n=>n.voice==='cloud_voice_'+voice);
        if(!n){gap=true;return;}
        const x=5+750*i/Math.max(1,result.graph.length-1),y=175-170*(n.note-lo)/(hi-lo);
        if(gap){ctx.moveTo(x,y);gap=false;}else ctx.lineTo(x,y);
        ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(x-2,y-2,4,4);
      });ctx.stroke();
    }
    output.append(graph);
    const packets=result.files.flatMap(f=>messages(Uint8Array.from(atob(f.data),c=>c.charCodeAt(0))));
    const plan=element('table');
    const header=plan.insertRow();
    for(const title of [t('Part','パート'),t('Steps','ステップ範囲'),t('Length','長さ'),t('Speed','速度')])header.append(element('th',title));
    for(const part of result.plan.patterns) {
      const row=plan.insertRow();
      for(const value of [part.pattern_name,part.global_step_start+'–'+part.global_step_end,part.total_steps,result.plan.timing.speed])row.insertCell().textContent=value;
    }
    output.append(plan);
    button(output,'Download .syx','.syx を保存',()=>{
      const link=element('a');
      link.href=URL.createObjectURL(new Blob(packets));link.download=song.title+'.syx';link.click();
      setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    });
    const ports=field(output,t('MIDI output','MIDI出力'),select([['','—']],''));
    const inputs=field(output,t('FM-1 MIDI input','FM-1 MIDI入力'),select([['','—']],''));
    button(output,'List MIDI ports','MIDIポートを表示',async()=>{
      if(!navigator.requestMIDIAccess) throw Error(t('Web MIDI unavailable','Web MIDI非対応です'));
      try{access=await navigator.requestMIDIAccess({sysex:true});}
      catch{throw Error(t('MIDI permission denied','MIDI権限が拒否されました'));}
      if(closed)return;
      ports.replaceChildren(new Option('—',''));
      inputs.replaceChildren(new Option('—',''));
      for(const p of access.inputs.values()) inputs.add(new Option(p.name,p.id));
      for(const p of access.outputs.values()) ports.add(new Option(p.name,p.id));
    });
    const port=()=>{
      const p=access?.outputs.get(ports.value);
      if(!p || p.state!=='connected') throw Error(t('Select a connected output','接続中の出力を選んでください'));
      return p;
    };
    button(output,'Preview','試聴',async()=>{const p=port();stop?.();await p.open();if(!closed&&result===generated)stop=preview(p,result.timeline,routing);});
    button(output,'Stop','停止',()=>{stop?.();stop=null;});
    const existing=field(output,t('Optional Digitone pattern file (.syx)','既存のDigitoneパターン（任意・.syx）'),element('input'));
    existing.type='file';existing.accept='.syx';
    const range=field(output,t('Overwrite area selected on Digitone II','Digitone II本体で選んだ上書き範囲'),element('input'));
    range.placeholder='A01–A02';
    const target=field(output,t('Send to','送信先'),select([['digitone','Digitone II'],['fm','Emiuet Session FM-1']],'digitone'));
    const transfer=element('p');
    transfer.setAttribute('role','status');
    let transferring=false;
    async function fm(remove) {
      if(transferring)return;
      transferring=true;
      transfer.textContent=t('Opening MIDI ports…','MIDIポートを開いています…');
      try {
        const p=port(),input=access?.inputs.get(inputs.value);
        if(!input) throw Error(t('Select the FM-1 input','FM-1入力を選択してください'));
        if(!remove && !result.fm_parts.length)throw Error(result.fm_error || 'Unsupported FM-1 song');
        const parts=remove?[]:result.fm_parts.map(data=>Uint8Array.from(atob(data),c=>c.charCodeAt(0)));
        const action=remove?t('Delete all parts','全パートを削除'):t('Replace all parts','全パートを更新');
        const saved=await updateLibrary(input,p,song.id,parts,()=>confirm([p.name,action,song.title].join('\n')),step=>{
          transfer.textContent=({
            hello:t('Waiting for FM-1…','FM-1の応答を待っています…'),
            library:t('Reading song library…','本体の曲一覧を読み取っています…'),
            stage:t('Transferring and checking song data…','曲データを転送・照合しています…'),
            apply:t('Saving and verifying…','本体に保存して読み戻しています…')
          })[step];
        });
        transfer.textContent=({saved:t('Saved and verified','保存・照合済み'),unchanged:t('Already matches','保存内容は同一です'),cancelled:t('Cancelled','キャンセルしました')})[saved];
      } catch(error) {
        const hint=error.code==='silent'?t('Check both FM-1 ports, power and firmware.','FM-1の電源、入出力ポート、ファーム版を確認してください。'):
          error.code==='busy'?t('Stop playback and release the keys before retrying.','本体の再生を止め、キーを離して再送してください。'):'';
        transfer.textContent=[transfer.textContent,error.message,hint].filter(Boolean).join(' ');
      } finally {transferring=false;}
    }
    const remove=button(output,'Delete song from FM-1','FM-1からこの曲を削除',()=>fm(true));
    remove.hidden=true;
    target.onchange=()=>{transfer.textContent='';remove.hidden=target.value!=='fm';existing.parentNode.hidden=!remove.hidden;range.parentNode.hidden=!remove.hidden;};
    button(output,'Send','送信',async()=>{
      if(target.value==='fm')return fm(false);
      const p=port();
      const area=range.value.trim();
      if(!area)throw Error(t('Enter the test area selected on the instrument','本体で選んだテスト範囲を入力してください'));
      let outgoing=packets, description=result.files.map(f=>f.name).join(', ');
      if(existing.files.length) {
        const file=existing.files[0];
        if(file.size>114118*128)throw Error(t('File too large','ファイルが大きすぎます'));
        outgoing=messages(new Uint8Array(await file.arrayBuffer()));
        for(const frame of outgoing) {
          const header=[0xf0,0,0x20,0x3c,0x15];
          if(frame.length!==114118 || !header.every((v,i)=>frame[i]===v) || frame[6]!==0x50)
            throw Error(t('Unsupported Digitone II pattern format','未対応のDigitone IIパターン形式です'));
          let sum=0;for(let i=10;i<114113;i++)sum+=frame[i];
          if((sum&16383)!==((frame[114113]<<7)|frame[114114]))throw Error(t('Pattern checksum mismatch','パターンのチェックサムが一致しません'));
        }
        description=file.name+' · '+outgoing.length;
      }
      if(!confirm(t('Confirm the overwrite area on your Digitone II','Digitone II 本体で上書き先を確認してください')+'\n'+p.name+'\n'+area+'\n'+description))return;
      stop?.();stop=null;controller=new AbortController();
      await sendPatterns(p,outgoing,controller.signal);
      status.textContent=t('Send requested. Verify placement and playback on the instrument.','送信を要求しました。本体で配置と再生を確認してください。');
    });
    output.append(transfer);
  }
  return ()=>{closed=true;reset();};
}
