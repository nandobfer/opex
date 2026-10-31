import { z } from "zod"
import { OPENCODE_RESOURCE_KINDS, type OpencodeResourceKind } from "@/features/opencode-resources/constants"
import { creatableKindSchema, installableKindSchema, mcpConfigSchema, mcpSecretsSchema, resourceInstallSchema, resourceNameSchema, scopeIdSchema, type ResourceContentInput } from "@/features/opencode-resources/schemas"
import type { OpencodeResourceDto } from "@/features/opencode-resources/types"
import { OPENCODE_LOG_LINES_DEFAULT, OPENCODE_LOG_LINES_MAX } from "@/features/opencode-service/constants"
import { serviceActionBodySchema } from "@/features/opencode-service/schemas"
import { defineTool, OpexToolError, type OpexToolContext } from "./define"
import { parseJsonObject } from "./json"

/**
 * Ferramentas do Agente Opex para o OpenCode: o serviço (status, logs, iniciar/parar/reiniciar/
 * atualizar, backups) e os recursos (skills, agentes, comandos, plugins e MCPs). Chamam as MESMAS
 * funções de serviço da aba de Integrações › IA › OpenCode (nunca HTTP): backup antes, lock,
 * auditoria (origem "opex-agent") e tempo real. Valores de segredos dos MCPs nunca voltam ao modelo.
 */

const resources = () => import("@/features/opencode-resources/server/service")
const backups = () => import("@/features/opencode-resources/server/backups")
const service = () => import("@/features/opencode-service/server/service")

const agentActor = (context: OpexToolContext) => ({ id: context.actorId, origin: "opex-agent" as const })

const kind = z.enum(OPENCODE_RESOURCE_KINDS).describe("skill, agent (agente), command (comando), plugin ou mcp")
const resourceId = z.string().trim().min(1).max(500).describe("Id do item (de list_opencode_resources)")
// O exemplo entra no JSON Schema (MCP do Agente Maddox e a documentação da API interna).
const scope = scopeIdSchema.describe("'global' (usuário) ou o id de um projeto (list_opencode_scopes)").meta({ examples: ["global"] })

const SECRET_REDACTED = "[segredo omitido]"
type SecretList = { key: string; value?: string | null }[] | undefined
const redactSecretList = (list: SecretList) => list?.map((item) => ({ key: item.key, value: item.value === null ? null : item.value === undefined ? undefined : SECRET_REDACTED }))

/** Itens da listagem sem o caminho no host e com a versão resumida (saída enxuta para o modelo). */
const listView = (items: readonly OpencodeResourceDto[]) =>
    items.map((item) => ({
        id: item.id,
        nome: item.name,
        descricao: item.description?.slice(0, 200) ?? null,
        escopo: item.scopeLabel,
        origem: item.origin,
        fonte: item.source,
        ligado: item.enabled,
        nativo: item.builtin,
        editavel: item.editable,
        versao: item.version,
        status: item.status,
        tags: item.tags,
    }))

