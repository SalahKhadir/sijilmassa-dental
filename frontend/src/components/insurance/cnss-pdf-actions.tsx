"use client";
import { InsurancePdfActions } from "./insurance-pdf-actions";
import type { CnssPdfInput } from "@/lib/insurance/pdf/cnss-renderer";
export function CnssPdfActions({ input }: { input: CnssPdfInput }) {
  return <InsurancePdfActions provider="CNSS" input={input} />;
}
