"use client";
import { useCallback } from "react";
import { usePatientQuery } from "@/components/patients/use-patient-query";
import { usePatients } from "@/components/patients/patient-provider";
import { appointmentPatient } from "@/lib/appointments/selectors";
import { useAppointments } from "./appointment-provider";

export function useAppointmentData() {
  const { repository, revision } = useAppointments();
  const { repository: patients, revision: patientRevision } = usePatients();
  const read = useCallback(async () => {
    const [appointments, records] = await Promise.all([
      repository.list(),
      patients.list(),
    ]);
    return { appointments, patients: records.map(appointmentPatient) };
  }, [repository, patients]);
  // Both revision counters only increase during the lifetime of their providers.
  return usePatientQuery(read, revision + patientRevision);
}
