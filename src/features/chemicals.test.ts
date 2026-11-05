import { describe, expect, it } from "vitest";
import { ApiError, BackendBusinessError, type Chemical } from "@openlab/protocol";
import {
  casProblem,
  checkChemicalForm,
  chemicalForm,
  chemicalPatchFromForm,
  chemicalSummaryText,
  chemicalWriteFromForm,
  describeChemicalError,
  inchiKeyProblem,
  normalizeAliases,
} from "./chemicals";

const ETHANOL: Chemical = {
  chemical_uuid: "c-eth", name: "乙醇", name_en: "Ethanol", aliases: ["酒精", "EtOH"], cas: "64-17-5",
  inchi_key: "LFQSCWFLJHTTHZ-UHFFFAOYSA-N", molecular_formula: "C2H6O", smiles: "CCO", molecular_weight: 46.07,
  density_g_per_ml: 0.789, physical_state: "liquid", description: "", meta_data: {}, created_at_ms: 1, updated_at_ms: 2, version: 3,
};
const business = (code: number, msg: string) => new BackendBusinessError({ code, error: { msg } });

describe("CAS / InChIKey 本地检查（与后端同一规则）", () => {
  it("CAS：格式 + 校验位；空串视为未填", () => {
    expect(casProblem("7732-18-5")).toBeNull();
    expect(casProblem(" 64-17-5 ")).toBeNull();
    expect(casProblem("7440-44-0")).toBeNull();
    expect(casProblem("7732-18-4")).toBe("校验位不正确（应为 5）");
    expect(casProblem("water")).toMatch(/格式/);
    expect(casProblem("1-1-1")).toMatch(/格式/);
    expect(casProblem("")).toBeNull();
  });

  it("InChIKey：27 位标准格式，大小写不敏感", () => {
    expect(inchiKeyProblem("xlyofnoqvpjjnp-uhfffaoysa-n")).toBeNull();
    expect(inchiKeyProblem("not-a-key")).toMatch(/27 位/);
    expect(inchiKeyProblem("  ")).toBeNull();
  });
});

describe("化学品表单", () => {
  it("提交前检查：名称必填、正数、CAS / InChIKey", () => {
    const form = { ...chemicalForm(null), cas: "7732-18-4", inchi_key: "x", molecular_weight: 0, density_g_per_ml: -1 };
    expect(Object.keys(checkChemicalForm(form).errors).sort()).toEqual(["cas", "density_g_per_ml", "inchi_key", "molecular_weight", "name"]);
    expect(checkChemicalForm(chemicalForm(ETHANOL)).errors).toEqual({});
  });

  it("新建：去空白、空串变 null、别名去重、InChIKey 大写", () => {
    const body = chemicalWriteFromForm({
      ...chemicalForm(null), name: " 水 ", name_en: " ", aliases: [" H2O ", "H2O", ""], cas: "7732-18-5",
      inchi_key: "xlyofnoqvpjjnp-uhfffaoysa-n", molecular_weight: 18.015, physical_state: "liquid",
    });
    expect(body).toEqual({
      name: "水", name_en: null, aliases: ["H2O"], cas: "7732-18-5", inchi_key: "XLYOFNOQVPJJNP-UHFFFAOYSA-N",
      molecular_formula: null, smiles: null, molecular_weight: 18.015, density_g_per_ml: null, physical_state: "liquid", description: "",
    });
    expect(normalizeAliases(["a", " a", "b "])).toEqual(["a", "b"]);
  });

  it("编辑：只提交改动的字段并带 expected_version；没改动返回 null", () => {
    expect(chemicalPatchFromForm(ETHANOL, chemicalForm(ETHANOL))).toBeNull();
    const patch = chemicalPatchFromForm(ETHANOL, { ...chemicalForm(ETHANOL), density_g_per_ml: 0.79, aliases: ["酒精"], cas: "" });
    expect(patch).toEqual({ expected_version: 3, density_g_per_ml: 0.79, aliases: ["酒精"], cas: null });
  });

  it("版本过期后重试：改动按打开时的快照比较，只换 expected_version（不覆盖别人改的字段）", () => {
    const form = { ...chemicalForm(ETHANOL), density_g_per_ml: 0.79 };
    // 别人在这期间改了说明（版本 4）；重试时表单里旧的说明不能被当成改动
    expect(chemicalPatchFromForm(ETHANOL, form, 4)).toEqual({ expected_version: 4, density_g_per_ml: 0.79 });
  });
});

describe("后端错误指回字段", () => {
  it("1000 校验：按消息定位 CAS / InChIKey / 正数 / 名称", () => {
    expect(describeChemicalError(business(1000, "CAS 登记号校验位不正确：'7732-18-4'"))).toEqual({ message: "CAS 登记号校验位不正确：'7732-18-4'", field: "cas" });
    expect(describeChemicalError(business(1000, "InChIKey 格式不正确：'x'"))?.field).toBe("inchi_key");
    expect(describeChemicalError(business(1000, "molecular_weight 必须是正数"))?.field).toBe("molecular_weight");
    expect(describeChemicalError(business(1000, "name 不能为空"))?.field).toBe("name");
  });

  it("3003：重复 CAS / InChIKey 指向字段，版本过期提示刷新；3002 已删除", () => {
    expect(describeChemicalError(business(3003, "已有相同 CAS 登记号的化学品"))).toMatchObject({ field: "cas", conflict: true });
    expect(describeChemicalError(business(3003, "已有相同 InChIKey 的化学品"))).toMatchObject({ field: "inchi_key", conflict: true });
    const stale = describeChemicalError(business(3003, "化学品已被修改，请刷新后重试"));
    expect(stale).toMatchObject({ conflict: true });
    expect(stale?.field).toBeUndefined();
    expect(describeChemicalError(business(3002, "化学品 x 不存在"))).toMatchObject({ conflict: true });
  });

  it("FastAPI 422 字段校验按 loc 定位；其他错误交给通用处理", () => {
    const error = new ApiError(422, "Input should be greater than 0", {
      detail: [{ loc: ["body", "molecular_weight"], msg: "Input should be greater than 0", type: "greater_than" }],
    });
    expect(describeChemicalError(error)).toEqual({ message: "必须是正数", field: "molecular_weight" });
    expect(describeChemicalError(new ApiError(0, "offline"))).toBeNull();
    expect(describeChemicalError(new Error("x"))).toBeNull();
  });
});

describe("摘要展示", () => {
  it("缺的项省略", () => {
    expect(chemicalSummaryText(ETHANOL)).toBe("乙醇 · CAS 64-17-5 · C2H6O · 46.07 g/mol");
    expect(chemicalSummaryText({ name: "未知样品", cas: null, molecular_formula: null, molecular_weight: null })).toBe("未知样品");
  });
});
