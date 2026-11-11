import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { appointmentFixtures } from "../src/data/appointments.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { appointmentPatient } from "../src/lib/appointments/selectors.ts";
import {
  appointmentStatuses,
  appointmentStatusValues,
} from "../src/lib/appointments/types.ts";
import { AppointmentStatus } from "../src/components/appointments/appointment-status.tsx";
import { AppointmentAgenda } from "../src/components/appointments/appointment-agenda.tsx";
import { CalendarGrid } from "../src/components/appointments/calendar-grid.tsx";
import {
  AppointmentNotice,
  AppointmentLoading,
  AppointmentError,
  AppointmentNotFound,
} from "../src/components/appointments/appointment-states.tsx";
const patients = patientFixtures.map(appointmentPatient);
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));

test("all appointment statuses have explicit French text and an icon", () => {
  for (const status of appointmentStatusValues) {
    const markup = render(AppointmentStatus, { status });
    assert(markup.includes(appointmentStatuses[status].label));
    assert(markup.includes("<svg"));
  }
});

test("agenda displays patient details derived from the repository, categories, durations and historical statuses", () => {
  const appointments = appointmentFixtures.filter(
    (appointment) => appointment.date === "2026-11-07",
  );
  const markup = render(AppointmentAgenda, {
    appointments,
    patients,
    showDate: true,
  });
  assert(markup.includes("Annulé"));
  assert(markup.includes("Absent"));
  assert(markup.includes("Terminé"));
  assert(markup.includes("patient-demo") === false); // only appointment ids are links in an agenda
  assert(markup.includes("appointment-demo-008"));
  assert(markup.includes("09:30–10:15"));
  assert(markup.includes("45 min"));
  assert(!markup.includes("DEMO-CIN"));
  assert(!markup.includes("Antécédents médicaux"));
  assert(
    render(AppointmentAgenda, { appointments: [], patients }).includes(
      "Aucun rendez-vous pour cette période",
    ),
  );
  assert(
    render(AppointmentAgenda, {
      appointments: appointments.slice(0, 1),
      patients: [],
    }).includes("Patient introuvable"),
  );
});

test("time grid positions all overlapping histories and keeps independent keyboard-operable links", () => {
  const appointments = appointmentFixtures.filter(
    (appointment) => appointment.date === "2026-11-07",
  );
  const markup = render(CalendarGrid, {
    dates: ["2026-11-07"],
    appointments,
    patients,
  });
  for (const appointment of appointments)
    assert(markup.includes(`href="/demo/rendez-vous/${appointment.id}"`));
  assert(markup.includes("height:88px"));
  assert(markup.includes("height:133px"));
  assert(markup.includes("Annulé"));
  assert(markup.includes("Absent"));
  assert(markup.includes('tabindex="0"'));
});

test("appointment loading, empty, error, unknown and development schedule states remain explicit", () => {
  assert(render(AppointmentLoading).includes('role="status"'));
  const error = render(AppointmentError, { retry() {} });
  assert(error.includes('role="alert"'));
  assert(error.includes("Réessayer"));
  assert(render(AppointmentNotFound).includes("Rendez-vous introuvable"));
  const notice = render(AppointmentNotice, { schedule: true });
  assert(notice.includes("Horaires de développement"));
  assert(notice.includes("réinitialisés"));
  assert(notice.includes("30–180"));
});
