/** Seção "Sobre o Engramind": resumo e os tópicos detalhados (aba Sobre e "Saiba mais" de /engramind). */

export const ENGRAMIND_SUMMARY =
    "O Engramind é uma rede de memórias para agentes de IA: um serviço separado do Opex, escrito em Rust, que guarda fatos duráveis e curtos em canais e os entrega por REST, MCP e CLI. O Opex é o gestor da rede: configura o serviço, administra apps, agentes, tokens, canais e memórias e acompanha a operação."

export interface AboutTopic {
    id: string
    title: string
    paragraphs: string[]
}

export const ENGRAMIND_ABOUT_TOPICS: AboutTopic[] = [
    {
        id: "arquitetura",
        title: "Arquitetura",
        paragraphs: [
            "Um único serviço Rust (container engramind-api) com banco SQLite e busca textual FTS5. O backup é a réplica contínua do banco no S3 pelo Litestream.",
            "As variáveis de ambiente cuidam só da infraestrutura (porta, banco, pepper dos tokens, chave dos segredos, Litestream). Todo o comportamento vive nas configurações, gravadas pela API.",
            "Trabalho assíncrono roda numa fila em tabela, sem broker: jobs redact (Redator), embed (vetores) e webhook (eventos).",
        ],
    },
    {
        id: "identidades",
        title: "Identidades e tokens",
        paragraphs: [
            "App é um sistema que usa a rede (o Opex é o app opex). Agente pertence a um app (app/agente). Token é a credencial Bearer eng.tk_…, cujo segredo aparece só na emissão.",
            "Token admin gere a rede e alcança todos os canais; token agent opera memórias só nos canais que o agente assina. Escopos: read, read+write, read+delete ou read+write+delete.",
            "A rede nunca fica sem um admin ativo com write: o Engramind recusa revogar, rebaixar ou excluir o último (LAST_ADMIN_TOKEN).",
        ],
    },
    {
        id: "canais",
        title: "Canais e assinaturas",
        paragraphs: [
            "Memórias pertencem a canais hierárquicos (eng/global, eng/projeto-atlas). O autor é só proveniência.",
            "Um agente alcança um canal quando o assina, por alvo exato ou prefixo (eng/*), em modo inject (contexto e busca), search (só busca) ou manage (só citado pelo slug). O acesso da assinatura restringe os escopos do token.",
            "Canal arquivado sai do contexto e da busca e não recebe escrita; só canal arquivado pode ser excluído.",
        ],
    },
    {
        id: "memorias",
        title: "Memórias, versões e contexto",
        paragraphs: [
            "Cada memória tem texto, categoria, status (active, permanent, archived), título e versões. Toda edição cria uma revisão; Reverter devolve o texto antigo numa revisão nova.",
            "O contexto (get_context) entrega aos agentes o bloco das memórias dos canais inject, com orçamento de tokens, numa ordem determinística e com versão para cache (304).",
            "A importação traz memórias de outro sistema em lote, com chave de idempotência: repetir o mesmo arquivo não duplica.",
        ],
    },
    {
        id: "redator",
        title: "Redator (LLM)",
        paragraphs: [
            "Depois de cada escrita, o Redator dá um título de uma linha e, se ligado, revisa o texto. O agente nunca espera o LLM.",
            "O texto revisado só vale se passar na guarda de sentido (similaridade de embedding). Provedores: OpenAI-compatível, Anthropic e Gemini, com modelos reserva.",
        ],
    },
    {
        id: "embeddings",
        title: "Embeddings e busca",
        paragraphs: [
            "A busca combina sentido (vetores) e texto (FTS5) pela fusão RRF. O provedor padrão é local (multilingual-e5-small, sem custo por chamada); também há OpenAI-compatível, Ollama e Gemini.",
            "Trocar provedor, modelo, URL, dimensão ou prefixo valida o provedor e reindexa todas as memórias; o progresso aparece no status. Com o embedding desligado, a busca é só textual.",
        ],
    },
    {
        id: "webhooks",
        title: "Webhooks e tempo real",
        paragraphs: [
            "Cada mutação de memória, canal, assinatura ou configuração gera um evento assinado (HMAC-SHA256) para os apps interessados. O Opex recebe todos em /api/engramind/webhook e atualiza as telas ao vivo.",
            "Entregas que falham voltam à fila com espera crescente e, esgotadas, ficam failed na aba Operação (Retentar reenvia).",
        ],
    },
    {
        id: "opex",
        title: "O papel do Opex",
        paragraphs: [
            "O Opex guarda o token admin cifrado e fala com o Engramind só pelo servidor (o navegador nunca chama o Engramind).",
            "No primeiro uso, troca o token de bootstrap por um token próprio do app opex, revoga o de bootstrap e registra o webhook.",
            "As variáveis de ambiente são lidas e gravadas no host pelo OpenCode; os valores sensíveis nunca saem do servidor. O Agente Opex do dono faz todas as operações, com confirmação nas exclusões, arquivamentos e revogações.",
        ],
    },
]
