import type { OpexTool } from "./tools/define"

/**
 * Formatação da entrada e da saída das ferramentas para o chat (módulo PURO, sem o registro de
 * ferramentas). Fica separado do `tool-runtime` para o Agente Maddox exibir e gravar a entrada sem
 * importar o registro: o registro importa serviços pesados e entra num ciclo de módulos que, por
 * ordem de avaliação, deixava `tools/jobs` sem inicializar na coleta de dados do `next build`.
 */

/** Entrada/saída guardadas para exibição no card. */
export const MAX_TOOL_DISPLAY_CHARS = 6000
/** Saída de ferramenta enviada ao modelo (o resto é cortado com aviso). */
export const MAX_TOOL_OUTPUT_CHARS = 30_000

/** Resultado grande vira um objeto cortado (o modelo é avisado para refinar a consulta). */
export function compactToolOutput(value: unknown): unknown {
    const json = JSON.stringify(value ?? null) ?? "null"
    if (json.length <= MAX_TOOL_OUTPUT_CHARS) return value ?? null
    return {
        truncated: true,
        note: `Resultado com ${json.length.toLocaleString("pt-BR")} caracteres cortado em ${MAX_TOOL_OUTPUT_CHARS.toLocaleString("pt-BR")}: use filtros ou limites menores para ver o resto.`,
        partialJson: json.slice(0, MAX_TOOL_OUTPUT_CHARS),
    }
}

/**
 * Entrada sem segredos para exibir e guardar (cards, NDJSON e histórico): aplica o `redact` da
 * ferramenta sobre a entrada validada. Compartilhado pelo Agente Opex e pelo Agente Maddox.
 * `strict`: entrada que não valida numa ferramenta com `redact` não sai (`null`) — no Maddox a entrada
 * vem do OpenCode e não passou pela validação do Opex.
 */
export function redactToolInput(tool: OpexTool | undefined, input: unknown, options: { strict?: boolean } = {}): unknown {
    if (!tool?.redact) return input
    const parsed = tool.input.safeParse(input)
    if (parsed.success) return tool.redact(parsed.data)
    return options.strict ? null : input
}

export function stringifyForDisplay(value: unknown, max = MAX_TOOL_DISPLAY_CHARS): string | null {
    if (value === undefined) return null
    let text: string
    try {
        text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
    } catch {
        text = String(value)
    }
    if (text === undefined) return null
    return text.length > max ? `${text.slice(0, max)}\n…(+${(text.length - max).toLocaleString("pt-BR")} caracteres)` : text
}
