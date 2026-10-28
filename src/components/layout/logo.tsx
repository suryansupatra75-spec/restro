import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { UtensilsCrossed } from "lucide-react";

export interface LogoProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  className?: string;
  withText?: boolean;
}

export function Logo({ className, withText = true, ...props }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2 text-xl font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md",
        className || ""
      )}
      {...props}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
      </div>
      {withText && <span className="text-foreground">RestaurantSaaS</span>}
    </Link>
  );
}

export default Logo;
