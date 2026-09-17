<script setup lang="ts">
import { computed, ref, shallowRef, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import { NButton, NSelect, NTag, NDrawer, NDrawerContent } from 'naive-ui';
import { useConnectionStore } from '../stores/connection';
import { useActionParamForm } from '../features/action-param-form';
import WorkflowRunButton from '../components/WorkflowRunButton.vue';
import TaskGraphCanvas from '../components/TaskGraphCanvas.vue';
import ActionParamFields from '../components/ActionParamFields.vue';
import ActionResult from '../components/ActionResult.vue';
import MaterialsScene from '../components/materials/MaterialsScene.vue';
import { materialApi, duration, phaseCamera } from '../features/materials/api';

const conn=useConnectionStore();
const scene=ref<InstanceType<typeof MaterialsScene>>();
const catalog=shallowRef<any>(null), preview=shallowRef<any>(null), run=shallowRef<any>(null), state=shallowRef<any>(null);
const metrics=shallowRef<any>({}), history=ref<any[]>([]), selectedExperiment=ref(''), selectedNode=ref('');
const ready=ref(false), error=ref(''), loading=ref(true), submitting=ref(false), controlling=ref(false), speed=ref(1);
const mode=ref<'normal'|'step'>('normal');
const sideTab=ref<'plan'|'workflow'|'results'>('plan'), graphOpen=ref(false), parametersOpen=ref(false);
const paramJson=ref('{}'), parameterError=ref(''), formDevice=ref(''), formAction=ref('');
const recording=ref(false), recordingUrl=ref('');
let recorder:MediaRecorder|null=null, recordingStream:MediaStream|null=null, chunks:Blob[]=[];
let timer=0, refreshedRun='', disposed=false, refreshing=false;
let idempotencyKey='';
const baseForm=useActionParamForm({api:()=>conn.api,device:formDevice,action:formAction,paramJson,active:()=>false});
const parameterLabels:Record<string,string>={reagents:'四种前驱体及投料量（g）',tolerance_mg:'称量允差（mg）',grinding_s:'混合研磨（s）',heating_profile:'升温程序（°C / °C·min⁻¹）',dwell_min:'高温保温（min）',unload_temperature_C:'允许出炉温度（°C）',cooling_tau_s:'仿真冷却时间常数（s）',bench_cooling_s:'台面冷却（s）',recovery_s:'粉体回收（s）',xrd_mass_mg:'XRD 取样量（mg）',xrd_two_theta_deg:'XRD 扫描范围（°）',xrd_scan_min:'XRD 扫描（min）'};
const form={...baseForm,fieldMeta:(path:string)=>({title:parameterLabels[path]||baseForm.fieldMeta(path).title,description:baseForm.fieldMeta(path).description})};
const deviceLabels:Record<string,string>={mwb_store:'样品归档',mwb_robot_a:'A 站机械臂',mwb_dosing:'称量与投料',mwb_mixer:'混合研磨',mwb_transport:'跨站虚拟转运',mwb_robot_b:'B 站导轨机械臂',mwb_furnace:'四号箱式炉',mwb_robot_c:'C 站机械臂',mwb_balance:'回收天平',mwb_capper:'封盖设备',mwb_shaker:'振摇设备',mwb_xrd_prep:'衍射制样',mwb_xrd:'XRD'};
const supported=computed(()=>catalog.value?.experiments.filter((e:any)=>e.supported)||[]);
const plan=computed(()=>run.value?.plan||preview.value?.plan);
const compiled=computed(()=>run.value?.compiled||preview.value?.compiled);
const active=computed(()=>run.value&&!['succeeded','failed','cancelled','aborted'].includes(run.value.state));
const complete=computed(()=>run.value?.state==='succeeded');
const nextIndex=computed(()=>state.value&&run.value&&state.value.run_id===run.value.id?state.value.next_index:(run.value?.next_index||0));
const currentNode=computed(()=>compiled.value?.nodes[nextIndex.value]);
const currentPhase=computed(()=>currentNode.value?.phase||(complete.value?'archive':'prepare'));
const displayNode=computed(()=>compiled.value?.nodes.find((n:any)=>n.id===selectedNode.value)||currentNode.value);
const nominal=computed(()=>compiled.value?.nominal_seconds||0);
const elapsed=computed(()=>{
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
const statusLabel=computed(()=>loading.value?'连接中':complete.value?'已完成':run.value?.state==='failed'?'执行中止':run.value?.stop_requested?'等待中止确认':waitingStep.value?'等待逐步放行':state.value?.paused?'已暂停':active.value?'实验执行中':'方案待执行');
const confirmedCount=computed(()=>run.value?.node_runs?.filter((n:any)=>n.status==='succeeded').length||0);
const stepMode=computed(()=>run.value?.task?.run_mode==='step');
const waitingStep=computed(()=>stepMode.value&&run.value?.task?.control_status==='paused');
const progress=computed(()=>compiled.value?Math.round(nextIndex.value/compiled.value.node_count*100):0);
const speedOptions=[1,10,50,100,300,600,1200,3600].map(value=>({label:`${value}×`,value}));

async function choose(id:string) {
  if(active.value)return;
  selectedExperiment.value=id;run.value=null;selectedNode.value='';error.value='';loading.value=true;idempotencyKey='';
  try{preview.value=await materialApi('/execution/preview',{experiment_id:id});paramJson.value=JSON.stringify(preview.value.plan.parameters,null,2);}
  catch(e){error.value=(e as Error).message;preview.value=null;}
  finally{loading.value=false;}
}
async function applyParameters() {
  parameterError.value='';
  try{
    const overrides=JSON.parse(paramJson.value);
    preview.value=await materialApi('/execution/preview',{experiment_id:selectedExperiment.value,overrides});
    run.value=null;parametersOpen.value=false;idempotencyKey='';
  }catch(e){parameterError.value=(e as Error).message;}
}
async function submit() {
  if(submitting.value||active.value||!ready.value)return;
  submitting.value=true;error.value='';if(run.value&&['succeeded','failed','aborted','cancelled'].includes(run.value.state))idempotencyKey='';idempotencyKey ||= crypto.randomUUID();
  try{
    run.value=await materialApi('/execution/runs',{experiment_id:selectedExperiment.value,
      overrides:preview.value.plan.user_overrides||{},speed:speed.value,run_mode:mode.value,
      execution_fidelity:'browser_trajectory',idempotency_key:idempotencyKey});
    sideTab.value='workflow';refreshedRun=run.value.id;selectedNode.value='';scene.value?.cameraView('A',true);
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
  speed.value=value;if(active.value)await control('speed',value);
}
async function readRun(id:string) {
  if(refreshing)return;refreshing=true;
  try{
    const value=await materialApi('/execution/runs/'+id);if(disposed)return;
    run.value=value;selectedExperiment.value=value.plan.experiment_id;speed.value=value.speed;refreshedRun=id;
    const item=history.value.find(x=>x.id===id);if(item){item.state=value.state;item.next_index=value.next_index;}
    if(value.state==='succeeded')sideTab.value='results';
  }catch(e){error.value=(e as Error).message;}
  finally{refreshing=false;}
}
function onState(value:any) {
  state.value=value;
  if(value.run_id&&value.run_id!==refreshedRun&&!submitting.value)void readRun(value.run_id);
}
function pickNode(node:any) {
  selectedNode.value=node.id;
  if(node.object_id)scene.value?.selectObject(node.object_id);
  scene.value?.cameraView(phaseCamera[node.phase]||'overview');
}
function openHistory(item:any) {
  if(item.task_uuid)window.open('/openlab/#/workflow-tasks/'+item.task_uuid,'_blank','noopener');
}
function nodeClass(node:any) {
  if(!run.value)return 'planned';
  const status=run.value.node_runs?.find((r:any)=>r.workflow_node_uuid===node.uuid)?.status;
  if(status==='succeeded')return 'done';
  if(['failed','cancelled','aborted'].includes(status))return 'failed';
  if(status==='running'||node.index===nextIndex.value)return run.value.state==='failed'?'failed':'current';
  return 'pending';
}
async function startRecording() {
  error.value='';
  try{
    recordingStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:false});
    chunks=[];
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
    recorder=new MediaRecorder(recordingStream,mime?{mimeType:mime}:undefined);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=()=>{
      if(recordingUrl.value)URL.revokeObjectURL(recordingUrl.value);
      recordingUrl.value=URL.createObjectURL(new Blob(chunks,{type:recorder?.mimeType||'video/webm'}));
      recording.value=false;recordingStream?.getTracks().forEach(t=>t.stop());
    };
    recordingStream.getVideoTracks()[0]?.addEventListener('ended',stopRecording);
    recorder.start(1000);recording.value=true;
  }catch(e){error.value='录屏未开始：'+(e as Error).message;}
}
function stopRecording(){if(recorder&&recorder.state!=='inactive')recorder.stop();}
watch(currentPhase,phase=>{if(active.value)scene.value?.cameraView(phaseCamera[phase]||'overview',true);});
watch(currentNode,async node=>{
  if(!node||!active.value)return;
  if(!selectedNode.value&&node.object_id)scene.value?.selectObject(node.object_id);
  await nextTick();document.querySelector('.mwb-node.current')?.scrollIntoView({block:'nearest',behavior:'smooth'});
});
onMounted(async()=>{
  conn.setBaseUrl(location.origin+'/edge');conn.startPolling();
  try{
    catalog.value=await materialApi('/execution/catalog');history.value=(await materialApi('/execution/runs')).runs;
    const last=history.value[0];
    if(last){await readRun(last.id);preview.value=await materialApi('/execution/preview',{experiment_id:last.experiment_id});paramJson.value=JSON.stringify(preview.value.plan.parameters,null,2);}
    else if(supported.value.length)await choose(supported.value[0].experiment_id);
  }catch(e){error.value=(e as Error).message;}
  finally{loading.value=false;}
  timer=window.setInterval(()=>{if(run.value?.id)void readRun(run.value.id);},1200);
});
onBeforeUnmount(()=>{disposed=true;clearInterval(timer);stopRecording();});
</script>

<template>
  <div class="materials-workbench" data-testid="materials-workbench">
    <header class="mwb-heading">
      <div><p class="mwb-eyebrow">MATERIALS · EVIDENCE TO EXPERIMENT</p><h1>材料实验工作台<span>从研究方案，到实验现场</span></h1></div>
      <div class="mwb-heading-actions"><span class="mwb-connection"><i :class="{on:conn.online}"/>{{conn.online?'UniLabOS 已连接':'实验后端离线'}}</span><NButton size="small" @click="recording?stopRecording():startRecording()">{{recording?'● 停止录屏':'录制页面'}}</NButton><a v-if="recordingUrl" :href="recordingUrl" download="材料实验工作流.webm">下载录屏</a></div>
    </header>
    <div v-if="error" class="mwb-alert" role="alert">{{error}}<button @click="error=''">×</button></div>
    <div v-if="!conn.online&&!loading" class="mwb-degraded degraded">实验后端暂时不可达，已保留方案与画面。恢复连接后可继续查看。</div>
    <div v-else-if="conn.online&&(!conn.schedulerLocal||!conn.executionReady)" class="mwb-degraded degraded">当前 Edge 角色没有本地调度或设备执行能力。请切换到承载模拟设备的 Host。</div>
    <div class="mwb-path"><span>01 <b>AI 研究方案</b></span><i>→</i><span>02 <b>原子工作流</b></span><i>→</i><span>03 <b>设备调度与三维执行</b></span><i>→</i><span>04 <b>结果回传</b></span></div>
    <div class="mwb-layout">
      <aside class="mwb-library">
        <div class="mwb-library-title"><strong>实验方案</strong><span>{{supported.length}} 项可执行</span></div>
        <p>源自已有研究的两组独立对照</p>
        <button v-for="(item,index) in supported" :key="item.experiment_id" class="mwb-experiment" :class="{selected:selectedExperiment===item.experiment_id}" :disabled="active" @click="choose(item.experiment_id)">
          <span class="mwb-exp-number">0{{Number(index)+1}}</span><strong>{{item.label||item.title}}</strong><span>{{item.title}}</span><small>4 种原料 · 固相路线</small>
        </button>
        <div v-if="!supported.length&&!loading" class="mwb-degraded">尚无绑定当前设备的实验方案。</div>
        <div class="mwb-library-note"><strong>同一套动作，不同配方</strong><p>参数变化保留工作流拓扑。其他 {{(catalog?.total_count||0)-supported.length}} 项研究尚未绑定此实验环境。</p></div>
        <div class="mwb-history" v-if="history.length"><strong>最近执行</strong><button v-for="item in history.slice(0,4)" :key="item.id" @click="openHistory(item)" title="在 OpenLab 查看真实任务记录"><i :class="{done:item.state==='succeeded'}"/><span>{{item.title}}</span><small>{{item.next_index}}/{{item.node_count}} ↗</small></button></div>
        <a class="mwb-openlab" href="/openlab/#/materials" target="_blank" rel="noopener">在 OpenLab 材料版中打开 ↗</a>
      </aside>
      <main class="mwb-main">
        <div class="mwb-run-header">
          <div><div class="mwb-target">{{plan?.target_formula||'选择实验方案'}}</div><h2>{{plan?.title||'准备实验环境'}}</h2><span class="mwb-run-sub">{{plan?.variant_id}} <span v-if="run">· {{run.id.slice(-8)}}</span></span></div>
          <div class="mwb-status" :class="{done:complete,failed:run?.state==='failed'}"><i/>{{statusLabel}}</div>
        </div>
        <div class="mwb-body-grid">
          <div class="mwb-visual"><MaterialsScene ref="scene" @ready="ready=$event" @state="onState" @metric="metrics=$event"/></div>
          <section class="mwb-detail">
            <div class="mwb-tabs"><button v-for="[id,label] in [['plan','实验方案'],['workflow','工作流'],['results','结果']]" :key="id" :class="{on:sideTab===id}" @click="sideTab=id as typeof sideTab">{{label}}</button></div>
            <div v-if="sideTab==='plan'&&plan" class="mwb-detail-content">
              <p class="mwb-intent">{{plan.scientific_intent}}</p>
              <div class="mwb-section-label">前驱体与投料量</div>
              <table class="mwb-reagents"><tbody><tr v-for="r in plan.parameters.reagents" :key="r.formula"><td>{{r.formula}}</td><td>{{r.mass_g.toFixed(6)}} <small>g</small></td></tr></tbody></table>
              <div class="mwb-section-label">工艺条件 <button @click="parametersOpen=true" :disabled="!!active">调整参数 ↗</button></div>
              <dl class="mwb-conditions"><div><dt>混合研磨</dt><dd>{{duration(plan.parameters.grinding_s)}}</dd></div><div v-for="(r,i) in plan.parameters.heating_profile" :key="i"><dt>升温 {{Number(i)+1}}</dt><dd>{{r.target_C}} °C · {{r.rate_C_per_min}} °C/min</dd></div><div><dt>高温保温</dt><dd>{{plan.parameters.dwell_min}} min</dd></div><div><dt>取样温度</dt><dd>≤ {{plan.parameters.unload_temperature_C}} °C</dd></div><div><dt>XRD</dt><dd>{{plan.parameters.xrd_two_theta_deg.join('–')}}° · {{plan.parameters.xrd_scan_min}} min</dd></div></dl>
              <details class="mwb-evidence"><summary>研究依据与仿真条件</summary><p v-for="(source,i) in plan.sources" :key="i">{{source.excerpt}}<small>{{source.path.split('/').slice(-2).join('/')}} · L{{source.start_line}}</small></p><p>投料与工艺参数来自已记录的仿真模板；本次执行验证设备流程，不推断产物成相。</p></details>
            </div>
            <div v-else-if="sideTab==='workflow'&&compiled" class="mwb-detail-content mwb-node-list">
              <div class="mwb-section-label">{{compiled.node_count}} 个原子动作 <button @click="graphOpen=true" :disabled="!run?.task">任务图 ↗</button></div>
              <details v-if="displayNode" class="mwb-atomic"><summary>{{deviceLabels[displayNode.device_id]}} · {{displayNode.label}}</summary><p>工艺耗时 {{duration(displayNode.duration_s)}}<span v-if="displayNode.operation==='virtual_transport'"> · 网页跨站转运</span></p><pre>{{JSON.stringify(displayNode.parameters,null,2)}}</pre></details>
              <template v-for="phase in compiled.phases" :key="phase.id"><h3>{{phase.title}}</h3><button v-for="node in compiled.nodes.filter((n:any)=>n.phase===phase.id)" :key="node.id" class="mwb-node" :class="[nodeClass(node),{selected:displayNode?.id===node.id}]" @click="pickNode(node)"><span class="mwb-node-dot">{{nodeClass(node)==='done'?'✓':String(node.index+1).padStart(2,'0')}}</span><span>{{node.label}}</span><small>{{duration(node.duration_s)}}</small></button></template>
            </div>
            <div v-else-if="sideTab==='results'" class="mwb-detail-content">
              <div class="mwb-result-title">{{complete?'实验流程完成':run?'执行记录':'尚未开始执行'}}</div>
              <p>{{complete?'全部轨迹回执已交回 UniLabOS，工作流完成。':'开始执行后，在这里查看设备结果与轨迹回执。'}}</p>
              <dl v-if="run" class="mwb-conditions"><div><dt>已完成动作</dt><dd>{{confirmedCount}} / {{compiled.node_count}}</dd></div><div><dt>工作流状态</dt><dd>{{run.task?.status||'待返回'}}</dd></div><div><dt>工艺时长</dt><dd>{{duration(elapsed)}}</dd></div><div><dt>结果类型</dt><dd>设备流程仿真</dd></div></dl>
              <div v-if="run?.scene_state?.xrd_result" class="mwb-result-note">XRD 扫描流程完成，取样 {{(run.scene_state.xrd_result.sample_mass_g*1000).toFixed(1)}} mg。此处没有生成或宣称真实衍射谱。</div>
              <NButton v-if="run?.task_uuid" size="small" tag="a" :href="'/openlab/#/workflow-tasks/'+run.task_uuid" target="_blank">在 OpenLab 查看任务记录 ↗</NButton>
              <details v-if="nodeResult" class="mwb-evidence"><summary>所选动作返回值</summary><ActionResult :info="nodeResult.return_info||{}" :errors="nodeResult.errors||[]"/></details>
              <p v-if="run?.error" class="mwb-result-note">{{run.error}}</p>
            </div>
          </section>
        </div>
        <section class="mwb-execution" v-if="compiled">
          <div class="mwb-phases"><button v-for="(phase,index) in compiled.phases" :key="phase.id" :class="{on:phase.id===currentPhase,done:run&&compiled.nodes.filter((n:any)=>n.phase===phase.id).every((n:any)=>nodeClass(n)==='done')}" @click="sideTab='workflow';scene?.cameraView(phaseCamera[phase.id]||'overview')"><span>{{String(Number(index)+1).padStart(2,'0')}}</span><b>{{phase.title}}</b></button></div>
          <div class="mwb-progress"><span :style="{width:progress+'%'}"/></div>
          <div class="mwb-control-row"><div class="mwb-current"><span>{{complete?'全部动作已完成':active?'当前动作':'流程已编译'}}</span><strong>{{complete?'结果已归档':active?currentNode?.label:`${compiled.node_count} 个动作 · ${compiled.phases.length} 个阶段`}}</strong></div><div class="mwb-time"><span>{{active||complete?'实验时钟':'预计工艺时长'}}</span><strong>{{duration(active||complete?elapsed:nominal)}}</strong><small v-if="active">/ {{duration(nominal)}}</small></div><div class="mwb-speed"><span>仿真倍速</span><NSelect size="small" :value="speed" :options="speedOptions" @update:value="changeSpeed" style="width:100px"/></div><div class="mwb-controls"><template v-if="active"><template v-if="stepMode"><NButton size="small" :disabled="!waitingStep||controlling" @click="control('step')">执行下一步</NButton><NButton size="small" :disabled="controlling" @click="control('automatic')">转为自动</NButton></template><NButton size="small" :disabled="controlling||run.stop_requested" @click="control(state?.paused?'resume':'pause')">{{state?.paused?'继续':'暂停'}}</NButton><NButton size="small" :disabled="controlling||run.stop_requested" @click="control('stop')">{{run.stop_requested?'中止确认中':'停止'}}</NButton></template><WorkflowRunButton v-else v-model="mode" :loading="submitting" :disabled="!ready||!conn.online||!conn.schedulerLocal||!conn.executionReady||!preview" @submit="submit"/></div></div>
          <div class="mwb-footnote"><span>{{ready?'执行页面就绪，动作完成后继续下一步':'等待三维模型加载并取得执行权'}}</span><span>{{metrics.latencyP95Ms!==undefined?`状态延迟 ${Math.round(metrics.latencyP95Ms)} ms · `:''}}固定拓扑 {{compiled.topology_hash.slice(0,10)}}</span></div>
        </section>
      </main>
    </div>
    <NDrawer v-model:show="parametersOpen" :width="560"><NDrawerContent title="调整本次实验参数" closable><p>仅修改实验参数，原子动作拓扑保持一致。修改不会覆盖原始研究文件。</p><ActionParamFields :form="form"/><details><summary>完整参数 JSON</summary><textarea v-model="paramJson" class="mwb-json" spellcheck="false"/></details><p v-if="parameterError" class="mwb-alert">{{parameterError}}</p><template #footer><NButton type="primary" @click="applyParameters">校验并应用参数</NButton></template></NDrawerContent></NDrawer>
    <NDrawer v-model:show="graphOpen" :width="'88vw'"><NDrawerContent title="UniLabOS 工作流任务图" closable><div style="height:75vh"><TaskGraphCanvas :task="run?.task||null" :runs="run?.node_runs||[]" :confirmations="[]" :active-node-uuid="displayNode?.uuid" @select="(uuid:string)=>{const n=compiled?.nodes.find((n:any)=>n.uuid===uuid);if(n)pickNode(n)}"/></div><template #footer><NTag size="small">OpenLabSite 原生任务图组件</NTag></template></NDrawerContent></NDrawer>
  </div>
</template>

<style scoped>
.materials-workbench{--domain-accent:#2d7468;--panel:#fbfaf7;--paper:#f5f3ed;--hairline:#d8dad6;color:#172b3a;padding:25px 30px 20px;min-height:100%;font-family:var(--font-sans,inherit);box-sizing:border-box;background:var(--paper)}
.mwb-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:17px}.mwb-eyebrow{font-size:10px;letter-spacing:.15em;color:#2d7468;margin:0 0 5px;font-weight:650}.mwb-heading h1{font-size:25px;margin:0;letter-spacing:.02em;font-weight:600}.mwb-heading h1 span{font-size:12px;font-weight:400;color:#66737b;margin-left:20px}.mwb-heading-actions{display:flex;align-items:center;gap:13px;font-size:11px}.mwb-heading-actions a{color:#2d7468}.mwb-connection{color:#66737b}.mwb-connection i,.mwb-status i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#b98032;margin-right:7px}.mwb-connection i.on{background:#2d7468}
.mwb-path{display:flex;align-items:center;gap:23px;padding:13px 18px;background:#efeee6;border:1px solid #e3e3da;border-radius:9px;margin-bottom:19px;font-size:10px;color:#77827d}.mwb-path b{font-size:11px;color:#56685f;margin-left:7px;font-weight:500}.mwb-path i{font-style:normal;color:#a0aaa4}
.mwb-layout{display:grid;grid-template-columns:215px minmax(0,1fr);gap:24px}.mwb-library{border-right:1px solid var(--hairline);padding-right:21px;display:flex;flex-direction:column}.mwb-library-title{display:flex;justify-content:space-between;font-size:12px;align-items:center}.mwb-library-title span{font-size:10px;color:#7d8982}.mwb-library>p{font-size:10px;line-height:1.7;color:#7d8982;margin:7px 0 16px}
.mwb-experiment{position:relative;display:flex;flex-direction:column;text-align:left;width:100%;background:transparent;border:1px solid transparent;border-radius:10px;padding:13px;margin-bottom:10px;cursor:pointer;color:inherit;gap:6px}.mwb-experiment.selected{background:#e7eee7;border-color:#c6d7ca}.mwb-experiment:disabled{cursor:default;opacity:1}.mwb-exp-number{font-size:10px;letter-spacing:.13em;color:#5f8370}.mwb-experiment strong{font-size:13px;line-height:1.6;font-weight:600}.mwb-experiment>span:not(.mwb-exp-number){font-size:10px;line-height:1.7;color:#6e7b76}.mwb-experiment small{font-size:9px;color:#7a8980}
.mwb-library-note{margin-top:21px;border-top:1px solid #e0e2d9;padding-top:18px;font-size:11px}.mwb-library-note strong{font-weight:500}.mwb-library-note p{font-size:10px;color:#7c8880;line-height:1.9}.mwb-openlab{color:#66786c;text-decoration:none;font-size:10px;padding:16px 0;margin-top:auto}.mwb-history{border-top:1px solid #e0e2d9;padding-top:15px;margin-top:16px;font-size:11px}.mwb-history button{display:flex;align-items:center;gap:7px;background:transparent;border:0;padding:8px 0;width:100%;font-size:9px;text-align:left;color:#748078;cursor:pointer}.mwb-history button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.mwb-history i{width:5px;height:5px;background:#b98032;border-radius:50%;flex:none}.mwb-history i.done{background:#2d7468}
.mwb-main{min-width:0}.mwb-run-header{display:flex;justify-content:space-between;align-items:center;margin:0 0 17px;gap:16px}.mwb-target{font-family:var(--font-mono,monospace);font-size:11px;color:#5f7669;letter-spacing:.06em;margin-bottom:3px}.mwb-run-header h2{font-size:18px;line-height:1.5;margin:0;font-weight:550}.mwb-run-sub{font-size:9px;color:#859087}.mwb-status{background:#eeeae0;color:#8a754a;padding:6px 11px;border-radius:20px;font-size:10px;white-space:nowrap}.mwb-status.done{background:#e2eee5;color:#2d7468}.mwb-status.done i{background:#2d7468}.mwb-status.failed{background:#f5e6df;color:#a94d45}
.mwb-body-grid{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:17px;height:510px;min-height:450px}.mwb-visual{min-width:0;min-height:0}.mwb-detail{display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--hairline);border-radius:13px;overflow:hidden;min-height:0}.mwb-tabs{display:flex;border-bottom:1px solid var(--hairline);padding:0 14px;flex:none}.mwb-tabs button{padding:13px 11px;background:none;border:0;border-bottom:2px solid transparent;color:#7a8581;font-size:11px;cursor:pointer}.mwb-tabs button.on{border-bottom-color:#2d7468;color:#172b3a;font-weight:600}.mwb-detail-content{padding:16px;overflow:auto;font-size:11px;line-height:1.7;flex:1;min-height:0}.mwb-intent{font-size:11px;color:#67776d;margin:0 0 17px;line-height:1.8}.mwb-section-label{display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#7c887f;letter-spacing:.025em;margin:12px 0 7px}.mwb-section-label button{border:0;background:none;padding:0;color:#2d7468;font:inherit;cursor:pointer}.mwb-section-label button:disabled{color:#adb4ad;cursor:default}
.mwb-reagents{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}.mwb-reagents td{padding:7px 0;border-bottom:1px solid #eaeae3}.mwb-reagents td:last-child{text-align:right}.mwb-reagents small{font-size:9px;color:#98a097}.mwb-conditions{margin:6px 0 17px}.mwb-conditions>div{display:flex;justify-content:space-between;gap:10px;margin:7px 0;font-size:10px}.mwb-conditions dt{color:#7e8981}.mwb-conditions dd{margin:0}.mwb-evidence{padding:10px 0;border-top:1px solid #e7e8df;font-size:10px;color:#7b887e}.mwb-evidence summary{cursor:pointer;color:#536d5d}.mwb-evidence p{line-height:1.7;overflow-wrap:anywhere}.mwb-evidence small{display:block;margin-top:5px;font-size:9px;color:#93a093}
.mwb-atomic{padding:10px;background:#eff2eb;border-radius:7px;font-size:10px;color:#536b5e;margin:8px 0}.mwb-atomic summary{cursor:pointer}.mwb-atomic pre{font-size:9px;white-space:pre-wrap;overflow-wrap:anywhere}.mwb-node-list{padding:8px 10px}.mwb-node-list h3{font-size:10px;letter-spacing:.02em;margin:17px 5px 8px;color:#8a938b;font-weight:500}.mwb-node{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;text-align:left;color:#66746b;font-size:10px;padding:7px 5px;border-radius:6px;cursor:pointer}.mwb-node>span:nth-child(2){flex:1;min-width:0}.mwb-node small{font-size:8px;color:#98a097;white-space:nowrap}.mwb-node-dot{display:flex;align-items:center;justify-content:center;width:21px;height:21px;border:1px solid #d8dfd7;border-radius:50%;font-size:8px;color:#96a194;flex:none}.mwb-node.current,.mwb-node.selected{background:#e8eee7;color:#172b3a}.mwb-node.current .mwb-node-dot{background:#2d7468;color:white;border-color:#2d7468}.mwb-node.done .mwb-node-dot{border-color:#bfd1c2;color:#2d7468}.mwb-node.failed .mwb-node-dot{background:#a94d45;color:white}.mwb-result-title{font-size:20px;margin:14px 0}.mwb-result-note{padding:12px;background:#eeeee5;border-radius:8px;font-size:10px;line-height:1.8;margin:16px 0}
.mwb-execution{margin-top:16px;border:1px solid var(--hairline);border-radius:12px;background:var(--panel);overflow:hidden}.mwb-phases{display:flex;gap:4px;padding:13px 16px}.mwb-phases button{flex:1;display:flex;gap:7px;align-items:center;border:0;background:transparent;border-radius:5px;padding:6px 5px;color:#8b948d;font:inherit;cursor:pointer;text-align:left}.mwb-phases span{font-size:9px;color:#9ca69b}.mwb-phases b{font-size:10px;font-weight:400;white-space:nowrap}.mwb-phases .on{background:#e4ede4;color:#265844}.mwb-phases .done{color:#2d7468}.mwb-progress{height:2px;background:#e9ece4}.mwb-progress span{display:block;height:100%;background:#3f8069;transition:width .3s}
.mwb-control-row{display:flex;align-items:center;gap:25px;padding:15px 19px}.mwb-current{flex:1;min-width:0}.mwb-current>span,.mwb-time>span,.mwb-speed>span{display:block;font-size:9px;color:#869286;margin-bottom:4px}.mwb-current strong{font-size:12px;font-weight:500}.mwb-time strong{font-variant-numeric:tabular-nums;font-size:13px;font-weight:500}.mwb-time small{display:block;font-size:8px;color:#8e9a8e;text-align:right}.mwb-controls{display:flex;gap:7px;align-items:center}.mwb-footnote{display:flex;justify-content:space-between;gap:20px;padding:0 19px 10px;font-size:9px;color:#8b958c}.mwb-alert{padding:11px 15px;background:#f5e8df;border:1px solid #e6cfbd;border-radius:8px;font-size:12px;margin-bottom:12px;display:flex;gap:15px;overflow-wrap:anywhere}.mwb-alert button{margin-left:auto;cursor:pointer;border:0;background:none}.mwb-degraded{font-size:12px;color:#8c7350;margin-bottom:12px;line-height:1.8}.mwb-json{width:100%;height:350px;box-sizing:border-box;font-family:var(--font-mono,monospace);font-size:11px;resize:vertical;padding:12px}
@media(min-width:1800px){.mwb-body-grid{height:580px;grid-template-columns:minmax(0,1fr) 340px}.mwb-run-header h2{font-size:21px}.mwb-detail-content{font-size:12px}.mwb-library{padding-right:24px}.mwb-layout{grid-template-columns:240px minmax(0,1fr)}}
@media(max-width:1250px){.materials-workbench{padding:20px}.mwb-layout{grid-template-columns:175px minmax(0,1fr);gap:16px}.mwb-body-grid{grid-template-columns:minmax(0,1fr) 270px}.mwb-heading h1 span{display:none}.mwb-library{padding-right:13px}.mwb-control-row{gap:15px}.mwb-phases{gap:0;padding:10px 8px}.mwb-phases span{display:none}}
@media(max-width:950px){.mwb-layout{display:block}.mwb-library{display:none}.mwb-body-grid{height:500px}.mwb-heading-actions .mwb-connection{display:none}.mwb-path{gap:9px}.mwb-path span{font-size:0}.mwb-path b{margin:0;font-size:10px}}
@media(max-width:700px){.materials-workbench{padding:14px}.mwb-body-grid{grid-template-columns:1fr;height:auto}.mwb-visual{height:430px}.mwb-detail{max-height:420px}.mwb-heading h1{font-size:20px}.mwb-heading-actions{gap:6px}.mwb-control-row{flex-wrap:wrap}.mwb-phases{overflow:auto}.mwb-phases button{flex:none}.mwb-footnote{flex-direction:column;gap:5px}}
</style>
