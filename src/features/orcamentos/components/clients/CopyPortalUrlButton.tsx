"use client"

import { useCallback, useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"

/** URL absoluta do portal a partir do caminho relativo (com o subcaminho público). */
export function portalUrlFrom(portalPath: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    return `${origin}${withBasePath(portalPath)}`
}

/** Botão que copia a URL do portal do cliente, com feedback visual (Check + toast). */
export function CopyPortalUrlButton({ portalPath, portalName, className }: { portalPath: string; portalName: string; className?: string }) {
    const [copied, setCopied] = useState(false)

    const copy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(portalUrlFrom(portalPath))
            setCopied(true)
            toast.success("URL do portal copiada")
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error("Não foi possível copiar a URL")
        }
    }, [portalPath])

    return (
        <Button type="button" variant="ghost" size="sm" className={cn("gap-1.5", className)} onClick={() => void copy()} title={`Copiar a URL do portal de ${portalName}`}>
            {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "Copiado" : "Copiar URL"}
        </Button>
    )
}
