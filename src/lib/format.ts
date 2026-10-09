/**
 * Formatação numérica pt-BR — cópia de `src/lib/format.ts` do Smart Desk (mesmas funções usadas
 * nos campos monetários do formulário de proposta, `MarketProposalDialog`).
 */

/**
 * Formata número no padrão brasileiro (#.###,##)
 *
 * @param value - Valor numérico
 * @param decimals - Casas decimais (padrão: 2)
 * @returns String formatada (ex: 1.234,56)
 */
export function formatNumberBR(value: number, decimals = 2): string {
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value)
}

/**
 * Converte entrada de texto "bancária" para número.
 *
 * Remove todos os caracteres não numéricos e aplica a quantidade de casas decimais.
 * Ex: "1234" com decimals=2 => 12.34; com decimals=4 => 0.1234
 */
export function parseBankingInputBR(value: string, decimals = 2): number {
    const digits = value.replace(/\D/g, "")
    if (!digits) return 0

    const divisor = Math.pow(10, Math.max(0, decimals))
    return parseInt(digits, 10) / divisor
}
