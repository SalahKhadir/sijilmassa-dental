import Link from "next/link";
import { notFound } from "next/navigation";
import { NewInsuranceDocument } from "@/components/insurance/persistent/create";
import { insuranceId } from "@/lib/insurance/api/schemas";

export const metadata = { title: "Nouveau document d’assurance" };

export default async function Page({ searchParams }: {
  searchParams: Promise<{ patientId?: string | string[]; consultationId?: string | string[] }>;
}) {
  const { patientId, consultationId } = await searchParams;
  if (patientId === undefined) return <p>Ouvrez la fiche d’un patient pour créer un document d’assurance. <Link className="text-primary underline" href="/patients">Voir les patients</Link></p>;
  const patient = insuranceId.safeParse(patientId);
  const consultation = insuranceId.optional().safeParse(consultationId);
  if (!patient.success || !consultation.success) notFound();
  return <NewInsuranceDocument patientId={patient.data.toLowerCase()} preset={consultation.data?.toLowerCase()} />;
}
