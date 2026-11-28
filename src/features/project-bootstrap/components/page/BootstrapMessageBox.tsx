"use client"

import { useState } from "react"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useSendBootstrapMessage } from "../../hooks/useProjectBootstrap"
import type { ProjectBootstrapDto } from "../../types"

/** Mensagem do dono ao agente: entra no turno em andamento ou abre um turno novo na mesma conversa. */
export function BootstrapMessageBox({ bootstrap }: { bootstrap: ProjectBootstrapDto }) {
    const send = useSendBootstrapMessage(bootstrap.id)
    const [text, setText] = useState("")
    const submit = () => {
        const value = text.trim()
        if (!value) return
        send.mutate(value, { onSuccess: () => setText("") })
    }
    const label = bootstrap.running ? "Mensagem para o agente (entra no turno em andamento)" : "Responder ao agente"
    return (
        <div className="space-y-2">
            <label htmlFor="bootstrap-message" className="text-xs font-semibold">
                {label}
            </label>
            <div className="flex items-end gap-2">
                <Textarea
                    id="bootstrap-message"
                    rows={2}
                    value={text}
                    placeholder="Escreva para o Agente de Bootstrap… (Ctrl+Enter envia)"
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault()
                            submit()
                        }
                    }}
                />
                <Button type="button" className="shrink-0 gap-1.5" disabled={!text.trim() || send.isPending} onClick={submit}>
                    {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Enviar
                </Button>
            </div>
        </div>
    )
}
