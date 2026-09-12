export interface CifCell {
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
}

export interface CifAtom {
  label: string;
  element: string;
  x: number;
  y: number;
  z: number;
  occupancy?: number;
  sourceLabel?: string;
  symmetryIndex?: number;
}

export interface CifStructure {
  name: string;
  cell: CifCell;
  atoms: CifAtom[];
  asymmetricAtomCount: number;
  symmetryOperationCount: number;
}

interface CifToken {
  value: string;
  quoted: boolean;
}

interface CifLoop {
  headers: string[];
  rows: string[][];
}

interface SymmetryOperation {
  source: string;
  matrix: [number[], number[], number[]];
  translation: [number, number, number];
}

function parseFraction(value: string): number {
  const normalized = value.trim();
  const fraction = /^([+-]?\d+)\/(\d+)$/.exec(normalized);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) throw new Error(`无法解析 CIF 分数 ${value}`);
    return Number(fraction[1]) / denominator;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`无法解析 CIF 数值 ${value}`);
  return parsed;
}

function numericToken(value: string | undefined): number {
  const normalized = String(value ?? "").replace(/\([^)]*\)$/, "");
  if (!normalized || normalized === "." || normalized === "?") {
    throw new Error(`无法解析 CIF 数值 ${value ?? ""}`);
  }
  return parseFraction(normalized);
}

function tokenizeLine(line: string): CifToken[] {
  const result: CifToken[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    while (/\s/.test(line[cursor] ?? "")) cursor += 1;
    if (cursor >= line.length || line[cursor] === "#") break;
    const quote = line[cursor] === "'" || line[cursor] === '"' ? line[cursor] : "";
    if (quote) {
      cursor += 1;
      const start = cursor;
      while (cursor < line.length && line[cursor] !== quote) cursor += 1;
      result.push({ value: line.slice(start, cursor), quoted: true });
      if (cursor < line.length) cursor += 1;
      continue;
    }
    const start = cursor;
    while (cursor < line.length && !/\s/.test(line[cursor] ?? "") && line[cursor] !== "#") {
      cursor += 1;
    }
    result.push({ value: line.slice(start, cursor), quoted: false });
    if (line[cursor] === "#") break;
  }
  return result;
}

function tokenizeCif(text: string): CifToken[] {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const result: CifToken[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(";")) {
      result.push(...tokenizeLine(line));
      continue;
    }
    const body = [line.slice(1)];
    index += 1;
    while (index < lines.length && !lines[index].startsWith(";")) {
      body.push(lines[index]);
      index += 1;
    }
    result.push({ value: body.join("\n"), quoted: true });
  }
  return result;
}

function isControlToken(token: CifToken): boolean {
  if (token.quoted) return false;
  const lower = token.value.toLowerCase();
  return token.value.startsWith("_") || lower === "loop_" || lower === "stop_" ||
    lower === "global_" || lower.startsWith("data_") || lower.startsWith("save_");
}

function parseDocument(text: string): {
  name: string;
  scalars: Map<string, string>;
  loops: CifLoop[];
} {
  const input = tokenizeCif(text);
  const scalars = new Map<string, string>();
  const loops: CifLoop[] = [];
  let name = "Untitled crystal";
  let cursor = 0;
  while (cursor < input.length) {
    const token = input[cursor];
    const lower = token.value.toLowerCase();
    if (!token.quoted && lower.startsWith("data_")) {
      if (name === "Untitled crystal") name = token.value.slice(5).trim() || name;
      cursor += 1;
      continue;
    }
    if (!token.quoted && token.value.startsWith("_")) {
      const value = input[cursor + 1];
      if (value && !isControlToken(value)) {
        scalars.set(lower, value.value);
        cursor += 2;
      } else {
        cursor += 1;
      }
      continue;
    }
    if (!token.quoted && lower === "loop_") {
      cursor += 1;
      const headers: string[] = [];
      while (cursor < input.length && !input[cursor].quoted && input[cursor].value.startsWith("_")) {
        headers.push(input[cursor].value.toLowerCase());
        cursor += 1;
      }
      if (!headers.length) continue;
      const values: string[] = [];
      while (cursor < input.length) {
        if (isControlToken(input[cursor]) && values.length % headers.length === 0) break;
        values.push(input[cursor].value);
        cursor += 1;
      }
      const rows: string[][] = [];
      for (let offset = 0; offset + headers.length <= values.length; offset += headers.length) {
        rows.push(values.slice(offset, offset + headers.length));
      }
      loops.push({ headers, rows });
      continue;
    }
    cursor += 1;
  }
  return { name, scalars, loops };
}

function scalarNumber(scalars: Map<string, string>, key: string, fallback?: number): number {
  const value = scalars.get(key.toLowerCase());
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`CIF 缺少 ${key}`);
  }
  return numericToken(value);
}

