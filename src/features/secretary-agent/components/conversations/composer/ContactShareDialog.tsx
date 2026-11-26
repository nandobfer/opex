"use client"

import { useState } from "react"
import { SendHorizontal, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConversationPicker } from "@/features/evolution-api/components/ConversationPicker"
import type { EvolutionContactDto } from "@/features/evolution-api/types"

/**
 * Compartilhar contato: adaptado do Atendimento (lá vinha do cadastro de clientes do CRM). Aqui escolhe contatos do
 * WhatsApp (cache da Evolution) com número; até 10 por vez.
 */
export function ContactShareDialog({ open, onOpenChange, contacts, onSend }: { open: boolean; onOpenChange: (open: boolean) => void; contacts: EvolutionContactDto[]; onSend: (contacts: { name: string; number: string }[]) => void }) {
    const [selected, setSelected] = useState<string[]>([])
    const changeOpen = (next: boolean) => {
        if (!next) setSelected([])
        onOpenChange(next)
    }
    const people = contacts.filter((contact) => !contact.isGroup && contact.number)
    const chosen = people.filter((contact) => selected.includes(contact.jid)).slice(0, 10)
    return (
        <Dialog open={open} onOpenChange={changeOpen}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserRound className="h-5 w-5 text-primary" aria-hidden /> Enviar contato
                    </DialogTitle>
                    <DialogDescription>Escolha até 10 contatos do WhatsApp para compartilhar nesta conversa.</DialogDescription>
                </DialogHeader>
                <ConversationPicker items={people} selected={selected} onChange={(jids) => setSelected(jids.slice(0, 10))} placeholder="Escolher contatos" />
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        disabled={chosen.length === 0}
                        onClick={() => {
                            onSend(chosen.map((contact) => ({ name: contact.name, number: contact.number! })))
                            changeOpen(false)
                        }}
                    >
                        <SendHorizontal aria-hidden /> Enviar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
