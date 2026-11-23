import {expandFiles,midiBase64} from './import_files.js';
import {openLibrary} from './library.js';
import {studio} from './studio.js';
import {Song, Converter} from '@music-i18n/ireal-musicxml';
import './style.css';

const byId = id => document.getElementById(id);
const key = 'eub-changes-library-v1';
const labels = {
  en: {create:'Create chart',title:'Song title',cells:'Chords · | bar · || section',playlist:'Official iReal Pro playlists',fetch:'Import playlist',import:'Import MusicXML or iReal Pro', search:'Search library', backup:'Export backup', restore:'Restore backup', replace:'Replace the library and language with this backup?', invalid:'Invalid file', limit:'File exceeds 4 MiB'},
  ja: {create:'曲を作成',title:'曲名',cells:'コード · | 小節 · || セクション',playlist:'iReal Pro 公式プレイリスト',fetch:'プレイリストを取り込む',import:'MusicXML・iReal Proを取り込む', search:'ライブラリを検索', backup:'バックアップを書き出す', restore:'バックアップを復元', replace:'このバックアップでライブラリと言語を置き換えますか？', invalid:'ファイル形式が不正です', limit:'ファイルが4 MiBを超えています'}
};
let state = {version:1, lang:navigator.language.startsWith('ja')?'ja':'en', songs:[]};
let selected, closeStudio, db, revision=0;
const msg = id => labels[state.lang][id];
function parseScore(xml) {
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  if (doc.documentElement.localName !== 'score-partwise' || doc.querySelector('parsererror')) throw Error(msg('invalid'));
  return doc;
}
function validate(value) {
  if (value?.version !== 1 || !Object.hasOwn(labels,value.lang) || !Array.isArray(value.songs)) throw Error(msg('invalid'));
  const ids = new Set();
  for (const song of value.songs) {
    if (typeof song.id !== 'string' || ids.has(song.id) || typeof song.title !== 'string' || (typeof song.xml !== 'string' && !Array.isArray(song.cells))) throw Error(msg('invalid'));
    ids.add(song.id);
    if(song.xml)parseScore(song.xml);
  }
  return value;
}
async function commit(next, redraw=true) {
  await db.write(next,revision);
  revision++;
  state = next;
  if(redraw)render();
}
function render() {
  document.documentElement.lang = state.lang;
  byId('lang').value = state.lang;
  for (const node of document.querySelectorAll('[data-label]')) node.textContent = msg(node.dataset.label);
  const list = byId('songs');
  list.replaceChildren();
  for (const song of state.songs.filter(s=>s.title.toLowerCase().includes(byId('search').value.toLowerCase()))) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.textContent = song.title;
    button.onclick = () => {selected=song.id; render();};
    item.append(button);
    list.append(item);
  }
  closeStudio?.();
  const score = byId('score');
  score.replaceChildren();
  const song = state.songs.find(s=>s.id===selected);
  if (!song) return;
  const title = document.createElement('h2');
  title.textContent = song.title;
  score.append(title);
  if(song.cells) { const cells=document.createElement('p'); cells.textContent=song.cells.join(' ');score.append(cells); }
  for (const bar of song.xml?parseScore(song.xml).querySelectorAll('part:first-of-type > measure'):[]) {
    const cell = document.createElement('span');
    cell.className='bar';
    cell.textContent = Array.from(bar.querySelectorAll('harmony'), h => {
      const kind = h.querySelector('kind');
      const alter = Number(h.querySelector('root-alter')?.textContent || 0);
      const accidental = ({'-2':'bb','-1':'b','0':'','1':'#','2':'##'})[alter] ?? '';
      return (h.querySelector('root-step')?.textContent || '') + accidental + (kind?.getAttribute('text') ?? kind?.textContent ?? '');
    }).join('  ') || '·';
    score.append(cell);
  }
  const manage=document.createElement('div');
  const rename=document.createElement('button');
  rename.textContent=state.lang==='ja'?'曲名を変更':'Rename';
  rename.onclick=handle(()=>{const title=prompt(rename.textContent,song.title)?.trim(); if(title)return commit({...state,songs:state.songs.map(s=>s.id===song.id?{...s,title}:s)});});
  const remove=document.createElement('button');
  remove.textContent=state.lang==='ja'?'ライブラリから削除':'Delete from library';
  remove.onclick=handle(()=>{if(confirm(remove.textContent+' · '+song.title))return commit({...state,songs:state.songs.filter(s=>s.id!==song.id)});});
  manage.append(rename,remove); score.append(manage);
  closeStudio=studio(score,song,state.lang,state.preferences || {},preferences=>{
    const next={...state,preferences};
    return commit(next,false);
  },changes=>{
    const songs=state.songs.map(s=>s.id===song.id?{...s,...changes}:s);
    return commit({...state,songs});
  });
}
function handle(action) {
  return async event => {
    byId('status').textContent='';
    try {await action(event);} catch(error) {byId('status').textContent=error.message; render();}
    finally {if(event.target.type==='file') event.target.value='';}
  };
}
byId('new').onclick=handle(async()=>{
  const title=byId('newTitle').value.trim(),cells=byId('newCells').value.trim().split(/\s+/);
  if(!title || !cells[0])throw Error(msg('invalid'));
  const song={id:crypto.randomUUID(),title,cells};
  selected=song.id;await commit({...state,songs:[...state.songs,song]});
});
byId('lang').onchange=handle(e=>commit({...state,lang:e.target.value}));
byId('search').oninput=render;
async function importCharts(files) {
  const songs=[];
  const expanded=await expandFiles(files);
  const stem=name=>name.replace(/\.[^.]+$/,'').trim().toLowerCase();
  const midi=new Map();
  for(const file of expanded.filter(f=>/\.midi?$/i.test(f.name)))midi.set(stem(file.name),midiBase64(new Uint8Array(await file.arrayBuffer())));
  for (const file of expanded.filter(f=>!/\.midi?$/i.test(f.name))) {
    if(file.size>4*1024*1024) throw Error(msg('limit'));
    const input=await file.text();
    const uri=/ireal(b|book):\/\/([^"\s<>]+)/i.exec(input);
    const add=(xml,title)=> {
      const doc=parseScore(xml);
      songs.push({id:crypto.randomUUID(),title:title || doc.querySelector('work-title,movement-title')?.textContent || file.name,source:file.name,xml,midi:midi.get(stem(file.name))});
    };
    if (!uri) {add(input); continue;}
    const parts=decodeURIComponent(uri[2]).split('===');
    if(parts.length>1) parts.pop();
    for (const part of parts) {
      const song=new Song(part,uri[1]==='book');
      add(Converter.convert(song),song.title);
    }
  }
  selected=songs[0]?.id;
  const existing=state.songs.map(s=>{
    const update=midi.get(stem(s.source || s.title)) || midi.get(stem(s.title));
    if(!songs.length && update)return {...s,midi:update};
    return s;
  });
  if(!songs.length && !existing.some((s,i)=>s!==state.songs[i]))throw Error(msg('invalid'));
  await commit({...state,songs:[...existing,...songs]});
}
byId('files').onchange=handle(e=>importCharts(e.target.files));
const playlists={jazz1460:'Jazz 1460',brazilian220:'Brazilian 220',latin50:'Latin 50',blues50:'Blues 50',pop400:'Pop 400',country50:'Country 50'};
for(const [id,name] of Object.entries(playlists))byId('playlist').add(new Option(name,id));
byId('fetch').onclick=handle(async()=>{
  const id=byId('playlist').value;
  if(!Object.hasOwn(playlists,id))return;
  const url='https://blog.karimratib.me/demos/chirp/data/'+id+'.txt';
  try {
    const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(String(response.status));
    await importCharts([new File([await response.blob()],id+'.txt')]);
  }catch(error) {
    const manual=document.createElement('a');
    manual.href=url;manual.target='_blank';manual.rel='noreferrer';
    manual.textContent=state.lang==='ja'?'元ファイルを保存して取り込む':'Save the source file and import it';
    byId('status').replaceChildren(document.createTextNode(error.message+' '),manual);
  }
});

byId('save').onclick=handle(()=>{
  const link=document.createElement('a');
  link.download='eub-changes.json';
  link.href=URL.createObjectURL(new Blob([JSON.stringify(state)],{type:'application/json'}));
  link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
});
byId('restore').onchange=handle(async e=>{
  const file=e.target.files[0];
  if(!file) return;
  const next=validate(JSON.parse(await file.text()));
  if(confirm(msg('replace'))) await commit(next);
});
async function start() {
  db=await openLibrary();
  const stored=await db.read();
  if(stored){state=validate(stored);revision=stored.revision;}
  else {
    const legacy=localStorage.getItem(key);
    if(legacy){await commit(validate(JSON.parse(legacy)),false);localStorage.removeItem(key);}
  }
  render();
}
start().catch(error=>byId('status').textContent=error.message);
