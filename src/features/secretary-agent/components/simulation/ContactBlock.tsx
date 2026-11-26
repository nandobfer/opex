"use client"

import { UserRound } from "lucide-react"
import { formatPhoneNumber } from "@/features/evolution-api/phone"
import type { SecretaryContact } from "../../contact"
import { SimulationBlock } from "./SimulationBlock"

/** O que o agente recebeu sobre o contato (nome, número e, em grupo, o autor), para o dono conferir. */
export function ContactBlock({ contact }: { contact: SecretaryContact }) {
    return (
        <SimulationBlock icon={UserRound} title="Contato">
            <ul className="space-y-1 text-sm" aria-label="Contato recebido pelo agente">
                <li>{contact.isGroup ? "Grupo" : "Nome"}: <strong>{contact.name ?? "Nome desconhecido"}</strong></li>
                {!contact.isGroup && <li>Número: {formatPhoneNumber(contact.number) ?? "—"}</li>}
                {contact.isGroup && <li>Autor: {contact.author ?? "—"}</li>}
            </ul>
        </SimulationBlock>
    )
}
