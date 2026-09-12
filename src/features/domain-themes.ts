export const LAB_THEME_IDS = ["general", "organic", "biology", "materials"] as const;

export type LabThemeId = (typeof LAB_THEME_IDS)[number];

/**
 * 首次进入（localStorage 无记录）时的主题。随站点发布的只有「通用」；
 * 有机 / 生物 / 材料等学科主题是可切换的示例，不预设给用户。
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
      { label: "专业工具", value: "Toolkit", hint: "领域工具随需切换" },
      { label: "典型设备", value: "Pump · Robot", hint: "通用设备快速接入" },
    ],
  },
  organic: {
    id: "organic",
    name: "有机合成",
    shortName: "有机",
    englishName: "Organic Synthesis",
    tagline: "从分子配方到自动化合成，一套界面完成实验闭环",
    description: "面向反应设计、试剂核算、合成排程与过程追踪。",
    accent: "#087F5B",
    accentHover: "#0B946A",
    accentPressed: "#066348",
    accentSoft: "#E8F6F0",
    accentRgb: "8, 127, 91",
    toolkitTitle: "分子与配方工具",
    toolkitDescription: "解析化学式、计算摩尔质量，并把称量值快速换算成物质的量。",
    nav: {
      console: "合成总览",
      lab: "反应平台",
      workflows: "实验流程",
      timeline: "反应排程",
      monitor: "过程监控",
      editor: "合成编排",
      inventory: "试剂与耗材",
      devices: "合成设备",
      toolkit: "分子工具",
      ...systemNav,
    },
    highlights: [
      { label: "核心对象", value: "Reaction", hint: "反应步骤与物料绑定" },
      { label: "专业工具", value: "Molar Mass", hint: "化学式与称量换算" },
      { label: "典型设备", value: "Pump · HPLC", hint: "液体处理与在线分析" },
    ],
  },
  biology: {
    id: "biology",
    name: "生物实验",
    shortName: "生物",
    englishName: "Life Science",
    tagline: "把样本、序列、培养与自动化流程放进同一个可追溯工作台",
    description: "面向样本处理、核酸检查、PCR 配制与培养流程。",
    accent: "#6D5CE7",
    accentHover: "#806FF0",
    accentPressed: "#5546BF",
    accentSoft: "#F0EDFF",
    accentRgb: "109, 92, 231",
    toolkitTitle: "序列与 PCR 工具",
    toolkitDescription: "检查 DNA 序列、GC/Tm、反向互补链，并生成 PCR Master Mix 配方。",
    nav: {
      console: "实验总览",
      lab: "生物实验区",
      workflows: "实验流程",
      timeline: "培养排程",
      monitor: "环境监控",
      editor: "生物流程",
      inventory: "样本与试剂",
      devices: "生物设备",
      toolkit: "序列工具",
      ...systemNav,
    },
    highlights: [
      { label: "核心对象", value: "Sample", hint: "样本谱系与批次" },
      { label: "专业工具", value: "DNA · PCR", hint: "序列质控与体系配制" },
      { label: "典型设备", value: "PCR · Incubator", hint: "扩增与培养设备" },
    ],
  },
  materials: {
    id: "materials",
    name: "材料研发",
    shortName: "材料",
    englishName: "Materials Research",
    tagline: "连接原料、制备、热处理和晶体结构表征的数字化实验链路",
    description: "面向粉体配料、烧结工艺、样品追踪与晶体结构预览。",
    accent: "#C65D2E",
    accentHover: "#DB6D3B",
    accentPressed: "#9F4721",
    accentSoft: "#FFF0E8",
    accentRgb: "198, 93, 46",
    toolkitTitle: "晶体结构工具",
    toolkitDescription: "粘贴或载入 CIF，解析晶胞参数和原子位点并交互预览结构。",
    nav: {
      console: "研发总览",
      lab: "材料实验区",
      workflows: "实验流程",
      timeline: "炉程排程",
      monitor: "工艺监控",
      editor: "材料编排",
      inventory: "原料与样品",
      devices: "表征设备",
      toolkit: "晶体工具",
      ...systemNav,
    },
    highlights: [
      { label: "核心对象", value: "Specimen", hint: "配方、批次与样品谱系" },
      { label: "专业工具", value: "CIF Viewer", hint: "晶胞与原子位点预览" },
      { label: "典型设备", value: "Furnace · XRD", hint: "热处理与结构表征" },
    ],
  },
};

export function isLabThemeId(value: unknown): value is LabThemeId {
  return typeof value === "string" && (LAB_THEME_IDS as readonly string[]).includes(value);
}
