/** 只解开结果信封一层，保留驱动返回内容的原始结构。 */
export function actionResultDisplay(info: Record<string, unknown>, errors: unknown[] = []) {
  const hasError = info.error !== undefined && info.error !== null && info.error !== "";
  const value = hasError ? info.error : info.return_value;
  return {
    tag: typeof info.suc_type === "string" ? info.suc_type : "",
    isError: hasError,
    text: resultText(value),
    // 历史错误仍独立保留，避免人工干预成功后丢失异常记录。
    errors: errors.map(resultText).filter((text) => text !== "" && (!hasError || text !== resultText(value))),
  };
}

function resultText(value: unknown): string {
  if (value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
}
