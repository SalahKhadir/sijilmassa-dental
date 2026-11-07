/** Shared FDI domain: 32 permanent and 20 temporary teeth. */
export const fdiTeeth = [
  "11", "12", "13", "14", "15", "16", "17", "18",
  "21", "22", "23", "24", "25", "26", "27", "28",
  "31", "32", "33", "34", "35", "36", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48",
  "51", "52", "53", "54", "55",
  "61", "62", "63", "64", "65",
  "71", "72", "73", "74", "75",
  "81", "82", "83", "84", "85",
 ] as const;
export type FdiTooth = (typeof fdiTeeth)[number];
export function isFdiTooth(value: string): value is FdiTooth {
  return fdiTeeth.some(tooth => tooth === value);
}
export const neutralChartMark = { size: 2.4, borderWidth: 0.6 } as const;
export const fdiQuadrants = [
  { prefix: "1", label: "Permanentes — haut droit (H/D)" },
  { prefix: "2", label: "Permanentes — haut gauche (H/G)" },
  { prefix: "4", label: "Permanentes — bas droit (B/D)" },
  { prefix: "3", label: "Permanentes — bas gauche (B/G)" },
  { prefix: "5", label: "Temporaires — haut droit (H/D)" },
  { prefix: "6", label: "Temporaires — haut gauche (H/G)" },
  { prefix: "8", label: "Temporaires — bas droit (B/D)" },
  { prefix: "7", label: "Temporaires — bas gauche (B/G)" },
] as const;
