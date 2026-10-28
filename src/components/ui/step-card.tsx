import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface StepCardProps extends React.HTMLAttributes<HTMLDivElement> {
  stepNumber: number;
  title: string;
  description: string;
  icon: LucideIcon;
}

export function StepCard({
  stepNumber,
  title,
  description,
  icon: Icon,
  className,
  ...props
}: StepCardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center text-center sm:items-start sm:text-left",
        className || ""
      )}
      {...props}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary relative shadow-sm border border-primary/20">
        <Icon className="h-6 w-6" aria-hidden="true" />
        <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {stepNumber}
        </span>
      </div>
      <h3 className="mb-2 text-xl font-semibold">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

export default StepCard;
