/**
 * Trava do planejamento (OPE-216): o texto final do planejador só vira versão do plano quando parece um
 * plano. Um anúncio curto ("Disparei duas explorações… fecho o plano assim que os resultados chegarem")
 * sem estrutura de plano não leva à revisão do plano. Um texto curto que não anuncia nada continua
 * aceito (ex.: "nada a fazer"), para não recusar planos curtos legítimos. Módulo puro.
 */

/** Abaixo disso, um texto que anuncia trabalho ainda por fazer (sem título nem lista numerada) não é plano. */
export const PLAN_MIN_CHARS = 300

export const NOT_A_PLAN_MESSAGE = "O planejador não devolveu um plano: a resposta só anuncia o que ainda vai fazer. Use Tentar de novo."

const ANNOUNCEMENT = /\b(assim que|quando (os |as )?(resultados?|explora[çc][õo]es|subagentes?|an[áa]lises?) (chegarem|chegar|terminarem|terminar|voltarem|voltar)|fecho o plano|escrevo o plano|aguardo|aguardando|disparei|lancei|vou (levantar|investigar|explorar|ler|analisar|fechar|escrever|consolidar|esperar|aguardar)|em seguida (escrevo|fecho|entrego)|retorno com|volto com)\b/i

const hasHeading = (text: string) => /^#{1,6}\s+\S/m.test(text)
const numberedItems = (text: string) => text.match(/^\s*\d+[.)]\s+\S/gm)?.length ?? 0

export function isPlanText(raw: string): boolean {
    const text = raw.trim()
    if (!text) return false
    if (text.length >= PLAN_MIN_CHARS) return true
    if (hasHeading(text) || numberedItems(text) >= 3) return true
    return !ANNOUNCEMENT.test(text)
}
