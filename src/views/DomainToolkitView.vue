<script setup lang="ts">
import { useRoute } from "vue-router";
import MolarMassCalculator from "../components/MolarMassCalculator.vue";
import BiologyToolkit from "../components/BiologyToolkit.vue";
import CifCrystalViewer from "../components/CifCrystalViewer.vue";
import DomainSwitcher from "../components/DomainSwitcher.vue";
import { isLabThemeId } from "../features/domain-themes";
import { useDomainThemeStore } from "../stores/domain-theme";

const domain = useDomainThemeStore();
const requestedTheme = useRoute().query.theme;
if (typeof requestedTheme === "string" && isLabThemeId(requestedTheme)) {
  domain.setTheme(requestedTheme);
}
</script>

<template>
  <div class="toolkit-page">
    <section class="toolkit-hero">
      <div>
        <span class="hero-kicker">{{ domain.config.englishName }}</span>
        <h1>{{ domain.config.toolkitTitle }}</h1>
        <p>{{ domain.config.toolkitDescription }}</p>
      </div>
      <DomainSwitcher class="hero-switcher" />
    </section>

    <!-- 通用模式汇集全部领域工具；领域模式只展示对应工具 -->
    <template v-if="domain.activeId === 'general'">
      <MolarMassCalculator />
      <BiologyToolkit />
      <CifCrystalViewer />
    </template>
    <MolarMassCalculator v-else-if="domain.activeId === 'organic'" />
    <BiologyToolkit v-else-if="domain.activeId === 'biology'" />
    <CifCrystalViewer v-else />
  </div>
</template>

<style scoped>
.toolkit-page { display: flex; flex-direction: column; gap: 16px; }
.toolkit-hero { position: relative; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: clamp(24px, 4vw, 46px); overflow: hidden; border: 1px solid rgba(var(--domain-accent-rgb), .18); border-radius: 20px; background: linear-gradient(125deg, var(--domain-accent-soft), rgba(255,255,255,.82)); }
.toolkit-hero::after { content: ""; position: absolute; width: 260px; height: 260px; right: -90px; top: -120px; border: 44px solid rgba(var(--domain-accent-rgb), .08); border-radius: 50%; }
.hero-kicker { color: var(--domain-accent); font: 700 10px var(--font-mono); letter-spacing: .16em; }
.toolkit-hero h1 { margin: 9px 0 7px; font: 700 clamp(30px, 4.5vw, 54px)/1 var(--font-display); letter-spacing: -.045em; }
.toolkit-hero p { max-width: 680px; margin: 0; color: #65707c; font-size: 14px; line-height: 1.7; }
.hero-switcher { width: 300px; flex: 0 0 auto; background: rgba(12,16,20,.92); padding: 5px; z-index: 1; }
@media (max-width: 780px) { .toolkit-hero { align-items: stretch; flex-direction: column; } .hero-switcher { width: 100%; min-width: 0; } }
</style>
