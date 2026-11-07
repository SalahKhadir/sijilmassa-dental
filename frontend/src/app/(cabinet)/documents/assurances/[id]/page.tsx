import type { Metadata } from "next";
import { InsuranceDraftEditPage } from "@/components/insurance/insurance-draft-page";

export const metadata: Metadata = {
  title: "Feuille de soins dentaires",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InsuranceDraftEditPage id={id} />;
}
