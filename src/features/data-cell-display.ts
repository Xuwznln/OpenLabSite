export interface StructuredValueSummary {
  label: string;
  preview: string;
}

export function isStructuredValue(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** 为表格中的 JSON 提供稳定摘要；完整内容只在点击后的详情抽屉展示。 */
export function summarizeStructuredValue(value: object): StructuredValueSummary {
  if (Array.isArray(value)) {
    const preview = value
      .slice(0, 3)
      .map((item) => {
        if (item === null) return "null";
        if (typeof item === "object") return Array.isArray(item) ? "[…]" : "{…}";
        return String(item);
      })
      .join(" · ");
    return {
      label: value.length ? `数组 · ${value.length} 项` : "空数组",
      preview: preview || "点击查看 JSON",
    };
  }

  const keys = Object.keys(value);
  return {
    label: keys.length ? `对象 · ${keys.length} 字段` : "空对象",
    preview: keys.slice(0, 4).join(" · ") || "点击查看 JSON",
  };
}
