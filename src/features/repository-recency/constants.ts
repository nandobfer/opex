/**
 * Vocabulário do histórico de **repositórios usados recentemente** (módulo PURO — cliente e servidor).
 *
 * O histórico é por **ator** (o dono ou o usuário do portal), guardado no servidor, e sustenta a
 * ordenação "selecionado recentemente" dos seletores de repositório dos filtros, do formulário de
 * tarefa e do formulário de prévia.
 */

/** Rotas de leitura/registro do histórico do **dono**. */
export const OWNER_REPO_RECENTS_PATH = "/tasks/repo-recents"

/** Rotas de leitura/registro do histórico do **usuário do portal**. */
export const CLIENTE_REPO_RECENTS_PATH = "/cliente/repo-recents"

/** Evento no canal privado do ator quando o histórico muda (outra aba/dispositivo). Payload: `{ projectId }`. */
export const REPO_RECENTS_UPDATED_EVENT = "repo-recents-updated"
