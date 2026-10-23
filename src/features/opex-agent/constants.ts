/** Constantes do "Agente Opex" (módulo puro: tela e servidor). */

/** Configuração salva em `ai_feature_settings` (`feature: "opex-agent"`). */
export const OPEX_FEATURE = "opex-agent"

/** Aba de `/integracoes/ia` com a configuração do agente. */
export const OPEX_AI_TAB = "agente-opex" as const

/** Provedores do agente: só os que aceitam ferramentas definidas pelo app (o OpenCode não aceita). */
export const OPEX_PROVIDER_IDS = ["gemini", "anthropic", "openai", "deepseek"] as const
export type OpexProviderId = (typeof OPEX_PROVIDER_IDS)[number]

export function isOpexProviderId(value: string): value is OpexProviderId {
    return (OPEX_PROVIDER_IDS as readonly string[]).includes(value)
}

/**
 * Grupos de ferramentas (módulos da árvore da configuração). A configuração guarda as ferramentas
 * **desligadas** (ferramenta nova nasce ligada) e o ajuste de confirmação por ferramenta.
 */
export const OPEX_TOOL_GROUPS = [
    "context",
    "files",
    "memories",
    "tasks",
    "previews",
    "time",
    "workbenches",
    "centrals",
    "github",
    "issues",
    "integrations",
    "routines",
    "ai-settings",
    "pr-reviews",
    "dashboard",
    "services",
    "finance",
    "clients",
    "host",
] as const
export type OpexToolGroup = (typeof OPEX_TOOL_GROUPS)[number]

export const OPEX_TOOL_GROUP_LABELS: Record<OpexToolGroup, { label: string; description: string }> = {
    context: { label: "Contexto", description: "Visão geral do app e data/hora atual" },
    files: { label: "Arquivos do chat", description: "Ler os arquivos enviados no chat e anexá-los a tarefas e prévias" },
    memories: { label: "Memórias do agente", description: "Listar, ler, criar, editar e excluir as memórias (instruções permanentes) do Agente Opex: globais, do dono e do cliente" },
    tasks: { label: "Tarefas", description: "Listar, ler, criar, editar, mover, comentar, arquivar e as features de IA das tarefas" },
    previews: { label: "Prévias", description: "Nova prévia com IA, correções, estimativa e aprovação (cria a tarefa)" },
    time: { label: "Horas", description: "Períodos ativos e horas agênticas apontadas" },
    workbenches: { label: "Mesas de trabalho", description: "Abrir, planejar, implementar, aprovar, corrigir e excluir mesas" },
    centrals: { label: "Centrais", description: "Centrais de desenvolvimento agêntico e a configuração geral" },
    github: { label: "Repositórios GitHub", description: "Ler e buscar arquivos, árvore, branches e commits de qualquer branch; criar branches e gravar/excluir arquivos (com confirmação)" },
    issues: { label: "Issues e dependências", description: "Ler e listar issues do GitHub, dependências formais com a entrega de cada uma, qual tarefa começar; registrar dependências e sub-issues (com confirmação)" },
    integrations: { label: "Integrações", description: "Ler (sem segredos), configurar e testar integrações" },
    routines: { label: "Rotinas", description: "Crons do agendador interno" },
    "ai-settings": { label: "Features de IA", description: "Configuração das features de IA do app" },
    "pr-reviews": { label: "Revisão de PR", description: "Revisões automáticas de pull requests" },
    dashboard: { label: "Dashboards", description: "Métricas de tarefas, horas, financeiro e IA" },
    services: { label: "Serviços", description: "Lançamentos manuais de faturamento: listar, ler, criar, editar e arquivar" },
    finance: { label: "Financeiro", description: "Faturamento por cliente e período (somente leitura)" },
    clients: { label: "Clientes", description: "Clientes do portal, usuários do portal e prévias de orçamento" },
    host: { label: "Terminal do host", description: "Executar comandos na máquina do OpenCode (fora do container do app)" },
}

/** Eventos em `private-app`. Payload: `{ id }` (sessão). */
export const OPEX_SESSION_UPDATED_EVENT = "opex-session-updated"
export const OPEX_SESSION_DELETED_EVENT = "opex-session-deleted"

export const OPEX_AUDIT_ENTITY = "AgenteOpex"
/**
 * Terminal do host: comandos rodam na máquina do OpenCode pelo shell dele. Diretórios permitidos e
 * tempo máximo são configuráveis; saída devolvida ao modelo cortada no fim.
 */
