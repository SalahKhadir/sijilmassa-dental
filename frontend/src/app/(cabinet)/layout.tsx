import { redirect } from "next/navigation";
import { readServerSession } from "@/lib/auth/server-session";
import { SessionBoundary, SessionUnavailable } from "@/components/auth/session-boundary";
import { BillingProvider } from "@/components/billing/billing-provider";
import { PrescriptionProvider } from "@/components/prescriptions/prescription-provider";
import { ConsultationProvider } from "@/components/consultations/consultation-provider";
import type { ReactNode } from "react";
import { AppointmentProvider } from "@/components/appointments/appointment-provider";
import { PatientProvider } from "@/components/patients/patient-provider";
import { InsuranceProvider } from "@/components/insurance/insurance-provider";
import { ApplicationShell } from "@/components/shell/application-shell";

export default async function CabinetLayout({ children }: { children: ReactNode }) {
  const session = await readServerSession();
  if (session.status === "unauthenticated") redirect("/login");
  if (session.status === "error") return <SessionUnavailable />;
  return (
    <SessionBoundary>
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
    </SessionBoundary>
  );
}
