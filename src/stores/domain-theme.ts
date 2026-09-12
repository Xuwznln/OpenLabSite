import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import {
  DEFAULT_LAB_THEME_ID,
  LAB_THEMES,
  isLabThemeId,
  type LabThemeId,
} from "../features/domain-themes";

const STORAGE_KEY = "openlab:domain-theme";

function initialTheme(): LabThemeId {
  if (typeof localStorage === "undefined") return DEFAULT_LAB_THEME_ID;
  const stored = localStorage.getItem(STORAGE_KEY);
  return isLabThemeId(stored) ? stored : DEFAULT_LAB_THEME_ID;
}

export const useDomainThemeStore = defineStore("domain-theme", () => {
  const activeId = ref<LabThemeId>(initialTheme());
  const config = computed(() => LAB_THEMES[activeId.value]);

  function setTheme(theme: LabThemeId) {
    activeId.value = theme;
  }

  watch(
    activeId,
    (theme) => {
      const next = LAB_THEMES[theme];
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, theme);
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      root.dataset.labTheme = theme;
      root.style.setProperty("--domain-accent", next.accent);
      root.style.setProperty("--domain-accent-hover", next.accentHover);
      root.style.setProperty("--domain-accent-soft", next.accentSoft);
      root.style.setProperty("--domain-accent-rgb", next.accentRgb);
    },
    { immediate: true },
  );

  return { activeId, config, setTheme };
});
