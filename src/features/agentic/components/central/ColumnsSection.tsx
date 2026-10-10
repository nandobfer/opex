"use client"

import { Controller } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { useTaskBoard } from "@/features/tasks/hooks/useTaskBoard"
import { AGENTIC_INCLUDE_LABELS } from "../../constants"
import type { CentralForm } from "./form"

const NONE = "__none__"

/** Aba Colunas e conclusão: movimentação das colunas por etapa e o que vai para o planejador. */
export function ColumnsSection({ form }: { form: CentralForm }) {
    const board = useTaskBoard()
    const control = form.control

    const columnField = (name: "columns.onStart" | "columns.onPr" | "columns.onDone", id: string, label: string) => (
        <Field id={id} label={label}>
            <Controller
                control={control}
                name={name}
                render={({ field }) => (
                    <Select value={field.value ?? NONE} onValueChange={(value) => field.onChange(value === NONE ? null : value)}>
                        <SelectTrigger id={id} className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Não mover</SelectItem>
                            {board.columns.map((column) => (
                                <SelectItem key={column.key} value={column.key}>
                                    {column.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            />
        </Field>
    )

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Movimentação das colunas</CardTitle>
                    <CardDescription>Ao avançar o desenvolvimento, a tarefa é movida para a coluna escolhida. &quot;Não mover&quot; deixa como está.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {columnField("columns.onStart", "central-col-start", "Ao abrir a mesa (implementação)")}
                    {columnField("columns.onPr", "central-col-pr", "Ao abrir o Pull Request")}
                    {columnField("columns.onDone", "central-col-done", "Ao concluir (PR mergeado)")}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Limpeza após o merge</CardTitle>
                    <CardDescription>Feita pelo agente de build, depois de mover a sessão de volta para o diretório da central.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <FormToggleCard control={control} name="cleanup.teardownEnvironment" id="central-cl-env" label="Derrubar a prévia" description="docker compose down do projeto da mesa (libera a porta)" onLabel="Sim" offLabel="Não" />
                    <FormToggleCard control={control} name="cleanup.removeWorktree" id="central-cl-worktree" label="Remover o worktree" description="git worktree remove + prune" onLabel="Sim" offLabel="Não" />
                    <FormToggleCard control={control} name="cleanup.deleteBranch" id="central-cl-branch" label="Apagar a branch local" description="A branch remota fica (o GitHub pode apagá-la no merge)" onLabel="Sim" offLabel="Não" />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">O que vai para o planejador</CardTitle>
                    <CardDescription>Título, dados, descrição e especificação vão sempre.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {(Object.keys(AGENTIC_INCLUDE_LABELS) as (keyof typeof AGENTIC_INCLUDE_LABELS)[]).map((key) => (
                        <FormToggleCard key={key} control={control} name={`include.${key}`} id={`central-include-${key}`} label={AGENTIC_INCLUDE_LABELS[key].label} description={AGENTIC_INCLUDE_LABELS[key].description} onLabel="Enviar" offLabel="Não enviar" />
                    ))}
                </CardContent>
            </Card>
        </>
    )
}
