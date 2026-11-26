"use client"

import { useCallback } from "react"
import { AvatarLabel } from "@/components/ui/avatar-label"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import type { EvolutionContactDto } from "../types"
import { EvolutionSyncAction } from "./EvolutionSyncAction"

export function ConversationLabel({ contact }: { contact: EvolutionContactDto }) {
    return <AvatarLabel title={contact.name} image={contact.pictureUrl} subtitle={contact.isGroup ? "Grupo" : contact.number} />
}

/** Seletor de conversas com a ação de sincronizar ao lado quando a lista está vazia. */
export function ConversationPickerField(props: Parameters<typeof ConversationPicker>[0]) {
    return <div className="space-y-2"><ConversationPicker {...props} />{props.items.length === 0 && <EvolutionSyncAction />}</div>
}

/**
 * Seletor de contatos e grupos. Os escolhidos ficam no topo da lista, ao vivo: marcar já leva o item para cima, e com
 * busca os escolhidos que casam vêm primeiro (OPE-197, decisões do dono D7/D8 de 26/11/2026; vale para todo uso).
 */
export function ConversationPicker({ items, selected, onChange, multiple = true, placeholder = "Escolher conversas" }: { items: EvolutionContactDto[]; selected: string[]; onChange: (jids: string[]) => void; multiple?: boolean; placeholder?: string }) {
    const selectedItem = items.find((item) => item.jid === selected[0])
    const pinSelected = useCallback((item: EvolutionContactDto) => selected.includes(item.jid), [selected])
    return <SearchPicker items={items} getKey={(item) => item.jid} searchKeys={["name", "number", "jid"]} selectedKeys={selected} closeOnPick={!multiple} pinFirst={pinSelected}
        trigger={<FieldTrigger placeholder={placeholder} value={selected.length > 1 ? `${selected.length} conversas` : selectedItem ? <ConversationLabel contact={selectedItem} /> : selected[0]} />}
        renderItem={(item) => <ConversationLabel contact={item} />}
        onPick={(item) => onChange(multiple ? selected.includes(item.jid) ? selected.filter((jid) => jid !== item.jid) : [...selected, item.jid] : [item.jid])}
        searchLabel="Buscar por nome ou número" listLabel="Contatos e grupos" emptyText="Nenhuma conversa disponível." emptySearchText="Nenhuma conversa encontrada" />
}
