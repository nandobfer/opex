/** Mensagens acionáveis (pt-BR, sem a chave) para os status HTTP do Provider API do Command Code (módulo PURO, OPE-190). */
export function commandCodeStatusMessage(status: number, options: { upgradeRequired?: boolean } = {}): string | null {
    if (status === 401) return "O Command Code recusou a chave (HTTP 401): confira a chave em Integrações › Inteligência Artificial › Command Code"
    if (status === 402) return "Sem créditos no Command Code (HTTP 402): adicione créditos ou confira o plano no Studio"
    if (status === 403 && options.upgradeRequired) return "O plano do Command Code não tem acesso à API (HTTP 403, upgrade_required): o plano Go não usa a Provider API; troque para GOAT, Pro, Max, Team ou Provider"
    if (status === 403) return "O Command Code negou acesso ao modelo (HTTP 403): o modelo pode exigir um plano superior; escolha outro modelo ou use créditos pay-as-you-go"
    if (status === 429) return "Limite de uso do Command Code atingido (HTTP 429): aguarde a janela de 5 horas ou semanal, ou adicione créditos extras (/extra)"
    return null
}

/** O corpo de um 403 indica plano sem acesso à API (`upgrade_required`). */
export function isCommandCodeUpgradeRequired(body: string): boolean {
    return /upgrade_required/i.test(body)
}
