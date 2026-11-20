/**
 * 动作初始参数：只用后端声明的默认值，不替必填参数编空值。
 */
import { describe, expect, it } from "vitest";
import { actionParameterTemplate } from "../src/device-actions";

/** aliquot / add_reagent 式的 goal schema：volume_ml 有默认值，sample / solvent / ready / count / tags 没有。 */
const SCHEMA = {
  properties: {
    goal: {
      type: "object",
      properties: {
        sample: { type: "object" },
        volume_ml: { type: "number", default: 5 },
        label: { type: "string" },
        ready: { type: "boolean" },
        count: { type: "integer" },
        tags: { type: "array", items: { type: "string" } },
        options: { type: "object", default: { mode: "fast" } },
      },
      required: ["sample", "label", "ready", "count", "tags"],
    },
  },
};

describe("actionParameterTemplate", () => {
  it("没有默认值的参数不出现（不编 0 / \"\" / false / [] / {}），schema 声明的默认值照用", () => {
    expect(actionParameterTemplate({ schema: SCHEMA, goal_default: null })).toEqual({ volume_ml: 5, options: { mode: "fast" } });
  });

  it("注册表 goal_default 叠加在 schema 默认值上；返回的是拷贝", () => {
    const goalDefault = { volume_ml: 2.5, label: "S-1", options: { mode: "slow" } };
    const template = actionParameterTemplate({ schema: SCHEMA, goal_default: goalDefault });
    expect(template).toEqual({ volume_ml: 2.5, label: "S-1", options: { mode: "slow" } });
    (template.options as Record<string, unknown>).mode = "changed";
    expect(goalDefault.options.mode).toBe("slow");
    expect(actionParameterTemplate({ schema: null, goal_default: { speed: 1 } })).toEqual({ speed: 1 });
    expect(actionParameterTemplate({ schema: null, goal_default: null })).toEqual({});
  });
});
