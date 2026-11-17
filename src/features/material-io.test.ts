import { describe, expect, it } from "vitest";
import {
  defaultMaterialIoData,
  describeMaterialIo,
  materialIoForm,
  materialIoParam,
  materialIoParamError,
} from "./material-io";

const MOUNT = "11111111-0000-4000-8000-0000000000aa";

describe("人工物料节点（material_io）参数", () => {
  it("新放的节点只带模式与确认设置：缺库位与模板时报未完成", () => {
    const data = defaultMaterialIoData("load");
    expect(data).toEqual({ label: "人工装入", param: { mode: "load", timeout_seconds: 3600, assignee_user_ids: [] } });
    expect(materialIoParamError(data.param)).toContain("挂载物料");
    expect(materialIoParamError(data.param)).toContain("资源模板");
  });

  it("装入：按模式只写允许的字段，试剂需要数量、单位与身份", () => {
    const form = materialIoForm(defaultMaterialIoData("load"));
    Object.assign(form, { mount: "deck", site: "A1", resourceTemplate: "tip_box", materialName: "新吸头盒", barcode: "TB-1" });
    expect(materialIoParam(form)).toEqual({
      param: {
        mode: "load", mount: "deck", site: "A1", resource_template: "tip_box", material_name: "新吸头盒", barcode: "TB-1",
        timeout_seconds: 3600, assignee_user_ids: [],
      },
    });
    form.quantity = 20;
    expect(materialIoParam(form).error).toContain("单位");
    form.quantityUnit = "mL";
    expect(materialIoParam(form).error).toContain("名称或 CAS");
    form.reagentName = "乙醇";
    expect(materialIoParam(form).param.reagent).toEqual({ quantity: 20, quantity_unit: "mL", name: "乙醇" });
  });

  it("取走：detach 只能处理物料本身；补量只有数量与单位", () => {
    const unload = materialIoForm({ param: { mode: "unload", mount: "deck", site: "A1", material: "box_1", disposition: "detach", scope: "material_only", assignee_user_ids: ["alice"] } });
    expect(materialIoParam(unload).param).toMatchObject({ mode: "unload", material: "box_1", disposition: "detach", scope: "material_only", assignee_user_ids: ["alice"] });
    unload.scope = "material_with_contents";
    expect(materialIoParam(unload).error).toContain("解除挂载");
    const refill = materialIoForm({ param: { mode: "refill", mount: "deck", site: "B1", material: "bottle", assignee_user_ids: [] } });
    expect(materialIoParam(refill).error).toContain("数量");
    refill.quantity = 5;
    refill.quantityUnit = "mL";
    const built = materialIoParam(refill);
    expect(built.error).toBeUndefined();
    expect(built.param.reagent).toEqual({ quantity: 5, quantity_unit: "mL" });
    expect(built.param).not.toHaveProperty("disposition");
  });

  it("源码 / 模板写出的引用与 reagent 的其余字段原样往返", () => {
    const param = {
      mode: "refill",
      mount: { uuid: MOUNT },
      site: "B1",
      material: { kind: "workflow_input", parameter: "bottle" },
      reagent: { quantity: 20, quantity_unit: "mL" },
      timeout_seconds: 600,
      assignee_user_ids: ["alice", " bob "],
    };
    const built = materialIoParam(materialIoForm({ label: "补量", param }));
    expect(built.error).toBeUndefined();
    expect(built.param).toEqual({ ...param, assignee_user_ids: ["alice", "bob"] });
    const load = { mode: "load", mount: "deck", site: "A1", resource_template: "rack", reagent: { quantity: 1, quantity_unit: "g", reagent_info_uuid: MOUNT, description: "x" }, assignee_user_ids: [] };
    expect(materialIoParam(materialIoForm({ param: load })).param.reagent).toEqual(load.reagent);
  });

  it("摘要：模式、挂载物料 / 库位、物料与数量", () => {
    expect(describeMaterialIo({ mode: "load", mount: "deck", site: "A1", resource_template: "tip_box" })).toBe("装入 · deck / A1 · tip_box");
    expect(describeMaterialIo({ mode: "unload", mount: { uuid: MOUNT }, site: "A1", material: { kind: "node_output", data_key: "material" }, disposition: "soft_delete" }))
      .toBe("取走 · 物料 11111111 / A1 · 上游步骤结果 .material · 软删除");
    expect(describeMaterialIo({ mode: "refill", mount: "deck", site: "B1", material: "bottle", reagent: { quantity: { kind: "workflow_input", parameter: "v" }, quantity_unit: "mL" } }))
      .toBe("补量 · deck / B1 · bottle · 入口参数 v mL");
    expect(describeMaterialIo({})).toBe("人工物料");
  });
});
