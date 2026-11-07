import { CalendarDays } from "lucide-react";
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <CalendarDays aria-hidden="true" className="mb-4 size-9 text-secondary" />
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
