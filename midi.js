export function messages(bytes) {
  const result=[];
  for (let start=0; start<bytes.length;) {
    const end=bytes.indexOf(0xf7,start+1);
    if (bytes[start]!==0xf0 || end<start+2 || bytes.subarray(start+1,end).some(n=>n>127))
      throw Error('Invalid SysEx / SysEx形式が不正です');
    result.push(bytes.slice(start,end+1));
    start=end+1;
  }
  if (!result.length) throw Error('Empty SysEx / 空のSysExです');
  return result;
}

export async function sendPatterns(port, packets, signal) {
  await port.open();
  for (let i=0;i<packets.length;i++) {
    signal.throwIfAborted();
    if (port.state!=='connected') throw Error('Port disconnected / ポートが切断されました');
    port.send(packets[i]);
    if (i+1<packets.length) await new Promise(resolve=>setTimeout(resolve,50));
  }
}

export function preview(port, timeline, routing) {
  const fraction=s=>{const [n,d=1]=s.split('/'); return Number(n)/Number(d);};
  const ms=60000/fraction(timeline.performance_tempo);
  const start=performance.now()+40;
  const channels=new Set();
  const notes=new Set();
  const schedule=[];
  for (const event of timeline.events) {
    const track=event.role==='cloud'?routing.cloud_tracks[Number(event.voice_id.split('_').at(-1))-1]:routing[event.role+'_track'];
    if (!track) continue;
    const channel=track-1;
    channels.add(channel);
    notes.add(channel*128+event.note_midi);
    const onset=fraction(event.onset_quarters)*ms;
    schedule.push([onset,0x90+channel,event.note_midi,80]);
    schedule.push([onset+fraction(event.duration_quarters)*ms,0x80+channel,event.note_midi,0]);
  }
  schedule.sort((a,b)=>a[0]-b[0] || a[3]-b[3]);
  const stop=()=>{
    if(port.state!=='connected')return;
    port.clear();
    for(const key of notes) port.send([0x80+(key>>7),key%128,0]);
    for(const ch of channels) port.send([0xb0+ch,123,0]);
  };
  try {
    for(const [time,...data] of schedule) port.send(data,start+time);
  } catch(error) {stop();throw error;}
  return stop;
}