export const OPEX_HOST_DIRECTORIES_MAX = 30
export const OPEX_HOST_TIMEOUT_DEFAULT_SECONDS = 60
export const OPEX_HOST_MAX_TIMEOUT_DEFAULT_SECONDS = 300
export const OPEX_HOST_MAX_TIMEOUT_LIMIT_SECONDS = 1800
export const OPEX_HOST_COMMAND_MAX = 8000
export const OPEX_HOST_OUTPUT_MAX = 20_000
export const OPEX_HOST_AUDIT_ENTITY = "TerminalHost"
/** Auditoria das escritas do agente nos repositórios do GitHub. */
export const OPEX_GITHUB_AUDIT_ENTITY = "RepositorioGithub"
/** Entidade da auditoria da configuração do agente por cliente (o id é o do cliente). */
export const OPEX_CLIENT_AUDIT_ENTITY = "ClienteOrcamentoOpexAgent"
/** Configuração do agente no portal, salva no cliente (`opexAgent`); evento em `private-app` e no canal do cliente. */
export const OPEX_CLIENT_CONFIG_EVENT = "opex-client-config-updated"
/** Origens do painel de consumo de IA. */
export const OPEX_CONSUMPTION_ORIGIN = "opex-agent"
export const OPEX_TITLE_CONSUMPTION_ORIGIN = "opex-title"
export const OPEX_CLIENT_CONSUMPTION_ORIGIN = "opex-client-agent"
export const OPEX_CLIENT_TITLE_CONSUMPTION_ORIGIN = "opex-client-title"

export const OPEX_TITLE_MAX = 60
export const OPEX_SUMMARY_MAX = 280
export const OPEX_MESSAGE_MAX = 20_000
export const OPEX_DEFAULT_TITLE = "Nova sessão"

export const DEFAULT_OPEX_INSTRUCTIONS = [
    "Você é o Agente Opex, o assistente do Opex: o app pessoal do dono para gerenciar as tarefas (fonte de verdade, com issue no GitHub), acompanhar horas agênticas, conduzir o desenvolvimento agêntico (centrais e mesas de trabalho), lançar serviços, acompanhar o financeiro e cuidar dos clientes do portal de orçamentos.",
    "Você executa o que o usuário pede usando as ferramentas do app. Use quantas ferramentas forem necessárias: consulte antes de perguntar, encadeie chamadas e confira o resultado.",
    "Você segue memórias: instruções permanentes cadastradas pelo dono (globais, que valem também no portal do cliente; do dono; e do cliente, só no portal). Com as ferramentas de memórias você lista, lê, cria, edita e exclui essas memórias (o texto é revisado pelo uso \"Resumo de memórias\"); a mudança vale a partir da próxima resposta.",
    "Nunca invente ids, códigos, repositórios ou valores: descubra-os pelas ferramentas (ex.: get_task_options para repositórios/projetos, colunas, tipos e prioridades; list_tasks para achar uma tarefa; list_clients para clientes).",
    "Para decidir qual tarefa começar ou se algo está bloqueado, use rank_ready_tasks (e get_issue_dependencies/get_issue para detalhar). Dependências são as relações formais do GitHub (bloqueada por / bloqueia) com a entrega real de cada uma (issue fechada, tarefa concluída ou PR mesclado), nunca deduzidas pelo título. Uma tarefa também pode ser referida pela issue vinculada (`dono/repo#N`).",
    "Para criar uma tarefa: identifique o repositório (projeto) pelas opções, pergunte só o que faltar e crie uma prévia (create_preview + generate_preview). Se a prévia indicar que a descrição não está clara (critérios de aceite ou localização vagos), pergunte ao usuário esses pontos, registre a correção (set_preview_correction) e gere de novo. Mostre o resultado e só aprove (approve_preview, que cria a tarefa no Opex com a issue no GitHub) com o ok do usuário.",
    "Quando uma ferramenta responder `confirmation_required`, a ação aguarda o usuário clicar em Confirmar ou Cancelar no chat: diga em uma frase o que será feito e encerre a resposta. Você receberá a decisão e o resultado na próxima mensagem.",
    "O usuário pode enviar arquivos no chat (cada um aparece com o id `fileId`). Imagens, PDFs e textos chegam a você quando o modelo lê o tipo; os demais vêm só como referência. Quando o arquivo for para uma tarefa ou prévia, anexe-o (attach_files_to_task, attach_files_to_preview ou chatFileIds no create_preview) sem perguntar de novo.",
    "Credenciais de integrações e senhas/tokens de clientes podem ser gravadas, mas nunca são lidas: as ferramentas só informam se um segredo está definido.",
    "Responda em português do Brasil, em Markdown, de forma objetiva. Use listas e tabelas curtas quando ajudarem e cite os códigos das tarefas (ex.: OPX-123) e dos serviços.",
].join("\n")

/**
 * Instruções do agente no **portal do cliente**. Não reaproveitam as do dono: falam só do que o portal
 * permite e reforçam que cada consulta e ação já chega limitada ao cliente e ao papel do usuário.
 */
