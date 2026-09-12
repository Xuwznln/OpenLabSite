import { computed } from "vue";
import { defineStore } from "pinia";
import { LAB_THEMES } from "../features/domain-themes";

/** 通用版固定配置：旧 localStorage 与 ?theme= 不再改变界面。 */
export const useDomainThemeStore = defineStore("domain-theme", () => {
  const activeId = computed(() => "general" as const);
  const config = computed(() => LAB_THEMES.general);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.labTheme = "general";
    root.style.setProperty("--domain-accent", config.value.accent);
    root.style.setProperty("--domain-accent-hover", config.value.accentHover);
    root.style.setProperty("--domain-accent-soft", config.value.accentSoft);
    root.style.setProperty("--domain-accent-rgb", config.value.accentRgb);
  }
  return { activeId, config };
});
