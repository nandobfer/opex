/**
 * Formato do WhatsApp nas mensagens que o Agente Secretário envia ao dono (OPE-199, puro). O WhatsApp mostra
 * `*negrito*`, `_itálico_`, `~riscado~`, ```` ```mono``` ````, `` `código` ``, `> citação` e listas `- `/`1. `;
 * o que é Markdown sem equivalente é convertido antes do envio. As respostas aos contatos não passam por aqui.
 *
 * Decisões do dono (26/11/2026): a pergunta sai como `❓ *Contato* (Autor): pergunta`, uma linha em branco e o
 * trecho do contato citado com `>` (R1); o modelo escreve a pergunta já no formato do WhatsApp e o conversor é a
 * garantia (R2); os avisos de texto fixo mantêm o texto e só passam pelo conversor (R3).
 */

const CODE = /```[\s\S]*?```|`[^`\n]+`/g
const PLACEHOLDER = /\u0000(\d+)\u0000/g
const RULE_LINE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
// Só os `#` de fechamento precedidos por espaço saem (`# C#` mantém o `#` colado ao texto).
const HEADING = /^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/
const STAR_LIST = /^(\s*)[*+]\s+/
const LINK = /!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

function linkText(label: string, url: string): string {
    const text = label.trim()
    return !text || text === url ? url : `${text} (${url})`
}

function convertLine(line: string): string {
    const heading = HEADING.exec(line)
    if (heading) {
        const text = heading[1]!.replace(/\*\*|__/g, "").replace(/^\*+|\*+$/g, "").trim()
        return text ? `*${text}*` : ""
    }
    return line.replace(STAR_LIST, "$1- ")
}

function convertInline(text: string): string {
    return text
        .replace(LINK, (_, label: string, url: string) => linkText(label, url))
        .replace(/\*\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*\*/g, "*_$1_*")
        .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "*$1*")
        .replace(/__(?=\S)(.+?)(?<=\S)__/g, "*$1*")
        .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "~$1~")
}

/** Bloco cercado perde só a etiqueta de linguagem; o conteúdo do código nunca é convertido. */
function normalizeCode(code: string): string {
    return code.replace(/^```[\w+.#-]+\n/, "```\n")
}

/** Converte o Markdown sem equivalente no WhatsApp; o que já está no formato do WhatsApp volta igual. */
export function markdownToWhatsApp(text: string): string {
    const codes: string[] = []
    const protectedText = text.replace(/\r\n?/g, "\n").replace(CODE, (code) => `\u0000${codes.push(normalizeCode(code)) - 1}\u0000`)
    const lines = protectedText.split("\n").filter((line) => !RULE_LINE.test(line)).map(convertLine)
    return convertInline(lines.join("\n"))
        .replace(/\n{3,}/g, "\n\n")
        .replace(PLACEHOLDER, (_, index: string) => codes[Number(index)] ?? "")
        .trim()
}

/** Citação do WhatsApp: `> ` no começo de cada linha (linha vazia vira `>`); o texto citado fica literal. */
export function whatsAppQuote(text: string): string {
    const normalized = text.replace(/\r\n?/g, "\n").trim()
    if (!normalized) return ""
    return normalized.split("\n").map((line) => (line.trim() ? `> ${line.trimEnd()}` : ">")).join("\n")
}

/**
 * Nome do contato dentro do negrito: quebras de linha viram espaço, as pontas são aparadas e `*`, `_` e `~` saem,
 * porque o WhatsApp não tem escape e eles quebrariam o negrito. Se não sobrar nada, o nome vai aparado e sem negrito.
 */
function boldContactName(name: string): string {
    const plain = name.replace(/[*_~]/g, "").replace(/\s+/g, " ").trim()
    return plain ? `*${plain}*` : name.replace(/\s+/g, " ").trim()
}

/** Pergunta ao dono (R1): contato em negrito, autor do grupo entre parênteses e o trecho citado após uma linha em branco. */
export function ownerQuestionMessage(input: { contactName: string; author?: string; question: string; excerpt?: string }): string {
    const quote = input.excerpt ? whatsAppQuote(input.excerpt) : ""
    return `❓ ${boldContactName(input.contactName)}${input.author ? ` (${input.author})` : ""}: ${markdownToWhatsApp(input.question)}${quote ? `\n\n${quote}` : ""}`
}
