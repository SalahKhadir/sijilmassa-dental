"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { DentalInsuranceAct } from "@/lib/insurance/types";
import { fdiTeeth, fdiQuadrants, isFdiTooth, neutralChartMark, type FdiTooth } from "@/lib/insurance/tooth-reference";

export interface InsuranceChartConfig {
  provider: "CNSS" | "CNOPS" | "FAR";
  viewport: { x: number; y: number; width: number; height: number };
  positions: Readonly<Record<FdiTooth, { x: number; y: number }>>;
  imageHref: string;
  note?: string;
  instructions?: string;
  caption?: string;
  wide?: boolean;
  selectionLabel?: string;
  statusLabel?: string;
}

interface InsuranceDentalChartProps {
  config: InsuranceChartConfig;
  acts: readonly DentalInsuranceAct[];
  confirmedTeeth: readonly string[];
  onChange(teeth: string[]): void;
  renderMark?(tooth: FdiTooth, centre: { x: number; y: number }): ReactNode;
}

export function InsuranceDentalChart({ config, acts, confirmedTeeth, onChange, renderMark }: InsuranceDentalChartProps) {
  const { provider, viewport, positions } = config;
  const titleId = `${provider.toLowerCase()}-chart-title`;
  const selected = new Set(confirmedTeeth);
  const teeth = fdiTeeth;

  function toggle(tooth: string) {
    onChange(selected.has(tooth)
      ? confirmedTeeth.filter(value => value !== tooth)
      : [...confirmedTeeth, tooth].sort());
  }

  return (
    <section aria-labelledby={titleId} className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <h2 id={titleId} className="font-semibold">Schéma dentaire</h2>
      <p className="text-sm text-muted-foreground">
        {config.instructions ?? "À confirmer par le dentiste : chaque case cochée confirme la dent FDI à marquer. Aucune dent n’est cochée à partir des actes. Le carré est un repère de sélection neutre, sans indication d’extraction, de couronne ou d’autre soin."}
      </p>
      {config.note && <p className="text-sm text-muted-foreground">{config.note}</p>}
      <div className="text-sm">
        <p className="font-semibold">Actes du brouillon et références saisies</p>
        <ul className="list-disc pl-5">
          {acts.map((act, index) => (
            <li key={act.id}>{act.description || `Acte ${index + 1}`} — référence : {act.toothReference || "non renseignée"}</li>
          ))}
        </ul>
        <p className="mt-2">Vérifiez la sélection après toute modification des actes.</p>
      </div>
      <div className={config.wide ? "grid gap-6" : "grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]"}>
        <figure>
          <svg
            role="img"
            aria-label={`Aperçu du schéma ${provider}. ${config.statusLabel ?? "Dents FDI confirmées"} : ${confirmedTeeth.join(", ") || "aucune"}.`}
            viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
            className={config.wide ? "w-full border border-border" : "w-full max-w-sm border border-border"}
          >
            <image href={config.imageHref} {...viewport} />
            {confirmedTeeth.filter(isFdiTooth).map(tooth => {
              const centre = positions[tooth];
              if (renderMark) return <g key={tooth}>{renderMark(tooth, centre)}</g>;
              return <rect
                key={tooth}
                data-tooth={tooth}
                x={centre.x - neutralChartMark.size / 2}
                y={centre.y - neutralChartMark.size / 2}
                width={neutralChartMark.size}
                height={neutralChartMark.size}
                strokeWidth={neutralChartMark.borderWidth}
                className="fill-none stroke-primary"
              />;
            })}
          </svg>
          <figcaption className="mt-2 text-sm text-muted-foreground">
            {config.caption ?? "Schéma officiel, page 2. D/G : droite/gauche du patient ; H/B : haut/bas. La droite du patient est à gauche du dessin."}
          </figcaption>
        </figure>
        <div className={config.wide ? "grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-4" : "grid content-start gap-3 sm:grid-cols-2"}>
          {fdiQuadrants.map(quadrant => (
            <fieldset key={quadrant.prefix} className="min-w-0 rounded border border-border p-3">
              <legend className="px-1 text-sm font-semibold">{quadrant.label}</legend>
              <div className="flex flex-wrap gap-1">
                {teeth.filter(tooth => tooth.startsWith(quadrant.prefix)).map(tooth => (
                  <label key={tooth} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded border border-border px-1 text-sm has-checked:bg-primary-tint">
                    <input
                      type="checkbox"
                      aria-label={`${config.selectionLabel ?? "Confirmer la dent FDI"} ${tooth}`}
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
        {config.statusLabel ?? "Dents FDI confirmées"} : {confirmedTeeth.join(", ") || "aucune"}.
      </p>
      <Button type="button" variant="outline" disabled={!confirmedTeeth.length} onClick={() => onChange([])}>
        Effacer les marques
      </Button>
      <p className="text-sm text-muted-foreground">Enregistrez le brouillon pour conserver cette sélection en mémoire.</p>
    </section>
  );
}
