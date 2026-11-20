import { describe, expect, it } from "vitest";
import type { DeviceActionSchemaDetail } from "@openlab/protocol";
import {
  inventoryRequirementKeys,
  isDeferredParamValue,
  missingParamEntries,
  pathCoveredByMappings,
} from "./param-completeness";

/** 造一个最小 schema：goal.required + 属性 + placeholder_keys。 */
function makeDetail(input: {
  required?: string[];
  goalProps?: Record<string, unknown>;
  placeholderKeys?: Record<string, string>;
}): DeviceActionSchemaDetail {
  return {
    device_id: "dev-1",
    action_name: "act",
    schema: {
      properties: {
        goal: {
          type: "object",
          properties: input.goalProps ?? {},
          ...(input.required ? { required: input.required } : {}),
        },
      },
    },
    goal_default: null,
    action_type: "goal",
    is_busy: false,
    placeholder_keys: input.placeholderKeys,
  };
}

const RESOURCE_SHAPE_PROPS = {
  vessel: {
    type: "object",
    properties: {
      id: {},
      name: {},
      sample_id: {},
      children: {},
      parent: {},
      pose: {},
    },
  },
};

describe("运行时才确定的参数", () => {
  it("inventoryRequirementKeys 读后端数组或画布 requirementsJson 文本，忽略坏条目", () => {
    const requirements = [
      { key: "solvent", kind: "lot", lot_uuid: "l-1", quantity: 10, unit: "ul" },
      { key: " tips ", kind: "material", template_uuid: "t-1" },
      { kind: "lot" },
      "garbage",
      { key: "solvent", kind: "lot" },
    ];
    expect(inventoryRequirementKeys(requirements)).toEqual(["solvent", "tips"]);
    expect(inventoryRequirementKeys(JSON.stringify(requirements))).toEqual(["solvent", "tips"]);
    expect(inventoryRequirementKeys("{oops")).toEqual([]);
    expect(inventoryRequirementKeys(undefined)).toEqual([]);
  });

  it("isDeferredParamValue 识别 node_output（可嵌套）与 {{loop.}}", () => {
    expect(isDeferredParamValue({ kind: "node_output", node_key: "step-3", data_key: "lot" })).toBe(true);
    expect(isDeferredParamValue({ lots: [{ kind: "node_output", workflow_node_uuid: "u", data_key: "" }] })).toBe(true);
    expect(isDeferredParamValue("S-{{loop.iteration}}")).toBe(true);
    expect(isDeferredParamValue({ kind: "workflow_input", parameter: "lot" })).toBe(false);
    expect(isDeferredParamValue("plain")).toBe(false);
    expect(isDeferredParamValue(0)).toBe(false);
  });
});

describe("pathCoveredByMappings", () => {
  it("精确、父路径、子路径三向覆盖", () => {
    expect(pathCoveredByMappings("vessel", ["vessel"])).toBe(true);
    expect(pathCoveredByMappings("vessel", ["vessel.id"])).toBe(true);
    expect(pathCoveredByMappings("vessel.id", ["vessel"])).toBe(true);
    expect(pathCoveredByMappings("vessel", ["vessel_2"])).toBe(false);
    expect(pathCoveredByMappings("volume", [])).toBe(false);
  });
});

