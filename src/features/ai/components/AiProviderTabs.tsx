"use client"

import { OptionTabs, type OptionTabsOption } from "@/components/ui/option-tabs"
import { getAiProvider, type AiProviderId, type AiProviderStatusDto } from "@/lib/ai/providers"

export interface AiProviderExtraOption {
    value: string
    label: string
    tooltip?: string
    /** Antes (ex.: "Mesmo do agente") ou depois dos provedores (padrão: antes). */
    position?: "start" | "end"
}

interface AiProviderTabsProps {
    id: string
    providers: readonly AiProviderStatusDto[]
    /** Provedores oferecidos, na ordem exibida. */
    allowed: readonly AiProviderId[]
    value: string | null
    onChange: (next: string) => void
    /** Opções que não são provedores do Opex (ex.: "Local", "Desligado"), sempre habilitadas. */
    extraOptions?: readonly AiProviderExtraOption[]
    /** Mostrado no lugar das abas quando nenhum provedor permitido está conectado e não há opção extra. */
    emptyText?: string
    disabled?: boolean
}

/**
 * Seletor de provedor das features de IA: só os conectados podem ser escolhidos (os demais ficam
 * desabilitados com "X: não conectado"). Compartilhado por `/integracoes/ia`, Agente Opex, Agente
 * Mentor e a aba Provedores do Engramind.
 */
export function AiProviderTabs({ id, providers, allowed, value, onChange, extraOptions = [], emptyText, disabled }: AiProviderTabsProps) {
    const anyConnected = allowed.some((providerId) => providers.find((item) => item.id === providerId)?.connected)
    if (emptyText && !anyConnected && extraOptions.length === 0) return <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{emptyText}</p>
    const extra = (position: "start" | "end"): OptionTabsOption<string>[] =>
        extraOptions.filter((option) => (option.position ?? "start") === position).map((option) => ({ value: option.value, label: option.label, tooltip: option.tooltip }))
    const options: OptionTabsOption<string>[] = [
        ...extra("start"),
        ...allowed.map((providerId) => {
            const connected = providers.find((item) => item.id === providerId)?.connected === true
            const name = getAiProvider(providerId).name
            return { value: providerId, label: name, disabled: !connected, title: connected ? undefined : `${name}: não conectado` }
        }),
        ...extra("end"),
    ]
    return <OptionTabs<string> id={id} options={options} value={value ?? ""} onChange={onChange} disabled={disabled} className="w-full flex-wrap" />
}
