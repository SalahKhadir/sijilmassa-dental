"use client";

import { Button } from "@/components/ui/button";
import type { DentalInsuranceAct } from "@/lib/insurance/types";
import {
  cnssChartMark,
  cnssChartViewport as viewport,
  cnssQuadrants,
  cnssToothPositions,
  isCnssTooth,
} from "@/lib/insurance/pdf/cnss-chart-mapping";

interface CnssDentalChartProps {
  acts: readonly DentalInsuranceAct[];
  confirmedTeeth: readonly string[];
  onChange(teeth: string[]): void;
}

export function CnssDentalChart({ acts, confirmedTeeth, onChange }: CnssDentalChartProps) {
  const selected = new Set(confirmedTeeth);
  const teeth = Object.keys(cnssToothPositions);

  function toggle(tooth: string) {
    onChange(selected.has(tooth)
      ? confirmedTeeth.filter(value => value !== tooth)
      : [...confirmedTeeth, tooth].sort());
  }

  return (
    <section aria-labelledby="cnss-chart-title" className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <h2 id="cnss-chart-title" className="font-semibold">Schéma dentaire</h2>
      <p className="text-sm text-muted-foreground">
        À confirmer par le dentiste : chaque case cochée confirme la dent FDI à marquer.
        Aucune dent n’est cochée à partir des actes. Le carré est un repère de sélection neutre,
        sans indication d’extraction, de couronne ou d’autre soin.
      </p>
      <div className="text-sm">
        <p className="font-semibold">Actes du brouillon et références saisies</p>
        <ul className="list-disc pl-5">
          {acts.map((act, index) => (
            <li key={act.id}>{act.description || `Acte ${index + 1}`} — référence : {act.toothReference || "non renseignée"}</li>
          ))}
        </ul>
        <p className="mt-2">Vérifiez la sélection après toute modification des actes.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <figure>
          <svg
            role="img"
            aria-label={`Aperçu du schéma CNSS. Dents FDI confirmées : ${confirmedTeeth.join(", ") || "aucune"}.`}
            viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
            className="w-full max-w-sm border border-border"
          >
            <image href="/images/cnss-dental-chart.png" {...viewport} />
            {confirmedTeeth.filter(isCnssTooth).map(tooth => {
              const centre = cnssToothPositions[tooth];
              return <rect
                key={tooth}
                data-tooth={tooth}
                x={centre.x - cnssChartMark.size / 2}
                y={centre.y - cnssChartMark.size / 2}
                width={cnssChartMark.size}
                height={cnssChartMark.size}
                strokeWidth={cnssChartMark.borderWidth}
                className="fill-none stroke-primary"
              />;
            })}
          </svg>
          <figcaption className="mt-2 text-sm text-muted-foreground">
            Schéma officiel, page 2. D/G : droite/gauche du patient ; H/B : haut/bas.
            La droite du patient est à gauche du dessin.
          </figcaption>
        </figure>
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {cnssQuadrants.map(quadrant => (
            <fieldset key={quadrant.prefix} className="min-w-0 rounded border border-border p-3">
              <legend className="px-1 text-sm font-semibold">{quadrant.label}</legend>
              <div className="flex flex-wrap gap-1">
                {teeth.filter(tooth => tooth.startsWith(quadrant.prefix)).map(tooth => (
                  <label key={tooth} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded border border-border px-1 text-sm has-checked:bg-primary-tint">
                    <input
                      type="checkbox"
                      aria-label={`Confirmer la dent FDI ${tooth}`}
                      checked={selected.has(tooth)}
                      onChange={() => toggle(tooth)}
                      className="accent-primary"
                    />
                    {tooth}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
      <p role="status" className="text-sm font-semibold">
        Dents FDI confirmées : {confirmedTeeth.join(", ") || "aucune"}.
      </p>
      <Button type="button" variant="outline" disabled={!confirmedTeeth.length} onClick={() => onChange([])}>
        Effacer les marques
      </Button>
      <p className="text-sm text-muted-foreground">Enregistrez le brouillon pour conserver cette sélection en mémoire.</p>
    </section>
  );
}
