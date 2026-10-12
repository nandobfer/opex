"use client"

import { useRouter } from "next/navigation"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clienteNovaPath } from "../../constants"
import { useClienteOptions } from "../hooks"

/**
 * Atalho de criação do portal no cabeçalho do dashboard ("Nova prévia", no mesmo padrão do atalho do
 * dono): abre a página de nova prévia e fica desabilitado quando o cliente não tem repositório
 * liberado. O portal não tem o fluxo de "Nova tarefa" manual.
 */
export function ClienteNewPreviewButton() {
    const router = useRouter()
    const options = useClienteOptions()
    const blocked = (options.data?.projects ?? []).length === 0

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => router.push(clienteNovaPath())}
            disabled={blocked}
            title={blocked ? "Fale com a equipe para liberar seus repositórios" : undefined}
        >
            <Sparkles className="h-4 w-4" aria-hidden /> Nova prévia
        </Button>
    )
}
