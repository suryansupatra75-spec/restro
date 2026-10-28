import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

export interface SectionHeadingProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  badge?: string;
  align?: "left" | "center";
}

export function SectionHeading({
  title,
  subtitle,
  badge,
  align = "center",
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 mb-10 sm:mb-12",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className || ""
      )}
      {...props}
    >
      {badge && <Badge variant="primary">{badge}</Badge>}
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="max-w-2xl text-lg text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default SectionHeading;
