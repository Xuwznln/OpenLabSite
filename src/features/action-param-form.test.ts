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

function makeTree(name: string) {
  const uuid = `uuid-${name}`;
  return {
    data: {
      root_material_uuid: uuid,
      nodes: [{ material: { material_uuid: uuid, name } }],
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
        domains: { materialsV1: { instantiate } },
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
    expect(param.resource).toEqual({ id: "rack-1", uuid: "uuid-rack-1" });
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
      { id: "rack-1", uuid: "uuid-rack-1" },
      { id: "rack-2", uuid: "uuid-rack-2" },
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
