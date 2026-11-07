/** Visual coordinates: points from the displayed CropBox's top-left; y is baseline. */
export interface PageGeometry {
  x: number; y: number; width: number; height: number; rotation: number;
}
export function visualToPdf(u: number, v: number, box: PageGeometry) {
  const { x, y, width: w, height: h } = box;
  switch ((box.rotation % 360 + 360) % 360) {
    case 0: return { x: x + u, y: y + h - v };
    case 90: return { x: x + v, y: y + u };
    case 180: return { x: x + w - u, y: y + v };
    case 270: return { x: x + w - v, y: y + h - u };
    default: throw new Error("Rotation PDF non prise en charge.");
  }
}
