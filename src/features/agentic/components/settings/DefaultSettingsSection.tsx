"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { LIVE_CHAT_DESCRIPTION } from "../../constants"
import type { AgenticSettings } from "../../schemas"
import { CiFixCard } from "./CiFixCard"
import { ColumnsCard } from "./ColumnsCard"

type ColumnName = "columns.queue" | "columns.onStart" | "columns.onPr" | "columns.onDone"

/**
 * Subaba "Configurações Padrão": chat durante a execução, fila, movimentação das colunas, correção de
 * CI e faixa de portas das prévias — padrões globais que cada central herda ou personaliza.
 */
export function DefaultSettingsSection({ form }: { form: UseFormReturn<AgenticSettings> }) {
    const columns = useWatch({ control: form.control, name: "columns" })
    const ci = useWatch({ control: form.control, name: "ci" })
    const portErrors = form.formState.errors.ports
    const setColumn = (name: ColumnName, value: string | null) => form.setValue(name, value, { shouldDirty: true, shouldValidate: true })

    return (
        <>
            <Card>
                <CardContent className="pt-6">
                    <FormToggleCard<AgenticSettings> bare control={form.control} name="liveChat" id="agentic-live-chat" label="Chat durante a execução" description={`${LIVE_CHAT_DESCRIPTION} Cada central pode ligar ou desligar só nela.`} />
                </CardContent>
            </Card>

            <ColumnsCard
                title="Fila padrão"
                description="Ao mover um card para esta coluna, a mesa da tarefa entra na fila. Havendo vaga, a mesa abre na hora; senão, aguarda na ordem dos cards do kanban. Vale para as centrais que usam o padrão global."
                idPrefix="agentic-queue"
                fields={[{ id: "agentic-col-queue", label: "Coluna que inicia a mesa automaticamente", noneLabel: "Nenhuma", value: columns.queue, onChange: (value) => setColumn("columns.queue", value) }]}
            />
            <ColumnsCard
                title="Movimentação padrão das colunas"
                description={`Para onde a tarefa vai ao avançar o desenvolvimento, nas centrais que usam o padrão global. "Não mover" deixa como está.`}
                idPrefix="agentic-movement"
                fields={[
                    { id: "agentic-col-start", label: "Ao abrir a mesa (implementação)", value: columns.onStart, onChange: (value) => setColumn("columns.onStart", value) },
                    { id: "agentic-col-pr", label: "Ao abrir o Pull Request", value: columns.onPr, onChange: (value) => setColumn("columns.onPr", value) },
                    { id: "agentic-col-done", label: "Ao concluir (PR mergeado)", value: columns.onDone, onChange: (value) => setColumn("columns.onDone", value) },
                ]}
            />

            <CiFixCard idPrefix="agentic-ci" value={ci} limitError={form.formState.errors.ci?.ciFixLimit?.message} onChange={(next) => form.setValue("ci", next, { shouldDirty: true, shouldValidate: true })} />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Portas da prévia</CardTitle>
                    <CardDescription>Faixa de portas reservadas às prévias das mesas, nas centrais que usam o padrão global. Alterar a faixa não muda as centrais personalizadas nem as mesas que já têm porta.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className={FORM_GRID}>
                        <Field id="agentic-port-min" label="Porta inicial da prévia" error={portErrors?.previewPortMin?.message}>
                            <Input id="agentic-port-min" type="number" min={1024} max={65535} {...form.register("ports.previewPortMin", { valueAsNumber: true, deps: ["ports.previewPortMax"] })} aria-invalid={portErrors?.previewPortMin ? true : undefined} />
                        </Field>
                        <Field id="agentic-port-max" label="Porta final da prévia" error={portErrors?.previewPortMax?.message}>
                            <Input id="agentic-port-max" type="number" min={1024} max={65535} {...form.register("ports.previewPortMax", { valueAsNumber: true, deps: ["ports.previewPortMin"] })} aria-invalid={portErrors?.previewPortMax ? true : undefined} />
                        </Field>
                    </div>
                </CardContent>
            </Card>
        </>
    )
}
