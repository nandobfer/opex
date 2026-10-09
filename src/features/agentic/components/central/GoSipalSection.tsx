"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { AGENTIC_INCLUDE_LABELS } from "../../constants"
import type { CentralForm } from "./form"

/** Aba Go! Sipal e conclusão: efeitos na tarefa, limpeza após o merge e o que vai para o planejador. */
export function GoSipalSection({ form }: { form: CentralForm }) {
    const control = form.control
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Go! Sipal</CardTitle>
                    <CardDescription>Ao concluir (PR mergeado), a tarefa sempre vai para Validação com os links do commit e do PR.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <FormToggleCard control={control} name="goSipal.moveToDevelopment" id="central-gs-move" label="Mover para Desenvolvimento ao abrir a mesa" description="Só quando a tarefa ainda está em Backlog, Priorizado ou Especificação" onLabel="Sim" offLabel="Não" />
                    <FormToggleCard control={control} name="goSipal.startTimer" id="central-gs-timer" label="Iniciar o timer ao abrir a mesa" description="Se ainda não houver timer rodando nesta tarefa" onLabel="Sim" offLabel="Não" />
                    <FormToggleCard control={control} name="goSipal.stopTimerOnDone" id="central-gs-stop" label="Parar o timer ao concluir" description="Quando o PR é mergeado" onLabel="Sim" offLabel="Não" />
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
                    <CardDescription>Título, dados, descrição, especificação, contexto e critérios de aceite vão sempre.</CardDescription>
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
