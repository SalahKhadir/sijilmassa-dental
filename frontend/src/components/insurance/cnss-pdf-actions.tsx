"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

import type { CnssPdfInput } from "@/lib/insurance/pdf/cnss-renderer";
import { CnssPdfError } from "@/lib/insurance/pdf/errors";

/** Parent keys this component by its input snapshot: edits discard stale PDFs. */
export function CnssPdfActions({ input }: { input: CnssPdfInput }) {
  const [url, setUrl] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [printStatus, setPrintStatus] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const active = useRef(true);
  const currentUrl = useRef<string | undefined>(undefined);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    };
  }, []);
  async function preview() {
    setBusy(true); setError("");
    try {
      const { generateCnssPdf } = await import("@/lib/insurance/pdf/cnss-service");
      const result = await generateCnssPdf(input);
      if (!active.current) return;
      const next = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: "application/pdf" }));
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = next;
      setReady(false); setUrl(next); setWarnings(result.warnings);
    } catch (error) {
      if (active.current) setError(error instanceof CnssPdfError ? error.message : "Le PDF CNSS n’a pas pu être généré. Réessayez.");
    } finally { if (active.current) setBusy(false); }
  }
  function print() {
    try {
      if (!frame.current?.contentWindow) throw new Error();
      frame.current.contentWindow.focus();
      frame.current.contentWindow.print();
      setPrintStatus("La demande d’impression a été transmise au navigateur.");
    } catch { setError("L’impression est indisponible dans ce navigateur. Téléchargez le PDF puis imprimez-le avec votre lecteur PDF."); }
  }
  return (
    <section aria-label="PDF CNSS" className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="font-semibold">Feuille CNSS — PDF officiel</h2>
      <p className="text-sm text-muted-foreground">L’aperçu reprend les valeurs actuelles du formulaire. Vérifiez les deux pages avant impression. Les signatures et cachets restent vierges.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={preview} disabled={busy}>{busy ? "Génération…" : "Prévisualiser"}</Button>
        {url && <a className="font-semibold text-primary underline" href={url} download="feuille-soins-cnss.pdf">Télécharger le PDF</a>}
        <Button type="button" variant="outline" disabled={!url || !ready} onClick={print}>Imprimer</Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {warnings.length > 0 && <div className="text-sm"><p className="font-semibold">À vérifier ou à compléter :</p><ul className="list-disc pl-5">{warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}
      {url && <>
        <p className="text-sm text-muted-foreground">Si l’aperçu ne s’affiche pas, téléchargez le PDF pour l’ouvrir dans votre lecteur local. Le modèle a un format natif hors A4. Vérifiez le papier et l’échelle dans le lecteur PDF ; l’ajustement au papier réduit le formulaire. Pour le recto verso, vérifiez le sens de retournement sur une feuille d’essai.</p>
        <iframe ref={frame} title="Aperçu du PDF CNSS — deux pages" src={url} className="h-[650px] w-full border border-border" onLoad={() => setReady(true)} />
      </>}
      {printStatus && <p role="status" className="text-sm">{printStatus}</p>}
    </section>
  );
}
