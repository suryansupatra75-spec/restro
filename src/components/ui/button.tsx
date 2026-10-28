import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  href?: string;
}

export const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps & React.AnchorHTMLAttributes<HTMLAnchorElement>>(
  ({ className, variant = "primary", size = "md", href, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background";
    
    const variants = {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
      ghost: "hover:bg-surface-muted hover:text-foreground",
      outline: "border border-border bg-transparent hover:bg-surface-muted hover:text-foreground",
    };
    
    const sizes = {
      sm: "h-9 px-3",
      md: "h-10 px-4 py-2",
      lg: "h-11 px-8 text-base",
    };

    const classes = cn(baseStyles, variants[variant], sizes[size], className || "");

    if (href) {
      return (
        <a href={href} className={classes} ref={ref as React.Ref<HTMLAnchorElement>} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)} />
      );
    }

    return (
      <button className={classes} ref={ref as React.Ref<HTMLButtonElement>} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)} />
    );
  }
);
Button.displayName = "Button";

export default Button;
