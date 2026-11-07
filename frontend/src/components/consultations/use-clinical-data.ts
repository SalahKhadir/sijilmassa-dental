"use client";
import { useCallback } from "react";
import { usePatientQuery } from "@/components/patients/use-patient-query";
import { usePatients } from "@/components/patients/patient-provider";
import { useAppointments } from "@/components/appointments/appointment-provider";
import { useConsultations } from "./consultation-provider";
/** Clinical routes only. Administrative pages use limited projections instead. */
export function useClinicalData() {
  const clinical = useConsultations();
  const patients = usePatients();
  const appointments = useAppointments();
  const read = useCallback(async () => {
    const [consultations, records, slots] = await Promise.all([clinical.repository.list(), patients.repository.list(), appointments.repository.list()]);
    return { consultations, patients: records, appointments: slots };
  }, [clinical.repository, patients.repository, appointments.repository]);
  return usePatientQuery(read, clinical.revision + patients.revision + appointments.revision);
}
