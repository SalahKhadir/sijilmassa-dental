"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useInsurance } from "./insurance-provider";
import { InsuranceDraftForm } from "./insurance-draft-form";
import type { InsuranceDocumentDraft } from "@/lib/insurance/types";

export function InsuranceDraftEditPage({ id }: { id: string }) {
  const { repository, revision } = useInsurance();
  const [draft, setDraft] = useState<InsuranceDocumentDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const found = await repository.getDraftById(id);
        if (!cancelled) {
          if (found) {
            setDraft(found);
          } else {
            setNotFound(true);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, repository, revision]);

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Chargement de la feuille de soins...
      </div>
    );
  }

  if (notFound || !draft) {
    return (
      <div className="space-y-4 p-8 text-center">
        <p className="text-sm text-danger font-semibold">
          Ce brouillon de feuille de soins est introuvable.
        </p>
        <Link
          href="/demo/documents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Retour aux documents
        </Link>
      </div>
    );
  }

  return <InsuranceDraftForm key={draft.id} initialDraft={draft} />;
}
