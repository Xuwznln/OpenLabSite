import { describe, expect, it } from "vitest";
import type { DeviceActionSchemaDetail } from "@openlab/protocol";
import {
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

    // schema 明确 required 时仍计未填；选了 site uuid 视为已填
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
      }),
    ).toEqual([]);
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
