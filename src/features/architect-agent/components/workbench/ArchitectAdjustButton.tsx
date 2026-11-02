"use client"

import { useState } from "react"
import { MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FeedbackComposer, type FeedbackCopy } from "@/features/agentic/components/workbench/FeedbackComposer"
import type { ArchitectDepth } from "../../constants"
import { CANVAS_TOOL_BUTTON_CLASS } from "./ArchitectCanvasToolbar"
import { DepthControl } from "./DepthControl"

const COPY: FeedbackCopy = {
    title: "Pedir ajustes no diagrama",
    placeholder: 'Ex.: "junte as estruturas de configuração", "mostre o fluxo de aprovação".',
    submit: "Gerar nova versão",
}

interface ArchitectAdjustButtonProps {
    defaultDepth: ArchitectDepth
    pending: boolean
    disabled: boolean
    onSubmit: (input: { feedback: string; depth: ArchitectDepth }) => Promise<boolean>
}

/**
 * "Pedir ajustes" na barra dentro do canvas: abre um painel preso ao próprio botão (fora do viewport
 * transformado, limitado à janela) com o campo do pedido e o slider de profundidade. O texto em
 * edição fica guardado enquanto o painel está fechado; enviar com sucesso limpa e fecha.
 */
export function ArchitectAdjustButton({ defaultDepth, pending, disabled, onSubmit }: ArchitectAdjustButtonProps) {
    const [open, setOpen] = useState(false)
    const [text, setText] = useState("")
    const [depth, setDepth] = useState(defaultDepth)
    return (
        <Popover open={open && !disabled} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className={CANVAS_TOOL_BUTTON_CLASS} disabled={disabled} aria-expanded={open && !disabled}>
                    <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /> Pedir ajustes
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" collisionPadding={8} className="w-[min(32rem,calc(100vw-1rem))] p-3" data-testid="architect-adjust-panel">
                <FeedbackComposer
                    id="architect-adjust"
                    copy={COPY}
                    value={text}
                    onValueChange={setText}
                    pending={pending}
                    onCancel={() => setOpen(false)}
                    onSubmit={async (feedback) => {
                        if (await onSubmit({ feedback, depth })) {
                            setText("")
                            setOpen(false)
                        }
                    }}
                    aside={<DepthControl id="architect-adjust-depth" value={depth} onChange={setDepth} disabled={pending} compact />}
                />
            </PopoverContent>
        </Popover>
    )
}
