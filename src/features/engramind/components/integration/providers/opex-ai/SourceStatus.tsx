"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { OPEX_KEY_PROVIDER_NAMES, usesOpexKey } from "../../../../ai-source"
import { AI_SOURCE_HELP, EMBEDDING_EXTRA_LABELS } from "../../../../help/ai-source"
import type { AiSourceSectionDto } from "../../../../types"
import { HelpBadge } from "../../../shared/Badges"
import { formatDateTime } from "../../../shared/format"

export const providerLabel = (provider: string | null) =>
    !provider ? "—" : usesOpexKey(provider) ? OPEX_KEY_PROVIDER_NAMES[provider] : (EMBEDDING_EXTRA_LABELS[provider as keyof typeof EMBEDDING_EXTRA_LABELS] ?? provider)

/** Selo de origem e estado da cópia da chave de uma seção, com "Reenviar a chave". */
export function SourceStatus({ state, onResend, resending }: { state: AiSourceSectionDto; onResend: () => void; resending: boolean }) {
    const fromOpex = state.origin === "opex"
    const label = fromOpex
        ? `Vem do Opex · ${providerLabel(state.provider)}${state.model ? ` · ${state.model}` : ""}`
        : state.origin === "engramind"
          ? `Configurado no Engramind · ${state.current.provider ?? "sem provedor"}${state.current.model ? ` · ${state.current.model}` : ""}`
          : `Ainda não aplicado · em uso: ${state.current.provider ?? "sem provedor"}${state.current.model ? ` · ${state.current.model}` : ""}`
    const needsKey = fromOpex && state.provider !== null && usesOpexKey(state.provider)
    const unsynced = needsKey && (state.syncError !== null || state.sourceKeyMissing)
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid={`source-status-${state.section}`}>
            <HelpBadge value={label} tone={fromOpex ? "success" : state.origin === "engramind" ? "warning" : "outline"} help={AI_SOURCE_HELP.origin} />
            {needsKey && !unsynced && state.syncedAt && <span className="text-muted-foreground">Chave copiada em {formatDateTime(state.syncedAt)}</span>}
            <AnimatePresence initial={false}>
                {unsynced && (
                    <motion.span key="unsynced" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.2 }} className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1 text-warning">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                            {state.sourceKeyMissing ? `A chave do ${providerLabel(state.provider)} foi apagada no Opex` : "Chave não sincronizada"}
                        </span>
                        <InfoTooltip text={state.syncError ? `${AI_SOURCE_HELP.sync} Último erro: ${state.syncError}` : AI_SOURCE_HELP.sync} label="Sincronização da chave" />
                        {!state.sourceKeyMissing && (
                            <Button type="button" size="sm" variant="outline" className="h-7" onClick={onResend} disabled={resending}>
                                {resending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />} Reenviar a chave
                            </Button>
                        )}
                    </motion.span>
                )}
            </AnimatePresence>
        </div>
    )
}
