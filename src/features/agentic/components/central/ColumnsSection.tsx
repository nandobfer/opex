"use client"

import { useWatch } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { AGENTIC_INCLUDE_LABELS } from "../../constants"
import { useAgenticSettings } from "../../hooks/useAgentic"
import { ColumnsCard } from "../settings/ColumnsCard"
import type { CentralForm } from "./form"

/**
 * Aba Colunas e conclusão: a **fila** e a **movimentação** das colunas (que podem herdar o padrão
 * global da aba "Desenvolvimento agêntico" ou ser personalizadas nesta central — OPE-79), a limpeza
 * após o merge e o que vai para o planejador.
 */
export function ColumnsSection({ form }: { form: CentralForm }) {
    const control = form.control
    const columns = useWatch({ control, name: "columns" })
    const settings = useAgenticSettings()
    const global = settings.data?.settings.columns

    const setColumn = (name: "columns.queue" | "columns.onStart" | "columns.onPr" | "columns.onDone", value: string | null) =>
        form.setValue(name, value, { shouldDirty: true, shouldValidate: true })
    const setInherit = (name: "columns.inheritQueue" | "columns.inheritMovement", value: boolean) => form.setValue(name, value, { shouldDirty: true, shouldValidate: true })

    return (
        <>
            <ColumnsCard
                title="Fila da central de desenvolvimento"
                description="Ao mover um card para esta coluna, a mesa da tarefa entra na fila. Havendo vaga (limite de mesas abertas), a mesa abre na hora; senão, aguarda na ordem dos cards do kanban."
                idPrefix="central-queue"
                inherited={{ value: columns.inheritQueue, onChange: (inherit) => setInherit("columns.inheritQueue", inherit) }}
                fields={[
                    {
                        id: "central-col-queue",
                        label: "Coluna que inicia a mesa automaticamente",
                        noneLabel: "Nenhuma",
                        value: columns.queue,
                        globalValue: global?.queue,
                        onChange: (value) => setColumn("columns.queue", value),
                    },
                ]}
            />
            <ColumnsCard
                title="Movimentação das colunas"
                description={`Ao avançar o desenvolvimento, a tarefa é movida para a coluna escolhida. "Não mover" deixa como está.`}
                idPrefix="central-movement"
                inherited={{ value: columns.inheritMovement, onChange: (inherit) => setInherit("columns.inheritMovement", inherit) }}
                fields={[
                    { id: "central-col-start", label: "Ao abrir a mesa (implementação)", value: columns.onStart, globalValue: global?.onStart, onChange: (value) => setColumn("columns.onStart", value) },
                    { id: "central-col-pr", label: "Ao abrir o Pull Request", value: columns.onPr, globalValue: global?.onPr, onChange: (value) => setColumn("columns.onPr", value) },
                    { id: "central-col-done", label: "Ao concluir (PR mergeado)", value: columns.onDone, globalValue: global?.onDone, onChange: (value) => setColumn("columns.onDone", value) },
                ]}
            />
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
