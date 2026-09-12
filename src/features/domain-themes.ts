export const LAB_THEME_IDS = ["general"] as const;

export type LabThemeId = (typeof LAB_THEME_IDS)[number];

/**
 * 首次进入（localStorage 无记录）时的主题。随站点发布的只有「通用」；
 * 学科专属版本仅在旧仓库 archive/domain-editions-20260913 维护。
 */
export const DEFAULT_LAB_THEME_ID: LabThemeId = "general";

export type ThemeNavKey =
  | "console"
  | "lab"
  | "workflows"
  | "timeline"
  | "monitor"
  | "editor"
  | "inventory"
  | "devices"
  | "toolkit"
  | "entities"
  | "history"
  | "registry"
  | "system"
  | "logs"
  | "error-decisions"
  | "status-incidents";

export interface LabThemeConfig {
  id: LabThemeId;
  name: string;
  shortName: string;
  englishName: string;
  tagline: string;
  description: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  accentSoft: string;
  accentRgb: string;
  toolkitTitle: string;
  toolkitDescription: string;
  nav: Record<ThemeNavKey, string>;
  highlights: readonly { label: string; value: string; hint: string }[];
}

const systemNav = {
  entities: "数据库浏览",
  history: "执行历史",
  registry: "注册表",
  packages: "驱动包",
  system: "系统诊断",
  logs: "实时日志",
  "error-decisions": "异常审批",
  "status-incidents": "状态告警",
} as const;

export const LAB_THEMES: Record<LabThemeId, LabThemeConfig> = {
  general: {
    id: "general",
    name: "通用实验",
    shortName: "通用",
    englishName: "OpenLab",
    tagline: "把设备、物料与实验流程放进同一个操作系统",
    description: "不预设学科语境，面向任意实验室的设备接入、流程编排、运行监控与物料追踪。",
    accent: "#2563EB",
    accentHover: "#3B82F6",
    accentPressed: "#1D4ED8",
    accentSoft: "#EAF1FE",
    accentRgb: "37, 99, 235",
    toolkitTitle: "实验室工具箱",
    toolkitDescription: "汇集分子、序列与晶体结构等常用工具，随时取用。",
    nav: {
      console: "运行总览",
      lab: "实验室地图",
      workflows: "实验流程",
      timeline: "任务排程",
      monitor: "运行监控",
      editor: "流程编排",
      inventory: "物料仓储",
      devices: "设备管理",
      toolkit: "实用工具",
      ...systemNav,
    },
    highlights: [
      { label: "核心对象", value: "Workflow", hint: "流程定义与运行任务" },
      { label: "专业工具", value: "Toolkit", hint: "通用设备与物料管理" },
      { label: "典型设备", value: "Pump · Robot", hint: "通用设备快速接入" },
    ],
  },

};

export function isLabThemeId(value: unknown): value is LabThemeId {
  return typeof value === "string" && (LAB_THEME_IDS as readonly string[]).includes(value);
}
