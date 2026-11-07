import { BillingProvider } from "@/components/billing/billing-provider";
import { PrescriptionProvider } from "@/components/prescriptions/prescription-provider";
import { ConsultationProvider } from "@/components/consultations/consultation-provider";
import type { ReactNode } from "react";
import { AppointmentProvider } from "@/components/appointments/appointment-provider";
import { PatientProvider } from "@/components/patients/patient-provider";
import { InsuranceProvider } from "@/components/insurance/insurance-provider";
import { ApplicationShell } from "@/components/shell/application-shell";

export default function CabinetLayout({ children }: { children: ReactNode }) {
  return (
    <PatientProvider>
      <AppointmentProvider>
        <ConsultationProvider>
          <BillingProvider>
            <PrescriptionProvider>
              <InsuranceProvider>
                <ApplicationShell>{children}</ApplicationShell>
              </InsuranceProvider>
            </PrescriptionProvider>
          </BillingProvider>
        </ConsultationProvider>
      </AppointmentProvider>
    </PatientProvider>
  );
}
