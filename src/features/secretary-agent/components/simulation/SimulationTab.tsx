"use client"

import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { FlaskConical, Loader2, RotateCcw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { apiErrorMessage } from "@/lib/api"
import { ConversationPickerField } from "@/features/evolution-api/components/ConversationPicker"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { useSecretarySimulation } from "../../hooks/useSecretarySimulation"
import type { SimulateInput } from "../../schemas"
import type { SimulateResult } from "../../server/simulate"
import type { SecretaryForm } from "../SecretaryAgentTab"
import { SimulationMessage, simulationBubble, type SimulationLine } from "./SimulationMessage"
import { SimulationPanel } from "./SimulationPanel"

type HistoryMode = "simulated" | "real"

/**
 * Aba Simulação (plano v3 da OPE-192): uma mensagem de um contato escolhido passa pelo mesmo motor do turno real, com
 * as configurações em edição. Nada é enviado nem gravado (decisão, leitura ou memória); a coluna lateral mostra se o
 * Secretário responderia e por quê. As memórias que ele gravaria ficam só aqui, até Reiniciar.
 */
export function SimulationTab({ form, contacts }: { form: SecretaryForm; contacts: EvolutionContactDto[] }) {
    const simulate = useSecretarySimulation()
    const [jid, setJid] = useState<string[]>([])
    const [mentioned, setMentioned] = useState(false)
    const [historyMode, setHistoryMode] = useState<HistoryMode>("simulated")
    const [lines, setLines] = useState<SimulationLine[]>([])
    const [memories, setMemories] = useState<SimulateInput["memories"]>([])
    const [result, setResult] = useState<SimulateResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const generation = useRef(0)
    const [text, setText] = useState("")
    const contact = contacts.find((item) => item.jid === jid[0])
    const reset = () => {
        generation.current++
        setLines([])
        setMemories([])
        setResult(null)
        setError(null)
    }
    const send = async () => {
        const message = text.trim()
        if (!message || !jid[0] || simulate.isPending) return
        const currentGeneration = generation.current
        setError(null)
        const history = lines.flatMap((line) => (line.kind === "text" ? [{ owner: line.author === "secretary", text: line.text }] : []))
        setLines((current) => [...current, { id: `c${Date.now()}`, kind: "text", author: "contact", text: message }])
        setText("")
        const response = await simulate.mutateAsync({ settings: form.getValues(), jid: jid[0], mentionsOwner: mentioned, history, message, useRealHistory: historyMode === "real", memories }).catch((error: unknown) => {
            if (generation.current === currentGeneration) setError(apiErrorMessage(error, "Não foi possível simular a mensagem"))
            return null
        })
        if (!response || generation.current !== currentGeneration) return
        setResult(response)
        setMemories((current) => [...current, ...response.memories.written.map((item) => ({ channel: item.channel, title: item.title, text: item.text }))].slice(-20))
        const now = Date.now()
        const replies: SimulationLine[] = response.replies.map((reply, index) => ({ id: `s${now}-${index}`, kind: "text", author: "secretary", text: reply }))
        const note: SimulationLine[] = response.replies.length ? [] : [{ id: `n${now}`, kind: "note", text: response.observing && response.decision.decision === "reply" ? "Modo Só observar: o Secretário não responderia." : `O Secretário não responderia: ${response.decision.reason}` }]
        setLines((current) => [...current, ...replies, ...note])
    }
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-4 w-4 text-primary" aria-hidden /> Simulação</CardTitle>
                <CardDescription>Converse como se fosse um contato, com as configurações desta tela (mesmo sem salvar). Nada é enviado nem gravado; o custo das chamadas de IA é real e fica fora do orçamento diário.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    <ConversationPickerField items={contacts} selected={jid} onChange={(items) => { setJid(items); setMentioned(false); reset() }} multiple={false} placeholder="Escolher o contato ou grupo" />
                    {contact?.isGroup && <label className="flex items-center gap-2 text-sm"><Switch checked={mentioned} onCheckedChange={setMentioned} /> A mensagem me menciona</label>}
                    <OptionTabs<HistoryMode> aria-label="Histórico" value={historyMode} onChange={(value) => { setHistoryMode(value); reset() }} options={[{ value: "simulated", label: "Só a conversa simulada" }, { value: "real", label: "Continuar a conversa real" }]} />
                </div>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="flex min-h-[360px] flex-col rounded-lg border bg-muted/20">
                        <ul className="flex-1 space-y-2 overflow-y-auto p-3" aria-label="Conversa simulada" aria-live="polite">
                            {lines.map((line) => <SimulationMessage key={line.id} line={line} />)}
                            {simulate.isPending && <motion.li {...simulationBubble} className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> digitando…</motion.li>}
                        </ul>
                        <div className="flex gap-2 border-t p-2">
                            <Textarea
                                rows={2}
                                aria-label="Mensagem do contato"
                                placeholder={jid[0] ? "Escreva como o contato…" : "Escolha o contato ou grupo primeiro"}
                                value={text}
                                disabled={!jid[0]}
                                onChange={(event) => setText(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault()
                                        void send()
                                    }
                                }}
                            />
                            <div className="flex flex-col gap-1">
                                <Button type="button" size="icon" aria-label="Enviar" disabled={!text.trim() || !jid[0] || simulate.isPending} onClick={() => void send()}><Send className="h-4 w-4" aria-hidden /></Button>
                                <Button type="button" size="icon" variant="outline" aria-label="Reiniciar" onClick={reset}><RotateCcw className="h-4 w-4" aria-hidden /></Button>
                            </div>
                        </div>
                    </div>
                    <SimulationPanel result={result} error={error} />
                </div>
            </CardContent>
        </Card>
    )
}
