"use client"

import { Toaster as Sonner } from "sonner"
import { SAFE_AREA_TOAST_MOBILE_OFFSET } from "@/components/ui/safe-area"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
      <Sonner
          className="toaster group"
          // App instalado (PWA): os toasts não ficam embaixo do notch nem da barra de gestos.
          mobileOffset={SAFE_AREA_TOAST_MOBILE_OFFSET}
          toastOptions={{
              classNames: {
                  toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
                  description: "group-[.toast]:text-muted-foreground",
                  actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
                  cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
                  error: "group-[.toaster]:bg-destructive group-[.toaster]:text-destructive-foreground group-[.toaster]:border-destructive",
                  success: "group-[.toaster]:bg-emerald-600 group-[.toaster]:text-white group-[.toaster]:border-emerald-600",
                  warning: "group-[.toaster]:bg-yellow-600 group-[.toaster]:text-white group-[.toaster]:border-yellow-600",
                  info: "group-[.toaster]:bg-emerald-600 group-[.toaster]:text-white group-[.toaster]:border-emerald-600",
              },
          }}
          {...props}
      />
  )
}

export { Toaster }
