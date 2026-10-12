"use client"

import { useRouter } from "next/navigation"
import { Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clienteNovaPath } from "../../constants"

/** Apresentação do atalho de criação do portal. */
export type ClienteTaskCreationAppearance = "task" | "preview"

const APPEARANCE = {
    task: { label: "Nova tarefa", variant: "default", Icon: Plus },
    preview: { label: "Nova prévia", variant: "outline", Icon: Sparkles },
} as const

/**
 * Atalho de criação do portal, compartilhado pelo cabeçalho de Tarefas e de Dashboard. As duas telas
 * abrem a **mesma** página (`/cliente/nova`) com o **mesmo** comportamento; muda só o rótulo e o
 * estilo visual. Não depende de repositório liberado — quem não tiver segue para a página e recebe a
 * orientação lá (o portal não tem o fluxo de "Nova tarefa" manual: tudo começa pela prévia por IA).
 */
export function ClienteTaskCreationButton({ appearance = "task" }: { appearance?: ClienteTaskCreationAppearance }) {
    const router = useRouter()
    const { label, variant, Icon } = APPEARANCE[appearance]

    return (
        <Button type="button" variant={variant} size="sm" className="h-9 gap-2" onClick={() => router.push(clienteNovaPath())}>
            <Icon className="h-4 w-4" aria-hidden /> {label}
        </Button>
    )
}
