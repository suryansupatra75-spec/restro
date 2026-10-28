import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  variant?: "default" | "muted" | "primary";
}

export function Section({ className, children, variant = "default", ...props }: SectionProps) {
  const variants = {
    default: "bg-background",
    muted: "bg-surface-muted",
    primary: "bg-primary text-primary-foreground",
  };

  return (
    <section
      className={cn("py-16 sm:py-20 lg:py-24", variants[variant], className || "")}
      {...props}
    >
      {children}
    </section>
  );
}

export default Section;
