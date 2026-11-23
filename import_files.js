import {ZipReader,BlobReader} from '@zip.js/zip.js';
const maximum=32*1024*1024;
export async function expandFiles(files) {
  const result=[];
  let total=0;
  for(const file of files) {
    if(file.size>maximum) throw Error('File exceeds 32 MiB / 32 MiBを超えています');
    if(!file.name.toLowerCase().endsWith('.zip')) {result.push(file);total+=file.size;continue;}
    const zip=new ZipReader(new BlobReader(file),{useWebWorkers:false});
    try {
      for await(const entry of zip.getEntriesGenerator()) {
        if(entry.directory || !/\.(?:xml|musicxml|midi?|html?|txt)$/i.test(entry.filename))continue;
        if(total+entry.uncompressedSize>maximum || result.length>=2048)throw Error('Archive too large / ZIPの展開上限を超えています');
        const chunks=[];
        await entry.getData(new WritableStream({write(chunk){
          total+=chunk.length;
          if(total>maximum)throw Error('Archive too large / ZIPの展開上限を超えています');
          chunks.push(chunk);
        }}),{checkSignature:true});
        result.push(new File(chunks,entry.filename.split('/').at(-1)));
      }
    } finally {await zip.close();}
  }
  if(total>maximum || result.length>2048)throw Error('Import too large / 取り込み上限を超えています');
  return result;
}
export function midiBase64(bytes) {
  let text='';
  for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(text);
}
