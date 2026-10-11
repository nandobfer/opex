"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Building2, Clock, Loader2, RefreshCw, Wallet, X } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumberBR } from "@/lib/format"
import { formatFactorLabel, formatHoursLabel } from "@/features/orcamentos/logic"
import type { ClienteOrcamentoDto, DraftEstimateDto } from "@/features/orcamentos/types"

interface PreviewEstimateCardProps {
    estimate: DraftEstimateDto | null
    estimating: boolean
    /** Progresso corrente da estimativa (ex.: "Consultando (banco)…"). */
    status?: string | null
    error: string | null
    onRetry: () => void
    /** Clientes ativos que incluem o repositório do rascunho. */
    clients: readonly ClienteOrcamentoDto[]
    /** Cliente escolhido para o custo; `null` = nenhum (só as horas reais). */
    clientId: string | null
    /** Escolhe/troca/limpa o cliente — dispara a reestimativa (só o custo). */
    onPickClient: (clientId: string | null) => void
    clientsLoading?: boolean
}

/**
 * Card de horas e custo da **prévia do dono** (2ª fase). As **horas reais** aparecem sempre; o
 * **cliente é opcional** e, escolhido, acrescenta o prazo inflado (`H × fator`) e o faturamento.
 * Selecionar/trocar/limpar o cliente reestima apenas o custo (sem nova chamada de IA).
 */
export function PreviewEstimateCard({ estimate, estimating, status, error, onRetry, clients, clientId, onPickClient, clientsLoading = false }: PreviewEstimateCardProps) {
    const selected = clients.find((client) => client.id === clientId) ?? null

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Horas e custo estimados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <SearchPicker
                            trigger={
                                <FieldTrigger
                                    id="preview-estimate-client"
                                    placeholder="Escolher cliente (opcional)"
                                    disabled={estimating}
                                    value={
                                        selected ? (
                                            <span className="flex items-center gap-1.5">
                                                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> {selected.name}
                                            </span>
                                        ) : undefined
                                    }
                                />
                            }
                            items={clients}
                            getKey={(item) => item.id}
                            searchKeys={["name"]}
                            loading={clientsLoading}
                            disabled={estimating}
                            renderItem={(item) => (
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate font-medium">{item.name}</span>
                                    <span className="truncate text-xs text-muted-foreground">
                                        Fator {formatFactorLabel(item.profitFactor)} · R$ {formatNumberBR(item.hourlyRate)}/h
                                    </span>
                                </span>
                            )}
                            onPick={(item) => onPickClient(item.id)}
                            matchTriggerWidth
                            searchLabel="Buscar cliente"
                            listLabel="Clientes do repositório"
                            emptyText="Nenhum cliente ativo inclui este repositório"
                            emptySearchText="Nenhum cliente encontrado"
                        />
                        {clientId && (
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onPickClient(null)} disabled={estimating} aria-label="Limpar cliente">
                                <X className="h-4 w-4" aria-hidden />
                            </Button>
                        )}
                    </div>
                    {selected && (
                        <p className="text-xs text-muted-foreground">
                            Fator {formatFactorLabel(selected.profitFactor)} · R$ {formatNumberBR(selected.hourlyRate)}/h
                        </p>
                    )}
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    {estimating ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3" aria-label="Calculando horas e custo">
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {status ?? "Calculando horas e custo…"}
                            </p>
                            <div className="space-y-2">
                                <motion.div className="h-6 rounded bg-muted" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="h-6 rounded bg-muted" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: 0.15 }} />
                            </div>
                        </motion.div>
                    ) : estimate ? (
                        <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="space-y-3">
                            <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <Clock className="h-3.5 w-3.5" aria-hidden /> Horas estimadas
                                </span>
                                <span className="font-mono font-medium">
                                    <AnimatedNumber value={estimate.hours} formatter={(value) => `${formatHoursLabel(value)} h`} />
                                </span>
                            </div>
                            {estimate.clientHours != null && (
                                <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Clock className="h-3.5 w-3.5" aria-hidden /> Prazo do cliente
                                    </span>
                                    <span className="font-mono font-medium">
                                        <AnimatedNumber value={estimate.clientHours} formatter={(value) => `${formatHoursLabel(value)} h`} />
                                    </span>
                                </div>
                            )}
                            {estimate.billingBrl != null && (
                                <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Wallet className="h-3.5 w-3.5" aria-hidden /> Faturamento
                                    </span>
                                    <span className="font-mono font-medium">
                                        <AnimatedNumber value={estimate.billingBrl} formatter={(value) => `R$ ${formatNumberBR(value)}`} />
                                    </span>
                                </div>
                            )}
                            {estimate.clientHours == null && <p className="text-xs text-muted-foreground">Escolha um cliente para ver o prazo e o faturamento.</p>}
                        </motion.div>
                    ) : error ? (
                        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                            <p className="text-sm text-destructive">{error}</p>
                            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onRetry}>
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
                            </Button>
                        </motion.div>
                    ) : (
                        <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2" aria-hidden>
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-full" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
