"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/feedback/EmptyState"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { LLM_PURPOSES } from "../../../constants"
import { LLM_OUTCOME_HELP, LLM_PURPOSE_HELP } from "../../../help/operation"
import type { LlmCall } from "../../../types"
import { useEngramindList } from "../../../hooks/useEngramind"
import { HelpBadge } from "../../shared/Badges"
import { dayToIso, FilterSelect } from "../../shared/FilterSelect"
import { formatDateTime } from "../../shared/format"
import { LoadMore } from "../../shared/LoadMore"
import { Section } from "../../shared/Section"

/** Chamadas do Redator ao LLM (finalidade, provedor, modelo, tokens, custo, duração e resultado). */
export function LlmCallsCard() {
    const [purpose, setPurpose] = useState<string | undefined>(undefined)
    const [since, setSince] = useState("")
    const calls = useEngramindList<LlmCall>("llm-calls", "calls", { purpose, since: dayToIso(since) })
    return (
        <Section title="Chamadas ao LLM" info="Toda chamada do Redator (job ou teste). O texto, o prompt e a chave nunca são gravados.">
            <div className="grid gap-2 sm:grid-cols-2">
                <FilterSelect id="llm-purpose" label="Finalidade" value={purpose} options={LLM_PURPOSES} onChange={setPurpose} help={LLM_PURPOSE_HELP} />
                <Input type="date" aria-label="Desde" value={since} onChange={(event) => setSince(event.target.value)} className="h-8 bg-transparent text-xs" />
            </div>
            {calls.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : calls.items.length === 0 ? (
                <EmptyState icon={Sparkles} title="Nenhuma chamada" description="O Redator ainda não chamou o LLM nesse período." />
            ) : (
                <div className="max-h-[24rem] overflow-auto rounded-lg border">
                    <VirtualizedRows
                        rows={calls.items}
                        rowKey={(call) => String(call.id)}
                        estimateSize={44}
                        rowClassName="border-b last:border-b-0"
                        renderRow={(call) => (
                            <div className="flex flex-wrap items-center gap-2 p-2.5 text-xs">
                                <span className="text-muted-foreground">{formatDateTime(call.at)}</span>
                                <HelpBadge value={call.purpose} help={LLM_PURPOSE_HELP[call.purpose]} />
                                <HelpBadge value={call.outcome} tone={call.outcome === "success" ? "success" : "destructive"} help={LLM_OUTCOME_HELP[call.outcome]} />
                                <span className="font-mono">
                                    {call.provider}/{call.model}
                                </span>
                                <span className="text-muted-foreground">
                                    {call.input_tokens ?? "?"}→{call.output_tokens ?? "?"} tokens · {call.duration_ms ?? "?"} ms{call.cost_usd != null ? ` · US$ ${call.cost_usd.toFixed(4)}` : ""}
                                </span>
                                {call.error && <span className="w-full text-destructive">{call.error}</span>}
                            </div>
                        )}
                    />
                </div>
            )}
            <LoadMore hasNextPage={Boolean(calls.hasNextPage)} isFetchingNextPage={calls.isFetchingNextPage} fetchNextPage={calls.fetchNextPage} />
        </Section>
    )
}
