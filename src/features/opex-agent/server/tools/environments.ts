import { z } from "zod"
import { contextSessionId, defineTool } from "./define"
import {
    adoptInputSchema,
    environmentInputSchema,
    environmentsSettingsSchema,
    envVarInputSchema,
    MACHINE_LABELS,
    MACHINES,
    projectNameSchema,
    refSchema,
    relativeFileSchema,
    serviceSchema,
    slugSchema,
    type EnvironmentInput,
} from "@/features/environments/schemas"
import type { IEnvironment } from "@/features/environments/server/models"
import { moveWarning, slugify } from "@/features/environments/view"
import { deployView, environmentDetailView, environmentsListView, mergeEnvironmentPatch, mergeSettingsPatch, redactEnvValues, stripAnsi, tailLines } from "@/features/environments/opex-format"

/**
 * Ferramentas do Agente Opex do dono para o módulo Ambientes (montadas no registro do agente). Chamam os mesmos
 * serviços das rotas de `/api/environments` — validação, auditoria `Ambiente`, Pusher e erros iguais
 * aos da tela. Os módulos do servidor entram sob demanda (o registro não carrega deploy, banco e shell).
 */

const service = () => import("@/features/environments/server/service")
const deploys = () => import("@/features/environments/server/deploy")
const settingsModule = () => import("@/features/environments/server/settings")

async function resolve(ref: string): Promise<IEnvironment> {
    return (await service()).resolveEnvironmentRef(ref)
}

const environment = z.string().trim().min(1).max(100).describe("Id ou slug do ambiente (de list_environments)")
const machine = z.enum(MACHINES).describe("server = Servidor; pc = PC (pelo Builder Machine)")
const envVars = z.array(envVarInputSchema).max(100).describe("Variáveis extras (gravadas cifradas; o valor nunca é lido de volta)")
const LOG_LINES_DEFAULT = 200
const DEPLOY_LOG_LINES_DEFAULT = 80

/** Valores do formulário a partir do ambiente salvo (variáveis com valor vazio = mantém o salvo). */
function inputOf(env: IEnvironment): EnvironmentInput {
    return { name: env.name, slug: env.slug, source: env.source, env: env.env.map((item) => ({ key: item.key, value: "" })), ports: env.ports, healthUrl: env.healthUrl ?? "", buildOn: env.buildOn, runOn: env.runOn }
}

const tool = <I>(def: Omit<Parameters<typeof defineTool<I>>[0], "group">) => defineTool<I>({ ...def, group: "environments" })

const createInput = z.object({
    name: z.string().trim().min(2).max(80),
    slug: slugSchema.optional().describe("Omitido: sugerido pelo nome"),
    centralId: z.string().trim().min(1).describe("Id da central de desenvolvimento (list_centrals)"),
    ref: refSchema.optional().describe("Branch, tag ou commit (padrão main)"),
    composeFile: relativeFileSchema.optional().describe("Arquivo do compose relativo ao repositório (padrão docker-compose.yml)"),
    services: z.array(serviceSchema).max(30).optional().describe("Serviços a subir (vazio = todos)"),
    projectName: projectNameSchema.optional().describe("Nome do projeto do compose (padrão: o slug)"),
    env: envVars.optional(),
    ports: z.array(z.number().int().min(1024).max(65535)).max(20).optional(),
    healthUrl: z.string().trim().max(300).optional().describe("URL de saúde esperada no fim do deploy"),
    buildOn: machine.optional().describe("Onde fazer o build (padrão server)"),
    runOn: machine.optional().describe("Onde executar (padrão server)"),
})

const updateInput = z.object({
    environment,
    name: z.string().trim().min(2).max(80).optional(),
    slug: slugSchema.optional(),
    centralId: z.string().trim().min(1).optional().describe("Só origem central"),
    ref: refSchema.optional().describe("Só origem central: ref salva (\"Última de <ref>\")"),
    composeFile: relativeFileSchema.optional().describe("Só origem central"),
    services: z.array(serviceSchema).max(30).optional().describe("Só origem central"),
    projectName: projectNameSchema.optional(),
    pullOnRedeploy: z.boolean().optional().describe("Só adotado com git: git pull no redeploy"),
    env: z
        .array(z.object({ key: envVarInputSchema.shape.key, value: z.string().max(10_000).optional() }))
        .max(100)
        .optional()
        .describe("Lista COMPLETA das variáveis (as ausentes são removidas); valor vazio ou omitido mantém o salvo"),
    ports: z.array(z.number().int().min(1024).max(65535)).max(20).optional(),
    healthUrl: z.string().trim().max(300).optional().describe("Vazio remove"),
    buildOn: machine.optional(),
    runOn: machine.optional(),
})
type UpdateInput = z.infer<typeof updateInput>

