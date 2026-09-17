<script setup lang="ts">
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadScene } from '../../features/materials/scene-glb.js';
import { materialApi } from '../../features/materials/api';

const emit = defineEmits<{ ready: [value: boolean]; state: [value: any]; metric: [value: any] }>();
const host = ref<HTMLDivElement>();
const loading = ref(true), error = ref(''), loadingText = ref('正在加载实验室…');
const role = ref('observer'), connected = ref(false), cameraName = ref('overview');
const followWorkflow = ref(true);
const fps = ref(0), cacheLabel = ref('读取模型'), selected = shallowRef<any>(null);
const clientId = crypto.randomUUID();
const objects = new Map<string, THREE.Group>(), parts = new Map<string, Map<string, THREE.Group>>();
const pickables: THREE.Object3D[] = [];
let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls;
let ws: WebSocket | null = null, raf = 0, reconnectTimer = 0, heartbeatTimer = 0, observer: ResizeObserver;
let disposed = false, manifest: any, snapshot: any, command: any, lease = 0, commandFrames = 0;
let lastFrameTime = 0, lastMetricAt = 0, frames = 0, receivedAt = 0, fetchingCommand = '';
let acknowledged = '', ackPending = false, runSeen: string | null = null, frameState: any = null;
let highlight: THREE.BoxHelper | null = null;
const latencies: number[] = [];
const metrics: any = { fps:0, renderedFrames:0, acknowledgedCommands:0, trajectoryLatencyMs:[], maxPositionErrorM:0, maxAngleErrorDeg:0 };

