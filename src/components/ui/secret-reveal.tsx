"use client"

import type { ReactNode } from "react"
import { ShieldAlert } from "lucide-react"
import { CopyButton } from "@/components/ui/copy-button"

interface SecretRevealProps {
    value: string
    /** Texto do toast e do rótulo acessível (ex.: "Token"). */
    noun?: string
    /** Aviso abaixo do valor. */
    hint?: ReactNode
}

/** Valor secreto que aparece UMA vez: código, Copiar e o aviso de uso. */
export function SecretReveal({ value, noun = "Token", hint }: SecretRevealProps) {
    return (
        <>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
                <CopyButton value={value} label={`Copiar ${noun.toLowerCase()}`} successMessage={`${noun} copiado.`} variant="outline" size="sm" resetMs={null} />
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
