import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { navigation } from "@/lib/navigation";
import { PageHeading } from "@/components/page-heading";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
const modules = navigation.filter(
  (item) =>
    item.href !== "/" &&
    item.href !== "/patients" &&
    item.href !== "/rendez-vous" &&
    item.href !== "/consultations" &&
    item.href !== "/documents" &&
    item.href !== "/facturation",
);
export const dynamicParams = false;
export function generateStaticParams() {
  return modules.map((item) => ({ module: item.href.slice(1) }));
}
function getModule(slug: string) {
  return modules.find((item) => item.href === `/${slug}`);
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}): Promise<Metadata> {
  return {
    title: getModule((await params).module)?.label ?? "Page introuvable",
  };
}
export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const item = getModule((await params).module);
  if (!item) notFound();
  return (
    <>
      <PageHeading
        eyebrow="Modules du cabinet"
        title={item.label}
        description={item.description}
      />
      <Card>
        <EmptyState
          title="Module en préparation"
          description="L’interface de ce module sera développée dans une prochaine phase. Aucune saisie ni opération métier n’est disponible pour le moment."
        />
        <div className="flex justify-center px-6 pb-8">
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft aria-hidden="true" />
              Retour au tableau de bord
            </Link>
          </Button>
        </div>
      </Card>
    </>
  );
}
