"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { ConversationLabel, ConversationPicker } from "@/features/evolution-api/components/ConversationPicker"
import { useEvolutionAction } from "@/features/evolution-api/hooks/useEvolution"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { ANALYSIS_CHAT_STATE_LABELS, ANALYSIS_PHASE_LABELS, ANALYSIS_STATUS_LABELS } from "../constants"
import { analysisReadCount, useSecretaryAnalyses, type AnalysisDto } from "../hooks/useSecretaryAnalyses"
import { analysisStartSchema, type AnalysisStartInput } from "../schemas"

export const ANALYSIS_STARTED_MESSAGE = "Análise iniciada. Você pode sair desta tela: ela continua em segundo plano."
export const ANALYSIS_BACKGROUND_NOTE = "Continua em segundo plano. O progresso aparece aqui quando você voltar."

/** Analisar minhas conversas: a execução roda no servidor; a tela só mostra o estado gravado e as atualizações. */
export function AnalysisPanel({ contacts }: { contacts: EvolutionContactDto[] }) {
    const [scope, setScope] = useState<AnalysisStartInput["scope"]>("all")
    const [jids, setJids] = useState<string[]>([])
    const [months, setMonths] = useState("6")
    const { query, runs, active } = useSecretaryAnalyses()
    const start = useEvolutionAction("/secretary/analyses", "post", ANALYSIS_STARTED_MESSAGE)
    const cancel = useEvolutionAction(`/secretary/analyses/${active?._id}/cancel`, "post", "Cancelamento solicitado")
    const parsed = analysisStartSchema.safeParse({ scope, jids, months: months ? Number(months) : null })
    return <Card><CardHeader><CardTitle>Analisar minhas conversas</CardTitle></CardHeader><CardContent className="space-y-4">
        <OptionTabs aria-label="Conversas da análise" value={scope} onChange={setScope} options={[{ value: "all", label: "Todas" }, { value: "selected", label: "Escolhidas" }]} />
        {scope === "selected" && <ConversationPicker items={contacts} selected={jids} onChange={setJids} />}
        <label className="block">Últimos meses (vazio para todo o histórico)<Input type="number" min={1} max={60} value={months} onChange={(event) => setMonths(event.target.value)} /></label>
        <Button disabled={Boolean(active) || !parsed.success || start.isPending} onClick={() => { if (parsed.success) start.mutate(parsed.data) }}>Iniciar análise</Button>
        {active && <Button className="ml-2" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(undefined)}>Cancelar análise</Button>}
        {active && <p className="text-sm text-muted-foreground" data-testid="analysis-background">{ANALYSIS_BACKGROUND_NOTE}</p>}
        {query.isError && <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>}
        {runs.map((run) => <AnalysisProgress key={run._id} run={run} contacts={contacts} />)}
    </CardContent></Card>
}

export function AnalysisProgress({ run, contacts }: { run: AnalysisDto; contacts: EvolutionContactDto[] }) {
    const read = analysisReadCount(run)
    const failures = run.chats.filter((item) => item.state === "failed").length
    const status = run.status === "done" && failures ? `Concluída com ${failures} ${failures === 1 ? "erro" : "erros"}` : ANALYSIS_STATUS_LABELS[run.status]
    const pct = read / Math.max(1, run.chats.length)
    const [now, setNow] = useState(Date.now)
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 15_000)
        return () => clearInterval(timer)
    }, [])
    const eta = read > 0 && run.status === "running" ? Math.max(1, Math.ceil(((now - Date.parse(run.at)) * (1 - pct)) / pct / 60_000)) : null
    const current = contacts.find((item) => item.jid === run.current)
    return <details open={run.status === "running" || undefined} className="rounded-lg border p-3">
        <summary>{status} · {new Date(run.at).toLocaleString("pt-BR")} · {read} de {run.chats.length} conversas lidas</summary>
        <div className="mt-3 flex items-center gap-3" role="progressbar" aria-valuemin={0} aria-valuemax={run.chats.length} aria-valuenow={read} aria-label="Conversas lidas">
            {/* `initial={false}`: ao voltar à tela, o anel começa no valor gravado em vez de recomeçar do zero. */}
            <svg viewBox="0 0 40 40" className="size-12 text-primary" aria-hidden="true"><circle cx="20" cy="20" r="16" stroke="currentColor" opacity="0.2" strokeWidth="4" fill="none" /><motion.circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="4" fill="none" initial={false} animate={{ pathLength: pct }} /></svg>
            <div><p>{run.status === "running" && `${ANALYSIS_PHASE_LABELS[run.phase]} · `}{run.messages} mensagens · US$ {run.cost.toFixed(4)}{eta ? ` · ~${eta} min` : ""}</p>{run.status === "running" && (current ? <ConversationLabel contact={current} /> : run.current)}</div>
        </div>
        {run.error && <p role="alert">{run.error}</p>}
        <ul className="my-2 divide-y">{run.chats.map((item) => <li key={item.jid} className="py-1 text-sm">{contacts.find((contact) => contact.jid === item.jid)?.name ?? item.jid} · {ANALYSIS_CHAT_STATE_LABELS[item.state]}{item.error && <p className="text-xs text-destructive" title={item.error}>{item.error}</p>}</li>)}</ul>
        {run.discoveries.length > 0 && <><p className="font-medium">Descobertas</p><ul className="list-inside list-disc text-sm">{run.discoveries.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
    </details>
}
