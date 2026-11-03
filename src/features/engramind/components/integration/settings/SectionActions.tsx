"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Eye, RefreshCw, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { OptionTabs } from "@/components/ui/option-tabs"
import { RunNowButton, RunNowDialog } from "@/components/ui/run-now-button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiErrorMessage } from "@/lib/api"
import type { ConsolidationRun, EngramindChannel, EngramindStatus } from "../../../types"
import { engramindSend, useEngramindList, useEngramindMutation, useEngramindQuery } from "../../../hooks/useEngramind"
import { formatDateTime } from "../../shared/format"
import { ConsolidationResult } from "./ConsolidationResult"

/**
 * "Executar agora" das seções de Configurações (OPE-117): executa a configuração SALVA. Com alterações
 * pendentes, a confirmação vira "Salvar e executar" (grava antes; falha ao gravar não executa).
 */
export interface SectionRunProps {
    /** Alterações pendentes no formulário (qualquer seção: o PUT é tudo ou nada). */
    dirty: boolean
    /** Grava as alterações pendentes; `false` quando a gravação falhou (nada é executado). */
    saveDraft: () => Promise<boolean>
}

type Scope = "all" | "channel"
const SCOPES: { value: Scope; label: string }[] = [
    { value: "all", label: "Todos com consolidação ativa" },
    { value: "channel", label: "Um canal" },
]

