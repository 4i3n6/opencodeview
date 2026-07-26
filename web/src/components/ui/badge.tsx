import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--color-panel-2)] text-[var(--color-muted)]",
        good: "bg-[color-mix(in_oklab,var(--color-good)_15%,transparent)] text-[var(--color-good)] border-[color-mix(in_oklab,var(--color-good)_35%,transparent)]",
        warn: "bg-[color-mix(in_oklab,var(--color-warn)_15%,transparent)] text-[var(--color-warn)] border-[color-mix(in_oklab,var(--color-warn)_35%,transparent)]",
        bad: "bg-[color-mix(in_oklab,var(--color-bad)_15%,transparent)] text-[var(--color-bad)] border-[color-mix(in_oklab,var(--color-bad)_35%,transparent)]",
        accent: "bg-[color-mix(in_oklab,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] border-[color-mix(in_oklab,var(--color-accent)_35%,transparent)]",
        purple: "bg-[color-mix(in_oklab,var(--color-purple)_15%,transparent)] text-[var(--color-purple)] border-[color-mix(in_oklab,var(--color-purple)_35%,transparent)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
