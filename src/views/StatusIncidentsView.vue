<script setup lang="ts">
/**
 * 状态告警面板（decisions 域 status-incidents）。
 *
 * 交互与异常审批（error-decisions）同语义：只展示/提交 Host 返回的
 * options，recovery_action 只读展示；下方常驻 scheduler_holds
 * 「谁在压着调度」列表与释放条件说明。数据来自 stores/decisions.ts。
 */
import { computed, onMounted, ref } from "vue";
import {
  NAlert,
  NButton,
  NEmpty,
  NIcon,
  NSpace,
  NTag,
  NTooltip,
  useMessage,
} from "naive-ui";
import { PauseCircleOutline, PulseOutline } from "@vicons/ionicons5";
import type { Condition, StatusIncident, StatusIncidentOption } from "@openlab/protocol";
import EntityRef from "../components/EntityRef.vue";
import PageHeader from "../components/PageHeader.vue";
import { useDecisionsStore } from "../stores/decisions";
import { describeError } from "../features/errors";

const decisions = useDecisionsStore();
const message = useMessage();
const submitting = ref("");

/** 页面沿用「status」命名的视图模型，数据来自统一的人工决策 store。 */
const status = computed(() => ({
  supported: decisions.incidentSupport !== "unsupported",
  hostReady: decisions.hostReady,
  lastError: decisions.incidentLastError,
  incidents: decisions.incidents,
  holds: decisions.holds,
}));

function clearError() {
  decisions.incidentLastError = "";
}

/** Condition 单键对象 → 人话（§4.1）。 */
function formatCondition(cond: Condition): string {
  if ("eq" in cond) return `= ${JSON.stringify(cond.eq)}`;
  if ("ne" in cond) return `≠ ${JSON.stringify(cond.ne)}`;
  if ("in" in cond) return `∈ ${JSON.stringify(cond.in)}`;
  if ("gt" in cond) return `> ${cond.gt}`;
  if ("gte" in cond) return `≥ ${cond.gte}`;
  if ("lt" in cond) return `< ${cond.lt}`;
  return `≤ ${cond.lte}`;
}

