import { describe, expect, it } from "vitest";
import { actionResultDisplay } from "./action-result";

describe("执行结果展示", () => {
  it("解包空返回值与类型标签，不展示信封", () => {
    expect(actionResultDisplay({ return_value: "", suc: true, suc_type: "normal" }))
      .toEqual({ tag: "normal", isError: false, text: "", errors: [] });
  });
  it.each([0, false, null])("保留有效的 %s 返回值", (value) => {
    expect(actionResultDisplay({ return_value: value }).text).toBe(JSON.stringify(value));
  });
  it("文本不加引号，对象只解开一层", () => {
    expect(actionResultDisplay({ return_value: "完成\n第二行" }).text).toBe("完成\n第二行");
    const value = { return_value: 1, suc: false };
    expect(actionResultDisplay({ return_value: value }).text).toBe(JSON.stringify(value, null, 2));
  });
  it("错误优先于空返回值，同一错误不重复展示", () => {
    expect(actionResultDisplay({ error: "设备断连", return_value: "", suc_type: "normal" }, ["设备断连"]))
      .toEqual({ tag: "normal", isError: true, text: "设备断连", errors: [] });
  });
  it("保留独立错误记录与未知标签", () => {
    expect(actionResultDisplay({ return_value: "人工替换", suc_type: "future_type" }, ["原始错误"]))
      .toEqual({ tag: "future_type", isError: false, text: "人工替换", errors: ["原始错误"] });
  });
  it("兼容空记录", () => {
    expect(actionResultDisplay({}).text).toBe("");
  });
});
