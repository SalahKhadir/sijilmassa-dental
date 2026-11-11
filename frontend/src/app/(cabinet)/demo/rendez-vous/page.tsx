import type { Metadata } from "next";
import { CalendarPage } from "@/components/appointments/calendar-page";
import { isCalendarDate } from "@/lib/appointments/local-time";
export const metadata: Metadata = { title: "Rendez-vous" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const query = await searchParams;
  const date =
    typeof query.date === "string" && isCalendarDate(query.date)
      ? query.date
      : undefined;
  return <CalendarPage key={date ?? "today"} initialDate={date} />;
}
