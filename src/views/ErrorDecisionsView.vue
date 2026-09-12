<script setup lang="ts">
/**
 * 异常审批：三类需要操作员介入的事件。
 *
 * - 动作异常（error-decisions）：动作失败后由微后端持有，等待选择 Host 给出的
 *   处理选项（重试 / 跳过 / 中止 / 人工替换结果）。只提交 options[].action。
 * - 人工确认（manual-confirmations）：流程走到人工确认节点时开出的确认单，有指派名单
 *   时只能以名单中的用户身份确认；有截止时间，到期由调度器收敛为超时。
 * - 工作流干预（interventions）：调度器把任务置为 waiting_intervention 时的
 *   干预记录，选项在 Workflow Authority 侧决策；此处展示并跳转任务运行时。
 */
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NEmpty,
  NIcon,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NTag,
  useMessage,
} from "naive-ui";
import { CheckmarkDoneOutline, HandRightOutline, WarningOutline } from "@vicons/ionicons5";
import type { BackendManualConfirmationDecisionInput, ErrorDecision, ErrorDecisionOption } from "@openlab/protocol";
import EntityRef from "../components/EntityRef.vue";
import PageHeader from "../components/PageHeader.vue";
import { useDecisionsStore, type PendingManualConfirmation } from "../stores/decisions";
import { describeError } from "../features/errors";
import { parseIsoMs } from "../features/task-jobs";

const router = useRouter();
const decisions = useDecisionsStore();
const message = useMessage();
const submitting = ref("");
const nowS = ref(Date.now() / 1000);

// ── 人工确认：每张单各自的确认人；有指派名单只能从名单里选 ──
const confirmActor = reactive<Record<string, string>>({});

function actorFor(item: PendingManualConfirmation): string {
  const current = confirmActor[item.confirmation.uuid];
  if (current !== undefined) return current;
  return item.confirmation.assignee_user_ids[0] ?? "operator";
}

function confirmRemaining(item: PendingManualConfirmation): string {
  const deadline = parseIsoMs(item.confirmation.deadline_at);
  if (!deadline) return "";
  const left = deadline / 1000 - nowS.value;
  if (left <= 0) return "已到期 · 等待调度器收敛为超时";
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = Math.floor(left % 60);
  return h > 0 ? `剩余 ${h} 小时 ${m} 分` : `剩余 ${m}:${String(s).padStart(2, "0")}`;
}

function confirmOverdue(item: PendingManualConfirmation): boolean {
  const deadline = parseIsoMs(item.confirmation.deadline_at);
  return Boolean(deadline) && deadline! / 1000 - nowS.value <= 0;
}

const CONFIRM_ACTION_LABELS: Record<string, string> = { approve: "确认放行", skip: "跳过", reject: "拒绝" };

async function decideConfirmation(item: PendingManualConfirmation, action: BackendManualConfirmationDecisionInput["action"]) {
  const actor = actorFor(item).trim() || "operator";
  const assignees = item.confirmation.assignee_user_ids;
  if (assignees.length && !assignees.includes(actor)) {
    message.error(`只有被指派的用户（${assignees.join("、")}）可以确认`);
    return;
  }
  submitting.value = `${item.confirmation.uuid}:${action}`;
  try {
    await decisions.decideManualConfirmation(item.confirmation.uuid, {
      action,
      confirmed_by: actor,
      decision_idempotency_key: `openlab-manual:${item.confirmation.uuid}:${action}`,
    });
    message.success(`已提交「${CONFIRM_ACTION_LABELS[action] ?? action}」`);
  } catch (err) {
    message.error(`提交失败：${describeError(err)}`);
  } finally {
    submitting.value = "";
  }
}

const ACTION_LABELS: Record<string, string> = {
  retry: "重试",
  skip: "跳过",
  abort: "中止",
  operator_intervention: "人工替换结果",
  release_failed: "按失败放行",
  replace_result: "替换结果",
  cancel: "取消",
};

const ACTION_TYPES: Record<string, "primary" | "warning" | "error" | "default"> = {
  retry: "primary",
  skip: "warning",
  abort: "error",
  operator_intervention: "default",
};

function optionLabel(option: ErrorDecisionOption): string {
  return option.label || ACTION_LABELS[option.action] || option.action;
}

