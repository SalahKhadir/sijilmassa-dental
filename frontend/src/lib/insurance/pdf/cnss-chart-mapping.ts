/** Centres des dents du scan CNSS, en points visuels (origine haut-gauche).
 * Relevé Poppler à 4000 px de large, recadrage x=2650, y=1150, 800×1100.
 * Quadrants mesurés séparément : aucune symétrie géométrique supposée.
 * D/G désignent la droite/gauche du patient ; H/B l’arcade supérieure/inférieure.
 */
export const cnssChartViewport = { x: 683.541, y: 296.631, width: 206.352, height: 283.734 } as const;
export const cnssChartMark = { size: 2.4, borderWidth: 0.6 } as const;
export const cnssToothPositions = {
  // Quadrant FDI 1
  "11": { x: 772.788, y: 351.572 },
  "12": { x: 763.760, y: 354.668 },
  "13": { x: 756.280, y: 361.374 },
  "14": { x: 751.895, y: 371.176 },
  "15": { x: 745.189, y: 382.783 },
  "16": { x: 741.835, y: 397.228 },
  "17": { x: 738.482, y: 411.930 },
  "18": { x: 735.645, y: 428.438 },
  // Quadrant FDI 2
  "21": { x: 782.590, y: 351.572 },
  "22": { x: 792.650, y: 355.183 },
  "23": { x: 799.872, y: 361.632 },
  "24": { x: 803.483, y: 371.692 },
  "25": { x: 809.674, y: 383.815 },
  "26": { x: 813.027, y: 397.743 },
  "27": { x: 816.896, y: 412.446 },
  "28": { x: 819.217, y: 428.696 },
  // Quadrant FDI 3
  "31": { x: 781.816, y: 529.035 },
  "32": { x: 789.554, y: 526.456 },
  "33": { x: 796.003, y: 521.039 },
  "34": { x: 801.935, y: 513.559 },
  "35": { x: 806.578, y: 503.241 },
  "36": { x: 812.253, y: 491.376 },
  "37": { x: 816.380, y: 476.157 },
  "38": { x: 820.249, y: 458.101 },
  // Quadrant FDI 4
  "41": { x: 773.046, y: 528.777 },
  "42": { x: 764.018, y: 526.198 },
  "43": { x: 757.054, y: 521.297 },
  "44": { x: 751.379, y: 513.816 },
  "45": { x: 745.962, y: 504.015 },
  "46": { x: 740.804, y: 491.634 },
  "47": { x: 737.450, y: 476.157 },
  "48": { x: 734.097, y: 458.359 },
  // Quadrant FDI 5
  "51": { x: 774.852, y: 375.045 },
  "52": { x: 769.951, y: 377.366 },
  "53": { x: 766.082, y: 380.977 },
  "54": { x: 762.471, y: 386.136 },
  "55": { x: 759.633, y: 393.616 },
  // Quadrant FDI 6
  "61": { x: 781.300, y: 375.045 },
  "62": { x: 785.427, y: 377.366 },
  "63": { x: 790.070, y: 380.977 },
  "64": { x: 793.165, y: 386.136 },
  "65": { x: 796.519, y: 393.616 },
  // Quadrant FDI 7
  "71": { x: 781.300, y: 508.916 },
  "72": { x: 785.943, y: 507.110 },
  "73": { x: 790.328, y: 503.499 },
  "74": { x: 792.908, y: 498.082 },
  "75": { x: 796.519, y: 491.376 },
  // Quadrant FDI 8
  "81": { x: 774.078, y: 508.658 },
  "82": { x: 769.177, y: 506.852 },
  "83": { x: 765.050, y: 503.241 },
  "84": { x: 761.439, y: 498.082 },
  "85": { x: 757.828, y: 491.892 },
} as const;
export type CnssTooth = keyof typeof cnssToothPositions;
export function isCnssTooth(value: string): value is CnssTooth {
  return Object.hasOwn(cnssToothPositions, value);
}
// UI rows follow the printed D (reader left) / G (reader right) orientation.
export const cnssQuadrants = [
  { prefix: "1", label: "Permanentes — haut droit (H/D)" },
  { prefix: "2", label: "Permanentes — haut gauche (H/G)" },
  { prefix: "4", label: "Permanentes — bas droit (B/D)" },
  { prefix: "3", label: "Permanentes — bas gauche (B/G)" },
  { prefix: "5", label: "Temporaires — haut droit (H/D)" },
  { prefix: "6", label: "Temporaires — haut gauche (H/G)" },
  { prefix: "8", label: "Temporaires — bas droit (B/D)" },
  { prefix: "7", label: "Temporaires — bas gauche (B/G)" },
] as const;
