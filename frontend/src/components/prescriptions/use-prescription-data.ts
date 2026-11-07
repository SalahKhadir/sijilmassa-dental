"use client";
import { useCallback } from "react";
import { usePatients } from "@/components/patients/patient-provider";
import { useConsultations } from "@/components/consultations/consultation-provider";
import { usePatientQuery } from "@/components/patients/use-patient-query";
import { prescriptionPatient } from "@/lib/prescriptions/repository";
import { usePrescriptions } from "./prescription-provider";
/** Patient selector and consultation selector exclude clinical questionnaire and notes. */
export function usePrescriptionData() {
  const prescriptions = usePrescriptions();
  const patients = usePatients();
  const consultations = useConsultations();
  const read = useCallback(async () => {
    const [records, people, encounters] = await Promise.all([prescriptions.repository.list(), patients.repository.list(), consultations.repository.list()]);
    return { prescriptions: records, patients: people.map(prescriptionPatient), consultations: encounters.map(record => ({ id: record.id, patientId: record.patientId, consultationDate: record.consultationDate })) };
  }, [prescriptions.repository, patients.repository, consultations.repository]);
  return usePatientQuery(read, prescriptions.revision + patients.revision + consultations.revision);
}
