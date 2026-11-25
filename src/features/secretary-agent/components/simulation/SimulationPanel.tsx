"use client"

import { AnimatePresence } from "framer-motion"
import { Brain, CircleCheck, CircleX, Coins, Gauge, HelpCircle, ListChecks, Sparkles } from "lucide-react"
import { formatUsd } from "@/features/ai/provider-usage"
import { CRITERIA_RULE_LABELS } from "../../criteria"
import type { SimulateResult } from "../../server/simulate"
import { CriteriaFlow } from "../criteria/CriteriaFlow"
import { JevAnswersBlock } from "./JevAnswersBlock"
import { SimulationBlock as Block } from "./SimulationBlock"

/** Coluna lateral da Simulação: a decisão, o passo a passo, o assunto, limites, personalidade, memórias, pergunta e custo. */
export function SimulationPanel({ result, error }: { result: SimulateResult | null; error: string | null }) {
    if (error) return <aside aria-label="Resultado da simulação"><Block icon={CircleX} title="Erro"><p className="text-sm text-destructive" role="alert">{error}</p></Block></aside>
    if (!result) return <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Envie uma mensagem para ver se o Secretário responderia, o motivo, o assunto identificado e o que ele aprenderia.</p>
    const replied = result.decision.decision === "reply"
    const { limits } = result
    return (
        <div className="space-y-3" data-testid="simulation-panel">
            <AnimatePresence initial={false}>
                <Block key="decision" icon={replied ? CircleCheck : CircleX} title="Decisão">
                    <p className="text-sm font-medium">{result.decision.label}</p>
                    <p className="text-xs text-muted-foreground">{CRITERIA_RULE_LABELS[result.decision.rule]} · {result.decision.reason}</p>
                </Block>
                <Block key="steps" icon={ListChecks} title="Passo a passo dos critérios">
                    <CriteriaFlow steps={result.steps} />
                </Block>
                {result.subject && <JevAnswersBlock key="subject" subject={result.subject} />}
                <Block key="limits" icon={Gauge} title="Limites e pausa (conversa real)">
                    {limits ? (
                        <ul className="space-y-1 text-sm">
                            <li>Respostas na última hora: <strong>{limits.repliesLastHour}</strong> de {limits.repliesPerHour}</li>
                            <li>Gasto de hoje: <strong>{formatUsd(limits.spentTodayUsd)}</strong> de {formatUsd(limits.dailyBudgetUsd)}</li>
                            {limits.blockedReason && <li className="text-destructive">O turno real seria barrado: {limits.blockedReason}</li>}
                        </ul>
                    ) : <p className="text-xs text-muted-foreground">Sem instância escolhida: não há conversa real para comparar.</p>}
                    {result.pausedUntil && <p className="text-sm">Na conversa real está pausada até {new Date(result.pausedUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</p>}
                    <p className="text-xs text-muted-foreground">A simulação não aplica esses bloqueios.</p>
                </Block>
                {replied && (
                    <Block key="personality" icon={Sparkles} title="Personalidade aplicada">
                        <p className="text-sm">Base{result.personality.variant ? ` + variante "${result.personality.variant}"` : " (sem variante para esta conversa)"}</p>
                    </Block>
                )}
                {replied && (
                    <Block key="memories" icon={Brain} title="Memórias">
                        {result.memories.counts && <p className="text-xs text-muted-foreground">No contexto: {result.memories.counts.full} completas e {result.memories.counts.titles} só pelo título.</p>}
                        {result.memories.written.length ? (
                            <ul className="space-y-1 text-sm" aria-label="Memórias que gravaria">
                                {result.memories.written.map((memory, index) => <li key={`${index}-${memory.title}`}><span className="text-xs text-muted-foreground">{memory.channel}:</span> {memory.text}</li>)}
                            </ul>
                        ) : <p className="text-xs text-muted-foreground">Não gravaria nenhuma memória.</p>}
                    </Block>
                )}
                {result.question && (
                    <Block key="question" icon={HelpCircle} title="Pergunta ao dono">
                        <p className="text-sm">{result.question}</p>
                        <p className="text-xs text-muted-foreground">Na conversa real, ele mandaria a frase de espera ao contato e a pergunta para você (nada foi enviado).</p>
                    </Block>
                )}
                <Block key="cost" icon={Coins} title="Custo desta mensagem">
                    <p className="text-sm">{formatUsd(result.costUsd)} <span className="text-xs text-muted-foreground">(fora do orçamento diário)</span></p>
                </Block>
            </AnimatePresence>
        </div>
    )
}
