import { getIntegrationConfig } from "@/lib/integrations/config"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import type { AiModelDto } from "./providers"
import { AiProviderError } from "./errors"

/**
 * JEV (TypeSafe) — SOMENTE servidor.
 *
 * O JEV é um modelo "System One" de **decisão estruturada**: a API `POST /v1/systemone` recebe um
 * estado (`state`) e perguntas tipadas (`questions`) e devolve respostas estruturadas (`answers`),
 * sem geração de texto. Aqui fica só o núcleo da integração: a listagem de modelos/aliases por
 * `GET /v1/models` (autenticação Bearer). As features que usam o JEV entram depois.
 */

export const JEV_API_URL = "https://api.typesafe.ai/v1"

async function getJevApiKey(): Promise<string> {
    const { apiKey } = await getIntegrationConfig("ai_jev")
    if (!apiKey) throw new AiProviderError("JEV sem API key: configure em Integrações › Provedores de IA › JEV")
    return apiKey
}

interface JevModelRaw {
    name: string
    description?: string
    release_date?: string
}

export function toJevModel(raw: JevModelRaw): AiModelDto {
    return {
        id: raw.name,
        name: raw.name,
        // O JEV não expõe variantes por modelo.
        variants: [],
        group: null,
        contextWindow: null,
        free: false,
    }
}

/** Modelos e aliases aceitos no campo `model` (`jev-latest`, `jev-preview`, ...). */
export async function listJevModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    const apiKey = await getJevApiKey()
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_jev"), "JEV", `${JEV_API_URL}/models`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
            cache: "no-store",
            signal,
        })
    } catch (error) {
        throw new AiProviderError(`Não foi possível conectar ao JEV: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (res.status === 401 || res.status === 403) throw new AiProviderError(`O JEV recusou a API key (HTTP ${res.status})`)
    if (!res.ok) throw new AiProviderError(`O JEV respondeu HTTP ${res.status}`)
    const body = (await res.json()) as { models?: JevModelRaw[] }
    return (body.models ?? []).map(toJevModel)
}
