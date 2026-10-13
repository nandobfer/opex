/**
 * Nomes dos canais privados do Pusher. Módulo PURO (sem dependências de servidor): pode ser
 * importado por hooks de cliente. A publicação fica em `./channels` (somente servidor).
 */

/** Canal do app (dados das telas, ex.: tarefas) — só o dono assina. */
export const appChannel = () => "private-app"
export const integrationChannel = (id: string) => `private-integration-${id}`
/** Canal do portal do cliente (dados das telas do cliente). */
export const clientChannel = (clientId: string) => `private-client-${clientId}`

/** Canal de um **ambiente** (operações e logs ao vivo do container). */
export const environmentChannel = (environmentId: string) => `private-environment-${environmentId}`

export const CLIENT_CHANNEL_PREFIX = "private-client-"
export const ENVIRONMENT_CHANNEL_PREFIX = "private-environment-"
