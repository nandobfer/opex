"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { useAiProviderStatuses } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAi"
import { DECISION_PROVIDER_IDS } from "../../schemas"
import type { SecretaryForm } from "../SecretaryAgentTab"
import { SecretaryModelCard } from "../SecretaryModelCard"

/**
 * "Quem decide o assunto": o modelo do agente, outro modelo de texto ou o JEV (decisões tipadas com probabilidade).
 * Só é chamado quando há assunto bloqueado ou "Só os assuntos liberados", e quem enviou passou na etapa 1.
 */
export function DecisionModelCard({ form }: { form: SecretaryForm }) {
    const providers = useAiProviderStatuses(true).providers.filter((item) => (DECISION_PROVIDER_IDS as readonly string[]).includes(item.id))
    const same = form.watch("decision.model.sameAsAgent")
    const provider = form.watch("decision.model.provider")
    return <Card>
        <CardHeader>
            <CardTitle className="text-base">Quem decide o assunto</CardTitle>
            <CardDescription>O custo da decisão conta no orçamento diário. Com o JEV, cada assunto vira uma pergunta com a probabilidade de &ldquo;sim&rdquo;; na dúvida sobre um assunto bloqueado, o Secretário fica quieto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <OptionTabs aria-label="Quem decide o assunto" value={same ? "same" : "own"} options={[{ value: "same", label: "Mesmo do agente" }, { value: "own", label: "Outro modelo ou o JEV" }]} onChange={(value) => form.setValue("decision.model.sameAsAgent", value === "same", { shouldDirty: true, shouldValidate: true })} />
            {!same && <SecretaryModelCard form={form} providers={providers} prefix="decision.model" idPrefix="secretary-decision" />}
            {!same && provider === "jev" && <p className="text-xs text-muted-foreground">Faixas do JEV: sim a partir de 70%, não até 30%, incerto entre os dois.</p>}
        </CardContent>
    </Card>
}
