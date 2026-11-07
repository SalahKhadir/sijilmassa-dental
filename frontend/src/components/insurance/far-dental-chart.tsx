"use client";
import { InsuranceDentalChart } from "./insurance-dental-chart";
import { Select } from "@/components/ui/select";
import { farChartShape as shape, farChartViewport, farToothPositions } from "@/lib/insurance/pdf/far-chart-mapping";
import type { DentalInsuranceAct, FARToothMark } from "@/lib/insurance/types";

const config = {
  provider: "FAR" as const, viewport: farChartViewport, positions: farToothPositions,
  imageHref: "/images/far-dental-chart.png", wide: true,
  selectionLabel: "Sélectionner la dent FDI", statusLabel: "Dents FDI sélectionnées",
  instructions: "Sélectionnez les dents, puis choisissez leur symbole et confirmez les choix en tant que dentiste. Aucun symbole n’est déduit d’un code d’acte ou de la catégorie de soins.",
  note: "Notice FAR : croix pour la dent objet de la prothèse ou de l’extraction ; cercle pour une dent soignée ou couronnée. Ces formulations peuvent se recouper : le dentiste doit trancher et confirmer chaque choix. Aucun carré neutre n’est imprimé sur la FAR.",
  caption: "Tableau officiel FAR, page 1. Les 52 références FDI sont imprimées. La droite du patient est à gauche du tableau ; dents temporaires sur les rangées externes, permanentes au centre.",
};
interface Props {
  acts: readonly DentalInsuranceAct[];
  marks: readonly FARToothMark[];
  approved: boolean;
  onMarksChange(marks: FARToothMark[]): void;
  onApprove(approved: boolean): void;
}
export function FarDentalChart({ acts, marks, approved, onMarksChange, onApprove }: Props) {
  function select(teeth: string[]) {
    onMarksChange(teeth.map(tooth => marks.find(mark => mark.tooth === tooth) ?? { tooth }));
  }
  return <div className="space-y-4">
    <InsuranceDentalChart config={config} acts={acts} confirmedTeeth={marks.map(mark => mark.tooth)} onChange={select}
      renderMark={(tooth, centre) => {
        const mark = marks.find(mark => mark.tooth === tooth);
        if (mark?.symbol === "CERCLE") return <ellipse data-far-tooth={tooth} data-far-symbol="CERCLE"
          cx={centre.x} cy={centre.y} rx={shape.radiusX} ry={shape.radiusY}
          className="fill-none stroke-primary" strokeWidth={shape.thickness} opacity={.85} />;
        if (mark?.symbol === "CROIX") return <g data-far-tooth={tooth} data-far-symbol="CROIX"
          className="stroke-primary" strokeWidth={shape.thickness} opacity={.75}>
          <line x1={centre.x-shape.crossX} y1={centre.y-shape.crossY} x2={centre.x+shape.crossX} y2={centre.y+shape.crossY} />
          <line x1={centre.x-shape.crossX} y1={centre.y+shape.crossY} x2={centre.x+shape.crossX} y2={centre.y-shape.crossY} />
        </g>;
        return null;
      }} />
    {marks.length > 0 && <fieldset className="space-y-3 rounded-lg border border-border bg-surface p-5">
      <legend className="px-1 font-semibold">Symboles FAR à confirmer par le dentiste</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {marks.map(mark => <label key={mark.tooth} className="space-y-1 text-sm">
          <span>Dent FDI {mark.tooth} — symbole</span>
          <Select aria-label={`Symbole FAR de la dent ${mark.tooth}`} value={mark.symbol ?? ""}
            onChange={event => onMarksChange(marks.map(value => value.tooth === mark.tooth
              ? { ...value, symbol: (event.target.value || undefined) as FARToothMark["symbol"] } : value))}>
            <option value="">Choisir un symbole</option>
            <option value="CERCLE">Cercle (dent soignée ou couronnée)</option>
            <option value="CROIX">Croix (prothèse ou extraction)</option>
          </Select>
        </label>)}
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="accent-primary" checked={approved}
          onChange={event => onApprove(event.target.checked)} />
        Je confirme, en tant que dentiste, les dents et les symboles selon la notice FAR.
      </label>
      <p className="text-sm text-muted-foreground">Toute modification des dents, des symboles ou des actes annule cette confirmation. Le PDF marqué reste bloqué tant que les choix ne sont pas confirmés.</p>
    </fieldset>}
  </div>;
}