function pose(target: THREE.Object3D, value: number[]) {
  target.position.set(value[0]!, value[1]!, value[2]!);
  target.quaternion.set(value[4]!, value[5]!, value[6]!, value[3]!).normalize();
  target.updateMatrix(); target.updateMatrixWorld(true);
}
function readPose(target: THREE.Object3D) {
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  target.getWorldPosition(p); target.getWorldQuaternion(q);
  return [p.x,p.y,p.z,q.w,q.x,q.y,q.z];
}
function applyObject(uid: string, value: any) {
  const root = objects.get(uid); if (!root) return;
  pose(root,value.pose);
  const inverse = root.matrixWorld.clone().invert();
  for (const [name, p] of Object.entries(value.bodies || {})) {
    const body = parts.get(uid)?.get(name); if (!body) continue;
    const v = p as number[];
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(v[0],v[1],v[2]),new THREE.Quaternion(v[4],v[5],v[6],v[3]),new THREE.Vector3(1,1,1));
    matrix.premultiply(inverse).decompose(body.position,body.quaternion,body.scale);
    body.updateMatrix();body.updateMatrixWorld(true);
  }
}
function applyState(value: any) {
  for (const [uid, item] of Object.entries(value.objects)) applyObject(uid,item);
  frameState = value;
}
function mixPose(a:number[],b:number[],s:number) {
  const qa=new THREE.Quaternion(a[4],a[5],a[6],a[3]);const qb=new THREE.Quaternion(b[4],b[5],b[6],b[3]);qa.slerp(qb,s);
  return [a[0]!+(b[0]!-a[0]!)*s,a[1]!+(b[1]!-a[1]!)*s,a[2]!+(b[2]!-a[2]!)*s,qa.w,qa.x,qa.y,qa.z];
}
function sampleTrajectory(t:number) {
  const trajectory=command.trajectory;const keyframes=trajectory.frames;
  if(t>=1) return trajectory.end_state;
  let hi=keyframes.findIndex((f:any)=>f.at>=t);if(hi<=0)hi=1;
  const a=keyframes[hi-1],b=keyframes[hi];const f=Math.max(0,Math.min(1,(t-a.at)/Math.max(.00001,b.at-a.at)));
  const current:any={objects:{},temperature_C:a.temperature_C ?? snapshot.scene_state.temperature_C};
  for(const uid of trajectory.affected_objects){
    const left=a.objects[uid],right=b.objects[uid];
    current.objects[uid]={...left,pose:mixPose(left.pose,right.pose,f),bodies:{}};
    for(const key of Object.keys(left.bodies)) current.objects[uid].bodies[key]=mixPose(left.bodies[key],right.bodies[key],f);
  }
  return current;
}
function actualEndState() {
  const expected=command.trajectory.end_state;
  const result=structuredClone(expected);
  for(const uid of command.trajectory.affected_objects){
    const root=objects.get(uid);if(!root)throw Error(`场景缺少 ${uid}`);
    result.objects[uid].pose=readPose(root);
    for(const name of Object.keys(expected.objects[uid].bodies)){
      const body=parts.get(uid)?.get(name);if(!body)throw Error(`模型缺少 ${uid}/${name}`);
      result.objects[uid].bodies[name]=readPose(body);
    }
  }
  return result;
}
async function acknowledge() {
  if(ackPending||acknowledged===command.id||role.value!=='executor')return;
  ackPending=true;
  const cid=command.id;
  try {
    const answer=await materialApi('/sim/receipt',{
      client_id:clientId,lease_epoch:lease,command_id:cid,trajectory_hash:command.trajectory.trajectory_hash,
      frame_index:command.trajectory.frames.length-1,simulation_elapsed_s:command.trajectory.duration_s,
      rendered_frames:commandFrames,end_state:actualEndState(),status:'completed',error:null,
    });
    acknowledged=cid;metrics.acknowledgedCommands++;
    metrics.maxPositionErrorM=Math.max(metrics.maxPositionErrorM,answer.pose_verification?.max_position_error_m||0);
    metrics.maxAngleErrorDeg=Math.max(metrics.maxAngleErrorDeg,answer.pose_verification?.max_angle_error_deg||0);
  } catch(e) { error.value=(e as Error).message; }
  finally { ackPending=false; }
}
async function acceptState(value:any) {
  snapshot=value;receivedAt=performance.now();connected.value=true;
  const lag=Math.max(0,Date.now()-value.server_time*1000);latencies.push(lag);if(latencies.length>300)latencies.shift();
  if(value.run_id!==runSeen){runSeen=value.run_id;command=null;applyState(value.scene_state);}
  if(!value.command){
    command=null;applyState(value.scene_state);
  }else if(command?.id!==value.command.id&&fetchingCommand!==value.command.id){
    const cid=value.command.id;fetchingCommand=cid;
    try{
      const payload=await materialApi('/execution/commands/'+cid);
      if(snapshot?.command?.id!==cid)return;
      applyState(value.scene_state);command=payload;commandFrames=0;acknowledged='';error.value='';
      const targetId=command.trajectory.affected_objects.find((id:string)=>!id.startsWith('ur')&&!id.startsWith('fr3'));
      if(targetId) selectObject(targetId);
    }catch(e){error.value=(e as Error).message;}
    finally{if(fetchingCommand===cid)fetchingCommand='';}
  }
  emit('state',value);
}
function connect() {
  if(disposed)return;
  const url=new URL('/sim/ws',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(url);
  ws.onmessage=(event)=>{try{void acceptState(JSON.parse(event.data));}catch(e){error.value=String(e);}};
  ws.onclose=()=>{connected.value=false;if(!disposed)reconnectTimer=window.setTimeout(connect,1500);};
  ws.onerror=()=>{connected.value=false;};
}
async function claim() {
  if(!manifest||loading.value||disposed||document.visibilityState!=='visible')return;
  try{
    const answer=await materialApi('/sim/claim',{client_id:clientId,scene_hash:manifest.kinematics.sha256,renderer_ready:true});
    role.value=answer.role;lease=answer.lease_epoch;
    emit('ready',role.value==='executor');
  }catch(e){error.value=(e as Error).message;emit('ready',false);}
}
function cameraView(key:string, automatic=false) {
  if(automatic&&!followWorkflow.value)return;
  if(!automatic)followWorkflow.value=false;
  const names:Record<string,string>={overview:'overview_1',A:'station_a',B:'station_b',C:'station_c'};
  const entry=manifest?.metadata.cameras.find((c:any)=>c.name.toLowerCase()===names[key]?.toLowerCase());
  if(entry){camera.position.fromArray(entry.eye);controls.target.fromArray(entry.target);camera.fov=2*Math.atan(24/(entry.focal||16)/(960/600)/2)*180/Math.PI;camera.updateProjectionMatrix();}
  else {
    const views:any={overview:[8,-9,8,0,0,1],A:[5,4,4,1.9,.65,1.2],B:[.5,-.9,3.4,-1.9,-2.45,1.1],C:[4.9,-4.8,3.1,2.5,-2.45,1.15]};
    const v=views[key]||views.overview;camera.position.set(...v.slice(0,3) as [number,number,number]);controls.target.set(...v.slice(3) as [number,number,number]);
  }
  cameraName.value=key;controls.update();
}
function selectObject(id:string) {
  const object=objects.get(id);if(!object)return;
  selected.value={id,pose:readPose(object)};
  if(highlight){scene.remove(highlight);highlight.geometry.dispose();(highlight.material as THREE.Material).dispose();}
  highlight=new THREE.BoxHelper(object,0x2d7468);scene.add(highlight);
}
function click(event:PointerEvent) {
  const rect=renderer.domElement.getBoundingClientRect();
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObjects(pickables,false)[0];if(hit?.object.userData.objectId)selectObject(hit.object.userData.objectId);
}
function draw(now:number) {
  if(disposed)return;raf=requestAnimationFrame(draw);
  if(now-lastFrameTime<15)return;lastFrameTime=now;
  if(command&&snapshot?.command?.id===command.id){
    const current=snapshot.command;
    // Server clock is authoritative. Extrapolate only until the next expected state,
    // freeze on disconnect/hidden tabs; do not multiply the stored time again.
    const age=Math.min(.25,Math.max(0,(now-receivedAt)/1000));
    const dt=connected.value&&!snapshot.paused&&current.status==='rendering'?age*snapshot.speed:0;
    const elapsed=Math.min(current.duration_s,current.elapsed_s+dt);
    const at=elapsed/current.duration_s;
    applyState(sampleTrajectory(at));commandFrames++;
    if(at>=1 && current.elapsed_s>=current.duration_s && current.status==='rendering'){
      renderer.render(scene,camera);metrics.renderedFrames++;void acknowledge();
    }
  }
  controls.update();highlight?.update();renderer.render(scene,camera);frames++;metrics.renderedFrames++;
  if(now-lastMetricAt>=1000){
    fps.value=Math.round(frames*1000/(now-lastMetricAt));metrics.fps=fps.value;frames=0;lastMetricAt=now;
    metrics.latencyP95Ms=[...latencies].sort((a,b)=>a-b)[Math.floor(latencies.length*.95)]||0;
    metrics.cache=(window as any).labAssetCache;metrics.rendererRole=role.value;
    (window as any).materialsMetrics=metrics;emit('metric',{...metrics});
    if(selected.value){const object=objects.get(selected.value.id);if(object)selected.value={id:selected.value.id,pose:readPose(object),state:frameState?.objects?.[selected.value.id]};}
  }
}
function progress(event:Event) {
  const data=(event as CustomEvent).detail;
  loadingText.value=`真实 USD 模型 · ${(data.cachedBytes/1e6).toFixed(1)} MB 已缓存 · ${(data.networkBytes/1e6).toFixed(1)} MB 本次读取`;
  cacheLabel.value=data.source==='persistent_cache'?'本机缓存':'首次加载';
}
onMounted(async()=>{
  window.addEventListener('lab-asset-cache-progress',progress);
  try{
    manifest=await materialApi('/sim/scene');
    scene=new THREE.Scene();scene.background=new THREE.Color('#e9ece7');
    camera=new THREE.PerspectiveCamera(42,1,.03,100);camera.up.set(0,0,1);
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(host.value!.clientWidth,host.value!.clientHeight);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
    host.value!.appendChild(renderer.domElement);renderer.domElement.dataset.testid='materials-threejs';
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxDistance=25;controls.minDistance=.2;
    controls.addEventListener('start',()=>{followWorkflow.value=false;});
    scene.add(new THREE.HemisphereLight(0xffffff,0x777777,2.2));const sun=new THREE.DirectionalLight(0xffffff,2.4);sun.position.set(2,2,8);scene.add(sun);
    cameraView('overview',true);
    await loadScene({scene,renderer,metadata:manifest.metadata,pose,objects,parts,pickables});
    applyState(manifest.initial_state);
    renderer.domElement.addEventListener('pointerup',click);
    observer=new ResizeObserver(()=>{if(!host.value)return;const w=host.value.clientWidth,h=host.value.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(host.value!);
    loading.value=false;loadingText.value='';lastMetricAt=performance.now();raf=requestAnimationFrame(draw);
    await claim();connect();
    heartbeatTimer=window.setInterval(async()=>{
      if(document.visibilityState!=='visible'){emit('ready',false);return;}
      if(role.value!=='executor'){await claim();return;}
      try{await materialApi('/sim/heartbeat',{client_id:clientId,lease_epoch:lease});emit('ready',true);}
      catch{role.value='observer';await claim();}
    },1000);
  }catch(e){error.value=(e as Error).message;loading.value=false;emit('ready',false);}
});
onBeforeUnmount(()=>{
  disposed=true;cancelAnimationFrame(raf);clearInterval(heartbeatTimer);clearTimeout(reconnectTimer);ws?.close();observer?.disconnect();
  window.removeEventListener('lab-asset-cache-progress',progress);controls?.dispose();
  scene?.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
  renderer?.dispose();emit('ready',false);
});
defineExpose({cameraView,selectObject,metrics});
</script>

<template>
  <section class="materials-scene">
    <div class="scene-toolbar"><div class="scene-mode"><i :class="{online:connected}"/>网页轨迹仿真 <span>USD 原始模型</span></div>
      <div class="camera-switch"><button v-for="[key,label] in [['overview','全景'],['A','A · 制备'],['B','B · 热处理'],['C','C · 表征']]" :key="key" :class="{active:cameraName===key}" @click="cameraView(key!)">{{label}}</button><button :class="{active:followWorkflow}" @click="followWorkflow=!followWorkflow">跟随流程</button></div>
    </div>
    <div ref="host" class="three-viewport">
      <div v-if="loading||error" class="scene-message" :class="{problem:!!error}"><strong>{{error?'场景提示':'加载实验室'}}</strong><span>{{error||loadingText}}</span><button v-if="error&&!loading" @click="error=''">收起</button></div>
      <div v-if="selected&&!loading" class="object-coordinate"><strong>{{selected.id}}</strong><span>{{selected.pose.slice(0,3).map((v:number)=>v.toFixed(3)).join(' · ')}} m</span><small v-if="selected.state?.capped!==undefined && /^(vial|precursor)_/.test(selected.id)">{{selected.state.capped?'已封盖':'未封盖'}}</small></div>
      <div class="scene-hint">拖动旋转 · 滚轮缩放 · 点击设备查看坐标</div>
    </div>
    <div class="scene-footer"><span><i :class="{online:connected}"/>{{connected?'状态桥已连接':'状态桥连接中'}}</span><span>{{role==='executor'?'此页面执行':'观察模式'}}</span><span>{{fps}} FPS</span><span>{{cacheLabel}}</span><span>m · Z↑</span></div>
  </section>
</template>

<style scoped>
.materials-scene{height:100%;min-height:450px;display:flex;flex-direction:column;background:var(--panel,#fbfaf7);border:1px solid var(--hairline,#d8dad6);border-radius:14px;overflow:hidden}
.scene-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:46px;padding:8px 14px;border-bottom:1px solid var(--hairline,#d8dad6);font-size:12px}
.scene-mode{display:flex;align-items:center;gap:7px;font-weight:600}.scene-mode span{color:var(--slate,#66737b);font-weight:400}
i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#b98032;margin-right:5px}i.online{background:var(--domain-accent,#2d7468)}
.camera-switch{display:flex;background:var(--paper,#f5f3ed);border-radius:7px;padding:2px}.camera-switch button{background:transparent;border:0;padding:4px 10px;border-radius:5px;color:inherit;cursor:pointer;font:inherit}.camera-switch button.active{background:var(--panel,#fff);box-shadow:0 1px 3px #0001}
.three-viewport{position:relative;flex:1;min-height:380px;overflow:hidden}.three-viewport :deep(canvas){width:100%;height:100%;display:block;touch-action:none}
.scene-message{position:absolute;z-index:3;left:50%;top:45%;transform:translate(-50%,-50%);background:var(--panel,#fbfaf7);padding:22px 28px;min-width:320px;max-width:80%;border:1px solid var(--hairline,#d8dad6);border-radius:12px;box-shadow:0 10px 60px #172b3a18;display:flex;flex-direction:column;gap:8px}.scene-message span{font-size:12px;overflow-wrap:anywhere}.problem{border-color:#c18d67}.scene-message button{align-self:flex-end;background:none;border:0;cursor:pointer;color:var(--domain-accent,#2d7468)}
.object-coordinate{position:absolute;left:14px;bottom:38px;display:flex;flex-direction:column;padding:9px 12px;border-radius:8px;background:#fbfaf7ed;border:1px solid #d8dad6;font-size:11px;gap:2px}.object-coordinate span{font-variant-numeric:tabular-nums;color:#526269}.scene-hint{position:absolute;bottom:12px;left:14px;color:#56645a;font-size:10px;background:#ffffffb5;padding:3px 7px;border-radius:4px;pointer-events:none}
.scene-footer{display:flex;gap:18px;align-items:center;min-height:32px;padding:0 14px;border-top:1px solid var(--hairline,#d8dad6);font-size:10px;color:#66737b}.scene-footer span:first-child{margin-right:auto}
@media(max-width:1000px){.scene-toolbar{flex-wrap:wrap}.three-viewport{min-height:350px}.scene-footer{gap:9px}}
</style>
