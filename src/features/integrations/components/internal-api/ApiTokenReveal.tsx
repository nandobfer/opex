"use client"

import { useState } from "react"
import { Check, Copy, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

/** O valor do token, que aparece UMA vez: copiar e o aviso de uso. */
export function ApiTokenReveal({ token }: { token: string }) {
    const [copied, setCopied] = useState(false)
    const copy = async () => {
        await navigator.clipboard.writeText(token)
        setCopied(true)
        toast.success("Token copiado.")
    }
    return (
        <>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{token}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => void copy()} aria-label="Copiar token">
                    {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                </Button>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                <span>
                    Use no cabeçalho <code className="font-mono">Authorization: Bearer …</code>. Entregue só a quem vai usá-lo.
                </span>
            </p>
        </>
    )
}
