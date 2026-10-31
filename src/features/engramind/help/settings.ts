/**
 * Rótulo e explicação (tooltip) de cada configuração do Engramind, escritos a partir do guia
 * `configuracoes` do repositório do Engramind. Chave nova que o Engramind passar a devolver usa a
 * descrição da própria API.
 */

export interface SettingHelp {
    label: string
    help: string
}

export const SETTING_HELP: Record<string, SettingHelp> = {
    "limits.rate_per_minute": { label: "Requisições por minuto", help: "Quantas requisições por minuto cada token pode fazer. Acima disso, o Engramind responde 429 RATE_LIMITED com Retry-After." },
    "limits.max_batch": { label: "Itens por lote", help: "Máximo de itens numa operação em lote, como a importação de memórias. Arquivos maiores são recusados antes do envio." },
    "categories.list": { label: "Categorias", help: "Categorias aceitas nas memórias ({ chave, rótulo, prioridade }). A primeira é a padrão; prioridade maior entra antes no contexto. Retirar uma categoria em uso é recusado (CATEGORY_IN_USE) com a contagem." },
    "memory.text_min": { label: "Texto mínimo", help: "Caracteres mínimos do texto de uma memória." },
    "memory.text_max": { label: "Texto máximo", help: "Caracteres máximos do texto de uma memória. Aceita sobreposição por canal." },
    "memory.dedupe_exact": { label: "Recusar duplicatas exatas", help: "Texto igual (hash normalizado) a outra memória do canal devolve a existente com duplicate: true em vez de criar outra." },
    "memory.similar_threshold": { label: "Limiar de semelhança", help: "Similaridade mínima (0 a 1) para uma memória aparecer em \"similar\" na resposta de escrita, alertando o agente sobre quase duplicatas." },
    "context.budget_tokens": { label: "Orçamento do texto completo", help: "Tokens da faixa de texto completo do contexto entregue aos agentes. No canal, é o teto da parte dele." },
    "context.titles_budget_tokens": { label: "Orçamento dos títulos", help: "Tokens da faixa \"#id: título\" do contexto (memórias que não couberam inteiras). No canal, é o teto da parte dele." },
    "context.default_format": { label: "Formato padrão do contexto", help: "Formato do contexto quando o agente não informa: tagged (marcas XML), markdown ou json." },
    "context.token_estimator": { label: "Estimador de tokens", help: "Codificação usada para contar os tokens do contexto: o200k (modelos recentes) ou cl100k." },
    "context.overflow_line": { label: "Linha de excedente", help: "Mostra <overflow count=\"N\"> no fim do contexto quando sobram memórias fora das duas faixas." },
    "redator.enabled": { label: "Redator ligado", help: "O Redator dá um título a cada memória e pode revisar o texto, sempre depois da escrita. Desligado (ou sem provedor, modelo e chave), o título fica fallback, sem chamar o LLM." },
    "redator.provider": { label: "Provedor do Redator", help: "LLM do Redator: openai_compatible (/chat/completions, inclusive servidores locais), anthropic (/v1/messages) ou gemini (generateContent)." },
    "redator.model": { label: "Modelo do Redator", help: "Modelo principal do Redator (ex.: gpt-4o-mini)." },
    "redator.api_key": { label: "Chave de API do Redator", help: "Chave do provedor do Redator, cifrada no Engramind com SECRETS_KEY. Só é gravada, nunca lida de volta. Opcional só no openai_compatible." },
    "redator.base_url": { label: "URL do provedor do Redator", help: "URL base do provedor. Obrigatória no openai_compatible (ex.: https://api.openai.com/v1); no anthropic e no gemini, vazia usa a oficial." },
    "redator.instructions": { label: "Instruções do Redator", help: "Texto acrescentado ao prompt do sistema do Redator. No canal, substitui a global." },
    "redator.rewrite_text": { label: "Revisar o texto", help: "O Redator também reescreve o texto numa revisão nova (autor system/redator); desligado, só gera o título. Aceita sobreposição por canal." },
    "redator.title_max": { label: "Título máximo", help: "Caracteres máximos do título gerado; maior invalida a resposta do LLM." },
    "redator.min_similarity": { label: "Guarda de sentido", help: "Similaridade de cosseno mínima entre o original e o revisado. Com embeddings desligados ou indisponíveis, o texto revisado nunca é aplicado (só o título)." },
    "redator.timeout_ms": { label: "Tempo limite do Redator", help: "Tempo limite de cada chamada ao LLM, em milissegundos." },
    "redator.max_attempts": { label: "Tentativas do Redator", help: "Tentativas do job redact (espera 2 s × 2ⁿ, teto de 10 min). Esgotadas, o título fica fallback." },
    "redator.fallback_models": { label: "Modelos reserva", help: "Modelos tentados em ordem quando o principal falha por indisponibilidade, limite (429) ou tempo limite. Até 5." },
    "redator.temperature": { label: "Temperatura do Redator", help: "Temperatura enviada ao LLM (Redator e consolidação), de 0 a 2. Vazia não envia o campo e usa o padrão do provedor — necessário nos modelos que recusam temperature (ex.: família 5.5 da Anthropic). Editada na aba Provedores (IA do Opex)." },
    "embedding.provider": { label: "Provedor de embedding", help: "Quem gera os vetores da busca por sentido: local (no próprio serviço), openai_compatible, ollama, gemini ou off (só busca textual). Trocar valida o provedor e reindexa." },
    "embedding.model": { label: "Modelo de embedding", help: "Modelo de embedding (nunca de chat). No local, um dos da listagem. Trocar reindexa as memórias." },
    "embedding.base_url": { label: "URL do provedor de embedding", help: "URL base do provedor remoto. Obrigatória no openai_compatible e no ollama; no gemini, vazia usa a oficial." },
    "embedding.api_key": { label: "Chave de API do embedding", help: "Chave do provedor de embedding, cifrada no Engramind. Obrigatória no gemini. Trocar a chave não reindexa." },
    "embedding.dimensions": { label: "Dimensão", help: "Dimensão pedida ao provedor (dimensions/outputDimensionality). Vazia, vale a do modelo. Entra no model_id e reindexa." },
    "embedding.query_prefix": { label: "Prefixo das consultas", help: "Texto antes de cada consulta. Vazio usa o automático (\"query: \" na família e5)." },
    "embedding.document_prefix": { label: "Prefixo das memórias", help: "Texto antes de cada memória vetorizada. Vazio usa o automático (\"passage: \" na família e5)." },
    "embedding.batch_size": { label: "Memórias por chamada", help: "Memórias por chamada ao provedor nos jobs da reindexação. Muda sem reindexar." },
    "embedding.timeout_ms": { label: "Tempo limite do embedding", help: "Tempo limite das chamadas de embedding dos jobs e testes (a consulta da busca espera no máximo 2 s)." },
    "search.vector_weight": { label: "Peso do ramo vetorial", help: "Peso da busca por sentido na fusão RRF de search_memories." },
    "search.text_weight": { label: "Peso do ramo textual", help: "Peso da busca textual (FTS5/BM25) na fusão RRF." },
    "search.rrf_k": { label: "Constante k da fusão", help: "Constante da fusão RRF: score = Σ peso / (k + posição). Maior suaviza a diferença entre as posições." },
    "search.default_limit": { label: "Resultados padrão", help: "Resultados da busca quando o limite não é informado." },
    "search.hint_threshold": { label: "Limiar das dicas", help: "Similaridade mínima de uma dica (get_hints). Modelos e5 comprimem os cossenos: perto de 0,88 filtra melhor." },
    "search.hint_limit": { label: "Dicas padrão", help: "Dicas devolvidas quando o limite não é informado." },
    "webhooks.enabled": { label: "Webhooks ligados", help: "Desligado, as mutações não enfileiram eventos e o Opex deixa de receber as mudanças ao vivo." },
    "webhooks.timeout_ms": { label: "Prazo da entrega", help: "Prazo de cada tentativa de entrega de um webhook, em milissegundos." },
    "webhooks.max_attempts": { label: "Tentativas de entrega", help: "Tentativas (espera 10 s × 4ⁿ, teto de 1 h) antes de o job de webhook ficar failed." },
    "retention.usage_days": { label: "Dias de uso", help: "Dias de registro de uso guardados (base do Consumo)." },
    "retention.llm_calls_days": { label: "Dias de chamadas ao LLM", help: "Dias de chamadas ao LLM guardados." },
    "retention.audit_days": { label: "Dias de auditoria", help: "Dias de auditoria guardados; vazio guarda para sempre." },
    "retention.jobs_days": { label: "Dias de jobs encerrados", help: "Dias que jobs done e failed ficam na fila depois de terminar (queued e running nunca saem)." },
}

export function settingHelp(key: string, apiDescription?: string): SettingHelp {
    return SETTING_HELP[key] ?? { label: key, help: apiDescription ?? key }
}