function validateCell(cell: CifCell): void {
  if (cell.a <= 0 || cell.b <= 0 || cell.c <= 0) throw new Error("CIF 晶胞边长必须大于 0");
  for (const [name, angle] of [["alpha", cell.alpha], ["beta", cell.beta], ["gamma", cell.gamma]] as const) {
    if (angle <= 0 || angle >= 180) throw new Error(`CIF 晶胞角 ${name} 必须在 0° 到 180° 之间`);
  }
}

function normalizeElement(value: string): string {
  const match = /[A-Za-z]{1,2}/.exec(value);
  if (!match) return "X";
  return match[0][0].toUpperCase() + match[0].slice(1).toLowerCase();
}

function wrapFractional(value: number): number {
  const wrapped = ((value % 1) + 1) % 1;
  return Math.abs(wrapped - 1) < 1e-8 || Math.abs(wrapped) < 1e-8 ? 0 : wrapped;
}

function parseCoordinateExpression(expression: string): { coefficients: number[]; offset: number } {
  const compact = expression.replace(/\s+/g, "").toLowerCase();
  const terms = compact.replace(/-/g, "+-").split("+").filter(Boolean);
  const coefficients = [0, 0, 0];
  let offset = 0;
  for (const term of terms) {
    const variable = /([xyz])/.exec(term);
    if (!variable) {
      offset += parseFraction(term);
      continue;
    }
    const axis = "xyz".indexOf(variable[1]);
    let coefficientText = term.replace(variable[1], "").replace("*", "");
    let divisor = 1;
    const divisorMatch = /\/(\d+)$/.exec(coefficientText);
    if (divisorMatch) {
      divisor = Number(divisorMatch[1]);
      coefficientText = coefficientText.slice(0, -divisorMatch[0].length);
    }
    let coefficient = coefficientText === "" || coefficientText === "+" ? 1
      : coefficientText === "-" ? -1
        : parseFraction(coefficientText);
    coefficient /= divisor;
    coefficients[axis] += coefficient;
  }
  return { coefficients, offset };
}

function parseSymmetryOperation(source: string): SymmetryOperation {
  const coordinates = source.split(",").map((item) => item.trim());
  if (coordinates.length !== 3) throw new Error(`无法解析 CIF 对称操作 ${source}`);
  const parsed = coordinates.map(parseCoordinateExpression);
  return {
    source,
    matrix: [parsed[0].coefficients, parsed[1].coefficients, parsed[2].coefficients],
    translation: [parsed[0].offset, parsed[1].offset, parsed[2].offset],
  };
}

function symmetrySources(scalars: Map<string, string>, loops: CifLoop[]): string[] {
  const keys = [
    "_space_group_symop_operation_xyz",
    "_space_group_symop.operation_xyz",
    "_symmetry_equiv_pos_as_xyz",
  ];
  const result: string[] = [];
  for (const key of keys) {
    const scalar = scalars.get(key);
    if (scalar) result.push(scalar);
  }
  for (const loop of loops) {
    const column = keys.map((key) => loop.headers.indexOf(key)).find((index) => index >= 0) ?? -1;
    if (column >= 0) result.push(...loop.rows.map((row) => row[column]).filter(Boolean));
  }
  return result.length ? [...new Set(result)] : ["x,y,z"];
}

