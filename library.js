export async function openLibrary() {
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('eub-changes',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('library');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  return {
    read:()=>new Promise((resolve,reject)=>{
      const request=db.transaction('library').objectStore('library').get('state');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    }),
    write:(state,revision)=>new Promise((resolve,reject)=>{
      const tx=db.transaction('library','readwrite');
      const store=tx.objectStore('library');
      const current=store.get('state');
      current.onsuccess=()=>{
        if((current.result?.revision||0)!==revision){tx.abort();return;}
        store.put({...state,revision:revision+1},'state');
      };
      tx.oncomplete=resolve;
      tx.onabort=()=>reject(tx.error||Error('Reload to apply changes / 再読み込みして変更してください'));
      tx.onerror=()=>reject(tx.error);
    })
  };
}