describe("missingParamEntries", () => {
  it("引用工作流入口参数的顶层参数由任务 input 给值，不计未填", () => {
    const detail = makeDetail({
      required: ["vessel", "volume"],
      goalProps: { ...RESOURCE_SHAPE_PROPS, volume: { type: "number" } },
      placeholderKeys: { vessel: "unilabos_resources" },
    });
    const ref = (parameter: string) => ({ kind: "workflow_input", parameter });
    expect(missingParamEntries({
      detail,
      paramJson: JSON.stringify({ vessel: ref("vessel"), volume: ref("amount") }),
      mappedPaths: [],
    })).toEqual([]);
  });

  it("placeholder 未选择计入；已选（uuid）不计入", () => {
    const detail = makeDetail({
      placeholderKeys: { vessel: "unilabos_resources", pump: "unilabos_devices" },
    });
    const missing = missingParamEntries({
      detail,
      paramJson: JSON.stringify({ vessel: {}, pump: "" }),
      mappedPaths: [],
    });
    expect(missing.map((entry) => entry.path).sort()).toEqual(["pump", "vessel"]);
    expect(missing.every((e) => e.reason === "placeholder-unselected")).toBe(true);

    const filled = missingParamEntries({
      detail,
      paramJson: JSON.stringify({ vessel: { uuid: "m-1" }, pump: "pump-01" }),
      mappedPaths: [],
    });
    expect(filled).toEqual([]);
  });

  it("人工确认指派：空列表 = 不指派（任何人可确认），是明确决定；键缺失才算未选", () => {
    const detail = makeDetail({
      required: ["assignee_user_ids", "timeout_seconds"],
      goalProps: { assignee_user_ids: { type: "array", items: { type: "string" } }, timeout_seconds: { type: "integer" } },
      placeholderKeys: { assignee_user_ids: "unilabos_manual_confirm" },
    });
    expect(
      missingParamEntries({ detail, paramJson: JSON.stringify({ assignee_user_ids: [], timeout_seconds: 3600 }), mappedPaths: [] }),
    ).toEqual([]);
    expect(
      missingParamEntries({ detail, paramJson: JSON.stringify({ assignee_user_ids: ["alice"], timeout_seconds: 3600 }), mappedPaths: [] }),
    ).toEqual([]);
    const missing = missingParamEntries({ detail, paramJson: JSON.stringify({ timeout_seconds: 3600 }), mappedPaths: [] });
    expect(missing.map((e) => [e.path, e.reason])).toEqual([["assignee_user_ids", "placeholder-unselected"]]);
  });

  it("legacy Resource 结构识别：uuid 与 id 均空计入，id 回退视为已选", () => {
    const detail = makeDetail({ goalProps: RESOURCE_SHAPE_PROPS });
    const empty = { id: "", name: "", sample_id: "", children: [], parent: "", pose: {} };
    expect(
      missingParamEntries({
        detail,
        paramJson: JSON.stringify({ vessel: empty }),
        mappedPaths: [],
      }),
    ).toHaveLength(1);
    // 后端 _resource_lookup_identity 优先 uuid、回退 id：id 已填视为已绑定
    expect(
      missingParamEntries({
        detail,
        paramJson: JSON.stringify({ vessel: { ...empty, id: "flask_A" } }),
        mappedPaths: [],
      }),
    ).toEqual([]);
  });

  it("SiteSlot（unilabos_sites）：非 required 未选不计，required 未选计入", () => {
    // transfer_resource 形态：site 有默认空串（可选），未选择 = 由父级默认排布
    const optional = makeDetail({
      required: ["resource"],
      placeholderKeys: { resource: "unilabos_resources", site: "unilabos_sites" },
    });
    const missing = missingParamEntries({
      detail: optional,
      paramJson: JSON.stringify({ resource: { uuid: "m-1" }, site: "" }),
      mappedPaths: [],
    });
    expect(missing).toEqual([]);

    // schema 明确 required 时仍计未填；仅填一个 UUID 字符串不能替代目录校验和确认。
    const requiredSite = makeDetail({
      required: ["site"],
      placeholderKeys: { site: "unilabos_sites" },
    });
    expect(
      missingParamEntries({
        detail: requiredSite,
        paramJson: JSON.stringify({ site: "" }),
        mappedPaths: [],
      }).map((entry) => entry.path),
    ).toEqual(["site"]);
    expect(
      missingParamEntries({
        detail: requiredSite,
        paramJson: JSON.stringify({ site: "site-uuid-1" }),
        mappedPaths: [],
      }).map((entry) => entry.reason),
    ).toEqual(["site-unavailable"]);
  });

  it("被上游 @@@ 映射覆盖的参数不算未填", () => {
    const detail = makeDetail({
      required: ["volume_ml"],
      placeholderKeys: { vessel: "unilabos_resources" },
    });
    const missing = missingParamEntries({
      detail,
      paramJson: JSON.stringify({ vessel: {}, volume_ml: "" }),
      mappedPaths: ["vessel.id", "volume_ml"],
    });
    expect(missing).toEqual([]);
  });

  it("schema required 限定必填口径：非 required 空叶子不计", () => {
    const detail = makeDetail({ required: ["volume_ml"] });
    const missing = missingParamEntries({
      detail,
      paramJson: JSON.stringify({ volume_ml: "", note: "" }),
      mappedPaths: [],
    });
    expect(missing.map((entry) => entry.path)).toEqual(["volume_ml"]);
  });

  it("schema required 参数整体缺失也计未填", () => {
    const detail = makeDetail({ required: ["volume_ml"] });
    const missing = missingParamEntries({
      detail,
      paramJson: "{}",
      mappedPaths: [],
    });
    expect(missing.map((entry) => entry.path)).toEqual(["volume_ml"]);
  });

  it("schema 不可用时空叶子全部视为待填；0/false 视为已填", () => {
    const missing = missingParamEntries({
      detail: null,
      paramJson: JSON.stringify({ speed: 0, active: false, name: "", tags: [] }),
      mappedPaths: [],
    });
    expect(missing.map((entry) => entry.path).sort()).toEqual(["name", "tags"]);
  });

  it("全部填齐 → 空清单（徽标 0 隐藏）", () => {
    expect(
      missingParamEntries({
        detail: null,
        paramJson: JSON.stringify({ speed: 300, name: "ok" }),
        mappedPaths: [],
      }),
    ).toEqual([]);
  });

  it("库存需求注入的参数（inventory_requirements[].key）派发时由调度器写入，不计未填", () => {
    // 联合演示「实际分装」：aliquot(source, target, solvent)，solvent 由 inventory=[{key: "solvent", …}] 注入
    const detail = makeDetail({
      required: ["source", "target", "solvent"],
      goalProps: { source: { type: "object" }, target: { type: "object" }, solvent: { type: "object" } },
      placeholderKeys: { source: "unilabos_resources", target: "unilabos_resources" },
    });
    const ref = (parameter: string) => ({ kind: "workflow_input", parameter });
    const paramJson = JSON.stringify({ source: ref("source"), target: ref("sample") });
    expect(missingParamEntries({ detail, paramJson, mappedPaths: [] }).map((entry) => entry.path)).toEqual(["solvent"]);
    expect(missingParamEntries({ detail, paramJson, mappedPaths: [], inventoryKeys: ["solvent"] })).toEqual([]);
  });

  it("值引用上游输出（node_output）或循环变量的参数派发时才确定，不计未填", () => {
    const detail = makeDetail({
      required: ["lot", "sample"],
      goalProps: { lot: { type: "string" }, sample: { type: "object" } },
      placeholderKeys: { sample: "unilabos_resources" },
    });
    const output = (dataKey: string) => ({ kind: "node_output", workflow_node_uuid: "u-1", data_key: dataKey });
    expect(
      missingParamEntries({
        detail,
        paramJson: JSON.stringify({ lot: output(""), sample: output("sample") }),
        mappedPaths: [],
      }),
    ).toEqual([]);
  });

  it("参数 JSON 不合法整体计一项", () => {
    const missing = missingParamEntries({
      detail: null,
      paramJson: "{oops",
      mappedPaths: [],
    });
    expect(missing).toHaveLength(1);
    expect(missing[0].reason).toBe("invalid-json");
  });
});
