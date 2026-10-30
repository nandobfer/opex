import type { AiFeatureAvailability } from "@/features/ai/types"
import type { OpexFilesSettings } from "@/features/opex-agent/schemas"
import type { OpexToolMetaDto } from "@/features/opex-agent/tool-tree"
import type { ColumnColor } from "@/features/tasks/board"
import type { MaddoxAgentSettings } from "./schemas"

export interface MaddoxAgentSettingsDto {
    settings: MaddoxAgentSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
    /** Ferramentas do Opex disponíveis ao Maddox (árvore de seleção e confirmação). */
    tools: OpexToolMetaDto[]
}

/** Situação do Maddox no portal (configuração do cliente, disponibilidade, cor e modelo padrão). */
export interface MaddoxClientStatusDto {
    enabled: boolean
    available: boolean
    reason: string | null
    modelLabel: string | null
    model: string | null
    variant: string | null
    color: ColumnColor | null
    files: OpexFilesSettings
}

/** Configuração do Maddox de um cliente (tela do dono). */
export interface MaddoxClientAgentConfigDto {
    enabled: boolean
    /** Ferramentas do portal ligadas (o contexto entra sempre). */
    enabledTools: string[]
}

/** Situação de um MCP do Opex no OpenCode (aba de configuração). */
export interface MaddoxMcpStatusDto {
    baseUrl: string | null
    servers: { scope: "owner" | "portal"; name: string; state: "connected" | "pending" | "disabled" | "failed" | "needs_auth" | "missing"; error: string | null }[]
    error: string | null
}
