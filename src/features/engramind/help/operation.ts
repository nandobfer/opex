/** Explicações da aba Operação (guia `operacao`). */
export const JOB_KIND_HELP: Record<string, string> = {
    redact: "Redator: gera o título e, se ligado, revisa o texto da memória.",
    embed: "Embedding: gera os vetores da busca por sentido.",
    webhook: "Entrega de um evento ao webhook de um app (inclusive o do Opex).",
}

export const JOB_STATE_HELP: Record<string, string> = {
    queued: "Na fila, esperando o runner (ou a próxima tentativa).",
    running: "Em execução, com lease reservado.",
    done: "Terminou (veja o resultado).",
    failed: "Esgotou as tentativas. Retentar recoloca na fila com as tentativas zeradas.",
}

export const JOB_OUTCOME_HELP: Record<string, string> = {
    applied: "Título e texto revisado aplicados.",
    title_only: "Só o título (sem revisão, texto igual, duplicata ou guarda de sentido).",
    superseded: "Sem efeito: a memória mudou ou foi excluída depois do job.",
    skipped: "Pulado: Redator ou webhook desligado ou sem configuração.",
    embedded: "Vetores gravados.",
    off: "Embeddings desligados.",
    delivered: "O app respondeu 2xx.",
    timeout: "Tempo limite excedido.",
}

export const LLM_OUTCOME_HELP: Record<string, string> = {
    success: "Resposta válida.",
    timeout: "Tempo limite do Redator excedido.",
    rate_limited: "O provedor recusou por limite (429).",
    unavailable: "Provedor indisponível.",
    rejected: "O provedor recusou a requisição.",
    invalid_response: "Resposta fora do esquema esperado.",
}

export const LLM_PURPOSE_HELP: Record<string, string> = {
    redact: "Chamada do job do Redator.",
    test: "Chamada do Testar Redator.",
}

export const USAGE_GROUP_HELP: Record<string, string> = {
    day: "Por dia (UTC).",
    agent: "Por agente (ou app, para tokens sem agente).",
    operation: "Por operação (get_context, search_memories, get_hints).",
    channel: "Por canal (uma requisição conta em cada canal que alcançou).",
}

export const STATUS_HELP = {
    version: "Versão do Engramind em execução e tempo desde a subida.",
    database: "Banco SQLite: ok ou migrations_pending, e o tamanho.",
    backup: "Réplica contínua do banco no S3 (Litestream), medida a cada 60 s. skip: backup desligado ou sem o binário.",
    queue: "Jobs pendentes e falhos por tipo e estado.",
    redator: "Redator: ligado, configurado, chaves que faltam e as chamadas das últimas 24 h.",
    embedding: "Provedor, modelo, dimensão e o estado: ready, reindexing (com o progresso), failed ou off.",
    webhooks: "Apps com webhook, entregas pendentes e as das últimas 24 h.",
    retention: "Última limpeza horária (uso, chamadas ao LLM, auditoria e jobs antigos).",
    counts: "Apps, agentes e tokens cadastrados.",
} as const

export const AUDIT_HELP = {
    entity: "app, agent, token, settings, secret, job, memory ou channel.",
    action: "Ex.: token.issue, token.revoke, settings.update, secret.set, memory.import.",
    period: "O Engramind não filtra por data: o Opex lê as páginas do mais recente até passar do \"desde\".",
    usage: "Requisições, memórias devolvidas ou injetadas e tokens renderizados no contexto.",
} as const
