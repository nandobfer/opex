"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { AGENT_ROLE_LABELS, AGENT_ROLES } from "../../constants"
import type { CentralForm } from "./form"

/** Aba Instruções: texto extra anexado às mensagens de cada etapa (convenções do produto). */
export function InstructionsSection({ form }: { form: CentralForm }) {
    const errors = form.formState.errors.instructions
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Instruções adicionais</CardTitle>
                <CardDescription>As mensagens padrão de cada etapa já pedem worktree, porta, PR etc. Use estes campos para regras do produto (ex.: &quot;rode pnpm test:e2e antes do PR&quot;).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {AGENT_ROLES.map((role) => (
                    <Field key={role} id={`central-instructions-${role}`} label={AGENT_ROLE_LABELS[role].label} error={errors?.[role]?.message}>
                        <Textarea id={`central-instructions-${role}`} rows={4} placeholder="Opcional" {...form.register(`instructions.${role}`)} />
                    </Field>
                ))}
            </CardContent>
        </Card>
    )
}
