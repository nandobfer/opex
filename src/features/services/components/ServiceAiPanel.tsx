"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Loader2, RefreshCw, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useRegenerateServiceAi } from "../hooks"
import type { ServiceDto } from "../types"

/**
 * Conteúdo gerado por IA de um serviço (título, resumo e tags) com o estado da geração: indicador
 * "Gerando IA…" enquanto pendente, "Gerar novamente" em caso de falha (ou para refazer) e as tags
 * como chips. Nunca bloqueia o serviço: ele continua válido e somando mesmo sem a IA.
 */
export function ServiceAiPanel({ service }: { service: ServiceDto }) {
    const reduceMotion = useReducedMotion()
    const regenerate = useRegenerateServiceAi(service.id)

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                    Conteúdo por IA
                </span>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => regenerate.mutate()} disabled={regenerate.isPending || service.aiStatus === "pending"}>
                    {regenerate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                    Gerar novamente
                </Button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={service.aiStatus} initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: 0.2 }}>
                    {service.aiStatus === "pending" && (
                        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            Gerando IA…
                        </p>
                    )}
                    {service.aiStatus === "error" && <p className="text-sm text-destructive">{service.aiError ?? "Não foi possível gerar o conteúdo por IA."}</p>}
                    {service.aiStatus === "done" && (
                        <div className="space-y-2">
                            {service.title && <p className="text-sm font-medium">{service.title}</p>}
                            {service.summary && <p className="text-sm text-muted-foreground">{service.summary}</p>}
                            {service.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {service.tags.map((tag) => (
                                        <Badge key={tag.id} variant="secondary">
                                            {tag.label}
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">Sem tags.</p>
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}
