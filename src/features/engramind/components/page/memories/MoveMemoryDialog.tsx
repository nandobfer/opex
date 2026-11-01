"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { EngramindChannel, EngramindMemory } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"

/** Mover a memória para outro canal ativo. */
export function MoveMemoryDialog({
    memory,
    channels,
    onOpenChange,
    onConfirm,
    onFailed,
}: {
    memory: EngramindMemory
    channels: EngramindChannel[]
    onOpenChange: (open: boolean) => void
    /** Clicou em Mover (antes da resposta). */
    onConfirm?: () => void
    /** A movimentação falhou. */
    onFailed?: () => void
}) {
    const options = channels.filter((channel) => !channel.archived_at && channel.slug !== memory.channel)
    const [to, setTo] = useState(options[0]?.slug ?? "")
    const move = useEngramindMutation((target: string) => engramindSend("post", route("memories", memory.id, "move"), { to: target }), { invalidate: ["memories", "channels"], success: (target) => `Memória movida para ${target}` })
    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Mover {memory.id}</DialogTitle>
                    <DialogDescription>Hoje em {memory.channel}.</DialogDescription>
                </DialogHeader>
                <InfoField id="move-to" label="Canal de destino" info="Só canais ativos recebem escrita.">
                    <Select value={to} onValueChange={setTo}>
                        <SelectTrigger id="move-to" className="bg-transparent">
                            <SelectValue placeholder="Escolha o canal" />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((channel) => (
                                <SelectItem key={channel.id} value={channel.slug}>
                                    {channel.slug}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </InfoField>
                <DialogFooter>
                    <Button type="button" disabled={!to || move.isPending} onClick={() => {
                            onConfirm?.()
                            move.mutate(to, { onSuccess: () => onOpenChange(false), onError: () => onFailed?.() })
                        }}>
                        {move.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Mover
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
