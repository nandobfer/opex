"use client"

import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"

/** "Conversar" na linha do título (OPE-160): abre a conversa na Visão geral; desabilitado com o motivo. */
export function ChatWithAgentButton({ disabledReason, onOpen }: { disabledReason: string | null; onOpen: () => void }) {
    return (
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" disabled={Boolean(disabledReason)} title={disabledReason ?? "Conversar com o agente (sem disparar uma execução)"} onClick={onOpen}>
            <MessageSquare className="h-4 w-4" aria-hidden /> Conversar
        </Button>
    )
}
