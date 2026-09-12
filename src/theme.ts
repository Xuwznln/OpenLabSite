/** 设计系统 v3「蓝图纸」：暖纸底 + 工程网格 + 墨色排版 + 单一电光蓝。
 *
 * - 背景是带绘图网格的暖纸色（#F6F6F3），不是冷灰后台底
 * - 面板一律细线（hairline）平面化，不堆阴影；层次靠排版而非投影
 * - 展示数字用 Space Grotesk，数据/标签用 JetBrains Mono 小号大写
 * - 全站只有一个强调色：电光蓝 #2E5BFF，其余全部墨色灰阶
 */

import type { GlobalThemeOverrides } from "naive-ui";

export const palette = {
  primary: "#2E5BFF",
  primaryHover: "#4D74FF",
  primaryPressed: "#1F44CC",
  ink: "#101418",
  paper: "#F6F6F3",
  /** 卡片底：极轻的暖白（收敛纯白，与 paper 拉开一档灰阶）。 */
  panel: "#FDFDFB",
  /** 抽屉/侧栏面板底：再暖一档，让内部白色卡片、输入框自然分层。 */
  panelSoft: "#FAF9F5",
  hairline: "#E8E6E1",
  success: "#0E9F6E",
  warning: "#D97706",
  error: "#DC2626",
  info: "#2E5BFF",
  textPrimary: "#101418",
  textSecondary: "#6E7580",
  textDisabled: "#A6ACB5",
};

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: palette.primary,
    primaryColorHover: palette.primaryHover,
    primaryColorPressed: palette.primaryPressed,
    primaryColorSuppl: palette.primaryHover,
    successColor: palette.success,
    warningColor: palette.warning,
    errorColor: palette.error,
    infoColor: palette.info,
    textColorBase: palette.ink,
    textColor1: palette.ink,
    textColor2: palette.ink,
    textColor3: palette.textSecondary,
    bodyColor: palette.paper,
    cardColor: palette.panel,
    borderColor: palette.hairline,
    dividerColor: palette.hairline,
    borderRadius: "12px",
    borderRadiusSmall: "6px",
    // 全局字体栈定义在 src/style.css 的 :root（--font-sans/display/mono）
    fontFamily: "var(--font-sans)",
    fontSize: "14px",
  },
  Card: {
    borderRadius: "14px",
    paddingMedium: "20px",
    titleFontSizeMedium: "12px",
    titleFontWeight: "700",
  },
  Button: {
    borderRadiusMedium: "9px",
    borderRadiusSmall: "7px",
    fontWeight: "600",
  },
  DataTable: {
    thFontWeight: "700",
    thTextColor: palette.textSecondary,
    borderRadius: "10px",
    thColor: "#FAFAF8",
  },
  Tag: {
    borderRadius: "8px",
  },
  Input: {
    borderRadius: "9px",
  },
  Drawer: {
    color: palette.panelSoft,
  },
  // 与 src/style.css 的原生滚动条样式保持同一视觉（细窄圆角 + hover 加深）
  Scrollbar: {
    color: "rgba(16, 20, 24, 0.18)",
    colorHover: "rgba(16, 20, 24, 0.34)",
    width: "9px",
    height: "9px",
    borderRadius: "999px",
  },
};

/** 领域主题只替换强调色，尺寸、语义色和排版仍共享同一设计系统。 */
export function domainThemeOverrides(colors: {
  accent: string;
  accentHover: string;
  accentPressed: string;
}): GlobalThemeOverrides {
  return {
    ...themeOverrides,
    common: {
      ...themeOverrides.common,
      primaryColor: colors.accent,
      primaryColorHover: colors.accentHover,
      primaryColorPressed: colors.accentPressed,
      primaryColorSuppl: colors.accentHover,
      infoColor: colors.accent,
    },
  };
}

/** 运行/节点/设备等状态 → 视觉语义（StatusPill 用）。 */
export interface StatusMeta {
  label: string;
  color: string;
  bg: string;
}

export const STATUS_META: Record<string, StatusMeta> = {
  // workflow task（Workflow Authority 状态机）
  running: { label: "运行中", color: "#2E5BFF", bg: "#EAF0FF" },
  waiting_for_material: { label: "等待物料", color: "#B45309", bg: "#FCF1E1" },
  success: { label: "已完成", color: "#0B7A55", bg: "#E6F7F0" },
  succeeded: { label: "已完成", color: "#0B7A55", bg: "#E6F7F0" },
  failed: { label: "失败", color: "#B91C1C", bg: "#FDEBEB" },
  timeout: { label: "超时", color: "#B91C1C", bg: "#FDEBEB" },
  canceled: { label: "已取消", color: "#6E7580", bg: "#EFEFEC" },
  interrupted: { label: "被中断", color: "#B45309", bg: "#FCF1E1" },
  paused: { label: "已暂停", color: "#B45309", bg: "#FCF1E1" },
  // node job
  pending: { label: "等待依赖", color: "#6E7580", bg: "#EFEFEC" },
  ready: { label: "就绪", color: "#2E5BFF", bg: "#EAF0FF" },
  dispatched: { label: "已下发", color: "#B45309", bg: "#FCF1E1" },
  intervention_required: { label: "等待干预", color: "#B45309", bg: "#FCF1E1" },
  cancel_requested: { label: "取消中", color: "#6E7580", bg: "#EFEFEC" },
  execution_unknown: { label: "执行态未知", color: "#B45309", bg: "#FCF1E1" },
  skipped: { label: "已跳过", color: "#6E7580", bg: "#EFEFEC" },
  // device / connection
  online: { label: "在线", color: "#0B7A55", bg: "#E6F7F0" },
  offline: { label: "离线", color: "#6E7580", bg: "#EFEFEC" },
  busy: { label: "占用", color: "#B45309", bg: "#FCF1E1" },
  idle: { label: "空闲", color: "#0B7A55", bg: "#E6F7F0" },
  // misc
  quarantined: { label: "隔离", color: "#B91C1C", bg: "#FDEBEB" },
  active: { label: "生效", color: "#2E5BFF", bg: "#EAF0FF" },
  consumed: { label: "已消费", color: "#6E7580", bg: "#EFEFEC" },
  released: { label: "已释放", color: "#6E7580", bg: "#EFEFEC" },
};

export function statusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status] ?? {
      label: status || "—",
      color: palette.textSecondary,
      bg: "#EFEFEC",
    }
  );
}
