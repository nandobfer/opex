"use client"

import { useQuery } from "@tanstack/react-query"
import type { AiModelDto } from "@/lib/ai/providers"
import type { ApplyAiSourceInput, TestAiSourceInput } from "../schemas/ai-source"
import type { AiSourceSection } from "../ai-source"
import type { AiSourceStateDto, ApplyAiSourceResult } from "../types"
import { engramindKey, engramindSend, useEngramindMutation, useEngramindQuery } from "./useEngramind"

/** "IA do Opex": estado, aplicar, testar e reenviar a chave (rotas `/api/engramind/providers/from-opex`). */

const FROM_OPEX = "providers/from-opex"

/** Intervalo do polling enquanto o modelo local baixa ou carrega (o webhook não avisa o fim do download). */
export const LOCAL_MODEL_POLL_MS = 3000
const localModelBusy = (data: AiSourceStateDto | undefined) => data?.localModel?.state === "downloading" || data?.localModel?.state === "loading"

export const useOpexAiSource = () => useEngramindQuery<AiSourceStateDto>(FROM_OPEX, undefined, { refetchInterval: (data) => (localModelBusy(data) ? LOCAL_MODEL_POLL_MS : false) })

export const useApplyOpexAiSource = () =>
    useEngramindMutation((input: ApplyAiSourceInput) => engramindSend<ApplyAiSourceResult>("post", FROM_OPEX, input), { invalidate: ["providers", "settings", "status"], silentError: true })

export const useTestOpexAiSource = () => useEngramindMutation((input: TestAiSourceInput) => engramindSend<Record<string, unknown>>("post", `${FROM_OPEX}/test`, input), { invalidate: [], silentError: true })

export const useResendOpexAiKey = () =>
    useEngramindMutation((section: AiSourceSection) => engramindSend<AiSourceStateDto>("post", `${FROM_OPEX}/resend`, { section }), { invalidate: ["providers", "settings"], success: "Chave reenviada ao Engramind" })

interface LocalEmbeddingModel {
    id: string
    dimensions: number | null
    description: string | null
}

/** Modelo local (fastembed) no formato do `ModelPickerField`. */
export const toPickerModel = (model: LocalEmbeddingModel): AiModelDto => ({ id: model.id, name: model.id, variants: [], group: model.dimensions ? `${model.dimensions} dimensões` : null, contextWindow: null, free: true })

/** Modelos do embedding local, listados pelo próprio Engramind. */
export function useLocalEmbeddingModels(enabled: boolean) {
    return useQuery({
        queryKey: engramindKey("providers/embedding/models", { provider: "local" }),
        queryFn: async () => (await engramindSend<{ models: LocalEmbeddingModel[] }>("post", "providers/embedding/models", { provider: "local" })).models.map(toPickerModel),
        enabled,
        staleTime: 5 * 60_000,
        retry: false,
    })
}
