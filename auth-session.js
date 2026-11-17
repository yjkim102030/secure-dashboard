/* Shared same-browser login for both protected viewers; no plaintext password is saved. */
(()=>{
 const open=()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('trinity-dashboard-login-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('keys');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 async function access(mode,key){
  let db;
  try{
   db=await open();
   return await new Promise((resolve,reject)=>{
    const tx=db.transaction('keys',mode),store=tx.objectStore('keys');
    const request=key===undefined?store.get('pbkdf2'):key===null?store.delete('pbkdf2'):store.put(key,'pbkdf2');
    let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result||null);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
   });
  }catch{return null;}finally{db?.close();}
 }
 window.DashboardRemember={get:()=>access('readonly'),save:key=>access('readwrite',key),clear:()=>access('readwrite',null)};
})();