function contentOf(input: { frontmatterJson?: string; body?: string; configJson?: string; mcpJson?: string }): ResourceContentInput {
    const content: ResourceContentInput = {}
    if (input.frontmatterJson) content.frontmatter = parseJsonObject(input.frontmatterJson, "frontmatterJson")
    if (input.body !== undefined) content.body = input.body
    if (input.configJson) content.config = parseJsonObject(input.configJson, "configJson")
    if (input.mcpJson) {
        const parsed = mcpConfigSchema.safeParse(parseJsonObject(input.mcpJson, "mcpJson"))
        if (!parsed.success) throw new OpexToolError(`mcpJson inválido: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`).join("; ")}`)
        content.mcp = parsed.data
    }
    return content
}

const contentFields = {
    frontmatterJson: z.string().max(20_000).optional().describe('Skill/agente/comando em arquivo: frontmatter como objeto JSON, ex.: {"description": "…", "mode": "subagent"}'),
    body: z.string().max(200_000).optional().describe("Skill: instruções do SKILL.md; agente: prompt de sistema; comando: template (Markdown)"),
    configJson: z.string().max(200_000).optional().describe("Agente/comando definido no JSON da configuração: o objeto inteiro"),
    mcpJson: z
        .string()
        .max(20_000)
        .optional()
        .describe('MCP sem segredos: {"type":"local","command":["npx","-y","pacote"],"cwd?":"…","disabled?":false} ou {"type":"remote","url":"https://…"}'),
}

const serviceTool = <I>(def: Omit<Parameters<typeof defineTool<I>>[0], "group">) => defineTool<I>({ ...def, group: "opencode-service" })
const resourceTool = <I>(def: Omit<Parameters<typeof defineTool<I>>[0], "group">) => defineTool<I>({ ...def, group: "opencode-resources" })

export const opencodeServiceTools = [
    serviceTool({
        name: "get_opencode_service_status",
        label: "Status do OpenCode",
        risk: "read",
        description:
            "Status do serviço do OpenCode no host: em execução/parado, versão, porta, tempo no ar, acesso SSH, versão disponível (última 2.x e major nova), operação em andamento e o impacto (mesas e refinamentos rodando agora). Consulte ANTES de parar, reiniciar ou atualizar e informe o impacto ao usuário.",
        input: z.object({}),
        execute: async () => (await service()).getServiceStatus(),
    }),
    serviceTool({
        name: "get_opencode_service_logs",
        label: "Logs do OpenCode",
        risk: "read",
        description: "Últimas linhas do log do OpenCode (sem cores; linhas que parecem segredo são omitidas).",
        input: z.object({ lines: z.number().int().min(1).max(OPENCODE_LOG_LINES_MAX).optional().describe(`Padrão ${OPENCODE_LOG_LINES_DEFAULT}`) }),
        execute: async (input) => (await service()).getServiceLogs(input.lines ?? OPENCODE_LOG_LINES_DEFAULT),
    }),
    serviceTool({
        name: "start_opencode_service",
        label: "Iniciar OpenCode",
        risk: "write",
        description: "Inicia o serviço do OpenCode no host (por SSH) e espera a API responder.",
        input: z.object({}),
        summarize: () => "Iniciar o serviço do OpenCode",
        execute: async (_input, context) => (await service()).runServiceAction("start", {}, { ...agentActor(context), opexSessionId: context.sessionId }),
    }),
    serviceTool({
        name: "stop_opencode_service",
        label: "Parar OpenCode",
        risk: "destructive",
        description: "Para o serviço do OpenCode no host (por SSH). Interrompe as mesas, refinamentos e gerações em andamento; só volta com start_opencode_service.",
        input: z.object({}),
        summarize: () => "Parar o serviço do OpenCode (interrompe mesas e refinamentos em andamento)",
        execute: async (_input, context) => (await service()).runServiceAction("stop", {}, { ...agentActor(context), opexSessionId: context.sessionId }),
    }),
    serviceTool({
        name: "restart_opencode_service",
        label: "Reiniciar OpenCode",
        risk: "destructive",
        description: "Reinicia o serviço do OpenCode (por SSH) e espera a API voltar. Necessário para aplicar plugins instalados/atualizados. Interrompe execuções em andamento.",
        input: z.object({}),
        summarize: () => "Reiniciar o serviço do OpenCode (interrompe mesas e refinamentos em andamento)",
        execute: async (_input, context) => (await service()).runServiceAction("restart", {}, { ...agentActor(context), opexSessionId: context.sessionId }),
    }),
    serviceTool({
        name: "upgrade_opencode",
        label: "Atualizar OpenCode",
        risk: "destructive",
        description:
            "Atualiza o OpenCode no host (por SSH) e reinicia. Sem version: a última 2.x. Major nova (3.x+) só com allowMajor: true depois de avisar o usuário do risco de incompatibilidade com o Opex. Roda em segundo plano: o resultado chega sozinho nesta conversa.",
        input: serviceActionBodySchema,
        summarize: (input) => `Atualizar o OpenCode${input.version ? ` para a ${input.version}` : " para a última 2.x"}${input.allowMajor ? " (major nova permitida)" : ""}`,
        execute: async (input, context) => {
            const op = await (await service()).runServiceAction("upgrade", input, { ...agentActor(context), opexSessionId: context.sessionId })
            return { ...op, nota: "Atualização em andamento: o resultado chega automaticamente nesta conversa." }
        },
    }),
    serviceTool({
        name: "get_opencode_service_operation",
        label: "Operação do OpenCode",
        risk: "read",
        description: "Uma operação do serviço (por id) ou a última: ação, situação, versões e erro.",
        input: z.object({ id: z.string().trim().max(40).optional() }),
        execute: async (input) => {
            const mod = await service()
            return input.id ? mod.getOperation(input.id) : mod.getLatestOperation()
        },
    }),
    serviceTool({
        name: "list_opencode_backups",
        label: "Backups do OpenCode",
        risk: "read",
        description: "Backups automáticos da configuração do OpenCode (feitos antes de cada alteração), do mais novo ao mais antigo.",
        input: z.object({}),
        execute: async () => (await backups()).listBackups(),
    }),
    serviceTool({
        name: "restore_opencode_backup",
        label: "Restaurar backup do OpenCode",
        risk: "destructive",
        description: "Restaura um backup da configuração do OpenCode (antes, faz um backup do estado atual).",
        input: z.object({ backupId: z.string().trim().min(1).max(80) }),
        summarize: (input) => `Restaurar o backup ${input.backupId} da configuração do OpenCode`,
        execute: async (input, context) => (await backups()).restoreBackup(input.backupId, agentActor(context)),
    }),
]

export const opencodeResourceTools = [
    resourceTool({
        name: "list_opencode_scopes",
        label: "Escopos do OpenCode",
        risk: "read",
        description: "Escopos dos recursos do OpenCode: 'global' (usuário) e um por projeto (diretório das centrais).",
        input: z.object({}),
        execute: async () => (await resources()).listOpencodeScopes(),
    }),
    resourceTool({
        name: "list_opencode_resources",
        label: "Listar recursos do OpenCode",
        risk: "read",
        description: "Lista skills, agentes, comandos, plugins ou MCPs de um escopo (sem conteúdo): id, ligado, nativo, versão instalada x disponível e situação (MCP).",
        input: z.object({
            kind,
            scope: scope.optional().describe("Padrão 'global'"),
            query: z.string().trim().max(100).optional().describe("Filtra pelo nome"),
            status: z.enum(["all", "enabled", "disabled", "outdated"]).optional().describe("Padrão all"),
        }),
        execute: async (input) => {
            const items = await (await resources()).listResources(input.kind, input.scope ?? "global")
            const term = input.query?.toLowerCase()
            const filtered = items.filter((item) => {
                if (term && !item.name.toLowerCase().includes(term)) return false
                if (input.status === "enabled") return item.enabled
                if (input.status === "disabled") return !item.enabled
                if (input.status === "outdated") return item.version?.outdated === true
                return true
            })
            return listView(filtered)
        },
    }),
    resourceTool({
        name: "get_opencode_resource",
        label: "Ler recurso do OpenCode",
        risk: "read",
        description: "Conteúdo de um item: frontmatter + corpo (Markdown), o JSON da configuração ou a configuração do MCP (variáveis e cabeçalhos só pelo NOME, nunca o valor).",
        input: z.object({ id: resourceId }),
        execute: async (input) => {
            const detail = await (await resources()).getResource(input.id)
            const { path: _path, ...rest } = detail
            void _path
            return rest
        },
    }),
    resourceTool({
        name: "create_opencode_resource",
        label: "Criar recurso do OpenCode",
        risk: "write",
        description:
            "Cria uma skill (frontmatterJson com description + body), agente (frontmatterJson + body = prompt), comando (frontmatterJson + body = template) ou MCP (mcpJson; segredos depois com set_opencode_mcp_secrets). Valida antes de salvar e faz backup.",
        input: z.object({ kind: creatableKindSchema, scope, name: resourceNameSchema, ...contentFields }),
        summarize: (input) => `Criar ${input.kind} "${input.name}" (${input.scope})`,
        execute: async (input, context) => {
            const { kind: k, scope: s, name } = input
            return (await resources()).createResource({ kind: k, scope: s, name, ...contentOf(input) }, agentActor(context))
        },
    }),
    resourceTool({
        name: "update_opencode_resource",
        label: "Editar recurso do OpenCode",
        risk: "write",
        description: "Edita um item (o que não for enviado fica como está). MCP: mcpJson completo; os segredos atuais são mantidos. Faz backup antes.",
        input: z.object({ id: resourceId, ...contentFields }),
        summarize: () => "Editar um recurso do OpenCode",
        execute: async (input, context) => {
            const mod = await resources()
            const current = await mod.getResource(input.id)
            const content = contentOf(input)
            if (current.format === "markdown") {
                content.frontmatter ??= current.frontmatter ?? {}
                content.body ??= current.body ?? ""
            }
            if (current.format === "json") content.config ??= current.config ?? {}
            if (current.format === "mcp" && !content.mcp && current.mcp) {
                const detail = current.mcp
                content.mcp = detail.type === "remote" ? { type: "remote", url: detail.url ?? "", disabled: detail.disabled } : { type: "local", command: detail.command ?? [], cwd: detail.cwd ?? undefined, disabled: detail.disabled }
            }
            if (current.format === "mcp" && current.mcp) {
                // Mantém todos os segredos atuais (lista completa sem valores = manter).
                content.secrets = { environment: current.mcp.environmentKeys.map((key) => ({ key })), headers: current.mcp.headerKeys.map((key) => ({ key })) }
            }
            return mod.updateResource(input.id, content, agentActor(context))
        },
    }),
    resourceTool({
        name: "set_opencode_mcp_secrets",
        label: "Gravar segredos de MCP",
        risk: "destructive",
        description: "Grava ou remove (value: null) variáveis de ambiente (MCP local) ou cabeçalhos (MCP remoto) de um MCP. Os valores nunca são lidos de volta.",
        input: z.object({ id: resourceId, ...mcpSecretsSchema.shape }),
        summarize: (input) => `Alterar segredos do MCP (${[...(input.environment ?? []), ...(input.headers ?? [])].map((item) => item.key).join(", ")})`,
        redact: (input) => ({ ...input, environment: redactSecretList(input.environment), headers: redactSecretList(input.headers) }),
        execute: async (input, context) => (await resources()).setMcpSecretsById(input.id, { environment: input.environment, headers: input.headers }, agentActor(context)),
    }),
    resourceTool({
        name: "set_opencode_resource_enabled",
        label: "Ligar/desligar recurso do OpenCode",
        risk: "write",
        confirmByDefault: true,
        description: "Liga ou desliga um item sem removê-lo (plugins só mudam depois de reiniciar o serviço).",
        input: z.object({ id: resourceId, enabled: z.boolean() }),
        summarize: (input) => `${input.enabled ? "Ligar" : "Desligar"} um recurso do OpenCode`,
        execute: async (input, context) => (await resources()).setResourceEnabled(input.id, input.enabled, agentActor(context)),
    }),
    resourceTool({
        name: "delete_opencode_resource",
        label: "Excluir recurso do OpenCode",
        risk: "destructive",
        description: "Exclui uma skill/agente/comando, desinstala um plugin ou remove um MCP (backup antes).",
        input: z.object({ id: resourceId }),
        summarize: () => "Excluir/desinstalar um recurso do OpenCode",
        execute: async (input, context) => (await resources()).deleteResource(input.id, agentActor(context)),
    }),
    resourceTool({
        name: "install_opencode_resource",
        label: "Instalar recurso do OpenCode",
        risk: "write",
        confirmByDefault: true,
        description:
            "Instala skills de um repositório (source 'dono/repo' ou URL; skills = nomes, vazio = todas), um plugin (pacote npm ou 'github:dono/repo') ou um MCP de pacote npm/'github:dono/repo' (name opcional). Executa código de terceiros no host. Plugins exigem reiniciar o serviço.",
        // Mesmo schema da rota (sem os segredos, que vão por set_opencode_mcp_secrets).
        input: resourceInstallSchema.omit({ secrets: true }).extend({ kind: installableKindSchema, scope }),
        summarize: (input) => `Instalar ${input.kind} de ${input.source} (${input.scope})`,
        execute: async (input, context) => (await resources()).installResource(input, agentActor(context)),
    }),
    resourceTool({
        name: "check_opencode_updates",
        label: "Conferir atualizações do OpenCode",
        risk: "read",
        description: "Versão instalada x disponível dos itens com versão (skills de repositório, plugins e MCPs de pacote), consultando sem cache.",
        input: z.object({ kind: z.enum(["skill", "plugin", "mcp"]), scope: scope.optional() }),
        execute: async (input) => listView(await (await resources()).checkResourceUpdates(input.kind as OpencodeResourceKind, input.scope ?? "global")),
    }),
    resourceTool({
        name: "update_opencode_resources",
        label: "Atualizar recursos do OpenCode",
        risk: "write",
        confirmByDefault: true,
        description: "Atualiza itens para a versão disponível: ids (individual) ou all: true (todos os desatualizados do tipo e escopo). Plugins exigem reiniciar o serviço.",
        input: z.object({ kind: z.enum(["skill", "plugin", "mcp"]), scope: scope.optional(), ids: z.array(resourceId).max(200).optional(), all: z.boolean().optional() }),
        summarize: (input) => `Atualizar ${input.all ? "todos os" : `${input.ids?.length ?? 0}`} ${input.kind}(s) desatualizados`,
        execute: async (input, context) => {
            if (!input.all && !input.ids?.length) throw new OpexToolError("Informe ids ou all: true")
            return (await resources()).updateResources(input.kind, input.scope ?? "global", { ids: input.ids, all: input.all }, agentActor(context))
        },
    }),
    resourceTool({
        name: "test_opencode_mcp",
        label: "Testar MCP",
        risk: "write",
        description: "Reconecta um MCP e devolve a situação e a lista de ferramentas expostas (pode levar até 2 min na primeira vez).",
        input: z.object({ id: resourceId }),
        summarize: () => "Testar a conexão de um MCP",
        execute: async (input) => (await resources()).testMcpById(input.id),
    }),
]