function fmtTime(unixS: number): string {
  const d = new Date(unixS * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function choose(incident: StatusIncident, option: StatusIncidentOption) {
  submitting.value = `${incident.incident_id}:${option.action}`;
  try {
    // 只透传 Host 下发的 option.action，绝不拼装设备动作
    const ack = await decisions.resolveIncident(incident.incident_id, {
      action: option.action,
      reason: "operator_ui",
    });
    // §10.3：delivered ≠ 恢复成功，按受理后状态提示
    message.success(
      ack.state === "recovering"
        ? `已提交「${option.label}」，Host 正在执行恢复动作`
        : `已提交「${option.label}」，hold 已释放`,
    );
  } catch (err) {
    message.error(`提交失败：${describeError(err)}`);
  } finally {
    submitting.value = "";
  }
}

onMounted(() => void decisions.refreshIncidents());
</script>

<template>
  <div>
    <PageHeader
      title="状态告警"
      subtitle="设备状态命中联锁策略时暂停新任务下发并在此等待决策；超时保持暂停（不自动执行任何动作），状态自愈会自动关闭"
    />

    <!-- GET 503/404：本进程没有执行面（如 --role backend），整面板置灰 -->
    <NAlert v-if="!status.supported" type="info" style="margin-bottom: 12px">
      当前连接的进程没有设备执行面，状态告警只在带 HostNode 的 Host 进程可用。
    </NAlert>

    <!-- host_ready=false：后端已装配但 HostNode 启动中 -->
    <NAlert
      v-else-if="!status.hostReady"
      type="warning"
      style="margin-bottom: 12px"
    >
      Host 启动中：状态告警尚未就绪，就绪后此处自动出现活跃 incident。
    </NAlert>

    <NAlert
      v-if="status.lastError"
      type="error"
      closable
      style="margin-bottom: 12px"
      @close="clearError"
    >
      {{ status.lastError }}
    </NAlert>

    <template v-if="status.supported">
      <NEmpty
        v-if="status.incidents.length === 0"
        description="当前没有活跃的状态告警"
        style="padding: 48px 0"
      >
        <template #icon>
          <NIcon size="42" color="#9AA3AB"><PulseOutline /></NIcon>
        </template>
      </NEmpty>

      <NSpace v-else vertical size="large">
        <div
          v-for="incident in status.incidents"
          :key="incident.incident_id"
          class="incident-card"
          :class="{ notify: incident.mode === 'notify' }"
        >
          <div class="incident-head">
            <span class="policy-chip">{{ incident.policy_id }}</span>
            <span class="incident-title">
              {{ incident.device_id }} · {{ incident.property_name }}
            </span>
            <NTag
              size="small"
              :type="incident.mode === 'interlock' ? 'error' : 'warning'"
              :bordered="false"
            >
              {{ incident.mode === "interlock" ? "联锁（暂停新下发）" : "仅通知" }}
            </NTag>
            <NTag
              size="small"
              :type="incident.state === 'recovering' ? 'info' : 'default'"
              :bordered="false"
            >
              {{ incident.state === "recovering" ? "恢复动作执行中" : "等待决策" }}
            </NTag>
            <span class="incident-id">
              编号 <EntityRef :uuid="incident.incident_id" mono />
            </span>
          </div>

          <p class="incident-message">{{ incident.message }}</p>

          <div class="cond-row mono">
            <span>
              观测值 <b>{{ JSON.stringify(incident.observed_value) }}</b>
            </span>
            <span>触发条件 {{ formatCondition(incident.when) }}</span>
            <span>恢复条件 {{ formatCondition(incident.clear_when) }}</span>
            <span>
              重试 {{ incident.retry.attempts_used }}/{{ incident.retry.max_attempts }}
            </span>
            <span>作用域 {{ incident.scope === "global" ? "全局" : "本设备" }}</span>
          </div>

          <!-- §10.4：超时只保持 hold 并周期提醒，前端不自行执行默认动作 -->
          <p class="timeout-note">
            决策提醒周期 {{ incident.decision_timeout_seconds }}s；超时保持暂停，
            不会自动选择任何动作。
          </p>

          <NSpace style="margin-top: 10px">
            <NTooltip
              v-for="option in incident.options"
              :key="option.action"
              :disabled="!option.recovery_action && !option.description"
            >
              <template #trigger>
                <NButton
                  :type="option.action === 'execute_recovery' ? 'primary' : 'warning'"
                  :loading="submitting === `${incident.incident_id}:${option.action}`"
                  :disabled="submitting !== '' || incident.state === 'recovering'"
                  @click="choose(incident, option)"
                >
                  {{ option.label }}
                </NButton>
              </template>
              <div style="max-width: 320px">
                <div v-if="option.description">{{ option.description }}</div>
                <!-- §4.3：recovery_action 只读展示，由 Host 执行 -->
                <div v-if="option.recovery_action" class="mono" style="margin-top: 4px">
                  Host 将执行：{{ option.recovery_action.device_id }}.{{
                    option.recovery_action.action_name
                  }}({{ JSON.stringify(option.recovery_action.params) }})
                </div>
              </div>
            </NTooltip>
          </NSpace>
        </div>
      </NSpace>

      <!-- ── scheduler_holds：谁在压着调度（§5） ── -->
      <section class="holds-panel">
        <header class="holds-head">
          <NIcon size="16" color="#b45309"><PauseCircleOutline /></NIcon>
          <span class="holds-title">谁在暂停调度</span>
          <span class="holds-count display-num">{{ status.holds.length }}</span>
        </header>
        <p class="holds-hint">
          暂停与状态告警的生命周期严格绑定：决策放行、恢复动作成功或状态自愈后
          自动解除；正在运行的任务不受影响，仅暂停新任务下发。
        </p>
        <div v-if="status.holds.length === 0" class="holds-empty">
          调度未被任何状态告警暂停。
        </div>
        <table v-else class="holds-table">
          <thead>
            <tr>
              <th>策略</th>
              <th>设备 · 属性</th>
              <th>作用域</th>
              <th>原因</th>
              <th>开始时间</th>
              <th>来源告警</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="hold in status.holds" :key="hold.hold_token">
              <td class="mono">{{ hold.policy_id }}</td>
              <td class="mono">{{ hold.device_id }} · {{ hold.property_name }}</td>
              <td>
                <NTag
                  size="small"
                  :type="hold.scope === 'global' ? 'error' : 'warning'"
                  :bordered="false"
                >
                  {{ hold.scope === "global" ? "全局暂停" : "仅该设备" }}
                </NTag>
              </td>
              <td>{{ hold.reason }}</td>
              <td class="mono">{{ fmtTime(hold.created_at) }}</td>
              <td><EntityRef :uuid="hold.incident_id" mono /></td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped>
.incident-card {
  background: #fff;
  border: 1px solid #e8e6e1;
  border-left: 4px solid #b45309;
  border-radius: 10px;
  padding: 14px 16px;
}

.incident-card.notify {
  border-left-color: #d97706;
}

.incident-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.policy-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: #92400e;
  background: #fef3c7;
  font-family: var(--font-mono);
}

.incident-title {
  font-weight: 600;
}

.incident-id {
  margin-left: auto;
  color: #9aa3ab;
  font-size: 12px;
}

.incident-message {
  margin: 8px 0 6px;
  color: #92400e;
  word-break: break-all;
}

.cond-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: 12px;
  color: #5c6874;
}

.timeout-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: #9aa3ab;
}

.holds-panel {
  margin-top: 20px;
  background: #fff;
  border: 1px solid #e8e6e1;
  border-radius: 12px;
  padding: 14px 16px;
}

.holds-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.holds-title {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6e7580;
}

.holds-count {
  margin-left: auto;
  font-size: 15px;
  font-weight: 700;
  color: #b45309;
}

.holds-hint {
  margin: 8px 0 10px;
  font-size: 12px;
  color: #9aa3ab;
  line-height: 1.6;
}

.holds-empty {
  font-size: 13px;
  color: #6e7580;
  padding: 6px 0 2px;
}

.holds-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.holds-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: #6e7580;
  padding: 6px 10px;
  border-bottom: 1px solid #f0eee9;
  white-space: nowrap;
}

.holds-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #f7f5f1;
  color: #3d4650;
  vertical-align: top;
}
</style>
