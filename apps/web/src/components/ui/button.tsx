import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm text-xs font-mono font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-emerald-500 text-zinc-950 font-bold hover:bg-emerald-400 active:bg-emerald-600 shadow-sm",
        destructive:
          "bg-rose-900/80 text-rose-100 hover:bg-rose-800 border border-rose-700/60",
        outline:
          "border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900 text-zinc-200 hover:text-white",
        secondary:
          "bg-zinc-900 text-zinc-200 hover:bg-zinc-800 border border-zinc-800",
        ghost: "hover:bg-zinc-900 hover:text-white text-zinc-400",
        link: "text-emerald-400 underline-offset-4 hover:underline",
        cyan: "bg-cyan-500 text-zinc-950 font-bold hover:bg-cyan-400 shadow-sm",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 px-2.5 text-[11px]",
        lg: "h-9 px-4 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
