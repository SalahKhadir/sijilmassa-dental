import type { Role } from "../../auth/types";
import { appointmentStatusValues, type AppointmentStatus } from "../types";
/** Presentation only: Spring remains authoritative for every transition. */
export function statusChoices(role: Role, current: AppointmentStatus) {
  return current === "TERMINE" ? [] : appointmentStatusValues.filter(status => status !== "TERMINE" || role === "DENTIST");
}
