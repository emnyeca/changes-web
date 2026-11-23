import {Companion,crc32} from './vendor/companion/companion.js';

const same=(a,b)=>a.length===b.length && a.every((v,i)=>v===b[i]);
export function mergeLibrary(before,id,parts,room) {
  if (!same(before.slice(0,4),new TextEncoder().encode('EL02'))) throw Error('Unsupported library / ライブラリ形式が未対応です');
  const kept=[before.slice(0,4)];
  for(let at=4;at<before.length;) {
    const size=before[at]+256*before[at+1];
    if(!Number.isInteger(size)||size<29||size>before.length-at)throw Error('Invalid library / ライブラリ形式が不正です');
    const part=before.slice(at,at+size);
    const uuid=Array.from(part.slice(2,18),v=>v.toString(16).padStart(2,'0')).join('');
    if(uuid!==id.replaceAll('-','').toLowerCase())kept.push(part);
    at+=size;
  }
  const records=[...kept,...parts];
  const size=records.reduce((sum,r)=>sum+r.length,0);
  if(size>room || records.length>33 || records.slice(1).reduce((n,r)=>n+r[26],0)>192)throw Error('Library full / 保存容量を超えています');
  const result=new Uint8Array(size);
  let offset=0;
  for(const r of records){result.set(r,offset);offset+=r.length;}
  return result;
}
export async function updateLibrary(input,output,id,parts,approve) {
  const client=new Companion(input,output);
  try {
    const hello=await client.hello();
    if(!/^FM-1_9362\d+$/.test(hello.identity))throw Error('Select Emiuet Session FM-1 / 対応するFM-1を選択してください');
    const files=await client.files();
    const [current,stage,apply]=['library-v2','library-stage','library-apply'].map(name=>files.find(f=>f.name===name));
    if(!current||!stage||!apply)throw Error('Update FM-1 firmware / FM-1のファームを更新してください');
    const before=await client.read(current.index);
    const next=mergeLibrary(before,id,parts,stage.room);
    if(same(before,next))return 'unchanged';
    if(!approve())return 'cancelled';
    await client.write(stage.index,next);
    if(!same(await client.read(stage.index),next))throw Error('Staging verification failed / 保存前の照合に失敗しました');
    const token=new Uint8Array(8),view=new DataView(token.buffer);
    view.setUint32(0,crc32(before),true);view.setUint32(4,crc32(next),true);
    await client.write(apply.index,token);
    if(!same(await client.read(current.index),next))throw Error('Read-back differs / 保存結果の読み戻しが一致しません');
    return 'saved';
  } finally {client.close();}
}