function sourcePatch(current: EnvironmentInput["source"], input: UpdateInput): EnvironmentInput["source"] {
    if (current.kind === "central") {
        return { ...current, centralId: input.centralId ?? current.centralId, ref: input.ref ?? current.ref, composeFile: input.composeFile ?? current.composeFile, services: input.services ?? current.services, projectName: input.projectName ?? current.projectName }
    }
    if (input.centralId || input.ref || input.composeFile || input.services) throw new Error("Ambiente adotado: central, ref, arquivo do compose e serviços não se aplicam (a pasta é a do projeto adotado)")
    return { ...current, projectName: input.projectName ?? current.projectName, pullOnRedeploy: input.pullOnRedeploy ?? current.pullOnRedeploy }
}

const envKeys = (input: { env?: { key: string }[] }) => (input.env?.length ? ` (variáveis: ${input.env.map((item) => item.key).join(", ")})` : "")

export const environmentTools = [
    tool({
        name: "list_environments",
        label: "Listar ambientes",
        risk: "read",
        description:
            "Ambientes Docker Compose (página /ambientes) agrupados em Servidor e PC: estado (No ar, Parcial, Parado, Nunca implantado, Implantando), portas, serviços no ar, versão, onde foi o build e o último deploy (resultado, ref @ commit). Informa também se o PC está alcançável e quantos projetos não gerenciados existem. Consulta os dois Dockers: chame uma vez e reaproveite.",
        input: z.object({}),
        execute: async () => {
            return environmentsListView(await (await service()).listEnvironments())
        },
    }),
    tool({
        name: "get_environment",
        label: "Ver ambiente",
        risk: "read",
        description: "Detalhe de um ambiente: origem (central/ref/compose/serviços ou pasta adotada), máquinas de build e execução, onde está no ar, nomes das variáveis (nunca os valores), URL de saúde, serviços com CPU/RAM/versão e o último deploy.",
        input: z.object({ environment }),
        execute: async (input) => {
            const env = await resolve(input.environment)
            return environmentDetailView(await (await service()).getEnvironment(String(env._id)))
        },
    }),
    tool({
        name: "create_environment",
        label: "Criar ambiente",
        risk: "write",
        description:
            "Cria um ambiente com origem numa central de desenvolvimento (para projetos já em execução use adopt_project). Não implanta: depois use deploy_environment. Build e execução em máquinas diferentes usam o registry local.",
        input: createInput,
        summarize: (input) => `Criar o ambiente ${input.name}${envKeys(input)}`,
        redact: (input) => redactEnvValues(input),
        execute: async (input, context) => {
            const slug = input.slug ?? slugify(input.name)
            const parsed = environmentInputSchema.parse({
                name: input.name,
                slug,
                source: { kind: "central", centralId: input.centralId, ref: input.ref ?? "main", composeFile: input.composeFile ?? "docker-compose.yml", services: input.services ?? [], projectName: input.projectName ?? slug },
                env: input.env ?? [],
                ports: input.ports ?? [],
                healthUrl: input.healthUrl ?? "",
                buildOn: input.buildOn ?? "server",
                runOn: input.runOn ?? "server",
            })
            const env = await (await service()).createEnvironment(parsed, context.actorId)
            return { id: String(env._id), slug: env.slug, nome: env.name, criado: true, proximoPasso: "Implante com deploy_environment quando o usuário pedir." }
        },
    }),
    tool({
        name: "update_environment",
        label: "Editar ambiente",
        risk: "write",
        confirmByDefault: true,
        description:
            "Edita um ambiente: só os campos enviados mudam. `env` é a lista completa das variáveis (as ausentes saem; valor vazio mantém o salvo). Trocar slug ou projeto exige o ambiente derrubado. A nova configuração vale no próximo deploy.",
        input: updateInput,
        summarize: (input) => {
            const fields = Object.keys(input).filter((key) => key !== "environment" && key !== "env")
            return `Editar o ambiente ${input.environment}${fields.length ? ` (${fields.join(", ")})` : ""}${envKeys(input)}`
        },
        redact: (input) => redactEnvValues(input),
        execute: async (input, context) => {
            const saved = await resolve(input.environment)
            const current = inputOf(saved)
            const next = environmentInputSchema.parse(
                mergeEnvironmentPatch(current, { name: input.name, slug: input.slug, source: sourcePatch(current.source, input), env: input.env, ports: input.ports, healthUrl: input.healthUrl, buildOn: input.buildOn, runOn: input.runOn }),
            )
            const env = await (await service()).updateEnvironment(String(saved._id), next, context.actorId)
            return { id: String(env._id), slug: env.slug, atualizado: true, variaveis: env.env.map((item) => item.key) }
        },
    }),
    tool({
        name: "delete_environment",
        label: "Apagar ambiente",
        risk: "destructive",
        description: "Apaga o ambiente: derruba onde estiver (com `removeVolumes`, apaga também os volumes e os dados), remove a pasta gerada e o histórico de deploys.",
        input: z.object({ environment, removeVolumes: z.boolean().optional().describe("Apagar também os volumes (padrão false)") }),
        summarize: (input) => `Apagar o ambiente ${input.environment}${input.removeVolumes ? " e os volumes (dados)" : " (mantendo os volumes)"}`,
        execute: async (input, context) => {
            const env = await resolve(input.environment)
            await (await deploys()).deleteEnvironment(String(env._id), { volumes: Boolean(input.removeVolumes) }, context.actorId)
            return { apagado: true, slug: env.slug, volumesApagados: Boolean(input.removeVolumes) }
        },
    }),
    tool({
        name: "deploy_environment",
        label: "Deploy/Redeploy",
        risk: "destructive",
        description:
            "Implanta (ou reimplanta) o ambiente em segundo plano. Sem `ref`, usa a ref salva da central (\"Última de <ref>\"); com `ref`, outra branch, tag ou commit (só origem central; adotado refaz o build da pasta). Volta na hora com o deployId: o resultado chega sozinho nesta conversa quando terminar — não fique consultando; use get_environment_deploy só se o usuário pedir o andamento.",
        input: z.object({ environment, ref: refSchema.optional().describe("Outra ref (omitido = a ref salva)") }),
        summarize: (input) => `${input.ref ? `Implantar ${input.ref} no` : "Redeploy do"} ambiente ${input.environment}`,
        execute: async (input, context) => {
            const env = await resolve(input.environment)
            if (input.ref && env.source.kind !== "central") throw new Error("Ambiente adotado não aceita outra ref: o redeploy refaz o build da pasta do projeto (com git pull, se ligado). Chame sem `ref`.")
            const { runEnvironmentAction } = await deploys()
            const { runEnvHost } = await settingsModule()
            const result = await runEnvironmentAction(String(env._id), { action: "deploy", ref: input.ref ?? "" }, context.actorId, runEnvHost, { notifyOpexSessionId: contextSessionId(context) })
            const ref = input.ref ?? (env.source.kind === "central" ? env.source.ref : null)
            return { deployId: result.deployId, status: "running", ref, nota: "Deploy em andamento: o resultado chega automaticamente nesta conversa quando terminar." }
        },
    }),
    tool({
        name: "move_environment",
        label: "Mover ambiente",
        risk: "destructive",
        description:
            "Troca as máquinas de build e execução e reimplanta no destino (segundo plano; o resultado chega sozinho nesta conversa). ANTES de chamar, avise o usuário: os volumes não migram (os dados do destino começam vazios) e, com portas, o ambiente fica fora do ar durante o deploy. Adotado do PC fica no PC.",
        input: z.object({ environment, buildOn: machine, runOn: machine }),
        summarize: (input) => `Mover o ambiente ${input.environment}: build no ${MACHINE_LABELS[input.buildOn].toLowerCase()}, execução no ${MACHINE_LABELS[input.runOn].toLowerCase()}`,
        execute: async (input, context) => {
            const env = await resolve(input.environment)
            const { runEnvironmentAction } = await deploys()
            const { runEnvHost } = await settingsModule()
            const result = await runEnvironmentAction(String(env._id), { action: "move", buildOn: input.buildOn, runOn: input.runOn }, context.actorId, runEnvHost, { notifyOpexSessionId: contextSessionId(context) })
            return { deployId: result.deployId, status: "running", aviso: moveWarning(env, input.runOn), nota: "Mudança em andamento: o resultado chega automaticamente nesta conversa quando terminar." }
        },
    }),
    ...(["up", "down", "restart"] as const).map((action) => {
        const meta = {
            up: { name: "start_environment", label: "Levantar", verb: "Levantar", risk: "write" as const, confirm: false, description: "Levanta (docker compose up -d) o ambiente onde ele está implantado, sem build." },
            down: { name: "stop_environment", label: "Derrubar", verb: "Derrubar", risk: "destructive" as const, confirm: false, description: "Derruba (docker compose down) o ambiente, mantendo os volumes. Ele fica fora do ar até levantar ou implantar de novo." },
            restart: { name: "restart_environment", label: "Reiniciar", verb: "Reiniciar", risk: "write" as const, confirm: true, description: "Reinicia os containers do ambiente (fica fora do ar alguns segundos)." },
        }[action]
        return tool({
            name: meta.name,
            label: meta.label,
            risk: meta.risk,
            ...(meta.confirm ? { confirmByDefault: true } : {}),
            description: meta.description,
            input: z.object({ environment }),
            summarize: (input) => `${meta.verb} o ambiente ${input.environment}`,
            execute: async (input, context) => {
                const env = await resolve(input.environment)
                await (await deploys()).runEnvironmentAction(String(env._id), { action }, context.actorId)
                return { ok: true, acao: meta.label, slug: env.slug }
            },
        })
    }),
    tool({
        name: "get_environment_logs",
        label: "Logs do ambiente",
        risk: "read",
        description: `Últimas linhas dos logs dos containers do ambiente (como o botão Logs da tela; até ${LOG_LINES_DEFAULT}).`,
        input: z.object({ environment, lines: z.number().int().min(1).max(LOG_LINES_DEFAULT).optional().describe(`Quantas linhas do fim (padrão ${LOG_LINES_DEFAULT})`) }),
        execute: async (input, context) => {
            const env = await resolve(input.environment)
            const result = await (await deploys()).runEnvironmentAction(String(env._id), { action: "logs" }, context.actorId)
            const tail = tailLines(stripAnsi(result.output ?? ""), input.lines ?? LOG_LINES_DEFAULT)
            return { slug: env.slug, linhas: tail.text || "(sem saída)", ...(tail.truncated ? { nota: `Mostrando as últimas ${input.lines ?? LOG_LINES_DEFAULT} linhas.` } : {}) }
        },
    }),
    tool({
        name: "list_environment_deploys",
        label: "Histórico de deploys",
        risk: "read",
        description: "Os 30 últimos deploys do ambiente: tipo (Deploy/Mover), resultado, duração, build → execução, ref @ commit, versão, build reaproveitado, recuperado após reinício e o erro resumido.",
        input: z.object({ environment }),
        execute: async (input) => {
            const env = await resolve(input.environment)
            return { slug: env.slug, deploys: (await (await service()).listDeploys(String(env._id))).map(deployView) }
        },
    }),
    tool({
        name: "get_environment_deploy",
        label: "Log do deploy",
        risk: "read",
        description: "Resumo e o fim do log de um deploy (pelo deployId de deploy_environment, move_environment ou list_environment_deploys), inclusive em andamento.",
        input: z.object({ deployId: z.string().trim().min(1).max(40), tailLines: z.number().int().min(1).max(400).optional().describe(`Linhas do fim do log (padrão ${DEPLOY_LOG_LINES_DEFAULT})`) }),
        execute: async (input) => {
            const deploy = await (await service()).getDeploy(input.deployId)
            const lines = input.tailLines ?? DEPLOY_LOG_LINES_DEFAULT
            const tail = tailLines(stripAnsi(deploy.log), lines)
            return { ...deployView(deploy), ambienteId: deploy.environmentId, log: tail.text || "(sem log)", ...(tail.truncated ? { nota: `Mostrando as últimas ${lines} de ${tail.totalLines} linhas.` } : {}) }
        },
    }),
    tool({
        name: "list_unmanaged_projects",
        label: "Não gerenciados",
        risk: "read",
        description: "Projetos do Docker Compose em execução no Servidor e no PC que ainda não são ambientes (descobertos pelos labels do compose), com pasta, arquivos, se há git e containers no ar. Adote com adopt_project.",
        input: z.object({}),
        execute: async () => {
            const list = await (await service()).listEnvironments()
            return { projetos: list.unmanaged, pcDisponivel: list.pcAvailable, ...(list.pcReason ? { motivoPcIndisponivel: list.pcReason } : {}) }
        },
    }),
    tool({
        name: "adopt_project",
        label: "Adotar projeto",
        risk: "write",
        confirmByDefault: true,
        description: "Passa a gerenciar um projeto do compose já em execução (de list_unmanaged_projects) como ambiente. Sem git, o redeploy só refaz o build; adotado do PC fica no PC.",
        input: z.object({ machine, projectName: projectNameSchema, name: z.string().trim().min(2).max(80), slug: slugSchema.optional().describe("Omitido: sugerido pelo nome") }),
        summarize: (input) => `Adotar o projeto ${input.projectName} (${MACHINE_LABELS[input.machine]}) como o ambiente ${input.name}`,
        execute: async (input, context) => {
            const parsed = adoptInputSchema.parse({ ...input, slug: input.slug ?? slugify(input.name) })
            const env = await (await service()).adoptProject(parsed, context.actorId)
            return { id: String(env._id), slug: env.slug, nome: env.name, adotado: true }
        },
    }),
    tool({
        name: "get_environments_settings",
        label: "Configuração dos ambientes",
        risk: "read",
        description: "Configuração dos ambientes (pasta base no servidor, porta do registry, tags mantidas por ambiente) e o estado do registry local.",
        input: z.object({}),
        execute: async () => {
            const [{ getEnvironmentsSettings }, { getRegistryStatus }] = await Promise.all([settingsModule(), import("@/features/environments/server/registry")])
            const [current, registry] = await Promise.all([getEnvironmentsSettings(), getRegistryStatus().catch((error: unknown) => ({ erro: error instanceof Error ? error.message : String(error) }))])
            return { ...current, registry }
        },
    }),
    tool({
        name: "update_environments_settings",
        label: "Salvar configuração",
        risk: "write",
        confirmByDefault: true,
        description: "Altera a configuração dos ambientes: só os campos enviados mudam (pasta base relativa ao $HOME, porta do registry, tags mantidas).",
        input: environmentsSettingsSchema.partial(),
        summarize: (input) => `Salvar a configuração dos ambientes (${Object.entries(input).map(([key, value]) => `${key}: ${String(value)}`).join(", ") || "sem mudanças"})`,
        execute: async (input, context) => {
            const { getEnvironmentsSettings, saveEnvironmentsSettings } = await settingsModule()
            const current = (await getEnvironmentsSettings()).settings
            return saveEnvironmentsSettings(environmentsSettingsSchema.parse(mergeSettingsPatch(current, input)), context.actorId)
        },
    }),
    tool({
        name: "clean_environments_registry",
        label: "Limpar registry",
        risk: "write",
        confirmByDefault: true,
        description: "Limpa o registry local: mantém as N últimas tags de cada ambiente (configuração) e roda o garbage-collect. Roda em segundo plano; o resultado chega sozinho nesta conversa.",
        input: z.object({}),
        summarize: () => "Limpar o registry dos ambientes (tags antigas + garbage-collect)",
        execute: async (_input, context) => {
            const [{ runRegistryCleanup }, { notifyOpexRegistryCleanup }, { envLog }] = await Promise.all([import("@/features/environments/server/registry"), import("@/features/environments/server/opex-notice"), settingsModule()])
            const sessionId = contextSessionId(context)
            void runRegistryCleanup()
                .then((message) => (sessionId ? notifyOpexRegistryCleanup(sessionId, { ok: true, message }) : undefined))
                .catch((error: unknown) => (sessionId ? notifyOpexRegistryCleanup(sessionId, { ok: false, error: error instanceof Error ? error.message : String(error) }) : undefined))
                .catch((error: unknown) => envLog.warn({ err: error instanceof Error ? error.message : error }, "[environments] Falha ao avisar o Agente Opex da limpeza do registry"))
            return { status: "running", nota: sessionId ? "Limpeza em andamento: o resultado chega automaticamente nesta conversa." : "Limpeza em andamento em segundo plano." }
        },
    }),
]
