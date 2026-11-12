import type { ReactNode } from "react";
import { InsuranceProvider } from "@/components/insurance/insurance-provider";
import { BillingProvider } from "@/components/billing/billing-provider";

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <BillingProvider><InsuranceProvider>{children}</InsuranceProvider></BillingProvider>;
}
