import { z } from "zod"
import { PLUGIN_SCOPES } from "@/features/plugins/constants"
import { diffAsText } from "@/features/plugins/logic"
import { diffPluginVersions, getPlugin, getPluginVersion, listPlugins, OWNER_ACCESS, rollbackPlugin, setPluginActive, setPluginArchived } from "@/features/plugins/server/service"
import { defineTool } from "./define"

/**
 * Plugins (OPE-172): listar, ler fontes, comparar versões, inspecionar o runtime do kernel,
 * ativar/desativar e rollback. Criar ou alterar um plugin é pela mesa: uma tarefa do tipo Plugin
 * (`create_task` com `taskType: "plugin"`).
 */

const versionId = z.string().regex(/^[a-f0-9]{24}$/, "Versão inválida")

export const pluginTools = [
    defineTool({
        name: "list_plugins",
        group: "plugins",
        label: "Listar plugins",
        risk: "read",
        description: "Plugins do dono e dos clientes: escopo, versão estável e em prévia, ativo e erro de runtime. Para criar ou alterar um plugin, crie uma tarefa do tipo plugin.",
        input: z.object({ scope: z.enum(PLUGIN_SCOPES).optional(), clientId: z.string().optional() }),
        execute: async (input) => listPlugins(OWNER_ACCESS, input),
    }),
    defineTool({
        name: "get_plugin",
        group: "plugins",
        label: "Ler plugin",
        risk: "read",
        description: "Um plugin com todas as versões (número, estado draft/preview/stable/archived, origem na mesa, testes).",
        input: z.object({ pluginId: z.string().min(1) }),
        execute: async ({ pluginId }) => getPlugin(pluginId),
    }),
    defineTool({
        name: "read_plugin_source",
        group: "plugins",
        label: "Ler fontes do plugin",
        risk: "read",
        description: "Manifesto, arquivos-fonte e log de compilação de uma versão do plugin (sem versionId: a estável).",
        input: z.object({ pluginId: z.string().min(1), versionId: versionId.optional(), path: z.string().optional() }),
        execute: async ({ pluginId, versionId: id, path }) => {
            const target = id ?? (await getPlugin(pluginId)).stable?.id
            if (!target) return { error: "O plugin ainda não tem versão estável; informe versionId" }
            const version = await getPluginVersion(pluginId, target)
            return path ? { ...version, files: version.files.filter((file) => file.path === path) } : version
        },
    }),
    defineTool({
        name: "diff_plugin_versions",
        group: "plugins",
        label: "Comparar versões do plugin",
        risk: "read",
        description: "Diferença (diff unificado por arquivo) entre duas versões do plugin; sem fromVersionId compara com a base da versão.",
        input: z.object({ pluginId: z.string().min(1), toVersionId: versionId, fromVersionId: versionId.optional() }),
        execute: async ({ pluginId, toVersionId, fromVersionId }) => {
            const diff = await diffPluginVersions(pluginId, toVersionId, fromVersionId ?? null)
            return { from: diff.from, to: diff.to, files: diff.files.map((file) => ({ path: file.path, status: file.status, additions: file.additions, deletions: file.deletions })), diff: diffAsText(diff.files).slice(0, 60_000) }
        },
    }),
    defineTool({
        name: "inspect_plugin_runtime",
        group: "plugins",
        label: "Inspecionar runtime de plugins",
        risk: "read",
        description: "Fotografia do kernel de plugins: modo da instância, versão do SDK, serviços disponíveis, fibers ativas (stable/preview) com seus efeitos, e as ferramentas, rotas e crons registrados.",
        input: z.object({}),
        execute: async () => (await import("@/features/plugins/server/kernel/kernel")).inspectPluginRuntime(),
    }),
    defineTool({
        name: "set_plugin_active",
        group: "plugins",
        label: "Ativar/desativar plugin",
        risk: "destructive",
        description: "Ativa ou desativa um plugin. Desativar desfaz na hora as rotas, ferramentas e crons do plugin e o tira das telas.",
        input: z.object({ pluginId: z.string().min(1), active: z.boolean() }),
        summarize: ({ pluginId, active }) => `${active ? "Ativar" : "Desativar"} o plugin ${pluginId}`,
        execute: async ({ pluginId, active }, context) => {
            await setPluginActive(pluginId, active, context.actorId)
            return { ok: true, pluginId, active }
        },
    }),
    defineTool({
        name: "archive_plugin",
        group: "plugins",
        label: "Arquivar/desarquivar plugin",
        risk: "destructive",
        description: "Arquiva ou desarquiva um plugin. Arquivar desliga o plugin (sai das telas e do servidor) e é recusado se houver uma prévia de mesa em andamento; desarquivar volta desligado. Nada é apagado.",
        input: z.object({ pluginId: z.string().min(1), archived: z.boolean() }),
        summarize: ({ pluginId, archived }) => `${archived ? "Arquivar" : "Desarquivar"} o plugin ${pluginId}`,
        execute: async ({ pluginId, archived }, context) => {
            await setPluginArchived(pluginId, archived, context.actorId)
            return { ok: true, pluginId, archived }
        },
    }),
    defineTool({
        name: "rollback_plugin",
        group: "plugins",
        label: "Rollback do plugin",
        risk: "destructive",
        description: "Volta a versão estável do plugin para uma versão consolidada antes; as telas abertas trocam ao vivo. Se a ativação falhar, a estável atual continua.",
        input: z.object({ pluginId: z.string().min(1), versionId }),
        summarize: ({ pluginId }) => `Fazer rollback do plugin ${pluginId}`,
        execute: async ({ pluginId, versionId: id }, context) => ({ ok: true, ...(await rollbackPlugin(pluginId, id, context.actorId)) }),
    }),
]
