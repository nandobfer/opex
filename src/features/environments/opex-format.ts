import { MACHINE_LABELS, type EnvironmentInput, type EnvironmentsSettings } from "./schemas"
import type { EnvironmentDeploySummaryDto, EnvironmentDto, UnmanagedProjectDto } from "./types"
import { DEPLOY_KIND_LABELS, formatDuration, groupByMachine, healthOf, HEALTH_LABELS, placementLabel, versionLabel } from "./view"

/** Formatação das respostas das ferramentas do Agente Opex para os ambientes (módulo puro). */

export const HIDDEN_VALUE = "[valor oculto]"

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g

export function stripAnsi(text: string): string {
    return text.replace(ANSI, "").replace(/\r(?!\n)/g, "\n")
}

/** As últimas `lines` linhas (sem a quebra final vazia). */
export function tailLines(text: string, lines: number): { text: string; totalLines: number; truncated: boolean } {
    const all = text.replace(/\n+$/, "").split("\n")
    const total = text.trim() ? all.length : 0
    return { text: all.slice(-lines).join("\n"), totalLines: total, truncated: total > lines }
}

const STATUS_LABELS = { running: "Em andamento", success: "Sucesso", failed: "Falhou" } as const

export function deployView(deploy: EnvironmentDeploySummaryDto) {
    return {
        id: deploy.id,
        tipo: DEPLOY_KIND_LABELS[deploy.kind],
        resultado: STATUS_LABELS[deploy.status],
        status: deploy.status,
        refCommit: [deploy.ref, deploy.commit ? deploy.commit.slice(0, 12) : null].filter(Boolean).join(" @ ") || null,
        versao: deploy.version ? `v${deploy.version}` : null,
        maquinas: placementLabel(deploy.buildOn, deploy.runOn),
        inicio: deploy.startedAt,
        fim: deploy.finishedAt,
        duracao: deploy.durationMs === null ? "em andamento" : formatDuration(deploy.durationMs),
        ...(deploy.skipBuild ? { buildReaproveitado: true } : {}),
        ...(deploy.resumed ? { recuperadoAposReinicio: true } : {}),
        ...(deploy.error ? { erro: deploy.error.slice(0, 500) } : {}),
    }
}

function stateOf(env: EnvironmentDto): string {
    if (env.lastDeploy?.status === "running") return "Implantando"
    return HEALTH_LABELS[healthOf(env)]
}

export function environmentRow(env: EnvironmentDto) {
    const running = env.services.filter((service) => service.state === "running").length
    const version = versionLabel(env)
    return {
        id: env.id,
        nome: env.name,
        slug: env.slug,
        estado: stateOf(env),
        portas: env.ports,
        servicosNoAr: `${running}/${env.services.length}`,
        versao: version ? `${version.text}${version.live ? "" : " (implantada)"}` : null,
        origem: env.source.kind === "central" ? `central (ref ${env.source.ref})` : `adotado (${MACHINE_LABELS[env.source.machine]})`,
        build: placementLabel(env.deployedOn?.buildOn ?? env.buildOn, env.deployedOn?.runOn ?? env.runOn),
        ultimoDeploy: env.lastDeploy ? deployView(env.lastDeploy) : null,
    }
}

/** Lista agrupada por onde o ambiente executa (Servidor e PC), como na tela. */
export function environmentsListView(list: { items: EnvironmentDto[]; unmanaged: UnmanagedProjectDto[]; pcAvailable: boolean; pcReason: string | null; checkedAt: string }) {
    const groups = groupByMachine(list.items)
    return {
        servidor: groups.server.map(environmentRow),
        pc: groups.pc.map(environmentRow),
        pcDisponivel: list.pcAvailable,
        ...(list.pcReason ? { motivoPcIndisponivel: list.pcReason } : {}),
        naoGerenciados: list.unmanaged.length,
        consultadoEm: list.checkedAt,
    }
}

/** Detalhe do ambiente: só os nomes das variáveis (os valores nunca saem do servidor). */
export function environmentDetailView(env: EnvironmentDto) {
    return {
        ...environmentRow(env),
        origem: env.source,
        buildEm: env.buildOn,
        executarEm: env.runOn,
        noArEm: env.deployedOn ? placementLabel(env.deployedOn.buildOn, env.deployedOn.runOn) : null,
        variaveis: env.envKeys,
        urlSaude: env.healthUrl,
        servicos: env.services.map((service) => ({ servico: service.service, container: service.container, estado: service.state, status: service.status, portas: service.ports, cpu: service.cpu, memoria: service.memory, versao: service.version })),
        criadoEm: env.createdAt,
        atualizadoEm: env.updatedAt,
    }
}

