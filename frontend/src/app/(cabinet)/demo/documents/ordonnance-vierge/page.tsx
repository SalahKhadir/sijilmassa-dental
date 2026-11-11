import type { Metadata } from "next";
import { BlankPrescriptionPage } from "@/components/prescriptions/blank-prescription-page";
export const metadata: Metadata = { title: "Ordonnance vierge A5" };
export default function Page() {
  return <BlankPrescriptionPage backHref="/demo/documents" />;
}
