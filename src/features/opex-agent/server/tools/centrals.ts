import { z } from "zod"
import { agenticSettingsSchema, centralConfigSchema, createCentralSchema } from "@/features/agentic/schemas"
import { createCentral, deleteCentral, getCentral, listCentrals, updateCentral } from "@/features/agentic/server/centrals"
import { listCentralQueue } from "@/features/agentic/server/queue"
import { getAgenticSettings, saveAgenticSettings } from "@/features/agentic/server/settings"
import { testCentral } from "@/features/agentic/server/tester"
import type { CentralDto } from "@/features/agentic/types"
import { defineTool } from "./define"
import { deepMerge, parseJsonObject } from "./json"

function slimCentral(central: CentralDto) {
    return {
        id: central.id,
        projectId: central.projectId,
        projectName: central.projectName,
        sigla: central.sigla,
        repo: central.repo,
        enabled: central.config.enabled,
        activeWorkbenches: central.activeWorkbenches,
        runningWorkbenches: central.runningWorkbenches,
        lastTest: central.lastTest,
    }
}

export const centralTools = [
    defineTool({
        name: "list_centrals",
        group: "centrals",
        label: "Listar centrais",
        risk: "read",
        description: "Centrais de desenvolvimento agêntico (uma por projeto/repositório) com repositório, estado e mesas ativas.",
        input: z.object({}),
        execute: async () => (await listCentrals()).map(slimCentral),
    }),
    defineTool({
        name: "get_central",
        group: "centrals",
        label: "Ler central",
        risk: "read",
        description: "Configuração completa de uma central (agentes, git, ambiente, colunas do quadro, limpeza, instruções) e a fila de tarefas.",
        input: z.object({ centralId: z.string() }),
        execute: async ({ centralId }) => {
            const [central, queue] = await Promise.all([getCentral(centralId), listCentralQueue(centralId)])
            return { ...slimCentral(central), config: central.config, queue }
        },
    }),
    defineTool({
        name: "create_central",
        group: "centrals",
        label: "Criar central",
        risk: "write",
        description: "Cria a central de um projeto (repositório vinculado em Integrações › GitHub). O resto da configuração nasce com os padrões.",
        input: z.object({ projectId: z.string().describe("Id do projeto (de get_task_options)"), projectName: z.string(), sessionDirectory: z.string().describe("Caminho absoluto do diretório das sessões do OpenCode") }),
        summarize: (input) => `Criar a central do projeto ${input.projectName}`,
        execute: async (input, context) => slimCentral(await createCentral(createCentralSchema.parse(input), context.actorId)),
    }),
    defineTool({
        name: "update_central",
        group: "centrals",
        label: "Configurar central",
        risk: "write",
        description:
            "Altera a configuração de uma central. `patchJson` é um objeto JSON parcial mesclado sobre a configuração atual (veja get_central), ex.: {\"maxConcurrent\": 2, \"git\": {\"baseBranch\": \"dev\"}}.",
        input: z.object({ centralId: z.string(), patchJson: z.string() }),
        summarize: () => "Alterar a configuração da central",
        execute: async ({ centralId, patchJson }, context) => {
            const current = await getCentral(centralId)
            const next = centralConfigSchema.parse(deepMerge(current.config, parseJsonObject(patchJson, "patchJson")))
            const saved = await updateCentral(centralId, next, context.actorId)
            return { ...slimCentral(saved), config: saved.config }
        },
    }),
    defineTool({
        name: "test_central",
        group: "centrals",
        label: "Testar central",
        risk: "read",
        description: "Testa a central (OpenCode, repositório, diretórios e ambiente).",
        input: z.object({ centralId: z.string() }),
        execute: async ({ centralId }) => testCentral(centralId),
    }),
    defineTool({
        name: "delete_central",
        group: "centrals",
        label: "Excluir central",
        risk: "destructive",
        description: "Exclui a central (recusado enquanto houver mesas rodando).",
        input: z.object({ centralId: z.string() }),
        summarize: () => "Excluir a central de desenvolvimento",
        execute: async ({ centralId }, context) => {
            await deleteCentral(centralId, context.actorId)
            return { ok: true }
        },
    }),
    defineTool({
        name: "get_agentic_settings",
        group: "centrals",
        label: "Desenvolvimento agêntico",
        risk: "read",
        description: "Configuração geral do desenvolvimento agêntico: ativo, agente/modelo/variante de cada papel (planning, implementation, build, pr, fork) e os padrões herdados pelas centrais (columns: fila e movimentação; ci: correção do CI; liveChat; ports: faixa de portas das prévias previewPortMin/previewPortMax).",
        input: z.object({}),
        execute: async () => getAgenticSettings(),
    }),
    defineTool({
        name: "update_agentic_settings",
        group: "centrals",
        label: "Configurar agêntico",
        risk: "write",
        description: "Altera a configuração geral do desenvolvimento agêntico. `patchJson` é mesclado sobre a atual (veja get_agentic_settings).",
        input: z.object({ patchJson: z.string() }),
        summarize: () => "Alterar a configuração do desenvolvimento agêntico",
        execute: async ({ patchJson }, context) => {
            const current = await getAgenticSettings()
            return saveAgenticSettings(agenticSettingsSchema.parse(deepMerge(current.settings, parseJsonObject(patchJson, "patchJson"))), context.actorId)
        },
    }),
]