/** Entrada sem os valores das variáveis (card e histórico do chat). */
export function redactEnvValues<T extends { env?: { key: string; value?: string }[] }>(input: T): T {
    if (!input.env) return input
    return { ...input, env: input.env.map((item) => ({ key: item.key, value: HIDDEN_VALUE })) }
}

export interface EnvironmentPatch {
    name?: string
    slug?: string
    source?: EnvironmentInput["source"]
    /** Lista completa das variáveis; valor vazio ou omitido mantém o salvo. */
    env?: { key: string; value?: string }[]
    ports?: number[]
    healthUrl?: string
    buildOn?: EnvironmentInput["buildOn"]
    runOn?: EnvironmentInput["runOn"]
}

/** Valores do ambiente salvo com os campos enviados por cima (variáveis com valor vazio = mantém). */
export function mergeEnvironmentPatch(current: EnvironmentInput, patch: EnvironmentPatch): EnvironmentInput {
    return {
        name: patch.name ?? current.name,
        slug: patch.slug ?? current.slug,
        source: patch.source ?? current.source,
        env: patch.env ? patch.env.map((item) => ({ key: item.key, value: item.value ?? "" })) : current.env,
        ports: patch.ports ?? current.ports,
        healthUrl: patch.healthUrl ?? current.healthUrl,
        buildOn: patch.buildOn ?? current.buildOn,
        runOn: patch.runOn ?? current.runOn,
    }
}

export function mergeSettingsPatch(current: EnvironmentsSettings, patch: Partial<EnvironmentsSettings>): EnvironmentsSettings {
    return { baseDir: patch.baseDir ?? current.baseDir, registryPort: patch.registryPort ?? current.registryPort, keepTags: patch.keepTags ?? current.keepTags }
}

interface FinishedDeploy {
    _id: unknown
    kind: EnvironmentDeploySummaryDto["kind"]
    status: EnvironmentDeploySummaryDto["status"]
    ref: string | null
    commit: string | null
    buildOn: EnvironmentDeploySummaryDto["buildOn"]
    runOn: EnvironmentDeploySummaryDto["runOn"]
    error: string | null
    startedAt: Date | string
    finishedAt: Date | string | null
    version?: string | null
}

/** Aviso do fim do deploy para a sessão do agente (texto ao modelo + selo no chat). */
export function deployNoticeText(deploy: FinishedDeploy, env: { name: string; slug: string } | null): { text: string; display: string } {
    const name = env ? `${env.name} (${env.slug})` : "do ambiente"
    const kind = DEPLOY_KIND_LABELS[deploy.kind]
    const ok = deploy.status === "success"
    const duration = deploy.finishedAt ? formatDuration(new Date(deploy.finishedAt).getTime() - new Date(deploy.startedAt).getTime()) : null
    const ref = [deploy.ref, deploy.commit ? deploy.commit.slice(0, 12) : null].filter(Boolean).join(" @ ")
    const details = [
        `resultado: ${ok ? "sucesso" : "falhou"}`,
        duration ? `duração: ${duration}` : null,
        ref ? `ref: ${ref}` : null,
        deploy.version ? `versão: v${deploy.version}` : null,
        placementLabel(deploy.buildOn, deploy.runOn).toLowerCase(),
        !ok && deploy.error ? `erro: ${deploy.error.slice(0, 500)}` : null,
    ].filter(Boolean)
    return {
        text: `[Aviso automático] O ${kind.toLowerCase()} ${env ? `do ambiente ${name}` : name} (deployId ${String(deploy._id)}) terminou — ${details.join("; ")}. Informe o usuário em poucas palavras${ok ? "" : " e, se ajudar, leia o fim do log com get_environment_deploy"}.`,
        display: `${kind} de ${env?.slug ?? "ambiente"} ${ok ? "concluído" : "falhou"}${duration ? ` (${duration})` : ""}`,
    }
}

export function registryCleanupNoticeText(result: { ok: true; message: string } | { ok: false; error: string }): { text: string; display: string } {
    return result.ok
        ? { text: `[Aviso automático] A limpeza do registry dos ambientes terminou: ${result.message}. Informe o usuário em poucas palavras.`, display: "Limpeza do registry concluída" }
        : { text: `[Aviso automático] A limpeza do registry dos ambientes falhou: ${result.error.slice(0, 500)}. Informe o usuário.`, display: "Limpeza do registry falhou" }
}