function fmtTime(unixS: number): string {
  const d = new Date(unixS * 1000);
  return d.toLocaleString("zh-CN", { hour12: false });
}

function remaining(decision: ErrorDecision): string {
  if (!decision.expires_at) return "";
  const left = decision.expires_at - nowS.value;
  if (left <= 0) return "已超时 · 等待默认处置";
  const minutes = Math.floor(left / 60);
  const seconds = Math.floor(left % 60);
  return `剩余 ${minutes}:${String(seconds).padStart(2, "0")}`;
}

function expired(decision: ErrorDecision): boolean {
  return Boolean(decision.expires_at) && decision.expires_at - nowS.value <= 0;
}

// ── 人工替换结果 ──
const replaceOpen = ref(false);
const replaceTarget = shallowRef<{ decision: ErrorDecision; option: ErrorDecisionOption } | null>(null);
const replaceJson = ref("{}");
const replaceReason = ref("");

function openReplace(decision: ErrorDecision, option: ErrorDecisionOption) {
  replaceTarget.value = { decision, option };
  replaceJson.value = JSON.stringify(option.result ?? option.return_value ?? {}, null, 2);
  replaceReason.value = "";
  replaceOpen.value = true;
}

async function submitReplace() {
  if (!replaceTarget.value) return;
  let result: unknown;
  try {
    result = JSON.parse(replaceJson.value || "null");
  } catch {
    message.error("替换结果必须是合法 JSON");
    return;
  }
  await choose(replaceTarget.value.decision, replaceTarget.value.option, {
    result: result as ErrorDecisionOption["result"],
    reason: replaceReason.value.trim() || "operator_replaced_result",
  });
  replaceOpen.value = false;
}

async function choose(
  decision: ErrorDecision,
  option: ErrorDecisionOption,
  extra: { result?: ErrorDecisionOption["result"]; reason?: string } = {},
) {
  if (option.action === "operator_intervention" && extra.result === undefined) {
    openReplace(decision, option);
    return;
  }
  submitting.value = `${decision.decision_id}:${option.action}`;
  try {
    await decisions.resolveErrorDecision(decision, {
      action: option.action,
      option,
      reason: extra.reason ?? "operator_ui",
      ...(extra.result !== undefined ? { result: extra.result } : {}),
    });
    message.success(`已提交「${optionLabel(option)}」`);
  } catch (err) {
    message.error(`提交失败：${describeError(err)}`);
    void decisions.refreshErrorDecisions();
  } finally {
    submitting.value = "";
  }
}

const unsupported = computed(() => decisions.errorSupport === "unsupported");
const empty = computed(
  () => !decisions.errorDecisions.length && !decisions.interventions.length && !decisions.manualConfirmations.length,
);

let clock: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void decisions.refresh();
  clock = setInterval(() => (nowS.value = Date.now() / 1000), 1000);
});
onUnmounted(() => {
  if (clock !== null) clearInterval(clock);
});
</script>

