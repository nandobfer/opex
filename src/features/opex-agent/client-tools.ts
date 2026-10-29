import type { CheckBranch } from "@/lib/check-tree"

/**
 * Catálogo das ferramentas do Agente Opex no **portal do cliente** (módulo PURO: tela e servidor).
 *
 * As ferramentas do portal são próprias (não reaproveitam as do dono): cada uma chama a função de
 * serviço do portal, que já filtra tudo pelo cliente em escopo. O dono escolhe, por cliente, quais
 * ficam ligadas; as marcadas `adminOnly` só chegam ao **admin** do cliente (espelham as telas do
 * portal: Financeiro e Usuários). As marcadas `optIn` (Jobs agendados) nascem **desligadas**: só
 * valem quando o dono as liga para o cliente (`opexAgent.enabledOptInTools`).
 */

export const OPEX_CLIENT_TOOL_GROUPS = ["context", "tasks", "previews", "files", "dashboard", "environments", "finance", "users", "jobs"] as const
export type OpexClientToolGroup = (typeof OPEX_CLIENT_TOOL_GROUPS)[number]

export const OPEX_CLIENT_TOOL_GROUP_LABELS: Record<OpexClientToolGroup, { label: string; description: string; adminOnly?: boolean; optIn?: boolean }> = {
    context: { label: "Contexto", description: "Visão geral do portal: cliente, usuário, papel e repositórios" },
    tasks: { label: "Tarefas", description: "Listar, ler, comentar e alterar a prioridade das tarefas do cliente" },
    previews: { label: "Orçamentos", description: "Pedidos de nova tarefa: criar, gerar com IA, corrigir, estimar e aprovar" },
    files: { label: "Arquivos do chat", description: "Ler os arquivos enviados no chat e anexá-los a tarefas e prévias" },
    dashboard: { label: "Dashboard", description: "Métricas de tarefas e do período" },
    environments: { label: "Ambientes", description: "Estado dos ambientes dos repositórios do cliente; implantar, levantar e reiniciar (admin)" },
    finance: { label: "Financeiro", description: "Faturamento por repositório, horas e serviços no período", adminOnly: true },
    users: { label: "Usuários", description: "Usuários do cliente: listar, editar e remover vínculos", adminOnly: true },
    jobs: { label: "Jobs agendados", description: "Agendar prompts para o agente executar sozinho mais tarde (agora, daqui a um tempo ou numa data e hora), listar, editar e cancelar os do próprio usuário", optIn: true },
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
    /** Desligada por padrão: só entra quando o dono a liga explicitamente para o cliente. */
    optIn?: boolean
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
    { name: "list_environments", group: "environments", label: "Listar ambientes", hint: "Estado, ref, versão e último deploy dos ambientes do cliente", risk: "read" },
    { name: "deploy_environment", group: "environments", label: "Implantar ambiente", hint: "Implanta a ref salva do ambiente", risk: "destructive", adminOnly: true },
    { name: "start_environment", group: "environments", label: "Levantar ambiente", hint: "Sobe os serviços de um ambiente parado", risk: "write", adminOnly: true },
    { name: "restart_environment", group: "environments", label: "Reiniciar ambiente", hint: "Reinicia os serviços do ambiente", risk: "destructive", adminOnly: true },
    { name: "get_finance", group: "finance", label: "Financeiro", hint: "Faturamento e horas por repositório no período", risk: "read", adminOnly: true },
    { name: "get_service", group: "finance", label: "Ler serviço", hint: "Detalhe de um serviço faturado", risk: "read", adminOnly: true },
    { name: "list_users", group: "users", label: "Listar usuários", hint: "Usuários vinculados ao cliente e papéis", risk: "read", adminOnly: true },
    { name: "update_user", group: "users", label: "Editar usuário", hint: "Nome, email, senha e papel no cliente", risk: "write", adminOnly: true },
    { name: "delete_user", group: "users", label: "Remover usuário", hint: "Remove o vínculo do usuário com o cliente", risk: "destructive", adminOnly: true },
    { name: "list_jobs", group: "jobs", label: "Listar jobs", hint: "Jobs do usuário agendados e dos últimos 30 dias", risk: "read", optIn: true },
    { name: "schedule_job", group: "jobs", label: "Agendar job", hint: "Agenda um prompt para o agente executar sozinho", risk: "write", optIn: true },
    { name: "update_job", group: "jobs", label: "Editar job", hint: "Altera um job ainda agendado do usuário", risk: "write", optIn: true },
    { name: "cancel_job", group: "jobs", label: "Cancelar job", hint: "Cancela um job agendado do usuário", risk: "destructive", optIn: true },
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
 * Ferramenta nova entra ligada (a configuração guarda as **desligadas**), exceto as `optIn`, que só
 * entram quando estão em `enabledOptInTools`.
 */
export function enabledOpexClientToolNames(disabledTools: readonly string[], isAdmin: boolean, enabledOptInTools: readonly string[] = []): string[] {
    const disabled = new Set(disabledTools)
    const optIn = new Set(enabledOptInTools)
    return opexClientToolsFor(isAdmin)
        .filter((tool) => tool.group === "context" || (tool.optIn ? optIn.has(tool.name) : !disabled.has(tool.name)))
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

/** Ferramentas desligadas por padrão (o dono liga explicitamente por cliente). */
export const OPEX_CLIENT_OPT_IN_TOOLS: readonly string[] = OPEX_CLIENT_TOOLS.filter((tool) => tool.optIn).map((tool) => tool.name)

/**
 * Árvore da seleção do portal (mesmo componente da seleção do dono): um módulo por grupo, uma folha
 * por ferramenta; destrutivas aparecem como sensíveis. O Contexto entra travado.
 */
export function buildOpexClientToolTree(): CheckBranch[] {
    return OPEX_CLIENT_TOOL_GROUPS.map((group) => ({
        id: group,
        label: OPEX_CLIENT_TOOL_GROUP_LABELS[group].label,
        description: OPEX_CLIENT_TOOL_GROUP_LABELS[group].description,
        children: OPEX_CLIENT_TOOLS.filter((tool) => tool.group === group).map((tool) => ({ key: tool.name, label: tool.label, description: tool.hint, ...(tool.risk === "destructive" ? { sensitive: true } : {}) })),
    })).filter((branch) => branch.children.length > 0)
}
