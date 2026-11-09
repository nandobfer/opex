/**
 * Custo informado pelo provedor (módulo PURO). O OpenCode (sessão) põe o custo nos metadados do passo;
 * o OpenCode Go devolve no `usage` da resposta `cost` (cobrado em dinheiro, Extra Usage) e
 * `opencode: { billing_source, allowance, list_cost }` (allowance = dólares descontados da cota do Go).
 * Custo efetivo do Go = `cost + allowance` (decisão do dono na OPE-154).
 */

export interface AiBilling {
    /** Origem da cobrança informada pelo Go (`go` = cota da assinatura). */
    source: string | null
    /** Dólares descontados da cota da assinatura. */
    allowanceUsd: number | null
    /** Preço de tabela do uso, independente de onde foi cobrado. */
    listCostUsd: number | null
}

export interface AiStepCost {
    costUsd: number | null
    billing: AiBilling | null
}

const numberOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)

/** Procura o bloco `{ cost, opencode: { billing_source, … } }` em qualquer formato de resposta do Go. */
export function findOpencodeGoCost(value: unknown, depth = 0): AiStepCost | null {
    if (!value || typeof value !== "object" || depth > 6) return null
    const record = value as Record<string, unknown>
    const opencode = record.opencode
    if (opencode && typeof opencode === "object" && "billing_source" in opencode) {
        const meta = opencode as Record<string, unknown>
        const cost = numberOrNull(record.cost)
        const allowance = numberOrNull(meta.allowance)
        const costUsd = cost === null && allowance === null ? null : (cost ?? 0) + (allowance ?? 0)
        return {
            costUsd,
            billing: { source: typeof meta.billing_source === "string" ? meta.billing_source : null, allowanceUsd: allowance, listCostUsd: numberOrNull(meta.list_cost) },
        }
    }
    for (const child of Array.isArray(value) ? value : Object.values(record)) {
        const found = findOpencodeGoCost(child, depth + 1)
        if (found) return found
    }
    return null
}

const addNullable = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0))

/** Soma de custos (passos ou respostas): `null` só quando nenhum lado informou. */
export function addStepCost(a: AiStepCost | null, b: AiStepCost | null): AiStepCost | null {
    if (!a) return b
    if (!b) return a
    const billing =
        a.billing || b.billing
            ? {
                  source: b.billing?.source ?? a.billing?.source ?? null,
                  allowanceUsd: addNullable(a.billing?.allowanceUsd ?? null, b.billing?.allowanceUsd ?? null),
                  listCostUsd: addNullable(a.billing?.listCostUsd ?? null, b.billing?.listCostUsd ?? null),
              }
            : null
    return { costUsd: addNullable(a.costUsd, b.costUsd), billing }
}

/** Custo do passo informado pelo OpenCode de sessão (`providerMetadata.opencode.cost`). */
export function opencodeSessionStepCost(providerMetadata: unknown): AiStepCost | null {
    const meta = (providerMetadata as { opencode?: { cost?: unknown } } | undefined)?.opencode
    const cost = numberOrNull(meta?.cost)
    return cost === null ? null : { costUsd: cost, billing: null }
}

/**
 * Leitor incremental do corpo da resposta (SSE ou JSON): acumula o custo de cada resposta do Go sem
 * alterar os bytes repassados à SDK. Linhas partidas entre pedaços ficam no buffer.
 */
export function createOpencodeGoCostScanner(onCost: (cost: AiStepCost) => void) {
    let buffer = ""
    /** Corpo inteiro enquanto não aparece `data:` (resposta JSON, sem stream). */
    let full = ""
    let sse = false
    const parse = (payload: string) => {
        try {
            const found = findOpencodeGoCost(JSON.parse(payload))
            if (found) onCost(found)
        } catch {
            // Trecho que não é JSON: ignora (o custo é telemetria, nunca interrompe a geração).
        }
    }
    const scanLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) return
        sse = true
        full = ""
        const payload = trimmed.slice(5).trim()
        if (payload && payload !== "[DONE]" && payload.includes("billing_source")) parse(payload)
    }
    return {
        push(text: string) {
            if (!sse && full.length < 5_000_000) full += text
            buffer += text
            let index = buffer.indexOf("\n")
            while (index >= 0) {
                scanLine(buffer.slice(0, index))
                buffer = buffer.slice(index + 1)
                index = buffer.indexOf("\n")
            }
        },
        end() {
            if (buffer.trim()) scanLine(buffer)
            if (!sse && full.includes("billing_source")) parse(full)
            buffer = ""
            full = ""
        },
    }
}
