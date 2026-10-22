'use strict';
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const statusNode=document.getElementById('status'),button=document.getElementById('unlock'),input=document.getElementById('password');
async function unlock(){
 if(!input.value){statusNode.textContent='접속 비밀번호를 입력하세요.';return;}
 button.disabled=true;statusNode.textContent='암호화된 자료를 확인하고 있습니다…';
 try{
  const manifestResponse=await fetch('manifest.json',{cache:'no-store'});if(!manifestResponse.ok)throw Error('자료를 불러올 수 없습니다.');const m=await manifestResponse.json();
  if(m.version!==1||m.algorithm!=='AES-256-GCM'||m.kdf!=='PBKDF2-SHA256'||m.payload!=='dashboard.enc'||m.iterations!==600000)throw Error('지원하지 않는 자료 형식입니다.');
  const passwordKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(input.value),'PBKDF2',false,['deriveKey']);input.value='';
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(m.salt),iterations:m.iterations,hash:'SHA-256'},passwordKey,{name:'AES-GCM',length:256},false,['decrypt']);
  const response=await fetch(m.payload,{cache:'no-store'});if(!response.ok)throw Error('암호화 자료를 불러올 수 없습니다.');const ciphertext=await response.arrayBuffer();
  statusNode.textContent='자료를 열고 있습니다…';const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(m.nonce),additionalData:new TextEncoder().encode('dashboard-v1')},key,ciphertext);
  const stream=new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));const payload=await new Response(stream).json();
  window.__DASHBOARD_DATA__=payload.data;document.open();document.write(payload.html);document.close();
 }catch(error){input.value='';button.disabled=false;statusNode.textContent=error.name==='OperationError'?'비밀번호가 맞지 않거나 자료가 손상되었습니다.':error.message;input.focus();}
}
button.addEventListener('click',unlock);input.addEventListener('keydown',event=>{if(event.key==='Enter')unlock();});
