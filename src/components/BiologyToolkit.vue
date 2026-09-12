<script setup lang="ts">
import { computed, ref } from "vue";
import { NAlert, NButton, NCard, NInput, NInputNumber, NTable, useMessage } from "naive-ui";
import { analyzeDna, calculatePcrMix } from "../features/biology";

const message = useMessage();
const sequence = ref("ATGGTGCTGCTGCCGCTGCTGTGGGGCGCCCTGGCTCACCTGGACAACCTCAAGGGC");
const reactions = ref(8);
const overage = ref(10);
const reactionVolume = ref(25);
const masterMix = ref(12.5);
const forwardPrimer = ref(0.5);
const reversePrimer = ref(0.5);
const template = ref(1);

const analysis = computed(() => {
  try {
    return { result: analyzeDna(sequence.value), error: "" };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : String(error) };
  }
});

const mix = computed(() => {
  try {
    return {
      rows: calculatePcrMix({
        reactions: reactions.value,
        overagePercent: overage.value,
        reactionVolume: reactionVolume.value,
        masterMix: masterMix.value,
        forwardPrimer: forwardPrimer.value,
        reversePrimer: reversePrimer.value,
        template: template.value,
      }),
      error: "",
    };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
});

async function copySequence(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    message.success("已复制到剪贴板");
  } catch {
    message.warning("浏览器未允许读取剪贴板，请手动选择结果复制");
  }
}
</script>

<template>
  <div class="bio-grid">
    <NCard title="DNA 序列质控" :bordered="false">
      <NInput v-model:value="sequence" type="textarea" :rows="7" class="sequence-input" placeholder="粘贴 DNA 序列" />
      <NAlert v-if="analysis.error" type="error" :bordered="false" style="margin-top: 12px">
        {{ analysis.error }}
      </NAlert>
      <template v-if="analysis.result">
        <div class="metrics">
          <div><span>长度</span><b class="display-num">{{ analysis.result.length }}</b><small>bp</small></div>
          <div><span>GC</span><b class="display-num">{{ analysis.result.gcPercent.toFixed(1) }}</b><small>%</small></div>
          <div><span>估算 Tm</span><b class="display-num">{{ analysis.result.meltingTemperature.toFixed(1) }}</b><small>°C</small></div>
        </div>
        <div class="sequence-result">
          <div class="result-head"><span>反向互补链</span><NButton text type="primary" @click="copySequence(analysis.result!.reverseComplement)">复制</NButton></div>
          <code>{{ analysis.result.reverseComplement }}</code>
        </div>
        <div class="sequence-result">
          <div class="result-head"><span>阅读框 +1 翻译</span><NButton text type="primary" @click="copySequence(analysis.result!.translation)">复制</NButton></div>
          <code>{{ analysis.result.translation }}</code>
        </div>
      </template>
    </NCard>

    <NCard title="PCR Master Mix" :bordered="false">
      <div class="mix-inputs">
        <label>反应数<NInputNumber v-model:value="reactions" :min="1" /></label>
        <label>余量<NInputNumber v-model:value="overage" :min="0"><template #suffix>%</template></NInputNumber></label>
        <label>单反应总体积<NInputNumber v-model:value="reactionVolume" :min="1"><template #suffix>µL</template></NInputNumber></label>
        <label>2× Mix<NInputNumber v-model:value="masterMix" :min="0"><template #suffix>µL</template></NInputNumber></label>
        <label>Forward primer<NInputNumber v-model:value="forwardPrimer" :min="0"><template #suffix>µL</template></NInputNumber></label>
        <label>Reverse primer<NInputNumber v-model:value="reversePrimer" :min="0"><template #suffix>µL</template></NInputNumber></label>
        <label>Template<NInputNumber v-model:value="template" :min="0"><template #suffix>µL</template></NInputNumber></label>
      </div>
      <NAlert v-if="mix.error" type="error" :bordered="false" style="margin: 12px 0">{{ mix.error }}</NAlert>
      <NTable v-else size="small" :single-line="false" style="margin-top: 18px">
        <thead><tr><th>组分</th><th>单反应</th><th>Master Mix 总量</th></tr></thead>
        <tbody>
          <tr v-for="row in mix.rows" :key="row.name">
            <td>{{ row.name }}</td><td class="mono">{{ row.perReaction.toFixed(2) }} µL</td><td class="mono total">{{ row.total.toFixed(2) }} µL</td>
          </tr>
        </tbody>
      </NTable>
    </NCard>
  </div>
</template>

<style scoped>
.bio-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 16px; }
.sequence-input :deep(textarea) { font: 12px/1.7 var(--font-mono); letter-spacing: 0.04em; }
.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0; }
.metrics > div { padding: 13px; border-radius: 12px; background: var(--domain-accent-soft); }
.metrics span { display: block; color: #747c87; font-size: 11px; }
.metrics b { color: var(--domain-accent); font-size: 28px; margin-right: 3px; }
.metrics small { color: #7c8490; }
.sequence-result { margin-top: 10px; padding: 12px; border: 1px solid var(--hairline); border-radius: 11px; background: #fafaf8; }
.result-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; color: #747c87; font-size: 11px; }
.sequence-result code { display: block; overflow-wrap: anywhere; color: #303944; font-size: 11px; line-height: 1.6; }
.mix-inputs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; }
.mix-inputs label { display: flex; flex-direction: column; gap: 5px; color: #747c87; font-size: 11px; }
.total { color: var(--domain-accent); font-weight: 700; }
@media (max-width: 960px) { .bio-grid { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .mix-inputs, .metrics { grid-template-columns: 1fr; } }
</style>
