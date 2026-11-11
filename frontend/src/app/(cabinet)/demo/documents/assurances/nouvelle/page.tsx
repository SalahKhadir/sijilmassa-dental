import type { Metadata } from "next";
import { InsuranceDraftForm } from "@/components/insurance/insurance-draft-form";

export const metadata: Metadata = {
  title: "Nouvelle feuille de soins dentaires",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string | string[] }>;
}) {
  const query = await searchParams;
  const patientId =
    typeof query.patientId === "string" ? query.patientId : undefined;

  return <InsuranceDraftForm presetPatientId={patientId} />;
}
