/** Explicações de tokens, escopos, tipos e assinaturas (guias `tokens-e-escopos` e `canais-e-assinaturas`). */
export const SCOPE_HELP: Record<string, string> = {
    read: "Ler e consultar. Num token admin, também ler identidades, configurações, status e auditoria.",
    write: "Criar e alterar. Num token admin, também identidades, canais, assinaturas e configurações. Exige read.",
    delete: "Excluir de vez. Num token admin, também excluir canais, apps e agentes e revogar tokens. Exige read.",
}

export const SCOPE_COMBINATION_HELP: Record<string, string> = {
    read: "Só leitura.",
    "read+write": "Ler, criar e alterar; não exclui nem revoga.",
    "read+delete": "Ler e excluir; não cria nem altera.",
    "read+write+delete": "Acesso completo (o necessário para o Opex administrar a rede).",
}

export const TOKEN_KIND_HELP: Record<string, string> = {
    admin: "Gere a rede: apps, agentes, tokens, canais, assinaturas, configurações, status e auditoria. Alcança todos os canais. Pertence a um app.",
    agent: "Opera memórias só nos canais que o agente assina (acesso = escopos ∩ acesso da assinatura). Pertence a um agente.",
}

export const TOKEN_STATUS_HELP: Record<string, string> = {
    active: "Autentica normalmente.",
    expired: "Passou da expiração: recebe 401.",
    revoked: "Revogado: recebe 401 na hora.",
}

export const SUBSCRIPTION_MODE_HELP: Record<string, string> = {
    inject: "Entra no contexto pronto do agente, na busca e nas dicas.",
    search: "Entra na busca e nas dicas, mas não no contexto.",
    manage: "Só é alcançado quando o canal é citado pelo slug exato (curadoria sem poluir o contexto).",
}

export const IDENTITY_HELP = {
    app: "Sistema que usa o Engramind (consumidor ou gestor). Slug único na rede; recebe webhooks dos canais que os agentes dele assinam (todos, se tiver token admin).",
    agent: "Agente de um app (endereço app/agente). Os tokens agent dele só alcançam os canais assinados.",
    token: "Credencial Bearer eng.tk_…; o segredo aparece só na emissão. last_used_at é gravado em lote a cada 10 s.",
    webhook: "URL que recebe os eventos assinados (HMAC-SHA256) e o segredo de 32 a 256 caracteres, só gravado.",
    disabled: "Desativado: os tokens deixam de autenticar e voltam ao reativar, sem perder o vínculo.",
    access: "Restringe os escopos do token neste alvo (nunca amplia). Vazio: os escopos do token.",
    target: "Canal exato (eng/global) ou prefixo com * depois de um segmento completo (eng/*, eng/projeto-*). Prefixo vale para canais criados depois.",
    subscriptionPriority: "Sobrepõe a prioridade do canal na ordem do contexto deste agente. Vazio: a do canal.",
    reaches: "Canais ativos que o alvo alcança agora.",
    expiresAt: "Opcional. Depois desta data o token recebe 401 (status expired).",
    label: "Nome para reconhecer o token na lista.",
    ownToken: "Token que este Opex usa para administrar o Engramind: não pode ser revogado nem rebaixado por aqui.",
    lastAdmin: "A rede nunca fica sem um token admin ativo com write: emita outro antes de revogar, rebaixar, desativar ou excluir o último.",
} as const

export const CHANNEL_HELP = {
    slug: "Endereço hierárquico e imutável do canal (eng/global): minúsculas, dígitos e hífens, até 8 segmentos.",
    priority: "De -1000 a 1000 (padrão 0): ordem padrão do canal no contexto.",
    version: "Cresce a cada mudança do canal ou das memórias dele.",
    archived: "Arquivado: sai do contexto, da busca e das dicas e não recebe escrita. Só canal arquivado pode ser excluído.",
    override: "Sobreposição do canal: vale só neste canal no lugar do valor global.",
    pending: "Memórias aguardando o título do Redator ou o vetor do embedding.",
    retrievals: "Quantas vezes as memórias do canal foram devolvidas em buscas e contextos.",
} as const

export const MEMORY_HELP = {
    status: "active: em uso; permanent: fixada; archived: fora do contexto e da busca padrão.",
    title_state: "pending: aguardando o Redator; ready: título gerado; fallback: título provisório (Redator desligado ou falhou).",
    embedding_state: "pending: na fila; ready: vetorizada; failed: esgotou as tentativas; off: embeddings desligados.",
    version: "Cresce a cada revisão. O histórico guarda todas e Reverter cria uma revisão nova com o texto antigo.",
    textOnly: "Busca só textual: o embedding está desligado, sem configuração ou indisponível.",
    importKey: "A chave de idempotência sai do canal e do conteúdo: o mesmo arquivo de novo não duplica nada.",
} as const
