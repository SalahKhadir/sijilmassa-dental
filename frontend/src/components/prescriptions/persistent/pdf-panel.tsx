"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PersistentPrescription } from "@/lib/prescriptions/api/schemas";
import { useFinalizedPrescriptionDownload } from "./use-prescription-forms";
export function StoredPrescriptionPdf({ prescription }: { prescription: PersistentPrescription }) {
  const file = useFinalizedPrescriptionDownload(prescription);
  const frame = useRef<HTMLIFrameElement>(null), currentUrl = useRef<string | undefined>(undefined);
  const [preview, setPreview] = useState<string>(), [ready, setReady] = useState(false), [message, setMessage] = useState("");
  function close() { if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); currentUrl.current = undefined; setPreview(undefined); setReady(false); }
  useEffect(() => () => { if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); }, []);
  useEffect(() => {
    if (!preview) return;
    const release = () => { URL.revokeObjectURL(preview); if (currentUrl.current === preview) { currentUrl.current = undefined; setPreview(undefined); setReady(false); } };
    window.addEventListener("afterprint", release);
    const timeout = window.setTimeout(release, 300000);
    return () => { window.removeEventListener("afterprint", release); clearTimeout(timeout); URL.revokeObjectURL(preview); };
  }, [preview]);
  return <Card className="space-y-4 p-5" id="pdf"><h2 className="text-lg font-semibold">PDF finalisé conservé</h2>
    <p>Document A5 d’origine, environ 147,90 × 210,08 mm. Imprimez à 100 % ou « Taille réelle ».</p>
    <div className="flex flex-wrap gap-3"><Button disabled={file.disabled} onClick={() => void file.download()}>Télécharger le PDF finalisé</Button>
      <Button variant="outline" disabled={file.disabled} onClick={() => void file.download(({ blob }) => { close(); const url = URL.createObjectURL(blob); currentUrl.current = url; setPreview(url); })}>Préparer l’impression</Button></div>
    {file.state.pending && <p role="status">Téléchargement sécurisé du PDF…</p>}
    {file.state.error && <p role="alert">{file.state.error.message}</p>}
    {preview && <>
      <div className="flex flex-wrap gap-3"><Button disabled={!ready || file.disabled} onClick={() => {
        try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); setMessage("Demande d’impression envoyée. Si aucune fenêtre ne s’ouvre, téléchargez le PDF puis imprimez-le depuis votre lecteur."); }
        catch { setMessage("Téléchargez le PDF puis imprimez-le depuis votre lecteur."); }
      }}>Imprimer le PDF finalisé</Button><Button variant="outline" onClick={close}>Fermer l’aperçu</Button></div>
      <iframe ref={frame} src={preview} title="PDF finalisé enregistré" className="h-[70vh] w-full rounded-lg border" onLoad={() => {
        setReady(true);
        try { frame.current?.contentWindow?.addEventListener("afterprint", close, { once: true }); } catch { /* Native PDF viewer may isolate its window. The close control and timeout still release the URL. */ }
      }} />
    </>}
    {message && <p role="status">{message}</p>}
  </Card>;
}
