import type { Metadata } from "next";
import { BillingDirectory } from "@/components/billing/billing-directory";
export const metadata: Metadata = { title: "Facturation" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string | string[] }>;
}) {
  const query = await searchParams;
  return (
    <BillingDirectory
      patientId={
        typeof query.patientId === "string" ? query.patientId : undefined
      }
    />
  );
}
