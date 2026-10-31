/** Textos dos tooltips da "IA do Opex" (aba Provedores). */
export const AI_SOURCE_HELP = {
    card: "Usa os provedores de IA já configurados no Opex (Integrações › Inteligência Artificial) no Redator e no embedding do Engramind. O Opex copia a chave para o Engramind (cifrada lá com a SECRETS_KEY) e a reenvia sozinho quando ela muda no Opex. Escolher o provedor já define o endereço da API: não há URL para preencher.",
    redatorProvider: "Provedor do LLM do Redator. Só os provedores conectados no Opex podem ser escolhidos. Gemini e Anthropic usam a URL oficial; OpenAI e DeepSeek vão como OpenAI-compatível com a URL oficial de cada um.",
    redatorModel: "Modelo de chat que dá título às memórias e, com redator.rewrite_text, revisa o texto. A lista vem do provedor, com a chave do Opex.",
    temperature: "Temperatura enviada ao LLM (Redator e consolidação), de 0 a 2. Vazia não envia o campo e usa o padrão do modelo — obrigatório nos modelos que recusam temperature (ex.: família 5.5 da Anthropic responde 400 \"temperature is deprecated\").",
    fallbacks: "Modelos tentados em ordem quando o principal falha por indisponibilidade, limite (429) ou tempo limite. Até 5, do mesmo provedor.",
    embeddingProvider: "Quem gera os vetores da busca por sentido. Local: fastembed no próprio Engramind (sem chave e sem custo por chamada). Gemini e OpenAI: com a chave do Opex. Desligado: só busca textual.",
    embeddingModel: "Modelo de embedding (nunca de chat). Trocar valida o provedor e reindexa todas as memórias.",
    dimensions: "Dimensão pedida ao provedor (dimensions na OpenAI, outputDimensionality no Gemini). Vazia, vale a do modelo. Trocar reindexa.",
    origin: "De onde vem a configuração em uso. \"Vem do Opex\": bate com o que foi aplicado aqui. \"Configurado no Engramind\": mudou por fora (ferramenta do agente, CLI, outro admin ou chave gravada à mão) — aplicar de novo volta a usar o Opex.",
    sync: "Estado da cópia da chave. Quando a chave muda no Opex, ela é reenviada sozinha; se o envio falhar, a configuração do Opex não é desfeita e aparece \"Reenviar a chave\".",
    test: "Chama o provedor de verdade pelo Engramind com a configuração proposta e a chave do Opex, sem gravar nada.",
} as const

export const EMBEDDING_EXTRA_LABELS = { local: "Local", off: "Desligado" } as const
export const EMBEDDING_EXTRA_HELP = {
    local: "fastembed no próprio Engramind: as memórias não saem do serviço e não há custo por chamada.",
    off: "Embeddings desligados: só busca textual.",
} as const
