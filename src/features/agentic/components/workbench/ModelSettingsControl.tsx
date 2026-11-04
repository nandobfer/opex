"use client"

import type { ReactNode } from "react"
import type { AiModelDto } from "@/lib/ai/providers"
import type { ModelChoiceDto } from "../../types"
import { ModelInUse } from "./ModelInUse"
import { ModelSettingsPopover } from "./ModelSettingsPopover"

type Models = { data?: AiModelDto[]; isError?: boolean; isLoading: boolean; error?: unknown }

/** Texto (só leitura) do modelo em uso no controle. */
interface ModelInUseText {
    /** "Modelo do Plano", "Modelo do fork"... (dica e leitor de tela). */
    label: string
    choice: Pick<ModelChoiceDto, "model" | "variant">
    /** Origem do valor ("da central", "definido nesta mesa"...). */
    sourceText?: string
    highlighted?: boolean
}

interface ModelSettingsControlProps {
    id: string
    /** `data-testid` do bloco (mesa, fork ou etapa inicial). */
    testId: string
    /** Nome acessível e dica do botão de configuração. */
    buttonLabel: string
    models: Models
    /** Texto do modelo em uso; `null` mostra só o botão. */
    inUse: ModelInUseText | null
    /** Texto ao vivo da gravação, lido por leitores de tela. */
    liveText?: string | null
    className?: string
    /** Seções do popover de cada tela. */
    children: ReactNode
}

/**
 * Modelo em uso (texto + botão único que abre "Modelos por etapa") compartilhado pela mesa em
 * andamento, pelo fork e pela etapa inicial da mesa (ela ocupa o mesmo lugar relativo: à esquerda do
 * botão principal). As seções vêm de `WorkbenchModelSections` em cada tela.
 */
export function ModelSettingsControl({ id, testId, buttonLabel, models, inUse, liveText = null, className, children }: ModelSettingsControlProps) {
    return (
        <div className="flex min-w-0 items-center gap-2" data-testid={testId}>
            {inUse && <ModelInUse label={inUse.label} choice={inUse.choice} sourceText={inUse.sourceText} highlighted={inUse.highlighted} models={models.data} />}
            <ModelSettingsPopover id={id} label={buttonLabel} liveText={liveText} className={className}>
                {children}
            </ModelSettingsPopover>
        </div>
    )
}
