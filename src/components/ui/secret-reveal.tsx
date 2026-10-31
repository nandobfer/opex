"use client"

import { useState, type ReactNode } from "react"
import { Check, Copy, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface SecretRevealProps {
    value: string
    /** Texto do toast e do rótulo acessível (ex.: "Token"). */
    noun?: string
    /** Aviso abaixo do valor. */
    hint?: ReactNode
}

/** Valor secreto que aparece UMA vez: código, Copiar e o aviso de uso. */
export function SecretReveal({ value, noun = "Token", hint }: SecretRevealProps) {
    const [copied, setCopied] = useState(false)
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            toast.success(`${noun} copiado.`)
        } catch {
            toast.error("Não foi possível copiar: selecione e copie manualmente.")
        }
    }
    return (
        <>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => void copy()} aria-label={`Copiar ${noun.toLowerCase()}`}>
                    {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                </Button>
            </div>
            {hint && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                    <span>{hint}</span>
                </p>
            )}
        </>
    )
}
