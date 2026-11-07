import type { Metadata } from "next";
import { DocumentsPage } from "@/components/prescriptions/documents-page";
export const metadata: Metadata = { title: "Documents" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string | string[] }>;
}) {
  const query = await searchParams;
  return (
    <DocumentsPage
      patientId={
        typeof query.patientId === "string" ? query.patientId : undefined
      }
    />
  );
}
