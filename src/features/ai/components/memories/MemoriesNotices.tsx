"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ArrowRightLeft, Layers } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useMemoriesMeta } from "../../hooks/useMemories"
import type { MemoriesMetaDto } from "../../types"

const MIGRATION_HREF = "/integracoes/engramind?aba=migracao"
const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

const when = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—")

/** Memórias fora do texto completo do contexto de algum agente que lê este canal. */
export function outsideFor(meta: MemoriesMetaDto | undefined, channel: string | null): number {
    if (!meta || !channel) return 0
    return Math.max(0, ...meta.outside.filter((row) => row.channels.includes(channel)).map((row) => row.outside))
}

/**
 * Avisos dos cards de memórias (e da aba Engramind): migração pendente, Engramind indisponível (os
 * agentes usam o contexto em cache) e memórias fora do contexto. Fica sempre montado e reage ao tempo
 * real (os avisos aparecem e somem sem recarregar).
 */
export function MemoriesNotices({ meta, channel }: { meta: MemoriesMetaDto | undefined; channel?: string | null }) {
    const outside = outsideFor(meta, channel ?? null)
    const unavailable = meta?.availability.unavailable === true
    return (
        <div className="flex flex-col gap-2" data-testid="memories-notices">
            <AnimatePresence initial={false}>
                {meta?.migrationPending && (
                    <motion.div key="migration" {...reveal} className="overflow-hidden">
                        <p className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-foreground" data-testid="memories-migration-pending">
                            <ArrowRightLeft className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                            <span className="flex-1">Migração de memórias pendente: os agentes só recebem o que já está no Engramind.</span>
                            <Link href={MIGRATION_HREF} className="font-medium text-primary underline-offset-2 hover:underline">
                                Migrar memórias
                            </Link>
                        </p>
                    </motion.div>
                )}
                {unavailable && (
                    <motion.div key="unavailable" {...reveal} className="overflow-hidden">
                        <p className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground" data-testid="memories-unavailable" title={meta?.availability.reason ?? undefined}>
                            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                            {meta?.availability.lastOkAt ? `Engramind indisponível: agentes usando o contexto de ${when(meta.availability.lastOkAt)}` : "Engramind indisponível: turno sem memórias"}
                        </p>
                    </motion.div>
                )}
                {outside > 0 && (
                    <motion.div key="outside" {...reveal} className="overflow-hidden">
                        <p className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground" data-testid="memories-outside">
                            <Layers className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="flex-1">
                                {outside === 1 ? "1 memória ficou" : `${outside} memórias ficaram`} fora do texto completo do contexto (orçamento do Engramind). Consolide ou aumente o orçamento.
                            </span>
                            <Link href="/integracoes/engramind?aba=configuracoes" className="font-medium text-primary underline-offset-2 hover:underline">
                                Configurações
                            </Link>
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

/** Avisos com os metadados lidos aqui (aba Conexão do Engramind). */
export function MemoriesNoticesBlock() {
    const meta = useMemoriesMeta()
    return <MemoriesNotices meta={meta.data} />
}
