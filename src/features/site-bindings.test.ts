import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { BackendWorkflowGraph, DeviceActionSchemaDetail, EdgeApi, MaterialsV1Aggregate } from "@openlab/protocol";
import { SiteIndex, confirmSite, siteBindingStatus, suggestSite, type SiteBindings } from "./site-bindings";
import { missingParamEntries } from "./param-completeness";
import { useActionParamForm } from "./action-param-form";
import { workflowReadiness, requireWorkflowReady } from "./workflow-readiness";
import type { PlaceholderField } from "./action-placeholders";

const SITE: PlaceholderField = { param: "site", kind: "site", placeholder: "unilabos_sites", multiple: false };
const items = [
  { material: { material_uuid: "dev", resource_id: "bench", name: "bench" }, sites: [] },
  { material: { material_uuid: "deck", resource_id: "deck", name: "deck", parent_material_uuid: "dev" }, sites: [{ site_uuid: "s1", label: "T1" }] },
  { material: { material_uuid: "other", resource_id: "other", name: "other" }, sites: [{ site_uuid: "s2", label: "T1" }] },
] as unknown as MaterialsV1Aggregate[];
const index = new SiteIndex(items);
const context = { deviceId: "bench", actionName: "load", param: { site: "T1" } };
const detail: DeviceActionSchemaDetail = { device_id: "bench", action_name: "load", action_type: "goal", is_busy: false,
  schema: { properties: { goal: { type: "object", required: [], properties: { site: { type: "string" } } } } },
  goal_default: { site: "T1" }, placeholder_keys: { site: "unilabos_sites" } };

describe("Site 绑定", () => {
  it("默认 T1 只在设备子树预选，不能自动写入或被视为已确认", () => {
    const candidates = index.candidates("site", context);
    expect(candidates.map((item) => item.value)).toEqual(["s1"]);
    expect(suggestSite("T1", candidates)?.value).toBe("s1");
    expect(context.param.site).toBe("T1"); // 包括取消窗口，没有写回
    expect(siteBindingStatus("site", context, index)).toBe("unconfirmed");
    expect(siteBindingStatus("site", { ...context, param: { site: "s1" } }, index)).toBe("unconfirmed");
  });
  it("显式确认后持久化可回显；更改设备、动作、目标物料或删 Site 会失效", () => {
    const binding = confirmSite("site", "s1", context, index);
    const confirmed = { ...context, param: { site: "s1" } };
    expect(siteBindingStatus("site", confirmed, index, JSON.parse(JSON.stringify(binding)))).toBe("bound");
    expect(siteBindingStatus("site", { ...confirmed, deviceId: "other" }, index, binding)).not.toBe("bound");
    expect(siteBindingStatus("site", { ...confirmed, actionName: "unload" }, index, binding)).not.toBe("bound");
    expect(siteBindingStatus("site", { ...confirmed, param: { site: "s1", mount_resource: { uuid: "other" } } }, index, binding)).not.toBe("bound");
    expect(siteBindingStatus("site", confirmed, new SiteIndex([]), binding)).toBe("invalid");
  });
  it("同设备多个同名 Site 不选第一个；明确物料后可以预选", () => {
    const ambiguous = new SiteIndex([...items, { material: { material_uuid: "deck2", name: "deck2", parent_material_uuid: "dev" }, sites: [{ site_uuid: "s3", label: "T1" }] } as unknown as MaterialsV1Aggregate]);
    expect(suggestSite("T1", ambiguous.candidates("site", context))).toBeUndefined();
    expect(suggestSite("T1", ambiguous.candidates("site", { ...context, owners: { site: "deck2" } }))?.value).toBe("s3");
  });
  it("Host 的 mount_resource 是目标父级，不根据源 resource 猜测", () => {
    const params = { site: "T1", mount_resource: { uuid: "other" }, resource: { uuid: "deck" } };
    expect(index.candidates("site", { ...context, param: params }).map((site) => site.value)).toEqual(["s2"]);
    expect(index.candidates("site", { ...context, param: { ...params, mount_resource: { uuid: "gone", id: "other" } } })).toEqual([]);
    expect(index.candidates("site", { ...context, param: { ...params, mount_resource: "other" } })).toEqual([]);
  });
  it("可选空值 / 上游映射不计，非空默认值必须计入且没有伪造的当前值选项", async () => {
    const check = (site: string, mappedPaths: string[] = []) => missingParamEntries({ detail, paramJson: JSON.stringify({ site }), mappedPaths, sites: index });
    expect(check("")).toEqual([]);
    expect(check("T1").map((entry) => entry.reason)).toEqual(["site-unconfirmed"]);
    expect(check("T1", ["site"])).toEqual([]);
    expect(missingParamEntries({ detail, paramJson: '{"site":"T1"}', mappedPaths: [], sites: null })[0].reason).toBe("site-unavailable");
  });
  it("省略 Site 仍须确认非空动作默认值；只有缺省为空或显式清空才跳过", () => {
    const input = { detail, paramJson: '{}', mappedPaths: [], sites: index };
    expect(missingParamEntries(input).map((entry) => entry.reason)).toEqual(["site-unconfirmed"]);
    expect(missingParamEntries({ ...input, detail: { ...detail, goal_default: {} } })).toEqual([]);
    expect(missingParamEntries({ ...input, paramJson: '{"site":""}' })).toEqual([]);
    const binding = confirmSite("site", "s1", context, index);
    expect(missingParamEntries({ ...input, detail: { ...detail, goal_default: { site: "s1" } },
      siteBindings: { site: binding } }).map((entry) => entry.reason)).toEqual(["site-unconfirmed"]);
  });
  it("表单只有确认按钮写 UUID，失败保留原参数；目录错误不回退原始选择器", async () => {
    const paramJson = ref('{"site":"T1", "note":"保留"}');
    const bindings = ref<SiteBindings>({});
    const onError = vi.fn();
    const instances = vi.fn().mockResolvedValue(items);
    const form = useActionParamForm({ api: () => ({ domains: { materialsV1: { instances }, runtimeV1: {
      endpoints: async () => [{ action_capabilities: [{ device_uuid: "bench", action_name: "load", state: "active", descriptor: detail }] }],
    } } }) as unknown as EdgeApi,
      device: ref("bench"), action: ref("load"), paramJson, siteBindings: bindings, active: () => true, onError });
    await form.reload(); await form.refreshSites();
    paramJson.value = '{"note":"保留"}';
    expect(form.placeholderCurrentValue(SITE)).toBe("T1");
    expect(form.siteStatus(SITE)).toBe("unconfirmed");
    expect(JSON.parse(paramJson.value)).toEqual({ note: "保留" });
    paramJson.value = '{"site":"T1", "note":"保留"}';
    expect(form.placeholderSelectOptions(SITE).map((option) => option.value)).toEqual(["s1"]);
    form.updatePlaceholderValue(SITE, "s1");
    expect(JSON.parse(paramJson.value).site).toBe("T1");
    expect(form.confirmSiteBinding(SITE, "s2")).toBe(false);
    expect(form.confirmSiteBinding(SITE, "s1")).toBe(true);
    expect(JSON.parse(paramJson.value)).toEqual({ site: "s1", note: "保留" });
    expect(form.siteStatus(SITE)).toBe("bound");
    instances.mockRejectedValue(new Error("offline"));
    await form.refreshSites();
    expect(form.siteStatus(SITE)).toBe("unavailable");
    expect(form.activePlaceholderFields.value.map((field) => field.kind)).toContain("site");
    expect(form.confirmSiteBinding(SITE, "s1")).toBe(false);
    expect(JSON.parse(paramJson.value).site).toBe("s1");
  });
});

