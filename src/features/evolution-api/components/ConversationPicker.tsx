"use client"

import { AvatarLabel } from "@/components/ui/avatar-label"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import type { EvolutionContactDto } from "../types"

export function ConversationLabel({ contact }: { contact: EvolutionContactDto }) {
    return <AvatarLabel title={contact.name} image={contact.pictureUrl} subtitle={contact.isGroup ? "Grupo" : contact.number} />
}

export function ConversationPicker({ items, selected, onChange, multiple = true, placeholder = "Escolher conversas" }: { items: EvolutionContactDto[]; selected: string[]; onChange: (jids: string[]) => void; multiple?: boolean; placeholder?: string }) {
    const selectedItem = items.find((item) => item.jid === selected[0])
    return <SearchPicker items={items} getKey={(item) => item.jid} searchKeys={["name", "number", "jid"]} selectedKeys={selected} closeOnPick={!multiple}
        trigger={<FieldTrigger placeholder={placeholder} value={selected.length > 1 ? `${selected.length} conversas` : selectedItem ? <ConversationLabel contact={selectedItem} /> : selected[0]} />}
        renderItem={(item) => <ConversationLabel contact={item} />}
        onPick={(item) => onChange(multiple ? selected.includes(item.jid) ? selected.filter((jid) => jid !== item.jid) : [...selected, item.jid] : [item.jid])}
        searchLabel="Buscar por nome ou número" listLabel="Contatos e grupos" emptyText="Nenhuma conversa disponível. Sincronize na integração Evolution API." emptySearchText="Nenhuma conversa encontrada" />
}
