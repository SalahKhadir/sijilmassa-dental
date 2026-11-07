export function formatDemoDate(date: string) {
  return new Intl.DateTimeFormat("fr-MA", {
    dateStyle: "full",
    timeZone: "Africa/Casablanca",
  }).format(new Date(`${date}T12:00:00Z`));
}
/** Affichage uniquement : les montants source sont stockés en centimes entiers. */
export function formatMAD(centimes: number) {
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency: "MAD",
  }).format(centimes / 100);
}