/** Consolidação: escopo (todos ou um canal), "Ver plano" (`dry_run`) e "Executar agora" (`run_consolidation`). */
export function ConsolidationActions({ dirty, saveDraft }: SectionRunProps) {
    const channels = useEngramindList<EngramindChannel>("channels", "channels", undefined, { all: true })
    const [scope, setScope] = useState<Scope>("all")
    const [channel, setChannel] = useState("")
    const [confirm, setConfirm] = useState<"plan" | "run" | null>(null)
    const [result, setResult] = useState<ConsolidationRun | null>(null)
    const [error, setError] = useState<{ message: string; dryRun: boolean } | null>(null)
    const run = useEngramindMutation((input: { channel?: string; dry_run?: boolean }) => engramindSend<ConsolidationRun>("post", "consolidation/run", input), { invalidate: ["jobs", "status"], silentError: true })
    const active = channels.items.filter((item) => !item.archived_at)
    const target = scope === "channel" ? channel : ""
    const scopeText = scope === "channel" ? (channel ? `o canal ${channel}` : "um canal") : "todos os canais com consolidação ativa"
    const blockReason = scope === "channel" && !channel ? "Escolha o canal" : null

    const execute = async (dryRun: boolean) => {
        setConfirm(null)
        if (dirty && !(await saveDraft())) return
        setError(null)
        try {
            const response = await run.mutateAsync({ ...(target ? { channel: target } : {}), ...(dryRun ? { dry_run: true } : {}) })
            setResult(response)
            toast.success(dryRun ? "Plano da consolidação pronto (nada foi gravado)" : `Consolidação enfileirada: ${response.jobs.length} job(s)`)
        } catch (reason) {
            const message = apiErrorMessage(reason, "Não foi possível executar a consolidação.")
            setError({ message, dryRun })
            toast.error(message)
        }
    }

    return (
        <div className="space-y-3 rounded-lg border border-dashed p-3" data-testid="consolidation-actions">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <OptionTabs aria-label="Escopo da consolidação" options={SCOPES} value={scope} onChange={setScope} disabled={run.isPending} />
                <AnimatePresence initial={false}>
                    {scope === "channel" && (
                        <motion.div key="channel" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} className="w-full min-w-0 sm:flex-1">
                            <Select value={channel} onValueChange={setChannel} disabled={run.isPending}>
                                <SelectTrigger aria-label="Canal da consolidação" className="w-full bg-transparent">
                                    <SelectValue placeholder="Escolha o canal" />
                                </SelectTrigger>
                                <SelectContent>
                                    {active.map((item) => (
                                        <SelectItem key={item.slug} value={item.slug}>
                                            {item.slug}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className="flex flex-wrap gap-2 sm:ml-auto">
                    <RunNowButton label="Consolidação" text="Ver plano" icon={Eye} blockReason={blockReason} pending={run.isPending && run.variables?.dry_run === true} onClick={() => setConfirm("plan")} />
                    <RunNowButton label="Consolidação" blockReason={blockReason} pending={run.isPending && run.variables?.dry_run !== true} onClick={() => setConfirm("run")} />
                </div>
            </div>
            <AnimatePresence initial={false}>
                {error && (
                    <motion.div key="error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {error.message}
                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void execute(error.dryRun)}>
                            <RotateCcw className="mr-1 h-3 w-3" aria-hidden /> Tentar novamente
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence initial={false}>{result && <ConsolidationResult key="result" result={result} />}</AnimatePresence>
            <RunNowDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={confirm === "plan" ? "Ver o plano da consolidação?" : "Executar a consolidação agora?"}
                description={
                    <>
                        Escopo: {scopeText}. {confirm === "plan" ? "O plano lista duplicatas, classificação e desatualizadas sem gravar nada nem chamar o LLM." : "Um job por canal entra na fila com a configuração salva."}
                        {dirty && " Há alterações pendentes no formulário: elas serão salvas antes."}
                    </>
                }
                confirmLabel={confirm === "plan" ? "Ver plano" : "Executar agora"}
                onConfirm={() => void execute(confirm === "plan")}
                extraAction={dirty ? { label: "Salvar e executar", onClick: () => void execute(confirm === "plan") } : undefined}
            />
        </div>
    )
}

/** Embeddings: "Reindexar agora" (`reembed_all`) com o progresso no status. */
export function ReindexAction({ dirty, saveDraft }: SectionRunProps) {
    const status = useEngramindQuery<EngramindStatus>("status")
    const [confirm, setConfirm] = useState(false)
    const reindex = useEngramindMutation(() => engramindSend<{ total?: number }>("post", "embeddings/reembed", {}), { invalidate: ["status"], silentError: true })
    const state = status.data?.embedding?.state
    const blockReason = state === "reindexing" ? "Reindexação em andamento" : state === "off" ? "Embeddings desligados" : null
    const execute = async () => {
        setConfirm(false)
        if (dirty && !(await saveDraft())) return
        try {
            const response = await reindex.mutateAsync(undefined as never)
            toast.success(`Reindexação iniciada${typeof response?.total === "number" ? ` (${response.total} memórias)` : ""}`)
        } catch (reason) {
            toast.error(apiErrorMessage(reason, "Não foi possível reindexar."), { action: { label: "Tentar novamente", onClick: () => void execute() } })
        }
    }
    return (
        <div className="flex flex-wrap items-center gap-2" data-testid="reindex-action">
            {state === "reindexing" && (
                <span className="text-xs text-muted-foreground">
                    Reindexando: {status.data?.embedding?.done ?? 0} de {status.data?.embedding?.total ?? 0}
                </span>
            )}
            <RunNowButton label="Embeddings" text="Reindexar agora" icon={RefreshCw} blockReason={blockReason} pending={reindex.isPending} onClick={() => setConfirm(true)} />
            <RunNowDialog
                open={confirm}
                onOpenChange={setConfirm}
                title="Reindexar todas as memórias agora?"
                description={<>Todas as memórias são revetorizadas com o modelo de embedding salvo. Enquanto isso, a busca por sentido usa os vetores antigos.{dirty && " Há alterações pendentes no formulário: elas serão salvas antes."}</>}
                confirmLabel="Reindexar agora"
                onConfirm={() => void execute()}
                extraAction={dirty ? { label: "Salvar e executar", onClick: () => void execute() } : undefined}
            />
        </div>
    )
}

/** Retenção: sem execução manual no Engramind (só a automática, de hora em hora); mostra a última. */
export function RetentionInfo() {
    const status = useEngramindQuery<EngramindStatus>("status")
    const last = status.data?.retention ?? null
    const removed = last?.removed ? Object.entries(last.removed).filter(([, count]) => count > 0) : []
    return (
        <p className="text-xs text-muted-foreground" data-testid="retention-info">
            A retenção roda automaticamente. Última execução: {last ? formatDateTime(last.last_run_at) : "ainda não rodou"}
            {last && (removed.length ? ` (removidos: ${removed.map(([key, count]) => `${key} ${count}`).join(", ")})` : " (nada removido)")}.
        </p>
    )
}
