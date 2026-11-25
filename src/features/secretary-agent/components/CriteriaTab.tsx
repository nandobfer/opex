"use client"

import { useState } from "react"
import Link from "next/link"
import { FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConversationPicker } from "@/features/evolution-api/components/ConversationPicker"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { useEvolution } from "@/features/evolution-api/hooks/useEvolution"
import { SECRETARY_DECISION_LABELS, type SecretaryDecision } from "../constants"
import { criteriaSteps, describeCriteria } from "../criteria-describe"
import type { SecretaryForm } from "./SecretaryAgentTab"
import { AudienceCard } from "./criteria/AudienceCard"
import { CriteriaFlow } from "./criteria/CriteriaFlow"
import { DecisionModelCard } from "./criteria/DecisionModelCard"
import { SubjectsCard } from "./criteria/SubjectsCard"

/**
 * Aba Critérios (plano v3 da OPE-192): duas etapas que precisam passar juntas (quem e sobre o quê), quem decide o
 * assunto, o resumo em frases e o fluxo da decisão (atualizados enquanto o dono edita) e o registro de decisões.
 */
export function CriteriaTab({ form, contacts }: { form: SecretaryForm; contacts: EvolutionContactDto[] }) {
    const criteria = form.watch("criteria")
    const nameOf = (jid: string) => contacts.find((item) => item.jid === jid)?.name ?? jid.split("@")[0] ?? jid
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Como o Secretário decide</CardTitle>
                    <CardDescription>O Secretário só responde quando a mensagem passa nas duas etapas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="criteria-summary" aria-live="polite">
                        {describeCriteria(criteria, nameOf)}
                    </p>
                    <CriteriaFlow flow={criteriaSteps(criteria)} />
                    <Button asChild variant="outline" size="sm">
                        <Link href="/integracoes/ia?aba=agente-secretario&secao=simulacao">
                            <FlaskConical className="mr-2 h-4 w-4" aria-hidden /> Simular uma mensagem
                        </Link>
                    </Button>
                </CardContent>
            </Card>
            <AudienceCard form={form} contacts={contacts} />
            <SubjectsCard form={form} />
            <DecisionModelCard form={form} />
            <DecisionLog contacts={contacts} />
        </>
    )
}

type DecisionRow = { _id: string; jid: string; decision: SecretaryDecision; reason: string; at: string }

function DecisionLog({ contacts }: { contacts: EvolutionContactDto[] }) {
    const [jid, setJid] = useState<string[]>([])
    const rows = useEvolution<DecisionRow[]>(`/secretary/decisions${jid[0] ? `?jid=${encodeURIComponent(jid[0])}` : ""}`)
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Registro de decisões</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <ConversationPicker items={contacts} selected={jid} onChange={setJid} multiple={false} placeholder="Todas as conversas" />
                {jid.length > 0 && <Button variant="ghost" onClick={() => setJid([])}>Limpar filtro</Button>}
                {rows.isError && <Button variant="outline" onClick={() => void rows.refetch()}>Tentar novamente</Button>}
                {rows.data?.length === 0 && <p>Nenhuma decisão registrada.</p>}
                <ul className="divide-y">
                    {rows.data?.map((row) => (
                        <li key={row._id} className="py-2">
                            <strong>{SECRETARY_DECISION_LABELS[row.decision]}</strong> · {contacts.find((contact) => contact.jid === row.jid)?.name ?? row.jid}
                            <p className="text-sm text-muted-foreground">{row.reason} · {new Date(row.at).toLocaleString("pt-BR")}</p>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    )
}
