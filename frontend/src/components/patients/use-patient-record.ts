"use client";
import { useCallback } from "react";
import { usePatients } from "./patient-provider";
import { usePatientQuery } from "./use-patient-query";

export function usePatientRecord(id: string) {
  const { repository, revision } = usePatients();
  const read = useCallback(() => repository.getById(id), [repository, id]);
  return usePatientQuery(read, revision);
}
