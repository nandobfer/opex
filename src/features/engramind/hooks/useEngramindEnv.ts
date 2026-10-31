"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api, unwrapApi } from "@/lib/api"
import { readNdjson } from "@/lib/ndjson-client"
import type { ApiResponse } from "@/lib/types/api"
import type { EnvUpdateInput } from "../schemas/env"
import type { ApplyEvent, ApplyStateDto, EnvFileDto } from "../types"
import { useEngramindMutation, useEngramindQuery } from "./useEngramind"

/** `.env` do Engramind lido no host (sensíveis só como configurada/não). */
export const useEngramindEnv = () => useEngramindQuery<EnvFileDto>("env")

export const useSaveEngramindEnv = () =>
    useEngramindMutation((input: EnvUpdateInput) => api.put<ApiResponse<EnvFileDto>>("/engramind/env", input).then((res) => unwrapApi(res.data)), { invalidate: ["env"], success: "Variáveis gravadas: alterações pendentes de aplicação", silentError: true })

export const useApplyEngramindEnv = () => useEngramindMutation(() => api.post<ApiResponse<{ id: string }>>("/engramind/env/apply", { confirm: true }).then((res) => unwrapApi(res.data)), { invalidate: ["env"] })

/** Log ao vivo do "Aplicar e reiniciar" (NDJSON), com reconexão enquanto estiver rodando. */
export function useApplyLog(active: boolean, onLog: (text: string, replace: boolean) => void) {
    const [status, setStatus] = useState<{ status: ApplyStateDto["status"]; error: string | null } | null>(null)
    const onLogRef = useRef(onLog)
    useEffect(() => {
        onLogRef.current = onLog
    }, [onLog])
    const reset = useCallback(() => setStatus(null), [])
    useEffect(() => {
        if (!active) return
        const controller = new AbortController()
        let stop = false
        void (async () => {
            for (let attempt = 0; attempt < 60 && !stop; attempt++) {
                let finished = false
                let first = true
                try {
                    await readNdjson<ApplyEvent>(
                        "/api/engramind/env/apply/events",
                        (event) => {
                            // Cada conexão começa pelo log inteiro: substitui o que já estava na tela.
                            if (event.type === "log") onLogRef.current(event.text, first)
                            if (event.type === "log") first = false
                            if (event.type === "status") {
                                finished = true
                                setStatus({ status: event.status, error: event.error })
                            }
                        },
                        { signal: controller.signal },
                    )
                } catch {
                    if (controller.signal.aborted) return
                }
                if (finished || controller.signal.aborted) return
                await new Promise((resolve) => setTimeout(resolve, 3_000))
            }
        })()
        return () => {
            stop = true
            controller.abort()
        }
    }, [active])
    return { status, reset }
}
