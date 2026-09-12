<script setup lang="ts">
import { ref, shallowRef } from "vue";
import { NAlert, NButton, NInput, NModal, NSpace } from "naive-ui";
import type { ResetPreview } from "@openlab/protocol";
import { useConnectionStore } from "../stores/connection";
import { describeError } from "../features/errors";

const conn = useConnectionStore();
const open = ref(false);
const busy = ref(false);
const confirmation = ref("");
const preview = shallowRef<ResetPreview | null>(null);
const error = ref("");
const accepted = ref(false);

async function show() {
  open.value = true;
  confirmation.value = "";
  preview.value = null;
  error.value = "";
  busy.value = true;
  try {
    preview.value = await conn.api.domains.system.resetPreview();
  } catch (cause) {
    error.value = `无法读取重置能力：${describeError(cause)}`;
  } finally {
    busy.value = false;
  }
}

async function submit() {
  if (busy.value || !conn.online || !preview.value?.supported || confirmation.value !== "清空全部数据") return;
  busy.value = true;
  error.value = "";
  try {
    preview.value = await conn.api.domains.system.requestReset({
      confirmation_token: preview.value.confirmation_token,
      confirmation: confirmation.value,
    });
    accepted.value = true;
    open.value = false;
  } catch (cause) {
    error.value = `${describeError(cause)}。若请求期间连接断开，请先查看服务端控制台与备份清单，不能仅凭断线判断成功。`;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="card">
    <div class="card-head">
      <span class="card-title">切换 Demo · 全量重置</span>
      <NButton type="error" secondary :disabled="!conn.online || busy || accepted" @click="show">清空全部数据并重置</NButton>
    </div>
    <p class="dim small">清空设备、物料、设备图、工作流、任务、遥测与历史；保留驱动包源码和一份可恢复备份。此操作不是普通的 Host 重启。</p>
    <NAlert v-if="accepted" type="warning" title="重置请求已受理，尚不能据此确认完成">
      服务将关闭。请在控制台确认「重置完成」及 {{ preview?.backup_path }} 下 manifest.json 的 completed 状态，
      然后不带旧 -g 重新启动 unilab，并刷新页面。启动时显式加载旧图会重新创建对应设备。
    </NAlert>
    <NModal v-model:show="open" preset="card" title="确认清空全部业务数据" style="width: 620px" :closable="!busy" :mask-closable="!busy" :close-on-esc="!busy">
      <p>{{ preview?.detail || '正在获取服务端重置范围…' }}</p>
      <p v-if="preview?.backup_path">恢复备份：{{ preview.backup_path }}</p>
      <NAlert v-if="error" type="error">{{ error }}</NAlert>
      <NAlert v-if="preview && !preview.supported" type="warning">当前部署不能从网页执行全量重置。</NAlert>
      <p>请先结束活跃作业，停止受管设备进程及外部 Slave，等待驱动包操作完成。历史数据会从活动库移除，不是清理浏览器缓存。</p>
      <NInput v-model:value="confirmation" placeholder="输入「清空全部数据」确认" :disabled="busy || !preview?.supported" />
      <template #footer>
        <NSpace justify="end">
          <NButton :disabled="busy" @click="open = false">取消</NButton>
          <NButton type="error" :loading="busy" :disabled="!conn.online || !preview?.supported || confirmation !== '清空全部数据'" @click="submit">停止服务并全部清空</NButton>
        </NSpace>
      </template>
    </NModal>
  </section>
</template>
