export function clinicDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function formatPatientDate(value: string): string {
  if (!value) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-MA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Africa/Casablanca",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}
export function formatPatientTimestamp(value: string): string {
  return new Intl.DateTimeFormat("fr-MA", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Casablanca",
  }).format(new Date(value));
}
