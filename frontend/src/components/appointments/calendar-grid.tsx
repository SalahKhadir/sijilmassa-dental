"use client";
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  appointmentStatuses,
  appointmentTypes,
  type Appointment,
  type AppointmentPatient,
} from "@/lib/appointments/types";
import { positionAppointments } from "@/lib/appointments/selectors";
import {
  formatLocalDate,
  formatMinutes,
  parseLocalTime,
  endTime,
  localWeekday,
} from "@/lib/appointments/local-time";
import { developmentSchedule } from "@/lib/appointments/schedule";

export function CalendarGrid({
  dates,
  appointments,
  patients,
  selectedDate,
}: {
  selectedDate?: string;
  dates: readonly string[];
  appointments: readonly Appointment[];
  patients: readonly AppointmentPatient[];
}) {
  const scrollRegion = useRef<HTMLDivElement>(null);
  const dateKey = dates.join(",");
  useLayoutEffect(() => {
    const region = scrollRegion.current;
    const heading = region?.querySelector<HTMLElement>(
      `[data-date="${selectedDate}"]`,
    );
    if (!region || !heading) return;
    const view = region.getBoundingClientRect();
    const target = heading.getBoundingClientRect();
    if (target.left < view.left + 56 || target.right > view.right)
      region.scrollLeft += target.left - view.left - 56;
  }, [selectedDate, dateKey]);
  const scale = Math.max(3, 90 / developmentSchedule.minimumDuration);
  const start = Math.min(
    parseLocalTime(developmentSchedule.gridStart) ?? 540,
    ...appointments.map(
      (appointment) =>
        Math.floor((parseLocalTime(appointment.startTime) ?? 540) / 60) * 60,
    ),
  );
  const end = Math.max(
    parseLocalTime(developmentSchedule.gridEnd) ?? 1080,
    ...appointments.map(
      (appointment) =>
        Math.ceil(
          ((parseLocalTime(appointment.startTime) ?? 540) +
            appointment.durationMinutes) /
            60,
        ) * 60,
    ),
  );
  const height = (end - start) * scale;
  const positioned = dates.map((date) =>
    positionAppointments(
      appointments.filter((appointment) => appointment.date === date),
    ),
  );
  const widths = positioned.map(
    (entries) => Math.max(1, ...entries.map((entry) => entry.columns)) * 210,
  );
  const columns = `56px ${widths.map((width) => `minmax(${width}px,1fr)`).join(" ")}`;
  return (
    <div
      ref={scrollRegion}
      role="region"
      aria-label="Grille horaire des rendez-vous, défilement horizontal et vertical"
      tabIndex={0}
      className="max-h-[680px] overflow-auto rounded-b-xl border-t"
    >
      <div
        style={{ minWidth: 56 + widths.reduce((sum, width) => sum + width, 0) }}
      >
        <div
          className="sticky top-0 z-30 grid border-b bg-surface"
          style={{ gridTemplateColumns: columns }}
        >
          <div
            aria-hidden="true"
            className="sticky left-0 z-10 border-r bg-surface"
          />
          {dates.map((date) => (
            <h3
              key={date}
              data-date={date}
              className={cn(
                "border-r px-3 py-4 text-xs font-semibold first-letter:uppercase",
                date === selectedDate && "bg-secondary-tint",
              )}
            >
              {formatLocalDate(date, "short")}
            </h3>
          ))}
        </div>
        <div className="grid py-3" style={{ gridTemplateColumns: columns }}>
          <div
            data-time-axis="true"
            className="sticky left-0 z-20 border-r bg-surface"
            style={{ height }}
          >
            {Array.from(
              { length: Math.floor((end - start) / 60) + 1 },
              (_, index) => (
                <span
                  key={index}
                  className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums"
                  style={{ top: index * 60 * scale }}
                >
                  {formatMinutes(start + index * 60)}
                </span>
              ),
            )}
          </div>
          {dates.map((date, index) => (
            <div
              key={date}
              className="relative border-r bg-muted"
              style={{ height }}
            >
              {(developmentSchedule.weeklyHours[localWeekday(date)] ?? []).map(
                (period) => (
                  <div
                    key={period.start}
                    aria-hidden="true"
                    className="absolute inset-x-0 bg-surface"
                    style={{
                      top:
                        ((parseLocalTime(period.start) ?? start) - start) *
                        scale,
                      height:
                        ((parseLocalTime(period.end) ?? start) -
                          (parseLocalTime(period.start) ?? start)) *
                        scale,
                    }}
                  />
                ),
              )}
              {Array.from(
                { length: Math.floor((end - start) / 30) },
                (_, row) => (
                  <div
                    key={row}
                    aria-hidden="true"
                    className={
                      row % 2
                        ? "absolute inset-x-0 border-t border-dashed border-border/60"
                        : "absolute inset-x-0 border-t"
                    }
                    style={{ top: row * 30 * scale }}
                  />
                ),
              )}
              {positioned[index].map(
                ({ appointment, column, columns: lanes }) => {
                  const patient = patients.find(
                    (record) => record.id === appointment.patientId,
                  );
                  const name = patient?.name ?? "Patient introuvable";
                  const description = `${name}, ${appointment.startTime}–${endTime(appointment.startTime, appointment.durationMinutes)}, ${appointmentTypes[appointment.type]}, ${appointmentStatuses[appointment.status].label}`;
                  return (
                    <Link
                      key={appointment.id}
                      href={`/rendez-vous/${appointment.id}`}
                      aria-label={description}
                      title={description}
                      className={cn(
                        "absolute z-10 flex flex-col gap-1 rounded-lg border p-2 shadow-sm hover:border-primary scroll-mt-16",
                        appointmentStatuses[appointment.status].className,
                      )}
                      style={{
                        top:
                          ((parseLocalTime(appointment.startTime) ?? start) -
                            start) *
                          scale,
                        height: appointment.durationMinutes * scale - 2,
                        left: `calc(${(column * 100) / lanes}% + 3px)`,
                        width: `calc(${100 / lanes}% - 6px)`,
                      }}
                    >
                      <p className="text-[11px] leading-4 tabular-nums">
                        {appointment.startTime}–
                        {endTime(
                          appointment.startTime,
                          appointment.durationMinutes,
                        )}{" "}
                        · {appointment.durationMinutes} min
                      </p>
                      <p className="truncate text-xs leading-4 font-semibold">
                        {name}
                      </p>
                      <p className="text-[11px] leading-3">
                        {appointmentTypes[appointment.type]}
                      </p>
                      <p className="text-[11px] leading-3 font-semibold">
                        {appointmentStatuses[appointment.status].label}
                      </p>
                    </Link>
                  );
                },
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
