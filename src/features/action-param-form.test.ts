/**
 * 出库（deduct）数量循环逻辑单测：
 * - 数量 >1 时循环调 instantiate 并自动加 -1/-2… 序号后缀；
 * - barcode 仅数量为 1 时随请求下发；
 * - 逐个失败即时提示，成功后有汇总消息，参数写回第一个成功实例。
 */
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { EdgeApi } from "@openlab/protocol";
import type { PlaceholderField } from "./action-placeholders";
import { useActionParamForm } from "./action-param-form";

const DEDUCT_FIELD: PlaceholderField = {
  param: "resource",
  placeholder: "unilabos_deduct_resource",
  kind: "deduct",
  multiple: false,
};

const CONFIRM_FIELD: PlaceholderField = {
  param: "assignee_user_ids",
  placeholder: "unilabos_manual_confirm",
  kind: "confirm",
  multiple: true,
};

type InstantiateMock = (
  cls: string,
  name: string,
  barcode?: string,
) => Promise<ReturnType<typeof makeTree>>;

/** 权威返回的树：物料 name = uuid，人读标签在 display_name，resource_id 取 PLR 根名。 */
function makeTree(name: string) {
  const uuid = `uuid-${name}`;
  return {
    data: {
      root_material_uuid: uuid,
      nodes: [{ material: { material_uuid: uuid, name: uuid, display_name: name, resource_id: `rid-${name}` } }],
    },
  };
}

function setup(instantiate: ReturnType<typeof vi.fn<InstantiateMock>>) {
  const paramJson = ref('{"resource": {}}');
  const onError = vi.fn();
  const onSuccess = vi.fn();
  const form = useActionParamForm({
    api: () =>
      ({
        domains: { inventory: { instantiate } },
      }) as unknown as EdgeApi,
    device: ref("dev-1"),
    action: ref("act"),
    paramJson,
    active: () => true,
    onError,
    onSuccess,
  });
  return { form, paramJson, onError, onSuccess };
}

describe("submitDeduct 数量循环", () => {
  it("数量 3：循环出库并加序号后缀，汇总成功消息，写回第一个实例", async () => {
    const instantiate = vi.fn<InstantiateMock>((_cls, name) =>
      Promise.resolve(makeTree(name)),
    );
    const { form, paramJson, onError, onSuccess } = setup(instantiate);
    const draft = form.deductDraftFor("resource");
    draft.registryClass = "test_class";
    draft.name = "rack";
    draft.quantity = 3;
    await form.submitDeduct(DEDUCT_FIELD);

    expect(instantiate).toHaveBeenCalledTimes(3);
    expect(instantiate.mock.calls.map((call) => call[1])).toEqual([
      "rack-1",
      "rack-2",
      "rack-3",
    ]);
    // 数量 >1 时不带 barcode
    expect(instantiate.mock.calls.every((call) => call[2] === undefined)).toBe(
      true,
    );
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith("出库完成：成功 3/3 个");
    const param = JSON.parse(paramJson.value) as {
      resource: { id: string; uuid: string };
    };
    // 引用写 uuid + resource_id，不再把物料 name（= uuid）当 id
    expect(param.resource).toEqual({ id: "rid-rack-1", uuid: "uuid-rack-1" });
  });

  it("数量 1：不加序号后缀且 barcode 随请求下发", async () => {
    const instantiate = vi.fn<InstantiateMock>((_cls, name) =>
      Promise.resolve(makeTree(name)),
    );
    const { form, onSuccess } = setup(instantiate);
    const draft = form.deductDraftFor("resource");
    draft.registryClass = "test_class";
    draft.name = "rack";
    draft.barcode = "BC-001";
    await form.submitDeduct(DEDUCT_FIELD);

    expect(instantiate).toHaveBeenCalledTimes(1);
    expect(instantiate.mock.calls[0][1]).toBe("rack");
    expect(instantiate.mock.calls[0][2]).toBe("BC-001");
    expect(onSuccess).toHaveBeenCalledWith("已出库：rack");
  });

  it("部分失败：逐个报错并在汇总消息中体现失败数", async () => {
    const instantiate = vi.fn<InstantiateMock>((_cls, name) =>
      name === "rack-2"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve(makeTree(name)),
    );
    const { form, onError, onSuccess } = setup(instantiate);
    const draft = form.deductDraftFor("resource");
    draft.registryClass = "test_class";
    draft.name = "rack";
    draft.quantity = 3;
    await form.submitDeduct(DEDUCT_FIELD);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toContain("rack-2");
    expect(onSuccess).toHaveBeenCalledWith("出库完成：成功 2/3 个，失败 1 个");
  });

  it("multiple 字段：全部成功实例以引用数组追加写回", async () => {
    const instantiate = vi.fn<InstantiateMock>((_cls, name) =>
      Promise.resolve(makeTree(name)),
    );
    const { form, paramJson } = setup(instantiate);
    paramJson.value = '{"resource": []}';
    const draft = form.deductDraftFor("resource");
    draft.registryClass = "test_class";
    draft.name = "rack";
    draft.quantity = 2;
    await form.submitDeduct({ ...DEDUCT_FIELD, multiple: true });

    const param = JSON.parse(paramJson.value) as {
      resource: { id: string; uuid: string }[];
    };
    expect(param.resource).toEqual([
      { id: "rid-rack-1", uuid: "uuid-rack-1" },
      { id: "rid-rack-2", uuid: "uuid-rack-2" },
    ]);
  });
});

