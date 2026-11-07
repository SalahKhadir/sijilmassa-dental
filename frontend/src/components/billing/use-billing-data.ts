"use client";
import { useCallback } from "react";
import { usePatients } from "@/components/patients/patient-provider";
import { useConsultations } from "@/components/consultations/consultation-provider";
import { usePatientQuery } from "@/components/patients/use-patient-query";
import { prescriptionPatient } from "@/lib/prescriptions/repository";
import { useBilling } from "./billing-provider";
export function useBillingData() {
  const { repositories, revision } = useBilling();
  const patients = usePatients();
  const consultations = useConsultations();
  const read = useCallback(async () => {
    const [invoices, payments, services, people, encounters] =
      await Promise.all([
        repositories.invoices.list(),
        repositories.payments.list(),
        repositories.services.list(),
        patients.repository.list(),
        consultations.repository.list(),
      ]);
    return {
      invoices,
      payments,
      services,
      patients: people.map(prescriptionPatient),
      consultations: encounters.map((record) => ({
        id: record.id,
        patientId: record.patientId,
        consultationDate: record.consultationDate,
      })),
    };
  }, [repositories, patients.repository, consultations.repository]);
  return usePatientQuery(
    read,
    revision + patients.revision + consultations.revision,
  );
}
export function useFinancialData() {
  const { repositories, revision } = useBilling();
  const read = useCallback(async () => {
    const [invoices, payments] = await Promise.all([
      repositories.invoices.list(),
      repositories.payments.list(),
    ]);
    return { invoices, payments };
  }, [repositories]);
  return usePatientQuery(read, revision);
}
