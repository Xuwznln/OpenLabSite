<script setup lang="ts">
import { NIcon } from "naive-ui";
import { LogoGithub, StarOutline } from "@vicons/ionicons5";

const assetBase = import.meta.env.BASE_URL;
</script>

<template>
  <header class="project-header" aria-label="项目机构与开源入口">
    <div class="institutions">
      <a class="institution" href="https://www.sjtu.edu.cn/" target="_blank" rel="noopener noreferrer" aria-label="上海交通大学">
        <img :src="`${assetBase}brands/sjtu.png`" alt="上海交通大学校徽" width="38" height="38" />
      </a>
      <a class="institution" href="https://thinklab.sjtu.edu.cn/" target="_blank" rel="noopener noreferrer">
        <img :src="`${assetBase}brands/rethinklab.jpg`" alt="" width="38" height="38" />
        <span><small>上海交通大学</small>ReThinkLab</span>
      </a>
      <a class="institution" href="https://www.bza.edu.cn/" target="_blank" rel="noopener noreferrer" aria-label="北京中关村学院">
        <img class="bza-logo" :src="`${assetBase}brands/bza.png`" alt="北京中关村学院" width="140" height="39" />
      </a>
      <a class="institution" href="https://github.com/deepmodeling" target="_blank" rel="noopener noreferrer">
        <img :src="`${assetBase}brands/deepmodeling.png`" alt="" width="32" height="32" />
        <span>DeepModeling</span>
      </a>
    </div>
    <div class="project-links">
      <a href="https://github.com/Xuwznln/OpenLabSite/blob/main/docs/LOCAL_START.md" target="_blank" rel="noopener noreferrer">本地启动教程</a>
      <a class="star-link" href="https://github.com/Xuwznln/OpenLabSite" target="_blank" rel="noopener noreferrer" aria-label="在 GitHub 查看 OpenLabSite，欢迎 Star">
        <NIcon size="16"><LogoGithub /></NIcon>
        <span>欢迎 Star</span>
        <NIcon size="14"><StarOutline /></NIcon>
      </a>
    </div>
  </header>
</template>

<style scoped>
.project-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 24px;
  flex-shrink: 0;
  padding: 0 2px 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--hairline);
}
.institutions, .project-links, .institution, .star-link {
  display: flex;
  align-items: center;
}
.institutions { flex-wrap: wrap; gap: 12px 22px; }
.project-links { gap: 16px; font-size: 12px; }
.institution { gap: 8px; font-size: 13px; font-weight: 600; }
a { color: inherit; text-decoration: none; }
a:hover { color: var(--domain-accent); }
a:focus-visible { outline: 2px solid var(--domain-accent); outline-offset: 4px; }
.institution img { object-fit: contain; flex-shrink: 0; }
.institution span { display: flex; flex-direction: column; }
.institution small { font-size: 10px; font-weight: 400; }
.bza-logo { max-width: 140px; }
.star-link { gap: 7px; padding: 7px 10px; border: 1px solid var(--hairline); border-radius: 7px; background: var(--panel); }
@media (max-width: 600px) {
  .institutions { gap: 10px 14px; }
  .institution { font-size: 11px; gap: 5px; }
  .bza-logo { width: 116px; height: auto; }
}
</style>