describe("manual_confirm 指派列表语义", () => {
  it("区分字段缺失与显式空列表，并允许通过表单写入 []", () => {
    const instantiate = vi.fn<InstantiateMock>((_cls, name) =>
      Promise.resolve(makeTree(name)),
    );
    const { form, paramJson } = setup(instantiate);

    expect(form.placeholderHasExplicitValue(CONFIRM_FIELD)).toBe(false);
    paramJson.value = '{"assignee_user_ids": []}';
    expect(form.placeholderHasExplicitValue(CONFIRM_FIELD)).toBe(true);
    expect(form.placeholderCurrentValue(CONFIRM_FIELD)).toEqual([]);

    form.updatePlaceholderValue(CONFIRM_FIELD, []);
    expect(JSON.parse(paramJson.value)).toEqual({ assignee_user_ids: [] });
    expect(form.placeholderHasExplicitValue(CONFIRM_FIELD)).toBe(true);
  });
});

describe("动作参数表单不替没给值的参数编值", () => {
  /** volume_ml / label / dry 必填且没有默认值；speed 有默认值；solvent 是对象（只能在高级 JSON 里填）。 */
  const capability = {
    device_uuid: "reactor",
    action_name: "aliquot",
    state: "active",
    availability: "free",
    descriptor: {
      goal_default: { speed: 300 },
      schema: {
        properties: {
          goal: {
            type: "object",
            properties: {
              volume_ml: { type: "number" },
              label: { anyOf: [{ type: "string" }, { type: "null" }] },
              dry: { type: "boolean" },
              solvent: { type: "object" },
              speed: { type: "integer", default: 300 },
            },
            required: ["volume_ml", "label", "dry", "solvent"],
          },
        },
      },
    },
  };

  function setupSchema(paramText: string, isFocused?: (path: string) => boolean) {
    const paramJson = ref(paramText);
    const form = useActionParamForm({
      api: () => ({ domains: { runtimeV1: { endpoints: async () => [{ action_capabilities: [capability] }] } } }) as unknown as EdgeApi,
      device: ref("reactor"),
      action: ref("aliquot"),
      paramJson,
      active: () => true,
      isFocused,
    });
    return { form, paramJson };
  }

  it("schema 里有、参数里还没有的参数列成空字段（类型取 schema），参数本身不写值", async () => {
    const { form, paramJson } = setupSchema('{"speed": 300}');
    await form.reload();
    expect(form.paramFields.value.map((field) => [field.path, field.type, field.value])).toEqual([
      ["volume_ml", "number", null],
      ["label", "string", null],
      ["dry", "boolean", null],
      ["speed", "number", 300],
    ]);
    expect(JSON.parse(paramJson.value)).toEqual({ speed: 300 });
    expect([form.fieldRequired("volume_ml"), form.fieldRequired("speed")]).toEqual([true, false]);
  });

  it("清空字段 = 删掉这个键；折叠时必填的空字段照样显示", async () => {
    const { form, paramJson } = setupSchema('{"volume_ml": 2, "label": "S-1", "speed": 300}', () => false);
    await form.reload();
    form.updateField(form.paramFields.value.find((field) => field.path === "volume_ml")!, null);
    form.updateField(form.paramFields.value.find((field) => field.path === "label")!, "");
    expect(JSON.parse(paramJson.value)).toEqual({ speed: 300 });
    expect(form.visibleParamFields.value.map((field) => field.path)).toEqual(["volume_ml", "label", "dry"]);
    expect(form.collapsedParamCount.value).toBe(1);
  });
});
