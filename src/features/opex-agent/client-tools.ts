/**
 * Catálogo das ferramentas do Agente Opex no **portal do cliente** (módulo PURO: tela e servidor).
 *
 * As ferramentas do portal são próprias (não reaproveitam as do dono): cada uma chama a função de
 * serviço do portal, que já filtra tudo pelo cliente em escopo. O dono escolhe, por cliente, quais
 * ficam ligadas; as marcadas `adminOnly` só chegam ao **admin** do cliente (espelham as telas do
 * portal: Financeiro e Usuários).
 */

export const OPEX_CLIENT_TOOL_GROUPS = ["context", "tasks", "previews", "files", "dashboard", "finance", "users"] as const
export type OpexClientToolGroup = (typeof OPEX_CLIENT_TOOL_GROUPS)[number]

export const OPEX_CLIENT_TOOL_GROUP_LABELS: Record<OpexClientToolGroup, { label: string; description: string; adminOnly?: boolean }> = {
    context: { label: "Contexto", description: "Visão geral do portal: cliente, usuário, papel e repositórios" },
    tasks: { label: "Tarefas", description: "Listar, ler, comentar e alterar a prioridade das tarefas do cliente" },
    previews: { label: "Orçamentos", description: "Pedidos de nova tarefa: criar, gerar com IA, corrigir, estimar e aprovar" },
    files: { label: "Arquivos do chat", description: "Ler os arquivos enviados no chat e anexá-los a tarefas e prévias" },
    dashboard: { label: "Dashboard", description: "Métricas de tarefas e do período" },
    finance: { label: "Financeiro", description: "Faturamento por repositório, horas e serviços no período", adminOnly: true },
    users: { label: "Usuários", description: "Usuários do cliente: listar, editar e remover vínculos", adminOnly: true },
}

export type OpexClientToolRisk = "read" | "write" | "destructive"

export interface OpexClientToolMeta {
    name: string
    group: OpexClientToolGroup
    label: string
    /** Texto curto da tela de configuração. */
    hint: string
    risk: OpexClientToolRisk
    /** Só o **admin** do cliente recebe a ferramenta, mesmo com ela ligada. */
    adminOnly?: boolean
}

/** Ferramenta de contexto: sempre disponível (não pode ser desligada). */
export const OPEX_CLIENT_CONTEXT_TOOL = "get_portal_overview"

export const OPEX_CLIENT_TOOLS: readonly OpexClientToolMeta[] = [
    { name: OPEX_CLIENT_CONTEXT_TOOL, group: "context", label: "Visão geral", hint: "Data/hora, cliente, usuário, papel e repositórios", risk: "read" },
    { name: "list_tasks", group: "tasks", label: "Listar tarefas", hint: "Busca por código, título, coluna, prioridade e tipo", risk: "read" },
    { name: "get_task", group: "tasks", label: "Ler tarefa", hint: "Descrição, especificação técnica e comentários", risk: "read" },
    { name: "add_comment", group: "tasks", label: "Comentar tarefa", hint: "Registra um comentário como o usuário do portal", risk: "write" },
    { name: "set_task_priority", group: "tasks", label: "Alterar prioridade", hint: "Muda a prioridade de uma tarefa do cliente", risk: "write" },
    { name: "list_previews", group: "previews", label: "Listar orçamentos", hint: "Pedidos de nova tarefa abertos e aprovados", risk: "read" },
    { name: "get_preview", group: "previews", label: "Ler orçamento", hint: "Conteúdo gerado, correção e estimativa", risk: "read" },
    { name: "create_preview", group: "previews", label: "Criar orçamento", hint: "Abre um pedido num repositório permitido", risk: "write" },
    { name: "generate_preview", group: "previews", label: "Gerar orçamento", hint: "Gera título, tipo, prioridade e especificação com IA", risk: "write" },
    { name: "set_preview_correction", group: "previews", label: "Corrigir orçamento", hint: "Registra o ajuste pedido antes de gerar de novo", risk: "write" },
    { name: "estimate_preview", group: "previews", label: "Estimar orçamento", hint: "Estima as horas e o valor do pedido", risk: "write" },
    { name: "approve_preview", group: "previews", label: "Aprovar orçamento", hint: "Cria a tarefa no Opex a partir do pedido", risk: "write" },
    { name: "list_chat_files", group: "files", label: "Arquivos do chat", hint: "Arquivos enviados nesta sessão", risk: "read" },
    { name: "read_chat_file", group: "files", label: "Ler arquivo", hint: "Conteúdo de texto de um arquivo do chat", risk: "read" },
    { name: "attach_files_to_task", group: "files", label: "Anexar à tarefa", hint: "Copia arquivos do chat para uma tarefa", risk: "write" },
    { name: "attach_files_to_preview", group: "files", label: "Anexar ao orçamento", hint: "Copia arquivos do chat para um pedido", risk: "write" },
    { name: "get_dashboard", group: "dashboard", label: "Dashboard", hint: "Tarefas por coluna, repositório, tags e período", risk: "read" },
    { name: "get_finance", group: "finance", label: "Financeiro", hint: "Faturamento e horas por repositório no período", risk: "read", adminOnly: true },
    { name: "get_service", group: "finance", label: "Ler serviço", hint: "Detalhe de um serviço faturado", risk: "read", adminOnly: true },
    { name: "list_users", group: "users", label: "Listar usuários", hint: "Usuários vinculados ao cliente e papéis", risk: "read", adminOnly: true },
    { name: "update_user", group: "users", label: "Editar usuário", hint: "Nome, email, senha e papel no cliente", risk: "write", adminOnly: true },
    { name: "delete_user", group: "users", label: "Remover usuário", hint: "Remove o vínculo do usuário com o cliente", risk: "destructive", adminOnly: true },
]

export function findOpexClientTool(name: string): OpexClientToolMeta | undefined {
    return OPEX_CLIENT_TOOLS.find((tool) => tool.name === name)
}

/** Ferramentas disponíveis para o cliente: contexto sempre; adminOnly só para o admin. */
export function opexClientToolsFor(isAdmin: boolean): OpexClientToolMeta[] {
    return OPEX_CLIENT_TOOLS.filter((tool) => !tool.adminOnly || isAdmin)
}

/**
 * Ferramentas efetivamente liberadas: contexto sempre, mais as não desligadas e permitidas ao papel.
 * Ferramenta nova entra ligada (a configuração guarda as **desligadas**).
 */
export function enabledOpexClientToolNames(disabledTools: readonly string[], isAdmin: boolean): string[] {
    const disabled = new Set(disabledTools)
    return opexClientToolsFor(isAdmin)
        .filter((tool) => tool.group === "context" || !disabled.has(tool.name))
        .map((tool) => tool.name)
}

/** Quantas ferramentas cada grupo tem para o papel (contador da tela). */
export function opexClientToolCounts(isAdmin: boolean): Record<OpexClientToolGroup, number> {
    const counts = Object.fromEntries(OPEX_CLIENT_TOOL_GROUPS.map((group) => [group, 0])) as Record<OpexClientToolGroup, number>
    for (const tool of opexClientToolsFor(isAdmin)) counts[tool.group] += 1
    return counts
}

/** Nomes válidos (validação da configuração salva pelo dono). */
export const OPEX_CLIENT_TOOL_NAMES: readonly string[] = OPEX_CLIENT_TOOLS.map((tool) => tool.name)