function expandSymmetry(atoms: CifAtom[], operations: SymmetryOperation[]): CifAtom[] {
  const result: CifAtom[] = [];
  const seen = new Set<string>();
  for (const atom of atoms) {
    for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
      const operation = operations[operationIndex];
      const input = [atom.x, atom.y, atom.z];
      const output = operation.matrix.map((row, rowIndex) =>
        wrapFractional(row.reduce((sum, coefficient, axis) => sum + coefficient * input[axis], operation.translation[rowIndex])),
      );
      const key = `${atom.element}:${output.map((value) => Math.round(value * 1e6)).join(":")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        ...atom,
        label: operationIndex === 0 ? atom.label : `${atom.label}·${operationIndex + 1}`,
        sourceLabel: atom.label,
        symmetryIndex: operationIndex,
        x: output[0],
        y: output[1],
        z: output[2],
      });
      if (result.length > 50_000) throw new Error("CIF 对称展开超过 50000 个原子，无法在浏览器中预览");
    }
  }
  return result;
}

function parseAtoms(loops: CifLoop[], cell: CifCell): CifAtom[] {
  const atoms: CifAtom[] = [];
  for (const loop of loops) {
    const labelIndex = loop.headers.indexOf("_atom_site_label");
    const symbolIndex = loop.headers.indexOf("_atom_site_type_symbol");
    const occupancyIndex = loop.headers.indexOf("_atom_site_occupancy");
    const fractional = ["_atom_site_fract_x", "_atom_site_fract_y", "_atom_site_fract_z"]
      .map((header) => loop.headers.indexOf(header));
    const cartesian = ["_atom_site_cartn_x", "_atom_site_cartn_y", "_atom_site_cartn_z"]
      .map((header) => loop.headers.indexOf(header));
    const usesFractional = fractional.every((index) => index >= 0);
    const usesCartesian = cartesian.every((index) => index >= 0);
    if (!usesFractional && !usesCartesian) continue;
    for (const row of loop.rows) {
      const label = row[labelIndex] || `Atom${atoms.length + 1}`;
      const coordinates = (usesFractional ? fractional : cartesian).map((index) => numericToken(row[index]));
      const point = usesFractional
        ? { x: coordinates[0], y: coordinates[1], z: coordinates[2] }
        : cartesianToFractional(cell, { x: coordinates[0], y: coordinates[1], z: coordinates[2] });
      atoms.push({
        label,
        element: normalizeElement(row[symbolIndex] || label),
        x: point.x,
        y: point.y,
        z: point.z,
        occupancy: occupancyIndex >= 0 && ![".", "?"].includes(row[occupancyIndex])
          ? numericToken(row[occupancyIndex])
          : undefined,
      });
    }
  }
  if (!atoms.length) throw new Error("CIF 中没有可识别的原子分数坐标或笛卡尔坐标 loop");
  return atoms;
}

export function parseCif(text: string): CifStructure {
  const document = parseDocument(text);
  const cell: CifCell = {
    a: scalarNumber(document.scalars, "_cell_length_a"),
    b: scalarNumber(document.scalars, "_cell_length_b"),
    c: scalarNumber(document.scalars, "_cell_length_c"),
    alpha: scalarNumber(document.scalars, "_cell_angle_alpha", 90),
    beta: scalarNumber(document.scalars, "_cell_angle_beta", 90),
    gamma: scalarNumber(document.scalars, "_cell_angle_gamma", 90),
  };
  validateCell(cell);
  const asymmetricAtoms = parseAtoms(document.loops, cell);
  const operations = symmetrySources(document.scalars, document.loops).map(parseSymmetryOperation);
  return {
    name: document.name,
    cell,
    atoms: expandSymmetry(asymmetricAtoms, operations),
    asymmetricAtomCount: asymmetricAtoms.length,
    symmetryOperationCount: operations.length,
  };
}

export function fractionalToCartesian(cell: CifCell, atom: Pick<CifAtom, "x" | "y" | "z">) {
  const rad = (degree: number) => (degree * Math.PI) / 180;
  const ca = Math.cos(rad(cell.alpha));
  const cb = Math.cos(rad(cell.beta));
  const cg = Math.cos(rad(cell.gamma));
  const sg = Math.sin(rad(cell.gamma));
  if (Math.abs(sg) < 1e-10) throw new Error("CIF gamma 角导致晶胞基矢退化");
  const zFactor = Math.sqrt(Math.max(0, 1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg));
  return {
    x: cell.a * atom.x + cell.b * cg * atom.y + cell.c * cb * atom.z,
    y: cell.b * sg * atom.y + cell.c * ((ca - cb * cg) / sg) * atom.z,
    z: cell.c * (zFactor / sg) * atom.z,
  };
}

export function cartesianToFractional(cell: CifCell, point: { x: number; y: number; z: number }) {
  const origin = fractionalToCartesian(cell, { x: 0, y: 0, z: 0 });
  const a = fractionalToCartesian(cell, { x: 1, y: 0, z: 0 });
  const b = fractionalToCartesian(cell, { x: 0, y: 1, z: 0 });
  const c = fractionalToCartesian(cell, { x: 0, y: 0, z: 1 });
  const z = (point.z - origin.z) / c.z;
  const y = (point.y - origin.y - c.y * z) / b.y;
  const x = (point.x - origin.x - b.x * y - c.x * z) / a.x;
  return { x, y, z };
}

export function expandBoundaryAtoms(atoms: CifAtom[], tolerance = 1e-6): CifAtom[] {
  const result: CifAtom[] = [];
  const seen = new Set<string>();
  for (const atom of atoms) {
    const choices = [atom.x, atom.y, atom.z].map((value) =>
      Math.abs(wrapFractional(value)) <= tolerance ? [0, 1] : [wrapFractional(value)],
    );
    for (const x of choices[0]) for (const y of choices[1]) for (const z of choices[2]) {
      const key = `${atom.element}:${Math.round(x * 1e6)}:${Math.round(y * 1e6)}:${Math.round(z * 1e6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ ...atom, label: atom.label, x, y, z });
    }
  }
  return result;
}
