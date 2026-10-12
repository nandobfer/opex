"use client"

import { useRouter } from "next/navigation"
import { Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TASK_NEW_PATH, TASK_PREVIEW_PATH } from "../constants"
import { useTaskOptions } from "../hooks/useTasks"

/**
 * Atalhos de criação de tarefa (**Nova prévia** e **Nova tarefa**) compartilhados pelos cabeçalhos
 * de Tarefas e de Dashboards. Cada botão leva à sua página própria e fica desabilitado quando não
 * há repositório vinculado (mesmo motivo do estado vazio de Tarefas). As ações independem do
 * período e do carregamento dos indicadores da tela hospedeira.
 */
export function TaskCreationActions({ enabled = true }: { enabled?: boolean }) {
    const router = useRouter()
    const options = useTaskOptions(enabled)
    const projects = options.data?.projects ?? []
    const blocked = projects.length === 0
    const hint = blocked ? "Vincule um repositório em Integrações › GitHub" : undefined

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-2"
                onClick={() => router.push(TASK_PREVIEW_PATH)}
                disabled={blocked}
                title={hint}
            >
                <Sparkles className="h-4 w-4" aria-hidden /> Nova prévia
            </Button>
            <Button type="button" size="sm" className="h-9 gap-2" onClick={() => router.push(TASK_NEW_PATH)} disabled={blocked} title={hint}>
                <Plus className="h-4 w-4" aria-hidden /> Nova tarefa
            </Button>
        </>
    )
}
