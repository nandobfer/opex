/** Junção pura do texto de um turno do OpenCode, ciente de blocos (partes/mensagens). */

const BLOCK_SEPARATOR = "\n\n"

/**
 * Acrescenta um delta de texto ao acumulado. Quando o delta abre um bloco novo (outra parte de texto,
 * outra mensagem ou texto depois de uma ferramenta), garante uma linha em branco antes dele, para que
 * blocos distintos não fiquem colados na mesma linha. `piece` é o que foi de fato acrescentado.
 */
export function appendTextDelta(acc: string, delta: string, newBlock: boolean): { text: string; piece: string } {
    const piece = newBlock && acc && !acc.endsWith("\n") && !delta.startsWith("\n") ? `${BLOCK_SEPARATOR}${delta}` : delta
    return { text: acc + piece, piece }
}

/** Junta partes de texto (cada uma é um bloco) com o mesmo critério de `appendTextDelta`. */
export function joinTextBlocks(parts: readonly string[]): string {
    return parts.reduce((acc, part) => appendTextDelta(acc, part, true).text, "")
}