<template>
  <div>
    <PageHeader
      title="异常审批"
      subtitle="动作失败后由微后端挂起等待处理；超时按 Host 声明的默认策略处置。只能选择 Host 给出的选项。"
    >
      <template #actions>
        <NButton size="small" @click="decisions.refresh()">刷新</NButton>
      </template>
    </PageHeader>

    <NAlert v-if="unsupported" type="info" style="margin-bottom: 12px">
      当前连接的进程没有设备执行面（如 <code>--role backend</code>），动作异常只在带 HostNode 的 Host 进程可见。
    </NAlert>
    <NAlert
      v-else-if="decisions.errorLastError"
      type="error"
      closable
      style="margin-bottom: 12px"
      @close="decisions.errorLastError = ''"
    >
      {{ decisions.errorLastError }}
    </NAlert>

    <NEmpty v-if="empty" description="当前没有等待处理的动作异常、人工确认或工作流干预" style="padding: 64px 0">
      <template #icon><NIcon size="42" color="#9AA3AB"><CheckmarkDoneOutline /></NIcon></template>
    </NEmpty>

    <NSpace v-else vertical size="large">
      <section v-if="decisions.manualConfirmations.length">
        <div class="section-title">人工确认（{{ decisions.manualConfirmations.length }}）</div>
        <div class="cards">
          <div v-for="item in decisions.manualConfirmations" :key="item.confirmation.uuid" class="decision-card confirm">
            <div class="card-head">
              <NIcon size="18" color="#d89a16"><HandRightOutline /></NIcon>
              <span class="title">{{ item.taskTitle }}</span>
              <NTag size="small" type="warning" :bordered="false">待确认</NTag>
              <NTag v-if="item.confirmation.assignee_user_ids.length" size="small" :bordered="false">
                指派 {{ item.confirmation.assignee_user_ids.join("、") }}
              </NTag>
              <NTag v-else size="small" :bordered="false" type="success">任何操作员可确认</NTag>
              <span class="spacer" />
              <span
                v-if="item.confirmation.deadline_at"
                class="countdown mono"
                :class="{ expired: confirmOverdue(item) }"
                :title="`截止 ${item.confirmation.deadline_at}`"
              >
                {{ confirmRemaining(item) }}
              </span>
            </div>
            <p v-if="item.confirmation.description" class="error-message">{{ item.confirmation.description }}</p>
            <div class="meta-row">
              <span>任务 <a class="link mono" @click="router.push(`/workflow-tasks/${encodeURIComponent(item.taskUuid)}`)">{{ item.taskUuid.slice(0, 8) }}</a></span>
              <span>作业 <span class="mono">{{ item.confirmation.workflow_node_job_uuid.slice(0, 8) }}</span></span>
              <span>开启 {{ item.confirmation.opened_at }}</span>
              <span v-if="item.confirmation.deadline_at">截止 {{ item.confirmation.deadline_at }}</span>
            </div>
            <div class="options">
              <NSelect
                v-if="item.confirmation.assignee_user_ids.length"
                :value="actorFor(item)"
                size="small"
                style="width: 170px"
                :options="item.confirmation.assignee_user_ids.map((id) => ({ label: id, value: id }))"
                @update:value="(value: string) => (confirmActor[item.confirmation.uuid] = value)"
              />
              <NInput
                v-else
                :value="actorFor(item)"
                size="small"
                style="width: 170px"
                placeholder="确认人 ID"
                @update:value="(value: string) => (confirmActor[item.confirmation.uuid] = value)"
              />
              <NButton
                size="small"
                type="primary"
                :loading="submitting === `${item.confirmation.uuid}:approve`"
                :disabled="!!submitting"
                @click="decideConfirmation(item, 'approve')"
              >
                确认放行
              </NButton>
              <NButton size="small" secondary :disabled="!!submitting" @click="decideConfirmation(item, 'skip')">跳过</NButton>
              <NButton size="small" tertiary type="error" :disabled="!!submitting" @click="decideConfirmation(item, 'reject')">拒绝</NButton>
            </div>
          </div>
        </div>
      </section>

      <section v-if="decisions.errorDecisions.length">
        <div class="section-title">动作异常（{{ decisions.errorDecisions.length }}）</div>
        <div class="cards">
          <div v-for="item in decisions.errorDecisions" :key="item.decision_id" class="decision-card">
            <div class="card-head">
              <NIcon size="18" color="#dc2626"><WarningOutline /></NIcon>
              <span class="title">{{ item.device_id }} · {{ item.action_name }}</span>
              <NTag size="small" type="error" :bordered="false">{{ item.exception_type }}</NTag>
              <NTag v-if="item.severity" size="small" :bordered="false">{{ item.severity }}</NTag>
              <span class="spacer" />
              <span v-if="item.expires_at" class="countdown mono" :class="{ expired: expired(item) }" title="决策剩余时间">{{ remaining(item) }}</span>
            </div>
            <p class="error-message">{{ item.error_message || "（无错误消息）" }}</p>
            <div class="meta-row">
              <span>任务 <a class="link mono" @click="router.push(`/workflow-tasks/${encodeURIComponent(item.task_id)}`)">{{ item.task_id.slice(0, 8) }}</a></span>
              <span>作业 <span class="mono">{{ item.job_id.slice(0, 8) }}</span></span>
              <span v-if="item.node_id">节点 <span class="mono">{{ item.node_id.slice(0, 8) }}</span></span>
              <span>重试 {{ item.retry_count }}/{{ item.max_retries }}</span>
              <span>发生于 {{ fmtTime(item.created_at) }}</span>
              <span>超时默认：{{ ACTION_LABELS[item.default_on_decision_timeout] ?? item.default_on_decision_timeout }}</span>
            </div>
            <details v-if="item.traceback" class="trace">
              <summary>Traceback</summary>
              <pre class="mono">{{ item.traceback }}</pre>
            </details>
            <div class="options">
              <NButton
                v-for="option in item.options"
                :key="option.action"
                size="small"
                :type="ACTION_TYPES[option.action] ?? 'default'"
                :secondary="option.action !== 'retry'"
                :loading="submitting === `${item.decision_id}:${option.action}`"
                :disabled="!!submitting"
                @click="choose(item, option)"
              >
                {{ optionLabel(option) }}
              </NButton>
              <span v-if="item.options.length === 0" class="dim">Host 未提供可选处理，等待自动处置</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="decisions.interventions.length">
        <div class="section-title">工作流干预（{{ decisions.interventions.length }}）</div>
        <div class="cards">
          <div v-for="item in decisions.interventions" :key="item.uuid" class="decision-card intervention">
            <div class="card-head">
              <NTag type="warning" size="small" :bordered="false">revision {{ item.revision }}</NTag>
              <span class="title">作业 <EntityRef :uuid="item.workflow_node_job_uuid" mono /></span>
              <span class="spacer" />
              <NButton size="tiny" type="primary" @click="router.push(`/workflow-tasks/${encodeURIComponent(item.workflow_task_uuid)}`)">
                查看任务运行时
              </NButton>
            </div>
            <div class="meta-row">
              <span>执行端 <span class="mono">{{ item.edge_agent_uuid }}</span></span>
              <span>开启 {{ item.opened_at }}</span>
              <span>恢复控制态 {{ item.resume_control_status }}</span>
            </div>
            <div class="options">
              <NTag v-for="(option, index) in item.options" :key="index" size="small" :bordered="false">
                {{ (option as Record<string, unknown>).label ?? (option as Record<string, unknown>).id ?? `选项 ${index + 1}` }}
              </NTag>
            </div>
          </div>
        </div>
      </section>
    </NSpace>

    <NModal v-model:show="replaceOpen" preset="card" title="人工替换结果" style="width: 560px">
      <p class="dim small">以你填写的结果替代失败动作的返回值，任务按成功继续。请确认内容与动作声明的 result 形状一致。</p>
      <NInput v-model:value="replaceJson" type="textarea" :rows="8" style="font-family: var(--font-mono); font-size: 12px" />
      <NInput v-model:value="replaceReason" placeholder="原因（可选）" style="margin-top: 10px" />
      <NSpace justify="end" style="margin-top: 12px">
        <NButton @click="replaceOpen = false">取消</NButton>
        <NButton type="primary" :loading="!!submitting" @click="submitReplace">提交</NButton>
      </NSpace>
    </NModal>
  </div>
