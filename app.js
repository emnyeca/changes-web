import {Song, Converter} from '@music-i18n/ireal-musicxml';
import './style.css';

const byId = id => document.getElementById(id);
const key = 'eub-changes-library-v1';
const labels = {
  en: {import:'Import MusicXML or iReal Pro', search:'Search library', backup:'Export backup', restore:'Restore backup', replace:'Replace the library and language with this backup?', invalid:'Invalid file', limit:'File exceeds 4 MiB'},
  ja: {import:'MusicXML・iReal Proを取り込む', search:'ライブラリを検索', backup:'バックアップを書き出す', restore:'バックアップを復元', replace:'このバックアップでライブラリと言語を置き換えますか？', invalid:'ファイル形式が不正です', limit:'ファイルが4 MiBを超えています'}
};
let state = {version:1, lang:navigator.language.startsWith('ja')?'ja':'en', songs:[]};
let selected;
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
    if (typeof song.id !== 'string' || ids.has(song.id) || typeof song.title !== 'string' || typeof song.xml !== 'string') throw Error(msg('invalid'));
    ids.add(song.id);
    parseScore(song.xml);
  }
  return value;
}
function commit(next) {
  localStorage.setItem(key,JSON.stringify(next));
  state = next;
  render();
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
  const score = byId('score');
  score.replaceChildren();
  const song = state.songs.find(s=>s.id===selected);
  if (!song) return;
  const title = document.createElement('h2');
  title.textContent = song.title;
  score.append(title);
  for (const bar of parseScore(song.xml).querySelectorAll('part:first-of-type > measure')) {
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
}
function handle(action) {
  return async event => {
    byId('status').textContent='';
    try {await action(event);} catch(error) {byId('status').textContent=error.message; render();}
    finally {if(event.target.type==='file') event.target.value='';}
  };
}
byId('lang').onchange=handle(e=>commit({...state,lang:e.target.value}));
byId('search').oninput=render;
byId('files').onchange=handle(async e=>{
  const songs=[];
  for (const file of e.target.files) {
    if(file.size>4*1024*1024) throw Error(msg('limit'));
    const input=await file.text();
    const uri=/ireal(b|book):\/\/([^"\s<>]+)/i.exec(input);
    const add=(xml,title)=> {
      const doc=parseScore(xml);
      songs.push({id:crypto.randomUUID(),title:title || doc.querySelector('work-title,movement-title')?.textContent || file.name,xml});
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
  commit({...state,songs:[...state.songs,...songs]});
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
  if(confirm(msg('replace'))) commit(next);
});
try {
  const stored=localStorage.getItem(key);
  if(stored) state=validate(JSON.parse(stored));
} catch(error) {byId('status').textContent=error.message;}
render();
