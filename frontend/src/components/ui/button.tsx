import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 rounded-lg border border-transparent text-center text-sm leading-5 font-semibold transition-colors disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border-input bg-surface text-foreground hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        secondary:
          "bg-secondary-tint text-foreground hover:bg-secondary-tint/70",
        destructive: "bg-destructive text-destructive-foreground hover:bg-[color-mix(in_srgb,var(--destructive)_86%,var(--foreground))]",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        icon: "size-11 shrink-0 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
