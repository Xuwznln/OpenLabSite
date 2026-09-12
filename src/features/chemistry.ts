export const ATOMIC_WEIGHTS: Record<string, number> = {
  H: 1.008,
  He: 4.0026,
  Li: 6.94,
  Be: 9.0122,
  B: 10.81,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  F: 18.998,
  Ne: 20.18,
  Na: 22.99,
  Mg: 24.305,
  Al: 26.982,
  Si: 28.085,
  P: 30.974,
  S: 32.06,
  Cl: 35.45,
  Ar: 39.948,
  K: 39.0983,
  Ca: 40.078,
  Sc: 44.956,
  Ti: 47.867,
  V: 50.942,
  Cr: 51.996,
  Mn: 54.938,
  Fe: 55.845,
  Co: 58.933,
  Ni: 58.693,
  Cu: 63.546,
  Zn: 65.38,
  Ga: 69.723,
  Ge: 72.63,
  As: 74.922,
  Se: 78.971,
  Br: 79.904,
  Kr: 83.798,
  Rb: 85.468,
  Sr: 87.62,
  Y: 88.906,
  Zr: 91.224,
  Nb: 92.906,
  Mo: 95.95,
  Ru: 101.07,
  Rh: 102.906,
  Pd: 106.42,
  Ag: 107.8682,
  Cd: 112.414,
  In: 114.818,
  Sn: 118.71,
  Sb: 121.76,
  Te: 127.6,
  I: 126.904,
  Cs: 132.905,
  Ba: 137.327,
  La: 138.905,
  Ce: 140.116,
  W: 183.84,
  Pt: 195.084,
  Au: 196.967,
  Hg: 200.592,
  Pb: 207.2,
};

export interface FormulaResult {
  formula: string;
  molarMass: number;
  composition: { element: string; count: number; mass: number; percent: number }[];
}

const SUBSCRIPT: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

function normalizeFormula(value: string): string {
  return value
    .trim()
    .replace(/[₀-₉]/g, (char) => SUBSCRIPT[char] ?? char)
    .replace(/[\[\{]/g, "(")
    .replace(/[\]\}]/g, ")")
    .replace(/\s+/g, "");
}

function addCounts(target: Map<string, number>, source: Map<string, number>, multiplier = 1) {
  for (const [element, count] of source) {
    target.set(element, (target.get(element) ?? 0) + count * multiplier);
  }
}

function readNumber(input: string, cursor: { value: number }): number {
  const start = cursor.value;
  while (/\d/.test(input[cursor.value] ?? "")) cursor.value += 1;
  return cursor.value === start ? 1 : Number(input.slice(start, cursor.value));
}

function parseGroup(input: string, cursor: { value: number }, nested = false): Map<string, number> {
  const counts = new Map<string, number>();
  while (cursor.value < input.length) {
    const char = input[cursor.value];
    if (char === ")") {
      if (!nested) throw new Error("化学式中存在多余的右括号");
      cursor.value += 1;
      return counts;
    }
    if (char === "(") {
      cursor.value += 1;
      const group = parseGroup(input, cursor, true);
      addCounts(counts, group, readNumber(input, cursor));
      continue;
    }
    const match = /^[A-Z][a-z]?/.exec(input.slice(cursor.value));
    if (!match) throw new Error(`无法识别“${char}”（位置 ${cursor.value + 1}）`);
    const element = match[0];
    if (!(element in ATOMIC_WEIGHTS)) throw new Error(`暂不支持元素 ${element}`);
    cursor.value += element.length;
    counts.set(element, (counts.get(element) ?? 0) + readNumber(input, cursor));
  }
  if (nested) throw new Error("化学式缺少右括号");
  return counts;
}

export function calculateFormula(rawFormula: string): FormulaResult {
  const formula = normalizeFormula(rawFormula);
  if (!formula) throw new Error("请输入化学式");
  const totals = new Map<string, number>();
  for (const rawPart of formula.split(/[·•]/)) {
    if (!rawPart) throw new Error("水合点两侧都需要化学式");
    const coefficientMatch = /^\d+/.exec(rawPart);
    const coefficient = coefficientMatch ? Number(coefficientMatch[0]) : 1;
    const part = coefficientMatch ? rawPart.slice(coefficientMatch[0].length) : rawPart;
    const cursor = { value: 0 };
    const counts = parseGroup(part, cursor);
    if (cursor.value !== part.length) throw new Error("化学式没有完整解析");
    addCounts(totals, counts, coefficient);
  }
  const masses = [...totals].map(([element, count]) => ({
    element,
    count,
    mass: ATOMIC_WEIGHTS[element] * count,
  }));
  const molarMass = masses.reduce((sum, item) => sum + item.mass, 0);
  return {
    formula,
    molarMass,
    composition: masses.map((item) => ({
      ...item,
      percent: (item.mass / molarMass) * 100,
    })),
  };
}
