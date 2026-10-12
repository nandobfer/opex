/** Vocabulário e protocolo do refinamento de tarefa (módulo puro). */

/** Título de nível 2 sob o qual o agente reescreve a especificação técnica a cada rodada. */
export const REFINEMENT_SPEC_HEADING = "## Especificação técnica"

export const REFINEMENT_AUDIT_ENTITY = "RefinamentoTarefa"

/**
 * Chave da entrada de instruções durável da sessão do OpenCode (aplica o protocolo e as instruções
 * configuradas à sessão inteira, sem reenviá-las a cada turno).
 */
export const REFINEMENT_INSTRUCTIONS_KEY = "opex-refinement"

/** Rodadas automáticas de consolidação quando o turno termina sem a especificação técnica. */
export const REFINEMENT_MAX_RECOVERY_ATTEMPTS = 2

/** Aviso quando o turno termina sem a especificação (o serviço tenta consolidar antes de avisar). */
export const REFINEMENT_SPEC_MISSING_ERROR = "O agente terminou sem produzir a especificação técnica. Use Continuar para finalizá-la."

/** Aviso quando a especificação foi produzida mas não pôde ser gravada na tarefa. */
export const REFINEMENT_SPEC_SAVE_ERROR = "Não foi possível gravar a especificação técnica na tarefa. Use Continuar para tentar de novo."

/** Evento em `private-app` quando o estado de um refinamento muda. Payload: `{ taskId }`. */
export const REFINEMENT_UPDATED_EVENT = "refinement-updated"

/** Rótulo exibido na saída do agente como nome do turno. */
export const REFINEMENT_STAGE_LABEL = "Refinando"

export const REFINEMENT_RUN_STATES = ["idle", "running", "failed", "interrupted"] as const
export type RefinementRunState = (typeof REFINEMENT_RUN_STATES)[number]

export const REFINEMENT_ACTIONS = ["interrupt", "restart", "continue"] as const
export type RefinementAction = (typeof REFINEMENT_ACTIONS)[number]

/**
 * Protocolo do refinamento, sempre aplicado por cima das instruções configuráveis: garante que o
 * agente pergunte pela ferramenta nativa `question` (uma rodada por vez), reescreva a especificação
 * completa e cubra critérios de aceite, localização da mudança e casos de borda.
 */
export const REFINEMENT_PROTOCOL = [
    "Protocolo do refinamento (sempre aplicado):",
    "1. Seu único produto é esclarecer e reescrever a especificação técnica desta tarefa. Você NÃO está na etapa de planejamento nem de implementação: não produza planos de execução, não peça para implementar e não altere arquivos.",
    "2. Para perguntar, use SEMPRE a ferramenta nativa de perguntas do OpenCode, chamada `question` (a que abre um formulário para o usuário responder). Faça uma rodada de perguntas por vez e NUNCA escreva as perguntas como texto na sua resposta.",
    `3. Depois de cada rodada de respostas, reescreva a especificação técnica COMPLETA em Markdown, sob o título exatamente "${REFINEMENT_SPEC_HEADING}", já incorporando as respostas (não escreva só as diferenças).`,
    "4. A especificação precisa cobrir, no mínimo: (a) critérios de aceite; (b) localização da mudança — rotas/URLs, telas, módulos, integrações e arquivos envolvidos; (c) casos de borda (edge cases).",
    "5. Você só pode encerrar o turno de duas formas: (a) abrindo um novo formulário de perguntas; ou (b) terminando a resposta com a especificação técnica COMPLETA sob o título do item 3. NUNCA encerre sem uma das duas — em especial, quando não houver mais nada a perguntar, SEMPRE termine com a especificação, mesmo que já a tenha escrito antes.",
    "6. Se não conseguir usar a ferramenta `question`, explique o motivo em uma frase e pare, sem listar as perguntas como texto.",
].join("\n")
