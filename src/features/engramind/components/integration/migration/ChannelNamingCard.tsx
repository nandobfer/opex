"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRightLeft, Loader2, RotateCw, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import type { ChannelMigrationStateDto } from "../../../channel-migration/types"
import { useChannelMigration, useStartChannelMigration } from "../../../hooks/useChannelMigration"
import { Section } from "../../shared/Section"
import { ChannelMigrationReport } from "./ChannelMigrationReport"

const fade = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }

const FORWARD_STEPS = [
    "Backup: o script de export roda no host e o total por canal e por status fica guardado.",
    "Manutenção: os agentes usam o contexto em cache e as gravações de memória esperam.",
    "Os canais agentes/... ganham o nome do app (opex/agentes/...), com nome, descrição, prioridade e configurações.",
    "As memórias são MOVIDAS (id, texto e histórico iguais); duplicatas ficam na origem para você resolver.",
    "As assinaturas (inclusive de outros apps) passam para os nomes novos, com o mesmo modo, acesso e prioridade.",
    "Novo export e conferência: só com tudo igual os canais antigos são arquivados. Nada é excluído.",
]

/** Estado da migração em uma frase. */
function statusText(state: ChannelMigrationStateDto): string {
    const current = state.current
    if (current?.status === "running") return `Em andamento (${current.step}) — pode fechar a tela.`
    if (current?.status === "interrupted") return "A execução foi interrompida: rode de novo para continuar de onde parou."
    if (current?.status === "failed") return current.error ?? "A migração parou: rode de novo para continuar."
    if (current?.status === "verify_failed") return "A conferência não bateu: nada foi arquivado e a manutenção continua."
    return state.namespace.prefixed ? `Os canais usam o nome do app (${state.namespace.app}/agentes/...).` : "Os canais ainda usam os nomes antigos (agentes/...)."
}

/**
 * Migração dos nomes dos canais (OPE-206, aba Migração): leva os canais do dono de `agentes/...` para
 * `<app>/agentes/...` com backup, manutenção, conferência e arquivamento só no fim; retoma de onde parou e oferece a
 * volta atrás. Ações críticas pedem confirmação.
 */
export function ChannelNamingCard() {
    const migration = useChannelMigration()
    const start = useStartChannelMigration()
    const [script, setScript] = useState<string | null>(null)
    const [confirm, setConfirm] = useState<"forward" | "revert" | null>(null)
    const state = migration.data
    if (migration.isLoading) return <ChannelNamingSkeleton />
    if (migration.isError || !state) {
        return (
            <Section title="Nomes dos canais" description="Não foi possível ler o estado da migração dos canais.">
                <Button type="button" size="sm" variant="outline" onClick={() => void migration.refetch()}>
                    <RotateCw className="mr-1.5 h-4 w-4" aria-hidden /> Tentar novamente
                </Button>
            </Section>
        )
    }
    const current = state.current
    const scriptPath = script ?? state.scriptPath ?? ""
    const running = current?.status === "running"
    const resumable = current && ["interrupted", "failed", "verify_failed"].includes(current.status)
    const resumeDirection = current?.direction ?? "forward"
    const run = (direction: "forward" | "revert") => start.mutate({ direction, ...(scriptPath.trim() ? { scriptPath: scriptPath.trim() } : {}) }, { onSettled: () => setConfirm(null) })
    return (
        <Section
            title="Nomes dos canais"
            info="Cada instância do Opex usa o próprio app do Engramind e os canais levam o nome do app na frente (OPE-206). A migração move as memórias do dono para os nomes novos sem perder, duplicar ou alterar nenhuma."
            description={statusText(state)}
            actions={
                <>
                    {resumable && (
                        <Button type="button" size="sm" disabled={start.isPending || !scriptPath.trim()} onClick={() => run(resumeDirection)}>
                            <RotateCw className="mr-1.5 h-4 w-4" aria-hidden /> Continuar de onde parou
                        </Button>
                    )}
                    {!resumable && state.canMigrate && (
                        <Button type="button" size="sm" disabled={start.isPending || !scriptPath.trim()} onClick={() => setConfirm("forward")}>
                            <ArrowRightLeft className="mr-1.5 h-4 w-4" aria-hidden /> Migrar canais para o nome do app
                        </Button>
                    )}
                    {!resumable && state.canRevert && (
                        <Button type="button" size="sm" variant="outline" disabled={start.isPending || !scriptPath.trim()} onClick={() => setConfirm("revert")}>
                            <Undo2 className="mr-1.5 h-4 w-4" aria-hidden /> Desfazer migração
                        </Button>
                    )}
                </>
            }
        >
            <div className="space-y-1.5">
                <Label htmlFor="channel-migration-script">Script de export das memórias (host)</Label>
                <Input id="channel-migration-script" className="bg-transparent" value={scriptPath} disabled={running} placeholder="/home/usuario/linux-scripts/export-engramind-memories.mjs" onChange={(event) => setScript(event.target.value)} />
                <p className="text-xs text-muted-foreground">Roda no host pelo OpenCode do Ambiente do Engramind, no backup e na conferência. Sem ele, a migração não começa.</p>
            </div>
            <AnimatePresence mode="wait" initial={false}>
                {running && (
                    <motion.p key="running" {...fade} className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="channel-migration-running">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> {current.movedCount} memória(s) movida(s) até agora.
                    </motion.p>
                )}
            </AnimatePresence>
            {current && <ChannelMigrationReport migration={current} />}
            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={confirm === "revert" ? "Desfazer a migração dos canais?" : "Migrar os canais para o nome do app?"}
                description={
                    confirm === "revert"
                        ? "As memórias voltam para os canais antigos (agentes/...), as assinaturas voltam aos alvos antigos e os canais novos são arquivados depois da conferência. Os agentes ficam em manutenção durante a volta."
                        : (
                              <ol className="list-decimal space-y-1 pl-4 text-left">
                                  {FORWARD_STEPS.map((item) => (
                                      <li key={item}>{item}</li>
                                  ))}
                              </ol>
                          )
                }
                confirmLabel={confirm === "revert" ? "Desfazer migração" : "Migrar canais"}
                pending={start.isPending}
                onConfirm={() => confirm && run(confirm)}
            />
        </Section>
    )
}

export function ChannelNamingSkeleton() {
    return (
        <div className="space-y-3 rounded-xl border p-6" aria-busy="true" data-testid="channel-naming-skeleton">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-9 w-full" />
        </div>
    )
}
