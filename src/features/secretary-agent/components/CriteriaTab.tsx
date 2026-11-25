"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ConversationPicker } from "@/features/evolution-api/components/ConversationPicker"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { useEvolution, useEvolutionAction } from "@/features/evolution-api/hooks/useEvolution"
import { CRITERIA_PRECEDENCE, CRITERIA_RULE_LABELS, type CriteriaVerdict } from "../criteria"
import { SECRETARY_DECISION_LABELS, type SecretaryDecision } from "../constants"
import type { CriteriaTestInput } from "../schemas"
import type { SecretaryForm } from "./SecretaryAgentTab"

export function CriteriaTab({ form, contacts }: { form: SecretaryForm; contacts: EvolutionContactDto[] }) {
    const criteria = form.watch("criteria")
    const [jid, setJid] = useState<string[]>([])
    const rows = useEvolution<{ _id: string; jid: string; decision: SecretaryDecision; reason: string; at: string }[]>(`/secretary/decisions${jid[0] ? `?jid=${encodeURIComponent(jid[0])}` : ""}`)
    return <>
        <Card><CardHeader><CardTitle>Quando responder</CardTitle></CardHeader><CardContent className="space-y-4">
            <OptionTabs aria-label="Escopo base" value={criteria.baseScope} options={[{ value: "all", label: "Responder todas as conversas" }, { value: "none", label: "Não responder nenhuma conversa" }]} onChange={(value) => form.setValue("criteria.baseScope", value, { shouldDirty: true })} />
            {(["exclude", "include"] as const).map((key) => <div key={key} className="space-y-2"><p>{key === "exclude" ? "Excluir contatos e grupos" : "Incluir contatos e grupos"}</p><ConversationPicker items={contacts} selected={criteria[key]} onChange={(items) => form.setValue(`criteria.${key}`, items, { shouldDirty: true })} /></div>)}
            {(["direct", "groups"] as const).map((key) => <label key={key} className="flex items-center gap-2"><Switch checked={criteria.chatTypes[key]} onCheckedChange={(value) => form.setValue(`criteria.chatTypes.${key}`, value, { shouldDirty: true })} />{key === "direct" ? "Conversas individuais" : "Grupos"}</label>)}
            <OptionTabs aria-label="Em grupos" value={criteria.groupMode} options={[{ value: "always", label: "Sem exigir menção" }, { value: "mention", label: "Só quando mencionado" }]} onChange={(value) => form.setValue("criteria.groupMode", value, { shouldDirty: true })} />
            {(["always", "never"] as const).map((key) => <div className="space-y-2" key={key}>
                <label htmlFor={`subject-${key}`}>{key === "always" ? "Responder sempre quando o assunto for…" : "Nunca responder quando o assunto for…"}</label>
                <Textarea id={`subject-${key}`} {...form.register(`criteria.subjects.${key}.description`)} />
                <Textarea aria-label={`Exemplos de assunto ${key === "always" ? "sempre" : "nunca"}`} placeholder="Um exemplo por linha" value={criteria.subjects[key].examples.join("\n")} onChange={(event) => form.setValue(`criteria.subjects.${key}.examples`, event.target.value.split("\n"), { shouldDirty: true })} onBlur={(event) => form.setValue(`criteria.subjects.${key}.examples`, event.target.value.split("\n").map((line) => line.trim()).filter(Boolean), { shouldDirty: true })} />
            </div>)}
            <ol className="list-inside list-decimal space-y-1">{CRITERIA_PRECEDENCE.map((rule) => <li key={rule.title}><strong>{rule.title}</strong> · {rule.description}</li>)}</ol>
        </CardContent></Card>
        <CriteriaTester contacts={contacts} criteria={criteria} />
        <Card><CardHeader><CardTitle>Registro de decisões</CardTitle></CardHeader><CardContent className="space-y-3">
            <ConversationPicker items={contacts} selected={jid} onChange={setJid} multiple={false} placeholder="Todas as conversas" />
            {jid.length > 0 && <Button variant="ghost" onClick={() => setJid([])}>Limpar filtro</Button>}
            {rows.isError && <Button variant="outline" onClick={() => void rows.refetch()}>Tentar novamente</Button>}
            {rows.data?.length === 0 && <p>Nenhuma decisão registrada.</p>}
            <ul className="divide-y">{rows.data?.map((row) => <li key={row._id} className="py-2"><strong>{SECRETARY_DECISION_LABELS[row.decision]}</strong> · {contacts.find((contact) => contact.jid === row.jid)?.name ?? row.jid}<p className="text-sm text-muted-foreground">{row.reason} · {new Date(row.at).toLocaleString("pt-BR")}</p></li>)}</ul>
        </CardContent></Card>
    </>
}

export function CriteriaTester({ contacts, criteria }: { contacts: EvolutionContactDto[]; criteria: CriteriaTestInput["criteria"] }) {
    const [selected, setSelected] = useState<string[]>([])
    const [text, setText] = useState("")
    const [mentioned, setMentioned] = useState(false)
    const test = useEvolutionAction<CriteriaVerdict, CriteriaTestInput>("/secretary/criteria/test", "post", "Critérios avaliados")
    return <Card><CardHeader><CardTitle>Testar critérios</CardTitle></CardHeader><CardContent className="space-y-3">
        <ConversationPicker items={contacts} selected={selected} onChange={setSelected} multiple={false} />
        <Textarea aria-label="Mensagem para testar" value={text} onChange={(event) => setText(event.target.value)} />
        {contacts.find((item) => item.jid === selected[0])?.isGroup && <label className="flex items-center gap-2"><Switch checked={mentioned} onCheckedChange={setMentioned} /> A mensagem menciona ou cita o dono</label>}
        <Button variant="outline" disabled={!selected[0] || !text.trim() || test.isPending} onClick={() => test.mutate({ jid: selected[0]!, text, mentioned, criteria })}>Testar critérios</Button>
        {test.data && <p role="status"><strong>{test.data.decision === "reply" ? "Responderia" : "Não responderia"}</strong> · {CRITERIA_RULE_LABELS[test.data.rule]} · {test.data.reason}</p>}
    </CardContent></Card>
}
