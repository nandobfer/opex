/**
 * Trava do planejamento (OPE-216): o texto final do planejador só vira versão do plano quando parece um
 * plano. Um anúncio ("Disparei duas explorações… fecho o plano assim que os resultados chegarem"), de
 * qualquer tamanho, sem estrutura de plano (título Markdown ou lista numerada com 3+ itens) não leva à
 * revisão do plano. Texto sem estrutura que não anuncia nada continua aceito (ex.: "nada a fazer"), para não
 * recusar planos curtos legítimos. É heurística: o sinal principal é o runner, que com espera em segundo plano
 * devolve só o texto da execução final (vazio quando ela não escreveu nada). Módulo puro.
 */

export const NOT_A_PLAN_MESSAGE = "O planejador não devolveu um plano: a resposta só anuncia o que ainda vai fazer. Use Tentar de novo."

const ANNOUNCEMENT = /\b(assim que|quando (os |as )?(resultados?|explora[çc][õo]es|subagentes?|an[áa]lises?) (chegarem|chegar|terminarem|terminar|voltarem|voltar)|fecho o plano|escrevo o plano|aguardo|aguardando|disparei|lancei|vou (levantar|investigar|explorar|ler|analisar|fechar|escrever|consolidar|esperar|aguardar)|em seguida (escrevo|fecho|entrego)|retorno com|volto com)\b/i

const hasHeading = (text: string) => /^#{1,6}\s+\S/m.test(text)
const numberedItems = (text: string) => text.match(/^\s*\d+[.)]\s+\S/gm)?.length ?? 0

export function isPlanText(raw: string): boolean {
    const text = raw.trim()
    if (!text) return false
    if (hasHeading(text) || numberedItems(text) >= 3) return true
    // Sem estrutura de plano, um anúncio não é plano em nenhum tamanho (parágrafos longos de "disparei… fecho quando chegarem").
    return !ANNOUNCEMENT.test(text)
}
