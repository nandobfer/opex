/** Mensagens acionáveis (pt-BR, sem a chave) para os status HTTP do gateway do OpenCode Go (módulo PURO). */
export function opencodeGoStatusMessage(status: number): string | null {
    if (status === 401) return "O OpenCode Go recusou a chave (HTTP 401): confira a chave oc_sk_… em Integrações › Inteligência Artificial › OpenCode Go"
    if (status === 403) return "O OpenCode Go negou acesso ao modelo (HTTP 403): confira o plano e, para DeepSeek V4.1 Flash e V4 Pro, habilite a região Global em Settings › Privacy do OpenCode"
    if (status === 429) return "Limite do plano OpenCode Go atingido (HTTP 429): aguarde a janela de 5 horas, semanal ou mensal, ou habilite o Extra Usage no OpenCode"
    return null
}
