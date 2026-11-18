'use strict';
(()=>{
 const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const status=document.getElementById('status'),button=document.getElementById('unlock'),input=document.getElementById('password');
 let key,manifest,bundle,frame,showSequence=0;
 const assets=new Map();
 async function decrypt(name){
  if(assets.has(name))return assets.get(name);
  const promise=(async()=>{
   const entry=manifest.assets[name];if(!entry)throw Error('해당 작성일의 게시 자료가 없습니다.');
   const response=await fetch(entry.path+'?v='+entry.sha256,{cache:'force-cache'});if(!response.ok)throw Error('게시 자료를 불러오지 못했습니다.');
   const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(entry.nonce),additionalData:new TextEncoder().encode('sales-performance-v1/'+name)},key,await response.arrayBuffer());
   return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  })();assets.set(name,promise);
  try{return await promise;}catch(error){assets.delete(name);throw error;}
 }
 const parameters=href=>{
  const u=new URL(href,location.href),params=new URLSearchParams(u.search);
  if(['/route','/route-fuel'].includes(u.pathname))params.set('view',u.pathname.slice(1));
  else if(u.pathname==='/')params.delete('view');
  return params;
 };
 async function show(){
  const sequence=++showSequence;
  const requested=new URLSearchParams(location.search).get('view');const view=['route','route-fuel'].includes(requested)?requested:'dashboard';
  const html=bundle.html?.[view]||await decrypt(bundle.htmlAssets[view]);
  if(sequence!==showSequence)return;
  if(frame)frame.remove();
  frame=document.createElement('iframe');frame.allow='clipboard-write';frame.title=view==='route'?'노선별 발매 상세':'출발월별 발매실적';frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;background:#f6f3ef';
  document.body.style.cssText='margin:0;display:block;height:100vh';document.body.append(frame);frame.srcdoc=html;
  document.title=frame.title;
 }
 window.SalesRuntime={
  replace(href){history.replaceState(null,'',location.pathname+'?'+parameters(href));},
  navigate(href){history.pushState(null,'',location.pathname+'?'+parameters(href));show();},
  async request(href,options={}){
   try{
    const u=new URL(href,location.href),q=u.searchParams,date=q.get('capture')||bundle.latest;
    let result;
    if(u.pathname.startsWith('/api/contract-documents')){
     const connectLocal=async()=>{
      try{
       const response=await fetch('http://127.0.0.1:8772'+u.pathname+u.search,{...options,signal:AbortSignal.timeout(u.pathname.endsWith('/publish')?240000:options.method==='POST'?60000:10000)});
       if(!response.ok){const error=await response.json();throw Error(error.error||'로컬 문서 조회에 실패했습니다.');}
       return response;
      }catch(error){throw Error('이 PC에서 「2. 대시보드 반영 및 열기」를 실행하고, 브라우저의 로컬 네트워크 연결을 허용한 뒤 다시 시도해 주세요. '+(error.message||''));}
     };
     if(options.method==='POST'){
      const response=await connectLocal(),row=await response.json();
      localStorage.setItem('sales-contract-local-enabled','1');
      return new Response(JSON.stringify({...row,localOnly:true}),{headers:{'Content-Type':'application/json'}});
     }
     if(u.pathname.endsWith('/file')){
      const id=q.get('id'),name='contract-file-'+id;
      if(manifest.assets[name]){const file=await decrypt(name);return new Response(decode(file.contentBase64),{headers:{'Content-Type':file.mime||'application/octet-stream'}});}
      return connectLocal();
     }
     const shared=await decrypt('contracts-index');result={...shared,documents:[...shared.documents]};
     if(q.get('local')==='1'||localStorage.getItem('sales-contract-local-enabled')==='1'){
      try{
       const local=await(await connectLocal()).json(),ids=new Set(result.documents.map(r=>r.id));
       result.documents.push(...local.documents.filter(r=>!ids.has(r.id)).map(r=>({...r,localOnly:true})));
       result.routes=[...new Set([...result.routes,...local.routes])].sort();localStorage.setItem('sales-contract-local-enabled','1');
      }catch(error){result.localNotice=error.message;}
     }
    }
    else if(u.pathname==='/api/dashboard'){const tag=(q.get('mode')||'bi')+'|'+date;result=bundle.reports?.[tag]||await decrypt(bundle.reportAssets[tag]);}
    else if(u.pathname==='/api/companies')result=await decrypt('companies-'+date);
    else if(['/api/route','/api/route-fuel'].includes(u.pathname)){
     const month=bundle.months.includes(q.get('month'))?q.get('month'):bundle.months[0];
     const asset=(u.pathname==='/api/route-fuel'?'routes-fuel-':'routes-')+month,index=bundle.routeIndexes?.[asset];
     const data=index?null:await decrypt(asset),initial=index||data['ALL|all|vv'];
     let route=q.get('route')||initial.routes[0],line=q.get('line')||initial.route_lines[route]||'all',direction=q.get('direction')||'vv';
     const choices=Object.keys(initial.route_lines).filter(rt=>line==='all'||initial.route_lines[rt]===line).sort();
     if(route!=='ALL'&&!choices.includes(route))route=choices[0];
     const group=route+'|'+(route==='ALL'?line:'all');
     const source=index?(await decrypt(index.groups[group]))[direction]:data[group+'|'+direction];
     if(source)result={...source,routes:choices,filter_line:line};
    }
    if(!result)throw Error('선택한 작성일 또는 노선의 게시 자료가 없습니다.');
    return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
   }catch(error){return new Response(JSON.stringify({error:error.message}),{status:400,headers:{'Content-Type':'application/json'}});}
  }
 };
 window.addEventListener('popstate',()=>{if(bundle)show();});
 async function unlock(rememberedKey=null){
  if(!input.value&&!rememberedKey){status.textContent='접속 비밀번호를 입력하세요.';return;}
  button.disabled=true;status.textContent='출발월별 발매실적을 확인하고 있습니다…';
  try{
   const response=await fetch('manifest.json',{cache:'no-store'});if(!response.ok)throw Error('게시 정보를 불러오지 못했습니다.');manifest=await response.json();
   if(manifest.version!==1||manifest.algorithm!=='AES-256-GCM'||manifest.kdf!=='PBKDF2-SHA256'||manifest.iterations!==600000)throw Error('지원하지 않는 자료 형식입니다.');
   const passwordKey=rememberedKey||await crypto.subtle.importKey('raw',new TextEncoder().encode(input.value),'PBKDF2',false,['deriveKey']);input.value='';
   key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(manifest.salt),iterations:manifest.iterations,hash:'SHA-256'},passwordKey,{name:'AES-GCM',length:256},false,['decrypt']);
   bundle=await decrypt('main');await window.DashboardRemember?.save(passwordKey);document.querySelector('.lock').remove();await show();
  }catch(error){if(error.name==='OperationError')await window.DashboardRemember?.clear();input.value='';button.disabled=false;status.textContent=error.name==='OperationError'?'비밀번호가 맞지 않거나 자료가 손상되었습니다.':error.message;input.focus();}
 }
 button.addEventListener('click',()=>unlock());input.addEventListener('keydown',event=>{if(event.key==='Enter')unlock();});
 button.disabled=true;
 (async()=>{const remembered=await window.DashboardRemember?.get();button.disabled=false;if(remembered)unlock(remembered);})();
})();
