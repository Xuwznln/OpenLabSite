<script setup lang="ts">
import { computed, ref, shallowRef, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import { NButton, NSelect, NTag, NSlider, NDrawer, NDrawerContent, NSpin } from 'naive-ui';
import { useConnectionStore } from '../stores/connection';
import { useActionParamForm } from '../features/action-param-form';
import WorkflowRunButton from '../components/WorkflowRunButton.vue';
import TaskGraphCanvas from '../components/TaskGraphCanvas.vue';
import ActionParamFields from '../components/ActionParamFields.vue';
import ActionResult from '../components/ActionResult.vue';
import MaterialsScene from '../components/materials/MaterialsScene.vue';
import { materialApi, duration, phaseCamera } from '../features/materials/api';
import { loadRecordedActions, selectReplayActions, type RecordedAction, type ReplayMode } from '../features/materials/replay';

const props=defineProps<{headerTarget?:string}>();
const conn=useConnectionStore();
const scene=ref<InstanceType<typeof MaterialsScene>>();
const workbench=ref<HTMLElement>(), libraryOpen=ref(true), libraryTab=ref<'recipes'|'history'>('recipes'), sceneFocused=ref(false), compact=ref(false);
let layoutObserver:ResizeObserver|undefined;
const catalog=shallowRef<any>(null), preview=shallowRef<any>(null), run=shallowRef<any>(null), state=shallowRef<any>(null);
const history=ref<any[]>([]), selectedExperiment=ref(''), selectedNode=ref('');
const ready=ref(false), error=ref(''), loading=ref(true), submitting=ref(false), controlling=ref(false), speed=ref(1);
const mode=ref<'normal'|'step'>('normal');
const viewMode=ref<'planning'|'run'|'replay'>('planning'), selectedRunId=ref('');
const rendererStatus=ref<any>({loaded:false,connected:false,role:'observer'});
const replayLoading=ref(false), replayLoadText=ref(''), playback=ref<any>({seconds:0,total:0,index:0,paused:false,completed:false});
const replayCache=new Map<string,RecordedAction[]>();
const replayMode=ref<ReplayMode>('full'), replayActions=shallowRef<RecordedAction[]>([]);
const motionDemo=computed(()=>viewMode.value==='replay'&&replayMode.value==='motion');
let selectionVersion=0;
const sideTab=ref<'plan'|'workflow'|'results'>('plan'), graphOpen=ref(false), parametersOpen=ref(false);
const paramJson=ref('{}'), parameterError=ref(''), formDevice=ref(''), formAction=ref('');
let timer=0, disposed=false, refreshing=false;
let idempotencyKey='';
const baseForm=useActionParamForm({api:()=>conn.api,device:formDevice,action:formAction,paramJson,active:()=>false});
const parameterLabels:Record<string,string>={reagents:'四种前驱体及投料量（g）',tolerance_mg:'称量允差（mg）',grinding_s:'混合研磨（s）',heating_profile:'升温程序（°C / °C·min⁻¹）',dwell_min:'高温保温（min）',unload_temperature_C:'允许出炉温度（°C）',cooling_tau_s:'仿真冷却时间常数（s）',bench_cooling_s:'台面冷却（s）',recovery_s:'粉体回收（s）',xrd_mass_mg:'XRD 取样量（mg）',xrd_two_theta_deg:'XRD 扫描范围（°）',xrd_scan_min:'XRD 扫描（min）'};
const form={...baseForm,fieldMeta:(path:string)=>({title:parameterLabels[path]||baseForm.fieldMeta(path).title,description:baseForm.fieldMeta(path).description})};
const deviceLabels:Record<string,string>={mwb_store:'样品归档',mwb_robot_a:'A 站机械臂',mwb_dosing:'称量与投料',mwb_mixer:'混合研磨',mwb_transport:'跨站虚拟转运',mwb_robot_b:'B 站导轨机械臂',mwb_furnace:'四号箱式炉',mwb_robot_c:'C 站机械臂',mwb_balance:'回收天平',mwb_capper:'封盖设备',mwb_shaker:'振摇设备',mwb_xrd_prep:'衍射制样',mwb_xrd:'XRD'};
const supported=computed(()=>catalog.value?.experiments.filter((e:any)=>e.supported)||[]);
const plan=computed(()=>run.value?.plan||preview.value?.plan);
const compiled=computed(()=>run.value?.compiled||preview.value?.compiled);
const active=computed(()=>viewMode.value==='run'&&run.value&&!['succeeded','failed','cancelled','aborted'].includes(run.value.state));
const labBusy=computed(()=>!!active.value||history.value.some(item=>!['succeeded','failed','cancelled','aborted'].includes(item.state)));
const latestReplay=computed(()=>history.value.find(item=>item.next_index>0&&['succeeded','failed','cancelled','aborted'].includes(item.state)));
const demoSource=computed(()=>{
  if(run.value?.next_index>0&&!active.value)return run.value;
  const records=history.value.filter(item=>item.experiment_id===selectedExperiment.value&&item.next_index>0&&['succeeded','failed','cancelled','aborted'].includes(item.state));
  return records.find(item=>item.state==='succeeded')||records[0];
});
const complete=computed(()=>run.value?.state==='succeeded');
const nextIndex=computed(()=>viewMode.value==='replay'?playback.value.index:state.value&&run.value&&state.value.run_id===run.value.id?state.value.next_index:(run.value?.next_index||0));
const visibleNodes=computed<any[]>(()=>{
  const nodes=compiled.value?.nodes||[];
  if(!motionDemo.value)return nodes;
  const ids=new Set(replayActions.value.map(action=>action.node_id));
  return nodes.filter((node:any)=>ids.has(node.id));
});
const visiblePhases=computed<any[]>(()=>(compiled.value?.phases||[]).filter((phase:any)=>visibleNodes.value.some(node=>node.phase===phase.id)));
const currentNode=computed(()=>viewMode.value==='replay'?compiled.value?.nodes.find((node:any)=>node.id===playback.value.nodeId):visibleNodes.value[nextIndex.value]);
const displayNode=computed(()=>compiled.value?.nodes.find((n:any)=>n.id===selectedNode.value)||currentNode.value);
const currentPhase=computed(()=>displayNode.value?.phase||(viewMode.value==='replay'?visibleNodes.value.at(-1)?.phase:complete.value?'archive':'prepare'));
const selectedUnexecuted=computed(()=>!!selectedNode.value&&!!displayNode.value&&(!run.value||displayNode.value.index>=run.value.next_index));
const selectedState=computed(()=>{
  if(!selectedUnexecuted.value)return '已执行';
  if(active.value&&displayNode.value?.index===nextIndex.value)return '执行中';
  const status=run.value?.node_runs?.find((item:any)=>item.workflow_node_uuid===displayNode.value?.uuid)?.status;
  return status==='failed'?'未完成':'未执行';
});
const actionCaption=computed(()=>selectedNode.value&&displayNode.value?`动作 ${displayNode.value.index+1} / ${compiled.value.node_count} · ${viewMode.value==='replay'&&!selectedUnexecuted.value?'回放':selectedState.value}`:viewMode.value==='replay'?(motionDemo.value?'演示动作':'回放动作'):complete.value?'全部动作已完成':active.value?'当前动作':'本次工作流');
const actionLabel=computed(()=>selectedNode.value&&displayNode.value?displayNode.value.label:viewMode.value==='replay'?(playback.value.completed?`${playbackLabel.value}结束`:currentNode.value?.label):complete.value?'结果已归档':active.value?currentNode.value?.label:`${compiled.value?.node_count} 个动作 · ${compiled.value?.phases.length} 个阶段`);
const nominal=computed(()=>compiled.value?.nominal_seconds||0);
const elapsed=computed(()=>{
  if(viewMode.value==='replay')return playback.value.seconds;
  if(!run.value)return 0;
  const s=state.value?.run_id===run.value.id?state.value:null;
  return (s?.scene_state?.simulation_seconds||run.value.scene_state?.simulation_seconds||0)+(s?.command?.elapsed_s||0);
});
const activeJobs=computed(()=>run.value?.jobs||[]);
const nodeResult=computed(()=>{
  const node=displayNode.value;
  const nr=run.value?.node_runs?.find((r:any)=>r.workflow_node_uuid===node?.uuid||r.node_uuid===node?.uuid);
  const job=activeJobs.value.find((j:any)=>j.workflow_node_uuid===node?.uuid||j.node_uuid===node?.uuid||j.uuid===nr?.current_job_uuid);
  return job||null;
});
const playbackLabel=computed(()=>motionDemo.value?'动作演示':'历史回放');
const statusLabel=computed(()=>loading.value?'加载中':viewMode.value==='replay'?(replayLoading.value?'读取历史轨迹':playback.value.completed?`${playbackLabel.value}结束`:playback.value.paused?`${playbackLabel.value}已暂停`:playbackLabel.value):complete.value?'已完成':run.value?.state==='failed'?'执行中止':run.value?.stop_requested?'等待中止确认':waitingStep.value?'等待逐步放行':active.value&&state.value?.paused?'已暂停':active.value?'实验执行中':'新规划 · 待提交');
const confirmedCount=computed(()=>run.value?.node_runs?.filter((n:any)=>n.status==='succeeded').length||0);
const stepMode=computed(()=>run.value?.task?.run_mode==='step');
const waitingStep=computed(()=>stepMode.value&&run.value?.task?.control_status==='paused');
const progress=computed(()=>{const count=viewMode.value==='replay'?replayActions.value.length:visibleNodes.value.length;return count?Math.round(nextIndex.value/count*100):0;});
const speedOptions=computed(()=>(motionDemo.value?[.5,1,2,5,10,20,50]:[1,10,50,100,300,600,1200,3600]).map(value=>({label:`${value}×`,value})));
const demoWallSeconds=computed(()=>playback.value.total/speed.value);
const executionHint=computed(()=>!conn.online?'正在连接实验后端':!conn.schedulerLocal||!conn.executionReady?'当前后端没有设备执行能力':!rendererStatus.value.loaded?'正在加载三维场景':!rendererStatus.value.connected?'正在同步实验状态':rendererStatus.value.role!=='executor'?'另一个页面正在执行，请关闭该页面或切回该页面操作':ready.value?'场景已就绪，可提交模拟实验':'等待执行页面就绪');
function runTime(value:number){return new Date(value*1000).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}

async function choose(id:string) {
  if(labBusy.value||submitting.value)return;
  if(compact.value)libraryOpen.value=false;
  const version=++selectionVersion;
  viewMode.value='planning';selectedRunId.value='';selectedExperiment.value=id;run.value=null;preview.value=null;selectedNode.value='';error.value='';loading.value=true;idempotencyKey='';sideTab.value='plan';replayLoading.value=false;
  speed.value=Math.max(1,speed.value);
  scene.value?.showInitial();
  try{const value=await materialApi('/execution/preview',{experiment_id:id});if(version!==selectionVersion)return;preview.value=value;paramJson.value=JSON.stringify(value.plan.parameters,null,2);}
  catch(e){if(version===selectionVersion)error.value=(e as Error).message;}
  finally{if(version===selectionVersion)loading.value=false;}
}
async function newPlan(){await choose(selectedExperiment.value||supported.value[0]?.experiment_id);}
async function applyParameters() {
  parameterError.value='';
  try{
    const overrides=JSON.parse(paramJson.value);
    preview.value=await materialApi('/execution/preview',{experiment_id:selectedExperiment.value,overrides});
    run.value=null;parametersOpen.value=false;idempotencyKey='';scene.value?.showInitial();
  }catch(e){parameterError.value=(e as Error).message;}
}
async function submit() {
  if(submitting.value||labBusy.value||!ready.value||viewMode.value!=='planning'||!preview.value)return;
  submitting.value=true;error.value='';idempotencyKey ||= crypto.randomUUID();scene.value?.resumeLive();
  try{
    run.value=await materialApi('/execution/runs',{experiment_id:selectedExperiment.value,
      overrides:preview.value.plan.user_overrides||{},speed:speed.value,run_mode:mode.value,
      execution_fidelity:'browser_trajectory',idempotency_key:idempotencyKey});
    viewMode.value='run';selectedRunId.value=run.value.id;sideTab.value='workflow';selectedNode.value='';scene.value?.cameraView('A',true);
    history.value=(await materialApi('/execution/runs')).runs;
  }catch(e){error.value=(e as Error).message;}
  finally{submitting.value=false;}
}
async function control(action:string,value?:number) {
  if(!run.value||controlling.value)return;controlling.value=true;
  try{run.value=await materialApi('/execution/runs/'+run.value.id+'/control',{action,value,
    ...(['step','automatic'].includes(action)?{expected_revision:run.value.task.control_revision,idempotency_key:crypto.randomUUID()}:{})});error.value='';}
  catch(e){error.value=(e as Error).message;}
  finally{controlling.value=false;}
}
async function changeSpeed(value:number) {
  speed.value=value;if(viewMode.value==='replay')scene.value?.setReplaySpeed(value);else if(active.value)await control('speed',value);
}
async function readRun(id:string) {
  try{
    const value=await materialApi('/execution/runs/'+id);if(disposed||selectedRunId.value!==id||viewMode.value!=='run')return;
    run.value=value;selectedExperiment.value=value.plan.experiment_id;speed.value=value.speed;
    const item=history.value.find(x=>x.id===id);if(item){item.state=value.state;item.next_index=value.next_index;}
  }catch(e){error.value=(e as Error).message;}
}
function onState(value:any) {
  state.value=value;
  if(value.run_id&&!['succeeded','failed','cancelled','aborted'].includes(value.run_state)&&viewMode.value==='planning'&&!submitting.value){
    ++selectionVersion;selectedRunId.value=value.run_id;viewMode.value='run';sideTab.value='workflow';void readRun(value.run_id);
  }
}
async function pickNode(node:any) {
  if(replayLoading.value||submitting.value)return;
  graphOpen.value=false;
  selectedNode.value=node.id;
  if(viewMode.value==='run'&&!labBusy.value&&node.index<run.value?.next_index){
    await replayRun(run.value,'full',node.id);
    await nextTick();workbench.value?.querySelector('.mwb-control-row')?.scrollIntoView({block:'nearest',behavior:'smooth'});
    return;
  }
  if(viewMode.value==='replay'){
    const actions=replayActions.value;const index=actions.findIndex(action=>action.node_id===node.id);
    scene.value?.pauseReplay(true);
    if(index>=0)scene.value?.seekReplay(actions.slice(0,index).reduce((sum,action)=>sum+action.trajectory.duration_s,0));
    else scene.value?.seekReplay(actions.reduce((sum,action)=>sum+action.trajectory.duration_s,0));
  }
  if(node.object_id)scene.value?.selectObject(node.object_id);
  scene.value?.cameraView(phaseCamera[node.phase]||'overview');
  await nextTick();workbench.value?.querySelector('.mwb-control-row')?.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function onPlayback(value:any) {
  playback.value=value;
  if(viewMode.value==='replay'&&!selectedUnexecuted.value&&!replayLoading.value)selectedNode.value=value.nodeId||'';
}
function seekPlayback(seconds:number) {
  selectedNode.value='';scene.value?.pauseReplay(true);scene.value?.seekReplay(seconds);
}
function togglePlayback() {
  selectedNode.value='';scene.value?.pauseReplay(!playback.value.paused);
}
function restartPlayback() {
  selectedNode.value='';scene.value?.seekReplay(0);scene.value?.pauseReplay(false);
}
async function openHistory(item:any) {
  if(labBusy.value||submitting.value)return;
  if(compact.value)libraryOpen.value=false;
  const version=++selectionVersion;selectedRunId.value=item.id;viewMode.value='run';sideTab.value='results';preview.value=null;selectedNode.value='';replayLoading.value=false;loading.value=true;error.value='';
  try{await readRun(item.id);if(version===selectionVersion&&run.value)scene.value?.showRecordedState(run.value.scene_state);}
  finally{if(version===selectionVersion)loading.value=false;}
}
function startReplay(mode:ReplayMode) {
  const actions=replayCache.get(run.value?.id);if(!actions)return;
  const selected=selectReplayActions(actions,compiled.value.nodes,mode);
  if(!selected.length)throw Error('这条记录还没有已完成的机械臂轨迹，请选择其他执行记录。');
  replayMode.value=mode;replayActions.value=selected;selectedNode.value='';
  speed.value=mode==='motion'?10:Math.max(1,Math.min(run.value.speed,600));
  scene.value?.startReplay(actions,speed.value,mode==='motion'?selected.map(action=>action.node_id):undefined);
  scene.value?.cameraView(phaseCamera[visibleNodes.value[0]?.phase]||'overview',true);
}
function changeReplayMode(mode:ReplayMode) {
  if(replayLoading.value||mode===replayMode.value)return;
  try{startReplay(mode);error.value='';}catch(e){error.value=(e as Error).message;}
}
function adjacentAction(offset:number) {
  const index=Math.max(0,Math.min(replayActions.value.length-1,playback.value.index+offset));
  const node=compiled.value?.nodes.find((item:any)=>item.id===replayActions.value[index]?.node_id);if(node)void pickNode(node);
}
async function replayRun(item:any, mode:ReplayMode='full', targetNode?:string) {
  if(labBusy.value||submitting.value||!rendererStatus.value.loaded)return;
  if(compact.value)libraryOpen.value=false;
  replayMode.value=mode;replayActions.value=[];
  playback.value={seconds:0,total:0,index:0,paused:false,completed:false};
  const version=++selectionVersion;selectedRunId.value=item.id;viewMode.value='replay';sideTab.value='workflow';selectedNode.value='';replayLoading.value=true;error.value='';replayLoadText.value='正在读取执行记录';scene.value?.enterReplay();
  try{
    const value=await materialApi('/execution/runs/'+item.id);if(version!==selectionVersion)return;
    run.value=value;selectedExperiment.value=value.plan.experiment_id;
    const actions=replayCache.get(item.id)||await loadRecordedActions(value,(done,total)=>{if(version===selectionVersion)replayLoadText.value=`正在读取轨迹 ${done} / ${total}`;});
    if(version!==selectionVersion||disposed)return;
    replayCache.set(item.id,actions);startReplay(mode);
    if(targetNode){
      const index=replayActions.value.findIndex(action=>action.node_id===targetNode);
      if(index>=0){scene.value?.pauseReplay(true);scene.value?.seekReplay(replayActions.value.slice(0,index).reduce((sum,action)=>sum+action.trajectory.duration_s,0));selectedNode.value=targetNode;}
      const node=value.compiled.nodes.find((entry:any)=>entry.id===targetNode);
      if(node?.object_id)scene.value?.selectObject(node.object_id);
      if(node)scene.value?.cameraView(phaseCamera[node.phase]||'overview');
    }
  }catch(e){if(version===selectionVersion)error.value=(e as Error).message;}
  finally{if(version===selectionVersion)replayLoading.value=false;}
}
async function reuseRun(){
  const original=run.value;if(!original||labBusy.value||submitting.value)return;
  await choose(original.plan.experiment_id);
  paramJson.value=JSON.stringify(original.plan.parameters,null,2);await applyParameters();
}
function nodeClass(node:any) {
  if(!run.value)return 'planned';
  if(viewMode.value==='replay'){
    const index=replayActions.value.findIndex(item=>item.node_id===node.id);
    return index<0?'pending':index<playback.value.index?'done':index===playback.value.index?'current':'pending';
  }
  const status=run.value.node_runs?.find((r:any)=>r.workflow_node_uuid===node.uuid)?.status;
  if(status==='succeeded')return 'done';
  if(['failed','cancelled','aborted'].includes(status))return 'failed';
  if(status==='running'||node.index===nextIndex.value)return run.value.state==='failed'?'failed':'current';
  return 'pending';
}
watch(currentPhase,phase=>{if(active.value||viewMode.value==='replay')scene.value?.cameraView(phaseCamera[phase]||'overview',true);});
watch(currentNode,async node=>{
  if(!node||(!active.value&&viewMode.value!=='replay'))return;
  if(!selectedUnexecuted.value&&node.object_id)scene.value?.selectObject(node.object_id);
  await nextTick();document.querySelector('.mwb-node.current')?.scrollIntoView({block:'nearest',behavior:'smooth'});
});
onMounted(async()=>{
  layoutObserver=new ResizeObserver(([entry])=>{
    if(!entry)return;
    const narrow=entry.contentRect.width<1080;
    if(narrow&&!compact.value)libraryOpen.value=false;
    compact.value=narrow;
  });
  if(workbench.value)layoutObserver.observe(workbench.value);
  conn.setBaseUrl(location.origin+'/edge');conn.startPolling();
  try{
    catalog.value=await materialApi('/execution/catalog');history.value=(await materialApi('/execution/runs')).runs;
    const last=history.value.find(item=>!['succeeded','failed','cancelled','aborted'].includes(item.state));
    if(last){selectedRunId.value=last.id;viewMode.value='run';await readRun(last.id);scene.value?.resumeLive();sideTab.value='workflow';}
    else if(supported.value.length)await choose(supported.value[0].experiment_id);
  }catch(e){error.value=(e as Error).message;}
  finally{loading.value=false;}
  timer=window.setInterval(async()=>{
    if(refreshing||disposed)return;refreshing=true;
    try{if(viewMode.value==='run'&&selectedRunId.value)await readRun(selectedRunId.value);history.value=(await materialApi('/execution/runs')).runs;}
    catch(e){error.value=(e as Error).message;}finally{refreshing=false;}
  },1500);
});
onBeforeUnmount(()=>{disposed=true;layoutObserver?.disconnect();clearInterval(timer);});
</script>

<template>
  <div ref="workbench" class="materials-workbench app-fill" :class="{'library-hidden':!libraryOpen||sceneFocused,'scene-focused':sceneFocused,compact,'is-replay':viewMode==='replay'}" data-testid="materials-workbench" :aria-busy="replayLoading">
    <Teleport :to="props.headerTarget||'body'" :disabled="!props.headerTarget">
    <header class="mwb-heading" :inert="replayLoading">
      <div class="mwb-heading-title"><h1>材料实验工作台</h1></div>
      <div class="mwb-heading-actions"><NButton size="small" quaternary :aria-expanded="libraryOpen&&!sceneFocused" @click="libraryOpen=sceneFocused||!libraryOpen;sceneFocused=false">{{libraryOpen&&!sceneFocused?'收起配方与记录':'配方与记录'}}</NButton><NButton size="small" :disabled="labBusy||submitting||!supported.length" @click="newPlan">新建实验规划</NButton><NButton size="small" type="primary" :title="demoSource?'演示当前配方的已保存机械臂轨迹':'当前配方暂无可演示的执行记录'" :disabled="!demoSource||labBusy||submitting||!rendererStatus.loaded||replayLoading" @click="replayRun(demoSource,'motion')">动作演示</NButton><NButton v-if="latestReplay" size="small" :disabled="labBusy||!rendererStatus.loaded||replayLoading" @click="replayRun(latestReplay)">回放上次实验</NButton></div>
    </header>
    </Teleport>
    <div v-if="error" class="mwb-alert" role="alert">{{error}}<button @click="error=''">×</button></div>
    <div v-if="!conn.online&&!loading" class="mwb-degraded degraded">实验后端暂时不可达，已保留方案与画面。恢复连接后可继续查看。</div>
    <div v-else-if="conn.online&&(!conn.schedulerLocal||!conn.executionReady)" class="mwb-degraded degraded">当前 Edge 角色没有本地调度或设备执行能力。请切换到承载模拟设备的 Host。</div>
    <div class="mwb-layout" :inert="replayLoading">
      <button v-if="compact&&libraryOpen&&!sceneFocused" class="mwb-library-backdrop" aria-label="关闭配方与记录" @click="libraryOpen=false"/>
      <aside v-show="libraryOpen&&!sceneFocused" class="mwb-library" aria-label="配方与记录">
        <div class="mwb-library-tabs" role="group" aria-label="实验资源">
          <button :class="{on:libraryTab==='recipes'}" :aria-pressed="libraryTab==='recipes'" @click="libraryTab='recipes'">配方 <small>{{supported.length}}</small></button>
          <button :class="{on:libraryTab==='history'}" :aria-pressed="libraryTab==='history'" @click="libraryTab='history'">执行记录 <small>{{history.length}}</small></button>
        </div>
        <div class="mwb-library-scroll">
          <section v-show="libraryTab==='recipes'">
            <p class="mwb-library-intro">选择配方，创建本次实验。</p>
            <button v-for="(item,index) in supported" :key="item.experiment_id" class="mwb-experiment" :class="{selected:selectedExperiment===item.experiment_id}" :title="item.title" :disabled="labBusy||submitting" @click="choose(item.experiment_id)">
              <span class="mwb-exp-number">配方 {{String(Number(index)+1).padStart(2,'0')}}</span><strong>{{item.label||item.title}}</strong><small>4 种原料 · 固相路线</small>
            </button>
            <div v-if="!supported.length&&!loading" class="mwb-degraded">尚无绑定当前设备的实验方案。</div>
            <div class="mwb-library-note"><strong>本次参数可调整</strong><p>投料量与工艺条件可在右侧修改，每次提交保留独立记录。</p><details><summary>其他研究方案</summary><p>还有 {{(catalog?.total_count||0)-supported.length}} 项方案尚未配置此实验环境。</p></details></div>
          </section>
          <section v-show="libraryTab==='history'" class="mwb-history">
            <p class="mwb-library-intro">最近的执行记录</p>
            <div v-for="item in history.slice(0,12)" :key="item.id" :data-run-id="item.id" class="mwb-history-item"><button class="history-summary" :disabled="labBusy||submitting" @click="openHistory(item)"><i :class="{done:item.state==='succeeded'}"/><span>{{item.title}}</span></button><small>{{runTime(item.created_at)}} · {{item.next_index}}/{{item.node_count}} 个动作</small><div class="history-actions"><button :disabled="labBusy||!rendererStatus.loaded||!item.next_index||replayLoading" @click="replayRun(item)">{{item.next_index?'回放过程':'暂无轨迹'}}</button><button :disabled="labBusy||submitting" @click="openHistory(item)">查看记录</button></div></div>
            <p v-if="!history.length" class="mwb-library-intro">提交实验后，执行记录会保存在这里。</p>
          </section>
        </div>
        <a class="mwb-openlab" href="/openlab/#/materials" target="_blank" rel="noopener">在 OpenLab 中打开 ↗</a>
      </aside>
      <main class="mwb-main">
        <div class="mwb-run-header">
          <div class="mwb-run-title"><h2 :title="plan?.title">{{plan?.title||'准备实验环境'}}</h2><div class="mwb-run-meta"><span class="mwb-target">{{plan?.target_formula||'选择实验方案'}}</span><span class="mwb-run-sub">{{plan?.variant_id}}<template v-if="run"> · {{run.id.slice(-8)}}</template></span></div></div>
          <div class="mwb-run-status"><span class="mwb-connection"><i :class="{on:conn.online}"/>{{conn.online?'UniLabOS 已连接':'实验后端离线'}}</span><div class="mwb-status" :class="{done:viewMode==='replay'?playback.completed:complete,failed:viewMode!=='replay'&&run?.state==='failed'}"><i/>{{statusLabel}}</div></div>
        </div>
        <div class="mwb-body-grid">
          <div class="mwb-visual"><MaterialsScene ref="scene" :focused="sceneFocused" @toggle-focus="sceneFocused=!sceneFocused" @ready="ready=$event" @state="onState" @status="rendererStatus=$event" @playback="onPlayback"/></div>
          <section v-show="!sceneFocused" class="mwb-detail">
            <div class="mwb-tabs"><button v-for="[id,label] in [['plan','实验方案'],['workflow','工作流'],['results','结果']]" :key="id" :class="{on:sideTab===id}" @click="sideTab=id as typeof sideTab">{{label}}</button></div>
            <div v-if="sideTab==='plan'&&plan" class="mwb-detail-content">
              <p class="mwb-intent">{{plan.scientific_intent}}</p>
              <div class="mwb-section-label">前驱体与投料量</div>
              <table class="mwb-reagents"><tbody><tr v-for="r in plan.parameters.reagents" :key="r.formula"><td>{{r.formula}}</td><td>{{r.mass_g.toFixed(6)}} <small>g</small></td></tr></tbody></table>
              <div class="mwb-section-label">工艺条件 <button @click="parametersOpen=true" :disabled="viewMode!=='planning'||submitting">调整参数 ↗</button></div>
              <dl class="mwb-conditions"><div><dt>混合研磨</dt><dd>{{duration(plan.parameters.grinding_s)}}</dd></div><div v-for="(r,i) in plan.parameters.heating_profile" :key="i"><dt>升温 {{Number(i)+1}}</dt><dd>{{r.target_C}} °C · {{r.rate_C_per_min}} °C/min</dd></div><div><dt>高温保温</dt><dd>{{plan.parameters.dwell_min}} min</dd></div><div><dt>取样温度</dt><dd>≤ {{plan.parameters.unload_temperature_C}} °C</dd></div><div><dt>XRD</dt><dd>{{plan.parameters.xrd_two_theta_deg.join('–')}}° · {{plan.parameters.xrd_scan_min}} min</dd></div></dl>
              <details class="mwb-evidence"><summary>研究依据与仿真条件</summary><p v-for="(source,i) in plan.sources" :key="i">{{source.excerpt}}<small>{{source.path.split('/').slice(-2).join('/')}} · L{{source.start_line}}</small></p><p>投料与工艺参数来自已记录的仿真模板；本次执行验证设备流程，不推断产物成相。</p></details>
            </div>
            <div v-else-if="sideTab==='workflow'&&compiled" class="mwb-detail-content mwb-node-list">
              <div class="mwb-section-label">{{visibleNodes.length}} 个{{motionDemo?'主要动作':'原子动作'}} <button @click="graphOpen=true" :disabled="!run?.task">任务图 ↗</button></div>
              <details v-if="displayNode" class="mwb-atomic"><summary>{{deviceLabels[displayNode.device_id]}} · {{displayNode.label}}</summary><p>工艺耗时 {{duration(displayNode.duration_s)}}<span v-if="displayNode.operation==='virtual_transport'"> · 网页跨站转运</span></p><pre>{{JSON.stringify(displayNode.parameters,null,2)}}</pre></details>
              <template v-for="phase in visiblePhases" :key="phase.id"><h3>{{phase.title}}</h3><button v-for="node in visibleNodes.filter((n:any)=>n.phase===phase.id)" :key="node.id" class="mwb-node" :data-node-id="node.id" :aria-pressed="displayNode?.id===node.id" :class="[nodeClass(node),{selected:displayNode?.id===node.id}]" @click="pickNode(node)"><span class="mwb-node-dot">{{nodeClass(node)==='done'?'✓':String(visibleNodes.indexOf(node)+1).padStart(2,'0')}}</span><span>{{node.label}}</span><small>{{duration(node.duration_s)}}</small></button></template>
            </div>
            <div v-else-if="sideTab==='results'" class="mwb-detail-content">
              <div class="mwb-result-title">{{complete?'实验流程完成':run?'执行记录':'尚未开始执行'}}</div>
              <p>{{complete?'设备动作已完成，结果已保存。':'执行后可在这里查看各动作的状态与返回结果。'}}</p>
              <dl v-if="run" class="mwb-conditions"><div><dt>已完成动作</dt><dd>{{confirmedCount}} / {{compiled.node_count}}</dd></div><div><dt>工作流状态</dt><dd>{{run.task?.status||'待返回'}}</dd></div><div><dt>工艺时长</dt><dd>{{duration(elapsed)}}</dd></div><div><dt>结果类型</dt><dd>设备流程仿真</dd></div></dl>
              <div v-if="run?.scene_state?.xrd_result" class="mwb-result-note">XRD 流程仿真已完成，取样 {{(run.scene_state.xrd_result.sample_mass_g*1000).toFixed(1)}} mg。衍射谱需由实际测量获得。</div>
              <NButton v-if="run?.task_uuid" size="small" tag="a" :href="'/openlab/#/workflow-tasks/'+run.task_uuid" target="_blank">在 OpenLab 查看任务记录 ↗</NButton>
              <details v-if="nodeResult" class="mwb-evidence"><summary>所选动作返回值</summary><ActionResult :info="nodeResult.return_info||{}" :errors="nodeResult.errors||[]"/></details>
              <p v-if="run?.error" class="mwb-result-note">{{run.error}}</p>
            </div>
          </section>
        </div>
        <section class="mwb-execution" v-if="compiled">
          <div v-if="viewMode==='replay'" class="mwb-replay-mode">
            <div class="mwb-replay-switch" role="group" aria-label="播放内容">
              <button :class="{on:motionDemo}" :aria-pressed="motionDemo" :disabled="replayLoading" @click="changeReplayMode('motion')">主要动作</button>
              <button :class="{on:!motionDemo}" :aria-pressed="!motionDemo" :disabled="replayLoading" @click="changeReplayMode('full')">完整回放</button>
            </div>
            <p v-if="motionDemo&&!replayLoading" title="保留机械臂、夹爪、导轨和整盘搬运，跳过开盖、称量、加热和检测等待"><strong>{{replayActions.length}} 个主要动作</strong> · 跳过 {{(run?.next_index||0)-replayActions.length}} 个工艺步骤 · 约 {{duration(demoWallSeconds)}}</p>
            <p v-else>{{replayLoading?replayLoadText:'播放全部已完成步骤，切换播放内容将从头开始。'}}</p>
            <span v-if="run" class="mwb-replay-source">记录 {{runTime(run.created_at)}}<small v-if="run.next_index<compiled.node_count">部分记录 · {{run.next_index}}/{{compiled.node_count}} 步已完成</small></span>
          </div>
          <div class="mwb-phases"><button v-for="(phase,index) in visiblePhases" :key="phase.id" :class="{on:phase.id===currentPhase,done:run&&visibleNodes.filter((n:any)=>n.phase===phase.id).every((n:any)=>nodeClass(n)==='done')}" @click="sideTab='workflow';scene?.cameraView(phaseCamera[phase.id]||'overview')"><span>{{String(Number(index)+1).padStart(2,'0')}}</span><b>{{phase.title}}</b></button></div>
          <div class="mwb-progress"><span :style="{width:progress+'%'}"/></div>
          <div v-if="viewMode==='replay'" class="mwb-replay-seek"><span>{{replayLoading?replayLoadText:selectedUnexecuted?`动作 ${displayNode.index+1} / ${compiled.node_count} · ${selectedState}`:`播放进度 · ${playback.index} / ${replayActions.length} 个动作`}}</span><NSlider :value="playback.seconds" :max="playback.total||1" :step=".1" :disabled="replayLoading" :format-tooltip="duration" @update:value="seekPlayback"/></div>
          <div class="mwb-control-row">
            <div class="mwb-current"><span :class="{'unexecuted':selectedUnexecuted}">{{actionCaption}}</span><strong :title="actionLabel">{{actionLabel}}</strong></div>
            <div class="mwb-time"><span>{{selectedUnexecuted?'工艺耗时':viewMode==='replay'?(motionDemo?'动作时长':'回放时钟'):active||complete?'实验时钟':'预计工艺时长'}}</span><strong>{{duration(selectedUnexecuted?displayNode.duration_s:viewMode==='replay'||active||complete?elapsed:nominal)}}</strong><small v-if="!selectedUnexecuted&&(active||viewMode==='replay')">/ {{duration(viewMode==='replay'?playback.total:nominal)}}</small></div>
            <div class="mwb-speed"><span>{{viewMode==='replay'?(motionDemo?'演示倍速':'回放倍速'):'仿真倍速'}}</span><NSelect size="small" :value="speed" :options="speedOptions" @update:value="changeSpeed" style="width:100px"/></div>
            <div class="mwb-controls">
              <template v-if="viewMode==='replay'"><NButton size="small" :disabled="replayLoading||!replayActions.length||playback.index===0" @click="adjacentAction(-1)">上一动作</NButton><NButton size="small" :disabled="replayLoading||playback.index>=replayActions.length-1" @click="adjacentAction(1)">下一动作</NButton><NButton size="small" :disabled="replayLoading||playback.completed" @click="togglePlayback">{{playback.paused?(motionDemo?'继续播放':'继续回放'):(motionDemo?'暂停播放':'暂停回放')}}</NButton><NButton size="small" :disabled="replayLoading" @click="restartPlayback">从头播放</NButton></template>
              <template v-else-if="active"><template v-if="stepMode"><NButton size="small" :disabled="!waitingStep||controlling" @click="control('step')">执行下一步</NButton><NButton size="small" :disabled="controlling" @click="control('automatic')">转为自动</NButton></template><NButton size="small" :disabled="controlling||run.stop_requested" @click="control(state?.paused?'resume':'pause')">{{state?.paused?'继续':'暂停'}}</NButton><NButton size="small" :disabled="controlling||run.stop_requested" @click="control('stop')">{{run.stop_requested?'中止确认中':'停止'}}</NButton></template>
              <WorkflowRunButton :title="!ready?executionHint:undefined" v-else-if="viewMode==='planning'" v-model="mode" :loading="submitting" :disabled="!ready||!conn.online||!conn.schedulerLocal||!conn.executionReady||!preview||labBusy||loading" @submit="submit"/>
              <NButton v-if="run&&!active" size="small" :disabled="labBusy||submitting" @click="reuseRun">复用此配方</NButton>
            </div>
          </div>

        </section>
      </main>
    </div>
    <div v-if="replayLoading" class="mwb-replay-loading" role="status" aria-live="polite" aria-label="正在加载实验回放">
      <div class="mwb-loading-card"><NSpin size="large"/><strong>正在加载实验回放</strong><span>{{replayLoadText}}</span></div>
    </div>
    <NDrawer v-model:show="parametersOpen" :width="560"><NDrawerContent title="调整本次实验参数" closable><p>设置本次投料与工艺条件，提交后生成独立执行记录。</p><ActionParamFields :form="form"/><details><summary>完整参数 JSON</summary><textarea v-model="paramJson" class="mwb-json" spellcheck="false"/></details><p v-if="parameterError" class="mwb-alert">{{parameterError}}</p><template #footer><NButton type="primary" @click="applyParameters">校验并应用参数</NButton></template></NDrawerContent></NDrawer>
    <NDrawer v-model:show="graphOpen" :width="'88vw'"><NDrawerContent title="UniLabOS 工作流任务图" closable><div style="height:75vh"><TaskGraphCanvas :task="run?.task||null" :runs="run?.node_runs||[]" :confirmations="[]" :active-node-uuid="displayNode?.uuid" @select="(uuid:string)=>{const n=compiled?.nodes.find((n:any)=>n.uuid===uuid);if(n)pickNode(n)}"/></div><template #footer><NTag size="small">OpenLabSite 原生任务图组件</NTag></template></NDrawerContent></NDrawer>
  </div>
</template>

<style scoped>
.materials-workbench{--domain-accent:#2d7468;--panel:#fbfaf7;--paper:#f5f3ed;--hairline:#d8dad6;color:var(--ink,#172b3a);position:relative;height:100%;min-height:0;padding:14px 20px 16px;box-sizing:border-box;background:var(--paper);display:flex;flex-direction:column;gap:12px;overflow:hidden;container-type:inline-size;font-family:var(--font-sans,inherit)}
.mwb-heading{display:flex;width:100%;min-width:0;align-items:center;justify-content:space-between;gap:14px;flex:none;min-height:32px}.mwb-heading-title{flex:none}.mwb-heading h1{font-size:21px;line-height:28px;margin:0;font-weight:650}.mwb-heading-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:nowrap;min-width:0;overflow-x:auto;font-size:11px}
.mwb-layout{display:grid;grid-template-columns:194px minmax(0,1fr);gap:14px;flex:1;min-height:0;position:relative}.library-hidden .mwb-layout,.compact .mwb-layout{grid-template-columns:minmax(0,1fr)}
.mwb-library{display:flex;flex-direction:column;min-height:0;min-width:0;border:1px solid var(--hairline);border-radius:12px;background:var(--panel);overflow:hidden}.mwb-library-tabs{display:flex;flex:none;padding:0 10px;border-bottom:1px solid var(--hairline);gap:6px}.mwb-library-tabs button{flex:1;border:0;border-bottom:2px solid transparent;background:none;padding:11px 2px;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;color:var(--slate,#66737b)}.mwb-library-tabs button.on{color:var(--ink,#172b3a);border-color:var(--domain-accent);font-weight:650}.mwb-library-tabs small{font-size:9px;margin-left:3px;font-weight:400;color:var(--slate,#66737b)}
.mwb-library-scroll{min-height:0;flex:1;overflow:auto;padding:0 10px 12px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#b9c5bd transparent}.mwb-library-intro{font-size:11px;color:var(--slate,#66737b);line-height:1.6;margin:12px 2px}
.mwb-experiment{display:flex;flex-direction:column;text-align:left;width:100%;background:transparent;border:1px solid var(--hairline);border-radius:8px;padding:11px 10px;margin-bottom:8px;cursor:pointer;color:inherit;gap:6px}.mwb-experiment.selected{background:#e7eee7;border-color:#b9d0c3}.mwb-experiment:disabled{cursor:default;opacity:.65}.mwb-exp-number{font-size:9px;letter-spacing:.08em;color:var(--slate,#66737b)}.mwb-experiment strong{font-size:12px;line-height:1.6;font-weight:600}.mwb-experiment small{font-size:10px;color:var(--slate,#66737b)}
.mwb-library-note{margin:16px 2px 0;padding-top:12px;border-top:1px solid var(--hairline);font-size:11px}.mwb-library-note strong{font-weight:600}.mwb-library-note p{font-size:10px;color:var(--slate,#66737b);line-height:1.8;margin:6px 0}.mwb-library-note details{margin-top:12px;color:var(--slate,#66737b);font-size:10px}.mwb-library-note summary{cursor:pointer}.mwb-openlab{flex:none;color:var(--slate,#66737b);text-decoration:none;font-size:10px;padding:10px 12px;border-top:1px solid var(--hairline)}.mwb-openlab:hover{color:var(--domain-accent)}
.mwb-history-item{padding:10px 1px;border-bottom:1px solid var(--hairline)}.mwb-history button{display:flex;align-items:center;gap:6px;background:transparent;border:0;padding:2px 0;width:100%;font:inherit;font-size:11px;text-align:left;color:var(--ink,#172b3a);cursor:pointer}.mwb-history button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.mwb-history i{width:5px;height:5px;background:#b98032;border-radius:50%;flex:none}.mwb-history i.done{background:var(--domain-accent)}.mwb-history-item>small{display:block;color:var(--slate,#66737b);font-size:10px;margin:6px 0}.mwb-history .history-actions{display:flex;gap:12px}.mwb-history .history-actions button{width:auto;color:var(--domain-accent);font-size:10px}.mwb-history button:disabled{opacity:.5;cursor:default}
.compact .mwb-library{position:absolute;top:0;bottom:0;left:0;width:240px;z-index:12;box-shadow:8px 0 28px #172b3a1a}.mwb-library-backdrop{position:absolute;inset:0;z-index:11;border:0;background:#172b3a20;cursor:pointer;border-radius:12px}
.mwb-main{min-width:0;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:10px}.mwb-run-header{display:flex;justify-content:space-between;align-items:center;gap:12px;min-width:0}.mwb-run-title{min-width:0}.mwb-run-header h2{font-size:20px;line-height:28px;margin:0;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mwb-run-meta{display:flex;align-items:center;gap:10px;min-width:0;line-height:16px}.mwb-target{font-family:var(--font-mono,monospace);font-size:10px;color:var(--slate,#66737b);white-space:nowrap}.mwb-run-sub{font-size:9px;color:var(--slate,#66737b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mwb-run-status{display:flex;align-items:center;gap:12px;flex:none}.mwb-connection{color:var(--slate,#66737b);font-size:10px;white-space:nowrap}.mwb-connection i,.mwb-status i{display:inline-block;width:5px;height:5px;border-radius:50%;background:#b98032;margin-right:6px}.mwb-connection i.on{background:var(--domain-accent)}.mwb-status{background:#eeeae0;color:#8a754a;padding:5px 9px;border-radius:6px;font-size:10px;white-space:nowrap}.mwb-status.done{background:#e2eee5;color:var(--domain-accent)}.mwb-status.done i{background:var(--domain-accent)}.mwb-status.failed{background:#f5e6df;color:#a94d45}
.mwb-body-grid{display:grid;grid-template-columns:minmax(0,1fr) clamp(276px,24%,334px);gap:12px;min-height:240px}.mwb-visual{min-width:0;min-height:0}.scene-focused .mwb-body-grid{grid-template-columns:minmax(0,1fr)}
.mwb-detail{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--panel);border:1px solid var(--hairline);border-radius:12px;overflow:hidden}.mwb-tabs{display:flex;border-bottom:1px solid var(--hairline);padding:0 12px;flex:none;gap:5px}.mwb-tabs button{flex:1;padding:11px 6px;background:none;border:0;border-bottom:2px solid transparent;color:var(--slate,#66737b);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}.mwb-tabs button.on{border-bottom-color:var(--domain-accent);color:var(--ink,#172b3a);font-weight:650}.mwb-detail-content{padding:12px 14px;overflow:auto;font-size:12px;line-height:1.7;flex:1;min-height:0;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#b9c5bd transparent;scrollbar-gutter:stable}.mwb-intent{font-size:11px;color:var(--slate,#66737b);margin:0 0 12px;line-height:1.8}.mwb-section-label{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--slate,#66737b);margin:12px 0 7px;font-weight:600}.mwb-section-label button{border:0;background:none;padding:0;color:var(--domain-accent);font:inherit;cursor:pointer;white-space:nowrap}.mwb-section-label button:disabled{color:#adb4ad;cursor:default}
.mwb-reagents{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}.mwb-reagents td{padding:6px 0;border-bottom:1px solid var(--hairline)}.mwb-reagents td:last-child{text-align:right}.mwb-reagents small{font-size:10px;color:var(--slate,#66737b)}.mwb-conditions{margin:6px 0 14px}.mwb-conditions>div{display:flex;justify-content:space-between;gap:10px;margin:7px 0;font-size:11px}.mwb-conditions dt{color:var(--slate,#66737b)}.mwb-conditions dd{margin:0;text-align:right}.mwb-evidence{padding:10px 0;border-top:1px solid var(--hairline);font-size:10px;color:var(--slate,#66737b)}.mwb-evidence summary{cursor:pointer;color:var(--domain-accent)}.mwb-evidence p{line-height:1.7;overflow-wrap:anywhere}.mwb-evidence small{display:block;margin-top:5px;font-size:9px}
.mwb-atomic{padding:8px 10px;background:#eff2eb;border-radius:6px;font-size:10px;color:#536b5e;margin:8px 0}.mwb-atomic summary{cursor:pointer}.mwb-atomic pre{font-size:10px;white-space:pre-wrap;overflow-wrap:anywhere}.mwb-node-list{padding:6px 10px}.mwb-node-list h3{font-size:10px;margin:14px 4px 5px;color:var(--slate,#66737b);font-weight:650}.mwb-node{display:flex;align-items:center;gap:7px;width:100%;border:0;background:transparent;text-align:left;color:var(--slate,#66737b);font:inherit;font-size:11px;padding:7px 4px;border-radius:6px;cursor:pointer}.mwb-node>span:nth-child(2){flex:1;min-width:0}.mwb-node small{font-size:9px;white-space:nowrap}.mwb-node-dot{display:flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid var(--hairline);border-radius:50%;font-size:9px;color:var(--slate,#66737b);flex:none}.mwb-node.current,.mwb-node.selected{background:#e8eee7;color:var(--ink,#172b3a)}.mwb-node.current .mwb-node-dot{background:var(--domain-accent);color:white;border-color:var(--domain-accent)}.mwb-node.done .mwb-node-dot{border-color:#bfd1c2;color:var(--domain-accent)}.mwb-node.failed .mwb-node-dot{background:#a94d45;color:white}.mwb-result-title{font-size:18px;margin:8px 0}.mwb-result-note{padding:10px;background:#eeeee5;border-radius:6px;font-size:11px;line-height:1.8;margin:12px 0}
.mwb-execution{border:1px solid var(--hairline);border-radius:10px;background:var(--panel);overflow:hidden;min-width:0}.mwb-phases{display:flex;gap:4px;padding:5px 10px;overflow-x:auto;scrollbar-width:thin}.mwb-phases button{flex:1;display:flex;gap:5px;align-items:center;justify-content:center;border:0;background:transparent;border-radius:4px;padding:4px 5px;color:var(--slate,#66737b);font:inherit;white-space:nowrap;cursor:pointer}.mwb-phases span{font-size:9px;opacity:.75}.mwb-phases b{font-size:10px;font-weight:550}.mwb-phases .on{background:#e4ede4;color:#265844}.mwb-phases .done{color:var(--domain-accent)}.mwb-progress{height:2px;background:var(--hairline)}.mwb-progress span{display:block;height:100%;background:var(--domain-accent);transition:width .3s}
.mwb-control-row{display:grid;grid-template-columns:minmax(130px,1fr) auto auto auto;align-items:center;gap:16px;padding:10px 12px}.mwb-current{min-width:0}.mwb-current>span,.mwb-time>span,.mwb-speed>span{display:block;font-size:10px;color:var(--slate,#66737b);margin-bottom:2px;line-height:14px}.mwb-current strong{display:block;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mwb-time{white-space:nowrap}.mwb-time strong{font-variant-numeric:tabular-nums;font-size:12px;font-weight:600}.mwb-time small{font-size:9px;color:var(--slate,#66737b);margin-left:5px}.mwb-controls{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.mwb-controls :deep(.n-button){font-size:11px;padding:0 9px}.mwb-replay-seek{display:flex;align-items:center;gap:12px;padding:6px 12px 0}.mwb-replay-seek>span{font-size:10px;color:var(--slate,#66737b);white-space:nowrap}.mwb-replay-seek :deep(.n-slider){flex:1;min-width:0}.mwb-replay-mode{display:flex;align-items:center;gap:10px;padding:6px 10px;background:var(--paper);border-bottom:1px solid var(--hairline)}.mwb-replay-switch{display:flex;padding:2px;border:1px solid var(--hairline);border-radius:6px;gap:2px;flex:none}.mwb-replay-switch button{border:0;border-radius:4px;padding:3px 8px;background:transparent;color:var(--slate,#66737b);font:inherit;font-size:10px;white-space:nowrap;cursor:pointer}.mwb-replay-switch button.on{background:var(--domain-accent);color:var(--panel)}.mwb-replay-switch button:disabled{opacity:.5;cursor:default}.mwb-replay-mode p{margin:0;flex:1;min-width:0;font-size:10px;line-height:16px}.mwb-replay-mode strong{font-weight:650}.mwb-replay-source{font-size:9px;color:var(--slate,#66737b);white-space:nowrap;line-height:14px}.mwb-replay-source small{display:block;font-size:9px}
.mwb-alert{flex:none;padding:8px 12px;background:#f5e8df;border:1px solid #e6cfbd;border-radius:6px;font-size:12px;display:flex;gap:12px;overflow-wrap:anywhere;max-height:90px;overflow:auto}.mwb-alert button{margin-left:auto;cursor:pointer;border:0;background:none}.mwb-degraded{flex:none;font-size:11px;color:#8c7350;line-height:1.6}.mwb-json{width:100%;height:350px;box-sizing:border-box;font-family:var(--font-mono,monospace);font-size:11px;resize:vertical;padding:12px}
@container (max-width:1100px){.mwb-heading-actions{gap:5px}.mwb-heading-actions :deep(.n-button){font-size:11px;padding:0 8px}.mwb-run-status{gap:7px}.mwb-connection{display:none}.mwb-controls{gap:4px}.mwb-control-row{gap:10px}.mwb-time small{display:block;margin:0;font-size:9px}.mwb-run-header h2{font-size:18px}.mwb-body-grid{grid-template-columns:minmax(0,1fr) 276px}}
@container (max-width:850px){.mwb-heading{align-items:center}.mwb-heading h1{font-size:18px}.mwb-control-row{grid-template-columns:minmax(0,1fr) auto auto;row-gap:6px}.mwb-controls{grid-column:1/-1}.mwb-replay-source{display:none}.mwb-run-sub{display:none}.mwb-body-grid{grid-template-columns:minmax(0,1fr) 252px}.mwb-phases span{display:none}.mwb-replay-mode p{font-size:9px}.scene-focused .mwb-body-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:760px){.materials-workbench{height:auto;min-height:100%;overflow:visible;padding:12px;gap:10px}.mwb-heading{flex-wrap:nowrap}.mwb-heading-actions{max-width:none;justify-content:flex-start}.mwb-layout{min-height:640px}.mwb-main{grid-template-rows:auto auto auto}.mwb-body-grid{display:flex;flex-direction:column;gap:10px}.mwb-visual{height:360px;flex:none}.mwb-detail{height:300px;flex:none}.scene-focused .mwb-visual{height:60vh}.mwb-execution{position:sticky;bottom:0;z-index:9}.mwb-replay-mode{flex-wrap:wrap}.mwb-replay-mode p{flex-basis:100%}.mwb-run-status{max-width:45%}.mwb-status{overflow:hidden;text-overflow:ellipsis}}
.mwb-current>span.unexecuted{color:#8a754a;font-weight:600}
.mwb-replay-loading{position:absolute;inset:0;z-index:40;display:grid;place-items:center;background:rgba(245,243,237,.88);backdrop-filter:blur(4px)}
.mwb-loading-card{display:flex;flex-direction:column;align-items:center;gap:18px;padding:34px 44px;border:1px solid var(--hairline);border-radius:14px;background:var(--panel);box-shadow:0 12px 40px #172b3a12}.mwb-loading-card strong{font-size:17px}.mwb-loading-card>span{font-size:13px;color:var(--slate,#66737b);font-variant-numeric:tabular-nums}
</style>
