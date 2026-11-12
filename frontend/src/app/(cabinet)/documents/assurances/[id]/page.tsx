import { notFound } from "next/navigation";
import { InsuranceDocumentPage } from "@/components/insurance/persistent/detail";
import { insuranceId } from "@/lib/insurance/api/schemas";

export const metadata = { title: "Document d’assurance" };

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ patientId?: string | string[]; action?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const document = insuranceId.safeParse(id);
  const patient = insuranceId.safeParse(query.patientId);
  if (!document.success || !patient.success) notFound();
  const action = query.action === "modifier" || query.action === "finaliser" ? query.action : undefined;
  return <InsuranceDocumentPage documentId={document.data.toLowerCase()} patientId={patient.data.toLowerCase()} action={action} />;
}
