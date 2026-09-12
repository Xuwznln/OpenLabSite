export interface CifRenderViewport {
  width: number;
  height: number;
  horizontalPadding: number;
  verticalPadding: number;
  viewBox: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * 让 SVG 用户坐标宽度与组件的 CSS 像素宽度保持一致，避免窄屏二次缩放文字和描边。
 */
export function calculateCifRenderViewport(measuredWidth: number): CifRenderViewport {
  const validWidth = Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : 640;
  const width = Math.round(validWidth * 1_000) / 1_000;
  const compact = width < 480;
  const height = compact
    ? clamp(Math.round(width * 1.28), 360, 430)
    : clamp(Math.round(width * 0.72), 400, 460);
  const horizontalPadding = compact ? clamp(Math.round(width * 0.1), 2, 28) : 48;
  const verticalPadding = compact ? 38 : 44;
  return {
    width,
    height,
    horizontalPadding,
    verticalPadding,
    viewBox: `0 0 ${width} ${height}`,
  };
}
