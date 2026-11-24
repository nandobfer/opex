/** Nó hast mínimo (texto ou elemento com filhos), sem depender dos tipos do `hast`. */
export interface CodeTextNode {
    type: string
    value?: unknown
    children?: CodeTextNode[]
}

function collect(node: CodeTextNode): string {
    if (node.type === "text") return typeof node.value === "string" ? node.value : ""
    return (node.children ?? []).map(collect).join("")
}

/**
 * Texto puro de um bloco de código (o nó `pre` do hast): concatena todos os textos descendentes,
 * inclusive os marcadores de linha do `rehypeLogicalLines`, e tira a quebra final que o mdast→hast
 * sempre acrescenta. Sem cercas nem rótulo de linguagem (eles não estão no hast).
 */
export function codeBlockText(node: CodeTextNode | null | undefined): string {
    if (!node) return ""
    return collect(node).replace(/\n$/, "")
}
