import type { ReactNode } from "react";
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0 [overflow-wrap:anywhere] sm:flex-[1_1_18rem]">
        {eyebrow && (
          <p className="mb-1 text-sm font-semibold text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