export const DEFAULT_OPEX_CLIENT_INSTRUCTIONS = [
    "Você é o Agente Opex no portal do cliente: um assistente por chat que ajuda o usuário do portal a acompanhar as tarefas, os pedidos de orçamento e (para administradores) o financeiro e os usuários do próprio cliente.",
    "Você executa o que o usuário pede usando as ferramentas do portal. Use quantas ferramentas forem necessárias: consulte antes de perguntar, encadeie chamadas e confira o resultado.",
    "As ferramentas já limitam tudo ao cliente e ao papel do usuário autenticado. Nunca tente acessar, deduzir ou mencionar dados de outros clientes, do app interno do dono ou de telas que o usuário não pode ver.",
    "Nunca invente ids, códigos, repositórios ou valores: descubra-os pelas ferramentas (ex.: get_portal_overview para repositórios e colunas; list_tasks para achar uma tarefa; list_previews para os pedidos abertos).",
    "Para um pedido de nova tarefa: identifique o repositório permitido pelas opções, pergunte só o que faltar e crie uma prévia (create_preview + generate_preview). Se a prévia indicar que a descrição não está clara (critérios de aceite ou localização vagos), pergunte ao usuário esses pontos, registre a correção (set_preview_correction) e gere de novo. Mostre o resultado e só aprove (approve_preview) com o ok do usuário.",
    "Quando uma ferramenta responder `confirmation_required`, a ação aguarda o usuário clicar em Confirmar ou Cancelar no chat: diga em uma frase o que será feito e encerre a resposta. Você receberá a decisão e o resultado na próxima mensagem.",
    "O usuário pode enviar arquivos no chat (cada um aparece com o id `fileId`). Imagens, PDFs e textos chegam a você quando o modelo lê o tipo; os demais vêm só como referência. Quando o arquivo for para uma tarefa ou prévia, anexe-o (attach_files_to_task, attach_files_to_preview) sem perguntar de novo.",
    "Nunca revele senhas ou tokens: as ferramentas não devolvem segredos e a gestão de usuários nunca mostra credenciais.",
    "Responda em português do Brasil, em Markdown, de forma objetiva. Use listas e tabelas curtas quando ajudarem e cite os códigos das tarefas (ex.: OPX-123).",
].join("\n")

export const DEFAULT_OPEX_TITLE_INSTRUCTIONS = [
    "Você mantém o título e o resumo de uma sessão de chat entre um usuário e um assistente.",
    `Título: até ${OPEX_TITLE_MAX} caracteres, sem aspas nem ponto final, que identifique o assunto principal da sessão.`,
    `Resumo: até ${OPEX_SUMMARY_MAX} caracteres, em uma ou duas frases, com o que foi pedido, o que foi feito e o que está pendente.`,
    "Atualize os dois com base no título e resumo atuais e no último turno: mantenha o que continua válido e incorpore o que mudou.",
    "Escreva em português do Brasil.",
    'Responda APENAS com JSON: {"title": "...", "summary": "..."}',
].join("\n")

/** Sugestões do estado vazio do chat (app do dono). */
export const OPEX_SUGGESTIONS = [
    "Quais tarefas estão em andamento?",
    "Quanto faturei neste mês?",
    "Crie uma tarefa a partir de uma ideia",
    "Como estão as mesas de trabalho?",
] as const

/** Sugestões do estado vazio do chat no portal do cliente. */
export const OPEX_CLIENT_SUGGESTIONS = [
    "Quais tarefas estão em andamento?",
    "Como está o andamento dos meus pedidos?",
    "Quero pedir uma nova tarefa",
    "Quanto ficou este mês?",
] as const

/** Arquivos do chat: limites padrão (configuráveis) e tetos. O teto de tamanho é o dos anexos de tarefa. */
export const OPEX_FILES_PER_MESSAGE_DEFAULT = 10
export const OPEX_FILES_PER_MESSAGE_MAX = 50
export const OPEX_FILE_SIZE_MB_DEFAULT = 100
export const OPEX_FILE_SIZE_MB_MAX = 100
/** Arquivo enviado e não usado numa mensagem é removido (S3 + metadado) pela rotina depois disso. */
export const OPEX_FILE_PENDING_TTL_MS = 24 * 60 * 60 * 1000
/** Validade da URL assinada do PUT direto no storage. */
export const OPEX_FILE_UPLOAD_URL_TTL_SECONDS = 15 * 60
/** Texto de arquivo enviado ao modelo por turno (o resto fica para read_chat_file). */
export const OPEX_FILE_TEXT_INLINE_MAX = 100_000
/** Maior arquivo baixado do storage para ir como conteúdo ao modelo; acima disso vira só referência. */
export const OPEX_FILE_CONTENT_MAX_BYTES = 20 * 1024 * 1024
/** Maior arquivo de texto lido do storage para `read_chat_file` e para o texto inline. */
export const OPEX_FILE_TEXT_MAX_BYTES = 5 * 1024 * 1024

/** Chave das abas abertas no navegador. */
export const OPEX_TABS_STORAGE_KEY = "opex:opex-agent:tabs:v1"

/** Atalho global: Ctrl+Shift+O (⌘+Shift+O no Mac). */
export function isOpexShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
    return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "o"
}
