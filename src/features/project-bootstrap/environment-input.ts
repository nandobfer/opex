import { parseEnvText } from "@/features/environments/env-import"
import type { EnvironmentInput } from "@/features/environments/schemas"
import type { CentralConfig } from "@/features/agentic/schemas"
import { slugFromRepoName } from "./repo-name"
import type { BootstrapResult } from "./schemas"

/**
 * Dados que o bootstrap grava na central e no ambiente (módulo puro): tudo sai da etapa 1 e do resumo
 * final do agente; nada é perguntado de novo.
 */

/** Caminho conferido pela saúde: a rota de health check ou, sem servidor, a página de entrada. */
export const bootstrapHealthPath = (result: Pick<BootstrapResult, "hasServer" | "healthPath">) => (result.hasServer ? result.healthPath : "/")

export const bootstrapHealthUrl = (result: Pick<BootstrapResult, "hasServer" | "healthPath" | "port">) => `http://localhost:${result.port}${bootstrapHealthPath(result)}`

export interface BootstrapEnvironmentSource {
    repoName: string
    centralId: string
    result: BootstrapResult
}

/** Ambiente da central nova: build e execução no servidor, sem limites, com as variáveis do `.env`. */
export function bootstrapEnvironmentInput(source: BootstrapEnvironmentSource, envText: string): EnvironmentInput {
    const slug = slugFromRepoName(source.repoName)
    // A última ocorrência de uma chave vale, como no próprio `.env`.
    const entries = [...new Map(parseEnvText(envText).entries.map((entry) => [entry.key, entry])).values()]
    const name = source.repoName.slice(0, 80)
    return {
        name: name.length >= 2 ? name : `${name}-app`,
        slug,
        source: { kind: "central", centralId: source.centralId, ref: source.result.branch, composeFile: "docker-compose.yml", services: [], projectName: slug.replace(/-+$/, "") },
        env: entries.slice(0, 100).map((entry) => ({ key: entry.key, value: entry.value })),
        ports: [source.result.port],
        healthUrl: bootstrapHealthUrl(source.result),
        buildOn: "server",
        runOn: "server",
        limits: null,
        composeOverrides: null,
    }
}

/**
 * Slug (e projeto do compose) livre: o do repositório ou, se outro ambiente já usa, o primeiro `<slug>-N` livre
 * (determinístico, até 40 caracteres). Assim um ambiente antigo com o mesmo nome não trava a etapa 4.
 */
export function freeEnvironmentSlug(base: string, taken: ReadonlySet<string>): string {
    if (!taken.has(base)) return base
    for (let index = 2; ; index++) {
        const suffix = `-${index}`
        const candidate = `${base.slice(0, 40 - suffix.length).replace(/-+$/, "")}${suffix}`
        if (!taken.has(candidate)) return candidate
    }
}

/** Troca o slug e o projeto do compose do ambiente (mesmo valor nos dois). */
export const withEnvironmentSlug = (input: EnvironmentInput, slug: string): EnvironmentInput => ({ ...input, slug, source: { ...input.source, projectName: slug } } as EnvironmentInput)

/** Central nova com os padrões, a branch do push como base e destino do PR e o backup só com MongoDB. */
export function bootstrapCentralConfig(config: CentralConfig, result: Pick<BootstrapResult, "branch" | "usesMongo" | "hasServer" | "healthPath">): CentralConfig {
    return {
        ...config,
        git: { ...config.git, baseBranch: result.branch, prTargetBranch: result.branch },
        environment: { ...config.environment, backupDatabase: result.usesMongo, healthPath: bootstrapHealthPath(result) },
    }
}
