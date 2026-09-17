// Persistent, versioned, resumable model cache. Only missing byte ranges are fetched.
const DB='alab-visual-assets-v1',CHUNK=4*1024*1024;
const primaryStatus=window.labAssetCache={source:'loading',networkBytes:0,cachedBytes:0,totalBytes:0,complete:false,persistent:false};
function requestValue(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function database(){
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('chunks');db.createObjectStore('models');};
  return requestValue(request);
}
async function get(db,store,key){return requestValue(db.transaction(store).objectStore(store).get(key));}
async function put(db,store,key,value){
  return new Promise((resolve,reject)=>{const transaction=db.transaction(store,'readwrite');transaction.objectStore(store).put(value,key);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
}
async function digest(buffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function reportProgress(message,status){
  window.labStartup?.stageChanged('完整场景缓存',message);
  window.dispatchEvent(new CustomEvent('lab-asset-cache-progress',{detail:{...status}}));
}

export async function loadCachedModel(metadata,status=primaryStatus){
  const progress=message=>reportProgress(message,status);
  const size=metadata.bytes,sha=metadata.sha256,key=sha+':'+size;
  Object.assign(status,{source:'loading',networkBytes:0,cachedBytes:0,totalBytes:size,complete:false,persistent:false});status.sha256=sha;
  const load=async()=>{
    let db=null;
    try{db=await database();status.persistent=true;}catch(error){status.storageError=String(error);}
    const parts=new Array(Math.ceil(size/CHUNK));const missing=[];
    for(let i=0;i<parts.length;i++){
      const expected=Math.min(CHUNK,size-i*CHUNK),part=db?await get(db,'chunks',key+':'+i):null;
      if(part?.data?.byteLength>0&&part.data.byteLength<=expected){parts[i]=part.data;status.cachedBytes+=part.data.byteLength;}
      if(parts[i]?.byteLength!==expected)missing.push(i);
    }
    status.source=missing.length?(status.cachedBytes?'resumed_download':'first_download'):'persistent_cache';
    if(!metadata.url.startsWith('/sim/')&&status.cachedBytes===0&&/alab_scene(?:-|\.)/.test(metadata.url)){
      // Reuse a complete download made by the previous viewer, when the browser
      // still has it. only-if-cached is essential: never start a second transfer.
      try{
        const legacy=new URL('./assets/alab_scene.glb?v='+sha.slice(0,12),location.href);
        const cached=await fetch(legacy,{cache:'only-if-cached',mode:'same-origin'});
        if(cached.ok){const data=await cached.arrayBuffer();
          if(data.byteLength===size&&await digest(data)===sha){
            for(let i=0;i<parts.length;i++){parts[i]=data.slice(i*CHUNK,Math.min(size,(i+1)*CHUNK));if(db)await put(db,'chunks',key+':'+i,{data:parts[i],savedAt:Date.now()});}
            missing.length=0;status.cachedBytes=size;status.source='previous_browser_cache';
          }
        }
      }catch{/* Cache miss must fall through to range downloads, without retrying the old URL. */}
    }
    let finishedBytes=status.cachedBytes;
    const controllers=new Set();
    const update=()=>progress(`真实模型 · 已缓存 ${(status.cachedBytes/1e6).toFixed(1)} MB · 本次下载 ${(status.networkBytes/1e6).toFixed(1)} MB · ${(finishedBytes/1e6).toFixed(1)} / ${(size/1e6).toFixed(1)} MB`);
    update();
    const save=async(i,data)=>{
      parts[i]=data;
      const connection=db;
      if(connection)try{await put(connection,'chunks',key+':'+i,{data,savedAt:Date.now()});}
      catch(error){status.storageError=String(error);status.persistent=false;connection.close();if(db===connection)db=null;}
    };
    const fetchPart=async i=>{
      const chunkStart=i*CHUNK,prefix=parts[i]?.byteLength||0,start=chunkStart+prefix,end=Math.min(size,chunkStart+CHUNK)-1;
      const controller=new AbortController();let watchdog;
      controllers.add(controller);
      let buffer=null,received=prefix;
      const touch=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>controller.abort(),30000);};touch();
      try{
        const response=await fetch(new URL(metadata.url,location.href),{headers:{Range:`bytes=${start}-${end}`},signal:controller.signal,cache:'default'});
        if(response.status!==206||response.headers.get('Content-Range')!==`bytes ${start}-${end}/${size}`)throw Error('模型服务没有返回正确的续传范围，请重新加载页面');
        const reader=response.body.getReader();buffer=new Uint8Array(end-chunkStart+1);let saved=prefix;
        if(prefix)buffer.set(new Uint8Array(parts[i]));
        while(true){const {done,value}=await reader.read();if(done)break;touch();
          if(received+value.byteLength>buffer.byteLength)throw Error('模型分块长度错误');
          buffer.set(value,received);received+=value.byteLength;status.networkBytes+=value.byteLength;update();
          // Persist incomplete chunks too, so a refresh resumes from the saved
          // byte offset rather than fetching the whole range again.
          if(received-saved>=1024*1024){await save(i,buffer.slice(0,received).buffer);saved=received;}
        }
        if(received!==buffer.byteLength)throw Error('模型传输中断，已完成分块将保留供下次续传');
        await save(i,buffer.buffer);finishedBytes+=buffer.byteLength-prefix;update();
      }catch(error){if(buffer&&received>prefix)await save(i,buffer.slice(0,received).buffer);if(error.name==='AbortError')throw Error('模型传输已暂停；已接收数据已缓存，重新加载会继续下载');throw error;}
      finally{clearTimeout(watchdog);controllers.delete(controller);}
    };
    // Two streams bound memory and avoid duplicate requests within this page.
    let next=0;
    try{
      const jobs=Array.from({length:Math.min(2,missing.length)},async()=>{while(next<missing.length){const index=missing[next++];await fetchPart(index);}});
      try{await Promise.all(jobs);}catch(error){for(const controller of controllers)controller.abort();await Promise.allSettled(jobs);throw error;}
      progress(status.source==='persistent_cache'?'正在从本机缓存解析模型 · 无需重新下载':'模型已接收，正在校验并保存缓存…');
      const buffer=new Uint8Array(size);parts.forEach((part,i)=>buffer.set(new Uint8Array(part),i*CHUNK));
      if(await digest(buffer)!==sha)throw Error('模型校验失败：缓存版本或服务端内容不一致，请清除站点缓存后重试');
      if(db)await put(db,'models',key,{sha256:sha,bytes:size,complete:true,verifiedAt:Date.now()});
      status.complete=true;status.completeBytes=size;
      progress(status.persistent?'正在解析已缓存模型 · 后续打开无需下载':'正在解析模型 · 浏览器未允许持久缓存');
      return buffer.buffer;
    }finally{db?.close();}
  };
  // Share downloads across tabs; the next tab rechecks the completed chunk store.
  if(navigator.locks)return navigator.locks.request('alab-model-'+key,load);
  return load();
}
