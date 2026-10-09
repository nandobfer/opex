/**
 * Nomes dos canais privados do Pusher. Módulo PURO (sem dependências de servidor): pode ser
 * importado por hooks de cliente. A publicação fica em `./channels` (somente servidor).
 */

/** Canal do app (dados das telas, ex.: tarefas). */
export const appChannel = () => "private-app"
export const integrationChannel = (id: string) => `private-integration-${id}`
