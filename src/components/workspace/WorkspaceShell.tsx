"use client"

import { useRef, type CSSProperties, type ReactNode } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useScrollViewportHeight } from "@/hooks/useScrollViewportHeight"

interface WorkspaceShellProps {
    /**
     * Painel lateral (lista/seletor). É o próprio item flex da casca: quem o constrói aplica a
     * largura fixa (`lg:w-[340px] lg:shrink-0`) — use `WorkspacePane` para o padrão.
     */
    aside: ReactNode
    /** Painel principal. */
    children: ReactNode
    /** Classe extra do painel principal. */
    mainClassName?: string
    /** Link do botão "voltar" mostrado só no celular (junto com `backLabel`). */
    backHref?: string
    backLabel?: string
    /** Chave da troca animada do painel principal (ex.: item selecionado). */
    viewKey: string
    /** No celular mostra somente o painel principal (a lista fica escondida). */
    detailOpen: boolean
    /** Mede a altura visível do `<main>` (desligue enquanto a tela carrega). */
    measure?: boolean
    ariaLabel?: string
    mainTestId?: string
    className?: string
}

/**
 * Casca de tela em duas colunas ocupando a área visível do `<main>` (descontado o padding): painel
 * lateral fixo a partir de `lg` e painel principal expansível. No celular mostra um painel por vez —
 * o principal quando `detailOpen` —, com o botão "voltar" para a lista. Trocar `viewKey` anima só o
 * painel principal: a casca, as colunas e a rolagem ficam.
 */
export function WorkspaceShell({
    aside,
    children,
    mainClassName,
    backHref,
    backLabel,
    viewKey,
    detailOpen,
    measure = true,
    ariaLabel,
    mainTestId,
    className,
}: WorkspaceShellProps) {
    const sectionRef = useRef<HTMLElement>(null)
    const height = useScrollViewportHeight(sectionRef, measure)
    const reduceMotion = useReducedMotion()
    return (
        <motion.section
            ref={sectionRef}
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={height ? ({ "--workspace-height": `${height}px` } as CSSProperties) : undefined}
            className={cn(
                "flex h-[var(--workspace-height,calc(100dvh_-_3rem))] min-h-0 flex-col gap-4 lg:flex-row",
                className,
            )}
        >
            {aside}
            <div
                className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !detailOpen && "max-lg:hidden", mainClassName)}
                data-testid={mainTestId}
            >
                {backHref && backLabel && (
                    <Button asChild variant="ghost" size="sm" className="mb-2 w-fit shrink-0 gap-1.5 lg:hidden">
                        <Link href={backHref}>
                            <ArrowLeft className="h-4 w-4" aria-hidden /> {backLabel}
                        </Link>
                    </Button>
                )}
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={viewKey}
                        initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="flex min-h-0 min-w-0 flex-1 flex-col"
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </div>
        </motion.section>
    )
}
