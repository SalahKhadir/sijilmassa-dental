"use client";
import { InsuranceDentalChart } from "./insurance-dental-chart";
import { cnssChartViewport, cnssToothPositions } from "@/lib/insurance/pdf/cnss-chart-mapping";
import type { ComponentProps } from "react";
const config = {
  provider: "CNSS" as const,
  viewport: cnssChartViewport,
  positions: cnssToothPositions,
  imageHref: "/images/cnss-dental-chart.png",
};
export function CnssDentalChart(props: Omit<ComponentProps<typeof InsuranceDentalChart>, "config">) {
  return <InsuranceDentalChart {...props} config={config} />;
}
