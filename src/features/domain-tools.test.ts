import { describe, expect, it } from "vitest";
import { analyzeDna, calculatePcrMix } from "./biology";
import { calculateFormula } from "./chemistry";
import { expandBoundaryAtoms, fractionalToCartesian, parseCif } from "./cif";
import { calculateCifRenderViewport } from "./cif-render";
import { isLabThemeId } from "./domain-themes";
import { buildWorkflowPrintDocument } from "./workflow-print";

describe("有机主题：摩尔质量", () => {
  it("支持括号、Unicode 下标与水合物系数", () => {
    expect(calculateFormula("H₂O").molarMass).toBeCloseTo(18.015, 3);
    expect(calculateFormula("Ca(OH)2").molarMass).toBeCloseTo(74.092, 3);
    const hydrate = calculateFormula("CuSO4·5H2O");
    expect(hydrate.molarMass).toBeCloseTo(249.677, 3);
    expect(hydrate.composition.find((item) => item.element === "H")?.count).toBe(10);
  });

  it("未知元素给出可解释错误", () => {
    expect(() => calculateFormula("Xx2")).toThrow("暂不支持元素 Xx");
  });
});

describe("生物主题：序列与 PCR", () => {
  it("计算 GC、反向互补链和 frame +1 翻译", () => {
    const result = analyzeDna("ATG GCC TAA");
    expect(result.length).toBe(9);
    expect(result.gcPercent).toBeCloseTo(44.444, 3);
    expect(result.reverseComplement).toBe("TTAGGCCAT");
    expect(result.translation).toBe("MA*");
  });

  it("按反应数和余量生成 Master Mix", () => {
    const rows = calculatePcrMix({
      reactions: 10,
      overagePercent: 10,
      reactionVolume: 25,
      masterMix: 12.5,
      forwardPrimer: 0.5,
      reversePrimer: 0.5,
      template: 1,
    });
    const water = rows.find((row) => row.name === "Nuclease-free water");
    expect(water?.perReaction).toBe(10.5);
    expect(water?.total).toBeCloseTo(115.5, 5);
  });
});

describe("材料主题：CIF", () => {
  const cif = `data_Si
_cell_length_a 5.43
_cell_length_b 5.43
_cell_length_c 5.43
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Si1 Si 0 0 0
Si2 Si 0.25 0.25 0.25`;

  it("解析晶胞与原子分数坐标", () => {
    const structure = parseCif(cif);
    expect(structure.name).toBe("Si");
    expect(structure.cell.alpha).toBe(90);
    expect(structure.atoms).toHaveLength(2);
    expect(structure.atoms[1]).toMatchObject({ element: "Si", x: 0.25, y: 0.25, z: 0.25 });
  });

  it("把正交晶胞的分数坐标转换成笛卡尔坐标", () => {
    const point = fractionalToCartesian(parseCif(cif).cell, { x: 0.5, y: 0.5, z: 0.5 });
    expect(point.x).toBeCloseTo(2.715, 5);
    expect(point.y).toBeCloseTo(2.715, 5);
    expect(point.z).toBeCloseTo(2.715, 5);
  });

  it("读取跨行 loop token，并按空间群操作展开去重", () => {
    const symmetric = `data_symmetry_test
_cell_length_a 4
_cell_length_b 5
_cell_length_c 6
loop_
_space_group_symop_operation_xyz
'x,y,z'
'-x,-y,-z'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
C1 C
0.1 0.2 0.3`;
    const structure = parseCif(symmetric);
    expect(structure.asymmetricAtomCount).toBe(1);
    expect(structure.symmetryOperationCount).toBe(2);
    expect(structure.atoms).toHaveLength(2);
    expect(structure.atoms[1]).toMatchObject({ element: "C", x: 0.9, y: 0.8, z: 0.7 });
  });

  it("为晶胞边界上的原子生成可见周期镜像", () => {
    const atoms = expandBoundaryAtoms([
      { label: "Na1", element: "Na", x: 0, y: 0, z: 0 },
    ]);
    expect(atoms).toHaveLength(8);
    expect(atoms.some((atom) => atom.x === 1 && atom.y === 1 && atom.z === 1)).toBe(true);
  });

  it.each([
    [280, 360, 28, 38],
    [390, 430, 28, 38],
    [640, 460, 48, 44],
  ])("为 %ipx 容器生成 1:1 SVG viewport", (width, height, horizontalPadding, verticalPadding) => {
    expect(calculateCifRenderViewport(width)).toEqual({
      width,
      height,
      horizontalPadding,
      verticalPadding,
      viewBox: `0 0 ${width} ${height}`,
    });
  });

  it("极窄容器不再强制使用 240px viewBox", () => {
    const viewport = calculateCifRenderViewport(120);
    expect(viewport.width).toBe(120);
    expect(viewport.viewBox).toBe("0 0 120 360");
    expect(viewport.horizontalPadding).toBe(12);
  });
});

describe("领域切换与实验执行单", () => {
  it("只接受三套公开领域主题", () => {
    expect(isLabThemeId("organic")).toBe(true);
    expect(isLabThemeId("biology")).toBe(true);
    expect(isLabThemeId("materials")).toBe(true);
    expect(isLabThemeId("clinical")).toBe(false);
  });

  it("打印文档包含权威 Task 标识并转义动态文本", () => {
    const html = buildWorkflowPrintDocument({
      domainName: "有机合成",
      workflowName: "<script>alert(1)</script>",
      workflowUuid: "wf-1",
      taskUuid: "task-real-1",
      runMode: "normal",
      status: "pending",
      tags: ["scale-up", "<unsafe>"],
      createdAt: "2026-08-20T08:00:00.000Z",
    });
    expect(html).toContain("task-real-1");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;unsafe&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
