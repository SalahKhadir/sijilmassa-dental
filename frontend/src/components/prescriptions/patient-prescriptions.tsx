"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { usePrescriptionData } from "./use-prescription-data";
import { PrescriptionList } from "./prescription-list";
import {
  PrescriptionErrorState,
  PrescriptionLoading,
} from "./prescription-states";
export function PatientPrescriptions({
  patientId,
  consultationId,
}: {
  patientId: string;
  consultationId?: string;
}) {
  const { state, retry } = usePrescriptionData();
  if (state.status === "loading") return <PrescriptionLoading />;
  if (state.status === "error") return <PrescriptionErrorState retry={retry} />;
  const records = state.data.prescriptions
    .filter(
      (record) =>
        record.patientId === patientId &&
        (!consultationId || record.consultationId === consultationId),
    )
    .sort(
      (a, b) =>
        b.issuedDate.localeCompare(a.issuedDate) || b.id.localeCompare(a.id),
    );
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b">
        <CardTitle>Ordonnances · Espace dentiste</CardTitle>
        <Button asChild variant="secondary">
          <Link
            href={`/documents/ordonnances/nouvelle?patientId=${patientId}${consultationId ? `&consultationId=${consultationId}` : ""}`}
          >
            {consultationId ? "Créer une ordonnance" : "Nouvelle ordonnance"}
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-6">
        <PrescriptionList records={records} patients={state.data.patients} />
      </CardContent>
    </Card>
  );
}