</template>

<style scoped>
.section-title {
  margin: 0 0 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e7580;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.decision-card {
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-left: 4px solid #dc2626;
  border-radius: 12px;
  padding: 14px 18px;
}

.decision-card.intervention {
  border-left-color: #d89a16;
}

.decision-card.confirm {
  border-left-color: #f59e0b;
  background: #fffdf6;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-weight: 700;
  color: #101418;
}

.spacer {
  flex: 1;
}

.countdown {
  font-size: 12px;
  color: #b45309;
  font-weight: 700;
}

.countdown.expired {
  color: #8b929c;
  font-weight: 600;
}

.error-message {
  margin: 10px 0 6px;
  font-size: 13px;
  color: #3d4650;
  word-break: break-all;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: 12px;
  color: #6e7580;
}

.trace {
  margin-top: 8px;
  font-size: 12px;
  color: #6e7580;
}

.trace pre {
  margin: 6px 0 0;
  padding: 10px;
  max-height: 220px;
  overflow: auto;
  background: #f7f8f9;
  border-radius: 8px;
  font-size: 11px;
  color: #3d4650;
  white-space: pre-wrap;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.dim {
  color: #8b929c;
  font-size: 12px;
}

.small {
  margin: 0 0 10px;
}

.link {
  color: var(--domain-accent);
  cursor: pointer;
}
</style>
