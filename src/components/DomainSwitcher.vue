<script setup lang="ts">
/** 学科模式切换：只改导航词条、强调色与领域工具，不改任何协议。 */
import { LAB_THEME_IDS, LAB_THEMES, type LabThemeId } from "../features/domain-themes";
import { useDomainThemeStore } from "../stores/domain-theme";

const domain = useDomainThemeStore();

function select(theme: LabThemeId) {
  domain.setTheme(theme);
}
</script>

<template>
  <div class="domain-switcher" role="radiogroup" aria-label="实验主题" title="切换学科模式（导航词条、强调色与领域工具）">
    <button
      v-for="theme in LAB_THEME_IDS"
      :key="theme"
      type="button"
      class="domain-option"
      :class="{ active: domain.activeId === theme }"
      :title="LAB_THEMES[theme].name"
      :aria-checked="domain.activeId === theme"
      role="radio"
      @click="select(theme)"
    >
      <span class="domain-glyph" :style="{ background: LAB_THEMES[theme].accent }" />
      <span class="domain-label">{{ LAB_THEMES[theme].shortName }}</span>
    </button>
  </div>
</template>

<style scoped>
.domain-switcher {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: #f1f0eb;
  border: 1px solid var(--hairline);
}

.domain-option {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 999px;
  padding: 4px 9px;
  background: transparent;
  color: #5c6874;
  font: 600 12px var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
  transition: 150ms ease;
}

.domain-option:hover {
  color: #101418;
}

.domain-option.active {
  color: #101418;
  background: #fff;
  box-shadow: 0 1px 4px rgba(16, 20, 24, 0.12);
}

.domain-glyph {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  opacity: 0.55;
}

.domain-option.active .domain-glyph {
  opacity: 1;
}
</style>
