/**
 * Rascunho das "Informações adicionais" da tela inicial da mesa quando "Refinar tarefa" abre a mesa já
 * em "Especificação pronta" (OPE-137): o texto não vai a nenhum agente na abertura e passa para o campo
 * do "Gerar plano" (os anexos seguem pela mesma fila de envios, chave `start:<tarefa>`). Só na memória
 * da aba: recarregar a página descarta.
 */
const drafts = new Map<string, string>()

export const startFieldKey = (taskId: string) => `start:${taskId}`

export function saveStartDraft(taskId: string, text: string): void {
    if (text.trim()) drafts.set(taskId, text)
    else drafts.delete(taskId)
}

export function takeStartDraft(taskId: string): string {
    const text = drafts.get(taskId) ?? ""
    drafts.delete(taskId)
    return text
}
