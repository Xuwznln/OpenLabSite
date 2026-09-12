<script setup lang="ts">
import { computed, ref } from "vue";
import { NAlert, NButton, NCard, NInput, NInputNumber, NTag } from "naive-ui";
import { calculateFormula } from "../features/chemistry";

const formula = ref("CuSO4·5H2O");
const weighedMass = ref<number | null>(1);
const samples = ["C8H10N4O2", "CuSO4·5H2O", "Ca(OH)2", "K4[Fe(CN)6]"];

const calculation = computed(() => {
  try {
    return { result: calculateFormula(formula.value), error: "" };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : String(error) };
  }
});

const millimoles = computed(() => {
  const mass = weighedMass.value;
  const molarMass = calculation.value.result?.molarMass;
  return mass !== null && molarMass ? (mass / molarMass) * 1000 : null;
});
</script>

<template>
  <div class="tool-layout">
    <NCard class="input-card" title="化学式输入" :bordered="false">
      <label class="field-label">Formula</label>
      <NInput v-model:value="formula" size="large" placeholder="例如 CuSO4·5H2O" class="formula-input" />
      <div class="samples">
        <span>示例</span>
        <NButton v-for="sample in samples" :key="sample" size="tiny" quaternary @click="formula = sample">
          {{ sample }}
        </NButton>
      </div>
      <NAlert v-if="calculation.error" type="error" :bordered="false" style="margin-top: 16px">
        {{ calculation.error }}
      </NAlert>
      <div class="weighing">
        <div>
          <label class="field-label">实际称量</label>
          <p>输入克数，立即换算 mmol。</p>
        </div>
        <NInputNumber v-model:value="weighedMass" :min="0" :precision="4" style="width: 150px">
          <template #suffix>g</template>
        </NInputNumber>
      </div>
    </NCard>

    <NCard class="result-card" :bordered="false">
      <template v-if="calculation.result">
        <div class="result-overline">MOLAR MASS</div>
        <div class="mass-value display-num">{{ calculation.result.molarMass.toFixed(4) }}</div>
        <div class="mass-unit">g · mol⁻¹</div>
        <div v-if="millimoles !== null" class="conversion">
          <span>{{ weighedMass }} g</span><b>→</b><strong>{{ millimoles.toFixed(3) }} mmol</strong>
        </div>
        <div class="composition">
          <div v-for="item in calculation.result.composition" :key="item.element" class="composition-row">
            <NTag size="small" round :bordered="false">{{ item.element }}</NTag>
            <span class="mono">× {{ item.count }}</span>
            <div class="percent-track"><i :style="{ width: `${item.percent}%` }" /></div>
            <b class="mono">{{ item.percent.toFixed(1) }}%</b>
          </div>
        </div>
      </template>
    </NCard>
  </div>
</template>

<style scoped>
.tool-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(320px, 1.1fr);
  gap: 16px;
}

.input-card,
.result-card {
  min-height: 390px;
}

.field-label,
.result-overline {
  display: block;
  margin-bottom: 8px;
  color: #818894;
  font: 700 10px var(--font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.formula-input :deep(input) {
  font: 600 22px var(--font-mono);
}

.samples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  color: #9298a1;
  font-size: 11px;
}

.weighing {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 28px;
  padding: 18px;
  border-radius: 13px;
  background: var(--domain-accent-soft);
}

.weighing p {
  margin: 0;
  color: #737b86;
  font-size: 12px;
}

.mass-value {
  color: var(--domain-accent);
  font-size: clamp(48px, 7vw, 78px);
  font-weight: 700;
  line-height: 0.95;
  letter-spacing: -0.055em;
}

.mass-unit {
  margin-top: 8px;
  color: #7d8590;
  font: 600 13px var(--font-mono);
}

.conversion {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0;
  padding: 12px 14px;
  border: 1px solid rgba(var(--domain-accent-rgb), 0.18);
  border-radius: 11px;
  background: var(--domain-accent-soft);
  color: #4b5561;
}

.conversion strong {
  color: var(--domain-accent);
}

.composition {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.composition-row {
  display: grid;
  grid-template-columns: 42px 55px 1fr 54px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.percent-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #ecece8;
}

.percent-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--domain-accent);
}

@media (max-width: 820px) {
  .tool-layout { grid-template-columns: 1fr; }
  .input-card, .result-card { min-height: 0; }
}
</style>