describe("流程卡片与运行门禁", () => {
  const schemas = new Map([["bench|load", detail]]);
  function graph(): BackendWorkflowGraph {
    return { nodes: [{ uuid: "n1", name: "装载", type: "device_action", action_name: "load", param: { site: "T1" },
      meta_data: { target_device_id: "bench" }, disabled: false }], edges: [], handle_templates: [], node_templates: [] } as unknown as BackendWorkflowGraph;
  }
  it("卡片汇总默认待确认项；确认后归零；请求失败不显示为全部填齐", () => {
    const draft = graph();
    expect(workflowReadiness(draft, schemas, index).missing).toBe(1);
    expect(() => requireWorkflowReady(workflowReadiness(draft, schemas, index))).toThrow("待补全 1 项");
    draft.nodes[0].param = { site: "s1" };
    draft.nodes[0].meta_data.site_bindings = { site: { ...confirmSite("site", "s1", context, index) } };
    expect(workflowReadiness(draft, schemas, index).missing).toBe(0);
    expect(() => requireWorkflowReady(workflowReadiness(draft, schemas, index))).not.toThrow();
    expect(() => requireWorkflowReady(workflowReadiness(draft, new Map(), index))).toThrow("待校验");
    expect(() => requireWorkflowReady(workflowReadiness(draft, schemas, null))).toThrow("待校验");
  });
  it("关闭的父组和真正的数据映射不计入待确认", () => {
    const draft = graph();
    draft.nodes.push({ uuid: "group", type: "group", disabled: true } as typeof draft.nodes[number]);
    draft.nodes[0].parent_uuid = "group";
    expect(workflowReadiness(draft, schemas, index).missing).toBe(0);
    draft.nodes[0].parent_uuid = undefined;
    draft.edges.push({ target_node_uuid: "n1", target_handle_uuid: "h1" } as typeof draft.edges[number]);
    draft.handle_templates.push({ uuid: "h1", data_key: "upstream@@@site" } as typeof draft.handle_templates[number]);
    expect(workflowReadiness(draft, schemas, index).missing).toBe(0);
  });
});
