'use strict';
(()=>{
 const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const status=document.getElementById('status'),button=document.getElementById('unlock'),input=document.getElementById('password');
 let key,manifest,bundle,frame;
 const assets=new Map();
 async function decrypt(name){
  if(assets.has(name))return assets.get(name);
  const promise=(async()=>{
   const entry=manifest.assets[name];if(!entry)throw Error('해당 작성일의 게시 자료가 없습니다.');
   const response=await fetch(entry.path,{cache:'no-store'});if(!response.ok)throw Error('게시 자료를 불러오지 못했습니다.');
   const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(entry.nonce),additionalData:new TextEncoder().encode('sales-performance-v1/'+name)},key,await response.arrayBuffer());
   return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  })();assets.set(name,promise);
  try{return await promise;}catch(error){assets.delete(name);throw error;}
 }
 const parameters=href=>{
  const u=new URL(href,location.href),params=new URLSearchParams(u.search);
  if(u.pathname==='/route')params.set('view','route');
  else if(u.pathname==='/')params.delete('view');
  return params;
 };
 function show(){
  const view=new URLSearchParams(location.search).get('view')==='route'?'route':'dashboard';
  if(frame)frame.remove();
  frame=document.createElement('iframe');frame.title=view==='route'?'노선별 발매 상세':'출발월별 발매실적';frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;background:#f6f3ef';
  document.body.style.cssText='margin:0;display:block;height:100vh';document.body.append(frame);frame.srcdoc=bundle.html[view];
  document.title=frame.title;
 }
 window.SalesRuntime={
  replace(href){history.replaceState(null,'',location.pathname+'?'+parameters(href));},
  navigate(href){history.pushState(null,'',location.pathname+'?'+parameters(href));show();},
  async request(href){
   try{
    const u=new URL(href,location.href),q=u.searchParams,date=q.get('capture')||bundle.latest;
    let result;
    if(u.pathname==='/api/dashboard')result=bundle.reports[(q.get('mode')||'bi')+'|'+date];
    else if(u.pathname==='/api/companies')result=await decrypt('companies-'+date);
    else if(u.pathname==='/api/route'){
     const month=bundle.months.includes(q.get('month'))?q.get('month'):bundle.months[0];
     const data=await decrypt('routes-'+month),initial=data['ALL|all|vv'];
     let route=q.get('route')||initial.routes[0],line=q.get('line')||initial.route_lines[route]||'all',direction=q.get('direction')||'vv';
     const choices=Object.keys(initial.route_lines).filter(rt=>line==='all'||initial.route_lines[rt]===line).sort();
     if(route!=='ALL'&&!choices.includes(route))route=choices[0];
     const source=data[route+'|'+(route==='ALL'?line:'all')+'|'+direction];
     if(source)result={...source,routes:choices,filter_line:line};
    }
    if(!result)throw Error('선택한 작성일 또는 노선의 게시 자료가 없습니다.');
    return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
   }catch(error){return new Response(JSON.stringify({error:error.message}),{status:400,headers:{'Content-Type':'application/json'}});}
  }
 };
 window.addEventListener('popstate',()=>{if(bundle)show();});
 async function unlock(){
  if(!input.value){status.textContent='접속 비밀번호를 입력하세요.';return;}
  button.disabled=true;status.textContent='출발월별 발매실적을 확인하고 있습니다…';
  try{
   const response=await fetch('manifest.json',{cache:'no-store'});if(!response.ok)throw Error('게시 정보를 불러오지 못했습니다.');manifest=await response.json();
   if(manifest.version!==1||manifest.algorithm!=='AES-256-GCM'||manifest.kdf!=='PBKDF2-SHA256'||manifest.iterations!==600000)throw Error('지원하지 않는 자료 형식입니다.');
   const passwordKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(input.value),'PBKDF2',false,['deriveKey']);input.value='';
   key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(manifest.salt),iterations:manifest.iterations,hash:'SHA-256'},passwordKey,{name:'AES-GCM',length:256},false,['decrypt']);
   bundle=await decrypt('main');document.querySelector('.lock').remove();show();
  }catch(error){input.value='';button.disabled=false;status.textContent=error.name==='OperationError'?'비밀번호가 맞지 않거나 자료가 손상되었습니다.':error.message;input.focus();}
 }
 button.addEventListener('click',unlock);input.addEventListener('keydown',event=>{if(event.key==='Enter')unlock();});
})();
