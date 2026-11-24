"use client"

import { useEffect, useRef, useState, type ComponentProps, type MouseEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { copyText } from "@/lib/clipboard"
import { codeBlockText, type CodeTextNode } from "@/lib/markdown/code-text"
import { cn } from "@/lib/utils"

/** Tempo do check depois de copiar. */
export const CODE_COPIED_MS = 2000
export const COPY_CODE_LABEL = "Copiar bloco de código"

interface MarkdownCodeBlockProps extends ComponentProps<"pre"> {
    /** Nó hast do `pre` (o texto copiado sai dele, não do DOM com os botões de linha). */
    node?: CodeTextNode
}

/**
 * Bloco de código do `Markdown` com o botão de copiar sempre visível no canto superior direito. O
 * botão fica numa faixa que não rola (o `<pre>` termina antes dela), então nunca cobre o código nem o
 * botão de citar no fim de cada linha.
 */
export function MarkdownCodeBlock({ node, className, ...props }: MarkdownCodeBlockProps) {
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current)
    }, [])

    const copy = async (event: MouseEvent) => {
        event.stopPropagation()
        if (!(await copyText(codeBlockText(node)))) {
            toast.error("Não foi possível copiar o bloco de código")
            return
        }
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), CODE_COPIED_MS)
    }

    const Icon = copied ? Check : Copy
    return (
        <div className="relative mb-2 rounded-md border bg-muted/60">
            <pre className={cn("mr-8 overflow-x-auto p-3 text-xs [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-foreground/90", className)} {...props} />
            <button
                type="button"
                aria-label={COPY_CODE_LABEL}
                title={COPY_CODE_LABEL}
                data-md-code-copy
                data-copied={copied ? "" : undefined}
                onClick={copy}
                className={cn(
                    "absolute right-1.5 top-1.5 inline-flex h-6 w-6 select-none items-center justify-center rounded hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    copied ? "text-primary" : "text-muted-foreground",
                )}
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                        key={copied ? "check" : "copy"}
                        className="inline-flex"
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                    </motion.span>
                </AnimatePresence>
                <span className="sr-only" aria-live="polite">
                    {copied ? "Copiado" : ""}
                </span>
            </button>
        </div>
    )
}
