const CODONS: Record<string, string> = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L", CTT: "L", CTC: "L", CTA: "L", CTG: "L",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M", GTT: "V", GTC: "V", GTA: "V", GTG: "V",
  TCT: "S", TCC: "S", TCA: "S", TCG: "S", CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  ACT: "T", ACC: "T", ACA: "T", ACG: "T", GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*", CAT: "H", CAC: "H", CAA: "Q", CAG: "Q",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K", GAT: "D", GAC: "D", GAA: "E", GAG: "E",
  TGT: "C", TGC: "C", TGA: "*", TGG: "W", CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  AGT: "S", AGC: "S", AGA: "R", AGG: "R", GGT: "G", GGC: "G", GGA: "G", GGG: "G",
};

export interface SequenceAnalysis {
  sequence: string;
  length: number;
  gcPercent: number;
  meltingTemperature: number;
  reverseComplement: string;
  translation: string;
}

export function analyzeDna(raw: string): SequenceAnalysis {
  const sequence = raw.toUpperCase().replace(/[\s\d-]/g, "");
  if (!sequence) throw new Error("请输入 DNA 序列");
  const invalid = [...new Set(sequence.replace(/[ATGCN]/g, ""))];
  if (invalid.length) throw new Error(`包含不支持的碱基：${invalid.join("、")}`);
  const a = (sequence.match(/A/g) ?? []).length;
  const t = (sequence.match(/T/g) ?? []).length;
  const g = (sequence.match(/G/g) ?? []).length;
  const c = (sequence.match(/C/g) ?? []).length;
  const known = a + t + g + c;
  const gcPercent = known ? ((g + c) / known) * 100 : 0;
  const meltingTemperature = known < 14
    ? 2 * (a + t) + 4 * (g + c)
    : 64.9 + (41 * (g + c - 16.4)) / known;
  const complement: Record<string, string> = { A: "T", T: "A", G: "C", C: "G", N: "N" };
  const reverseComplement = [...sequence].reverse().map((base) => complement[base]).join("");
  let translation = "";
  for (let index = 0; index + 2 < sequence.length; index += 3) {
    translation += CODONS[sequence.slice(index, index + 3)] ?? "X";
  }
  return { sequence, length: sequence.length, gcPercent, meltingTemperature, reverseComplement, translation };
}

export interface PcrMixInput {
  reactions: number;
  overagePercent: number;
  reactionVolume: number;
  masterMix: number;
  forwardPrimer: number;
  reversePrimer: number;
  template: number;
}

export function calculatePcrMix(input: PcrMixInput) {
  const multiplier = Math.ceil(input.reactions * (1 + input.overagePercent / 100) * 100) / 100;
  const water = input.reactionVolume - input.masterMix - input.forwardPrimer - input.reversePrimer - input.template;
  if (water < 0) throw new Error("各组分体积之和超过单反应总体积");
  return [
    ["2× Master Mix", input.masterMix],
    ["Forward primer", input.forwardPrimer],
    ["Reverse primer", input.reversePrimer],
    ["Template DNA", input.template],
    ["Nuclease-free water", water],
  ].map(([name, perReaction]) => ({
    name: String(name),
    perReaction: Number(perReaction),
    total: Number(perReaction) * multiplier,
  }));
}
