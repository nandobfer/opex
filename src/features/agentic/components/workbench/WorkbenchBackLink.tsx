"use client"

import { createContext, useContext, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const BackHrefContext = createContext<string | null>(null)

/** Destino do "Voltar para tarefas" da mesa (a Central de desenvolvimento fornece `/desenvolvimento`). */
export function WorkbenchBackHrefProvider({ href, children }: { href: string | null; children: ReactNode }) {
    return <BackHrefContext.Provider value={href}>{children}</BackHrefContext.Provider>
}

/**
 * "Voltar para tarefas" do celular (`< lg`, OPE-166): botão de ícone na própria linha do cabeçalho da mesa,
 * sem faixa própria acima dela. Some no desktop, onde a lista de tarefas está ao lado.
 */
export function WorkbenchBackLink({ className }: { className?: string }) {
    const href = useContext(BackHrefContext)
    if (!href) return null
    return (
        <Button asChild variant="ghost" size="icon" className={cn("h-9 w-9 shrink-0 lg:hidden", className)}>
            <Link href={href} aria-label="Voltar para tarefas">
                <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
        </Button>
    )
}
