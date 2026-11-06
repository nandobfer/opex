"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { USAGE_LEVEL_CLASSES, USAGE_UNKNOWN_DOT_CLASS, type UsageLevel } from "@/components/metrics/usage-level"

const LEVEL_TEXT: Readonly<Record<UsageLevel | "unknown", string>> = { ok: "normal", warning: "atenção", critical: "crítico", unknown: "sem dados" }

function Dot({ name, level, side }: { name: string; level: UsageLevel | null; side: "left" | "right" }) {
    const reduceMotion = useReducedMotion()
    const key = level ?? "unknown"
    return (
        <span className={cn("absolute -top-1 flex h-2 w-2", side === "left" ? "-left-1" : "-right-1")} data-testid={`status-dot-${side}`} data-level={key}>
            <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                    key={key}
                    initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={reduceMotion ? undefined : { scale: 0.4, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={cn("h-2 w-2 rounded-full ring-2 ring-sidebar", level ? USAGE_LEVEL_CLASSES[level].dot : USAGE_UNKNOWN_DOT_CLASS)}
                    aria-hidden
                />
            </AnimatePresence>
            <span className="sr-only">
                {name}: {LEVEL_TEXT[key]}
            </span>
        </span>
    )
}

/** Duas bolinhas sobre o ícone: à esquerda o servidor, à direita a quota (pior faixa; cinza sem dado confiável). */
export function StatusDots({ server, quota }: { server: UsageLevel | null; quota: UsageLevel | null }) {
    return (
        <>
            <Dot name="Servidor" level={server} side="left" />
            <Dot name="Quota" level={quota} side="right" />
        </>
    )
}
