import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { getOpencodeConnection } from "@/lib/ai/opencode"
import { OPENCODE_QUOTA_RPC_TIMEOUT_MS, QUOTA_RPC_ID, QUOTA_RPC_METHOD, type QuotaRefreshReason } from "../constants"

/**
 * Chamada ao RPC `slkiser.opencode-quota` (método `refresh`) do plugin, no `opencode serve`: o mesmo
 * canal do TUI, então a quota se renova sem nenhum TUI aberto. Falhas do SDK viram um tipo fechado,
 * para o serviço não interpretar erros do cliente.
 */

export type QuotaRpcFailureKind = "unavailable" | "unauthorized" | "timeout" | "network" | "internal"

export type QuotaRpcResult = { ok: true; output: unknown } | { ok: false; kind: QuotaRpcFailureKind; message: string }

export type QuotaRpcCaller = (reason: QuotaRefreshReason) => Promise<QuotaRpcResult>

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Classifica o erro do `@opencode/client` (`RpcError`, `UnauthorizedError`, `ClientError`…). */
export function classifyQuotaRpcError(error: unknown, timedOut: boolean): { kind: QuotaRpcFailureKind; message: string } {
    const message = errorMessage(error)
    if (timedOut) return { kind: "timeout", message }
    const value = (error ?? {}) as { _tag?: unknown; type?: unknown; reason?: unknown; status?: unknown }
    if (value._tag === "UnauthorizedError" || value.status === 401) return { kind: "unauthorized", message }
    if (value._tag === "RpcError" && (value.type === "rpc.unavailable" || value.type === "rpc.method_not_found")) return { kind: "unavailable", message }
    if (value.reason === "Transport") return { kind: "network", message }
    return { kind: "internal", message }
}

/** Pede ao plugin a quota (`refresh` com o motivo); usa o "Diretório das sessões" como `location`, quando houver. */
export const callQuotaRpc: QuotaRpcCaller = async (reason) => {
    const connection = await getOpencodeConnection()
    const client = await getOpencodeClient(connection)
    const signal = AbortSignal.timeout(OPENCODE_QUOTA_RPC_TIMEOUT_MS)
    try {
        const result = await client.rpc.call(
            { rpcID: QUOTA_RPC_ID, method: QUOTA_RPC_METHOD, input: { reason }, ...(connection.directory ? { location: { directory: connection.directory } } : {}) },
            { signal },
        )
        return { ok: true, output: result.output }
    } catch (error) {
        return { ok: false, ...classifyQuotaRpcError(error, signal.aborted) }
    }
}
