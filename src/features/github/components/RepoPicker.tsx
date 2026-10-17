"use client"

import type { ReactNode } from "react"
import type { FuseOptionKey } from "fuse.js"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"

interface RepoPickerProps<T> {
    items: readonly T[]
    /** Item mostrado no gatilho (o escolhido). */
    active: T | null
    getKey: (item: T) => string
    /** Conteúdo da opção e do gatilho: `GithubRepoLabel` (avatar + `owner/repo` + cadeado) ou rótulo próprio. */
    renderItem: (item: T) => ReactNode
    /** Campos da busca tolerante (fuse.js). */
    searchKeys: FuseOptionKey<T>[]
    onPick: (item: T) => void
    placeholder: string
    searchLabel: string
    listLabel: string
    emptyText: string
    emptySearchText: string
    id?: string
    disabled?: boolean
    loading?: boolean
}

/**
 * Seletor de escopo por repositório (central, projeto do cliente...) com busca em popover, no padrão
 * do app: campo de largura total com o item escolhido dentro. A lista usa `GithubRepoLabel` quando o
 * item tem repositório; quem chama decide o conteúdo via `renderItem`.
 */
export function RepoPicker<T>({
    items,
    active,
    getKey,
    renderItem,
    searchKeys,
    onPick,
    placeholder,
    searchLabel,
    listLabel,
    emptyText,
    emptySearchText,
    id,
    disabled,
    loading,
}: RepoPickerProps<T>) {
    return (
        <SearchPicker<T>
            trigger={<FieldTrigger id={id} placeholder={placeholder} value={active ? renderItem(active) : undefined} />}
            items={items}
            getKey={getKey}
            searchKeys={searchKeys}
            renderItem={renderItem}
            onPick={onPick}
            matchTriggerWidth
            searchLabel={searchLabel}
            listLabel={listLabel}
            emptyText={emptyText}
            emptySearchText={emptySearchText}
            align="start"
            disabled={disabled}
            loading={loading}
        />
    )
}
