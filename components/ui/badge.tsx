import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        primary:
          "bg-[#0066FF] text-white hover:bg-[#0052CC]",
        secondary:
          "bg-[#F7F7F5] text-[#37352F] border border-[#E7E7E5] hover:bg-[#F5F5F4]",
        outline:
          "border border-[#E7E7E5] text-[#73726E] hover:bg-[#F7F7F5]",
        success:
          "bg-[#00C853] text-white",
        warning:
          "bg-[#FFA000] text-white",
        danger:
          "bg-[#D32F2F] text-white",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
