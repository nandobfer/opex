"use client"

import Link from "next/link"
import { FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { criteriaSteps, describeCriteria } from "../criteria-describe"
import type { SecretaryForm } from "./SecretaryAgentTab"
import { AudienceCard } from "./criteria/AudienceCard"
import { CriteriaFlow } from "./criteria/CriteriaFlow"
import { DecisionModelCard } from "./criteria/DecisionModelCard"
import { SubjectsCard } from "./criteria/SubjectsCard"

/**
 * Aba Critérios (plano v3 da OPE-192): duas etapas que precisam passar juntas (quem e sobre o quê), quem decide o
 * assunto e o resumo em frases e o fluxo da decisão (atualizados enquanto o dono edita). O registro de decisões saiu
 * daqui para a aba Decisões (OPE-197).
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
        </>
    )
}
