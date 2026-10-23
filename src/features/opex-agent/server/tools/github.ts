import { z } from "zod"
import { GithubError, githubPaginate, githubRequest } from "@/features/github/client"
import { listGithubRepos } from "@/features/github/server/lookups"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { OPEX_GITHUB_AUDIT_ENTITY } from "../../constants"
import {
    clipPatches,
    encodePath,
    isValidBranchName,
    lineWindow,
    listTree,
    normalizeRepoPath,
    REPO_LINES_DEFAULT,
    REPO_LINES_MAX,
    REPO_SEARCH_CONTEXT_MAX,
    REPO_SEARCH_DEFAULT,
    REPO_SEARCH_MAX,
    REPO_TEXT_FILE_MAX_BYTES,
    REPO_TREE_DEFAULT,
    REPO_TREE_MAX,
    REPO_WRITE_MAX_BYTES,
    searchFiles,
} from "../../repo-search"
import { centralsByRepo, defaultBranchOf, openRepo, parseRepo, refInfo, resolveRepoRef, resolveSha } from "../repo-snapshot"
import { defineTool, OpexToolError } from "./define"

const repo = z.string().trim().min(3).max(200).describe("Repositório no formato dono/nome (de list_repositories)")
const ref = z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("Branch, tag ou SHA. Omitido: a branch base da central do repositório (Git e PR) ou, sem central, a branch padrão do repositório")
const branch = z.string().trim().max(200).optional().describe("Branch onde gravar. Omitida: a branch base da central ou, sem central, a branch padrão")
const filePath = z.string().trim().min(1).max(500).describe("Caminho do arquivo a partir da raiz do repositório (ex.: src/app/page.tsx)")

const firstLine = (message: string) => message.split("\n")[0]!.slice(0, 200)

interface RawCommit {
    sha: string
    html_url?: string
    commit: { message: string; author?: { name?: string; date?: string } | null }
    author?: { login?: string } | null
    stats?: { additions: number; deletions: number; total: number }
    files?: RawFile[]
}

interface RawFile {
    filename: string
    status: string
    additions: number
    deletions: number
    previous_filename?: string
    patch?: string
}

const slimCommit = (commit: RawCommit) => ({
    sha: commit.sha.slice(0, 12),
    message: firstLine(commit.commit.message),
    author: commit.author?.login ?? commit.commit.author?.name ?? null,
    date: commit.commit.author?.date ?? null,
})

const slimFiles = (files: readonly RawFile[] = []) =>
    clipPatches(files.map((file) => ({ path: file.filename, status: file.status, additions: file.additions, deletions: file.deletions, ...(file.previous_filename ? { previousPath: file.previous_filename } : {}), patch: file.patch ?? null })))

/** Erro do GitHub com o contexto do pedido (404 genérico vira mensagem acionável). */
export async function withContext<T>(what: string, run: () => Promise<T>): Promise<T> {
    try {
        return await run()
    } catch (error) {
        if (error instanceof GithubError && error.code === "NOT_FOUND") throw new OpexToolError(`${what}: não encontrado no GitHub (ou o token não tem acesso).`)
        if (error instanceof GithubError && error.status === 409) throw new OpexToolError(`${what}: conflito no GitHub (${error.message}). Releia o arquivo e tente de novo.`)
        throw error
    }
}

/** Branch de escrita (nunca SHA) e os metadados da central. */
async function writeTarget(rawRepo: string, requested: string | undefined, signal?: AbortSignal) {
    const resolved = await resolveRepoRef(rawRepo, requested, signal)
    if (!isValidBranchName(resolved.ref)) throw new OpexToolError(`"${resolved.ref}" não é um nome de branch válido.`)
    return resolved
}

/** SHA atual do arquivo na branch (`null` se não existe). */
async function currentFileSha(repoName: string, path: string, branchName: string, signal?: AbortSignal): Promise<string | null> {
    try {
        const info = await githubRequest<{ sha?: string; type?: string } | unknown[]>(`/repos/${repoName}/contents/${encodePath(path)}?ref=${encodeURIComponent(branchName)}`, { signal, label: "opex: arquivo atual" })
        if (Array.isArray(info) || (info as { type?: string }).type !== "file") throw new OpexToolError(`"${path}" é uma pasta, não um arquivo.`)
        return (info as { sha?: string }).sha ?? null
    } catch (error) {
        if (error instanceof GithubError && error.code === "NOT_FOUND") return null
        throw error
    }
}

async function audit(actorId: string, repoName: string, acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria], depois: Record<string, unknown>) {
    await recordAudit({ userId: actorId, entidade: OPEX_GITHUB_AUDIT_ENTITY, entidadeId: repoName, acao, depois: { ...depois, via: "opex" } })
}

/** Branches que o agente nunca exclui: a padrão e as da central. */
async function protectedBranches(repoName: string, signal?: AbortSignal): Promise<Set<string>> {
    const [defaultBranch, centrals] = await Promise.all([defaultBranchOf(repoName, signal), centralsByRepo()])
    const central = centrals.get(repoName)
    return new Set([defaultBranch, ...(central ? [central.baseBranch, central.prTargetBranch] : [])])
}

const readTools = [
    defineTool({
        name: "list_repositories",
        group: "github",
        label: "Listar repositórios",
        risk: "read",
        description:
            "Repositórios do GitHub acessíveis pelo token da integração, marcando os que têm central de desenvolvimento e a branch base de consulta dela. Use antes das outras ferramentas de repositório para achar o dono/nome.",
        input: z.object({ query: z.string().trim().max(100).optional().describe("Filtra pelo nome (sem diferenciar maiúsculas)") }),
        execute: async ({ query }) => {
            const [repos, centrals] = await Promise.all([listGithubRepos(), centralsByRepo()])
            const term = query?.toLowerCase()
            return repos
                .filter((item) => !term || item.fullName.includes(term))
                .map((item) => {
                    const central = centrals.get(item.fullName)
                    return {
                        repo: item.fullName,
                        private: item.private,
                        description: item.description,
                        central: central ? { project: central.projectName, baseBranch: central.baseBranch, prTargetBranch: central.prTargetBranch } : null,
                    }
                })
        },
    }),
    defineTool({
        name: "get_repo_tree",
        group: "github",
        label: "Árvore do repositório",
        risk: "read",
        description: `Lista pastas (terminam em /) e arquivos de uma branch, com filtro por pasta e glob (ex.: "**/*.ts", "{src,lib}/**/*.tsx"). Padrão ${REPO_TREE_DEFAULT} itens, até ${REPO_TREE_MAX}.`,
        input: z.object({
            repo,
            ref,
            path: z.string().trim().max(500).optional().describe("Pasta inicial (padrão: raiz)"),
            glob: z.string().trim().max(200).optional().describe("Só arquivos que casam com o glob (sem barra = nome do arquivo em qualquer pasta)"),
            recursive: z.boolean().optional().describe("Padrão true; false lista só o primeiro nível da pasta"),
            limit: z.number().int().min(1).max(REPO_TREE_MAX).optional(),
        }),
        execute: async (input, context) => {
            const opened = await openRepo(input.repo, input.ref, context.signal)
            try {
                return { ...refInfo(opened), ...listTree(opened.snapshot, input) }
            } catch (error) {
                throw new OpexToolError(error instanceof Error ? error.message : String(error))
            }
        },
    }),
    defineTool({
        name: "read_repo_file",
        group: "github",
        label: "Ler arquivo do repositório",
        risk: "read",
        description: `Lê um arquivo de texto de uma branch em janelas de linhas numeradas (padrão ${REPO_LINES_DEFAULT}, até ${REPO_LINES_MAX}). Para arquivos longos, continue com startLine = endLine + 1. Binários e arquivos acima de ${REPO_TEXT_FILE_MAX_BYTES / 1024 / 1024} MB não são lidos.`,
        input: z.object({
            repo,
            ref,
            path: filePath,
            startLine: z.number().int().min(1).optional(),
            maxLines: z.number().int().min(1).max(REPO_LINES_MAX).optional(),
        }),
        execute: async ({ repo: rawRepo, ref: rawRef, path, startLine, maxLines }, context) => {
            const opened = await openRepo(rawRepo, rawRef, context.signal)
            const target = normalizeRepoPath(path)
            const file = opened.snapshot.files.get(target)
            if (!file) {
                if (opened.snapshot.dirs.has(target)) throw new OpexToolError(`"${target}" é uma pasta: use get_repo_tree.`)
                const name = target.split("/").pop()!.toLowerCase()
                const similar = [...opened.snapshot.files.keys()].filter((item) => item.toLowerCase().endsWith(`/${name}`) || item.toLowerCase() === name).slice(0, 10)
                throw new OpexToolError(`"${target}" não existe na branch ${opened.ref}.${similar.length ? ` Parecidos: ${similar.join(", ")}` : " Use get_repo_tree ou search_repo_code."}`)
            }
            if (file.text === null) {
                throw new OpexToolError(file.size > REPO_TEXT_FILE_MAX_BYTES ? `"${target}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB: grande demais para ler.` : `"${target}" é um arquivo binário: não dá para ler o conteúdo.`)
            }
            return { ...refInfo(opened), path: target, size: file.size, ...lineWindow(file.text, startLine, maxLines) }
        },
    }),
    defineTool({
        name: "search_repo_code",
        group: "github",
        label: "Buscar no repositório",
        risk: "read",
        description: `Busca texto ou expressão regular (JavaScript) no conteúdo de QUALQUER branch, como um grep: devolve caminho, linha e trecho. Pula binários, arquivos acima de ${REPO_TEXT_FILE_MAX_BYTES / 1024 / 1024} MB e pastas como node_modules/dist/build (salvo se path apontar para elas). Padrão ${REPO_SEARCH_DEFAULT} ocorrências, até ${REPO_SEARCH_MAX}.`,
        input: z.object({
            repo,
            ref,
            query: z.string().min(1).max(500).describe("Texto procurado (ou regex com regex=true), linha a linha"),
            regex: z.boolean().optional(),
            caseSensitive: z.boolean().optional().describe("Padrão false"),
            path: z.string().trim().max(500).optional().describe("Só dentro desta pasta"),
            glob: z.string().trim().max(200).optional().describe('Só arquivos que casam (ex.: "*.ts", "src/**/*.tsx")'),
            contextLines: z.number().int().min(0).max(REPO_SEARCH_CONTEXT_MAX).optional().describe("Linhas antes/depois de cada ocorrência"),
            limit: z.number().int().min(1).max(REPO_SEARCH_MAX).optional(),
        }),
        execute: async (input, context) => {
            const opened = await openRepo(input.repo, input.ref, context.signal)
            try {
                return { ...refInfo(opened), ...searchFiles(opened.snapshot.files.values(), input) }
            } catch (error) {
                throw new OpexToolError(error instanceof Error ? error.message : String(error))
            }
        },
    }),
    defineTool({
        name: "list_branches",
        group: "github",
        label: "Branches do repositório",
        risk: "read",
        description: "Branches do repositório (até 500), com filtro por nome, indicando a padrão e as da central (base e destino do PR).",
        input: z.object({ repo, query: z.string().trim().max(100).optional().describe("Filtra pelo nome") }),
        execute: async ({ repo: rawRepo, query }, context) => {
            const repoName = parseRepo(rawRepo)
            const [items, defaultBranch, centrals] = await Promise.all([
                withContext(`Branches de ${repoName}`, () => githubPaginate<{ name: string; protected: boolean }>(`/repos/${repoName}/branches?per_page=100`, { signal: context.signal, label: "opex: branches", maxPages: 5 })),
                defaultBranchOf(repoName, context.signal),
                centralsByRepo(),
            ])
            const central = centrals.get(repoName) ?? null
            const term = query?.toLowerCase()
            const branches = items.filter((item) => !term || item.name.toLowerCase().includes(term)).map((item) => ({ name: item.name, protected: item.protected }))
            return { repo: repoName, defaultBranch, central, total: branches.length, branches }
        },
    }),
    defineTool({
        name: "list_commits",
        group: "github",
        label: "Commits do repositório",
        risk: "read",
        description: "Últimos commits de uma branch (opcionalmente só os que tocam um caminho).",
        input: z.object({
            repo,
            ref,
            path: z.string().trim().max(500).optional(),
            limit: z.number().int().min(1).max(100).optional().describe("Padrão 20"),
        }),
        execute: async ({ repo: rawRepo, ref: rawRef, path, limit }, context) => {
            const resolved = await resolveRepoRef(rawRepo, rawRef, context.signal)
            const params = new URLSearchParams({ sha: resolved.ref, per_page: String(limit ?? 20) })
            const target = normalizeRepoPath(path)
            if (target) params.set("path", target)
            const commits = await withContext(`Commits de ${resolved.ref}`, () => githubRequest<RawCommit[]>(`/repos/${resolved.repo}/commits?${params}`, { signal: context.signal, label: "opex: commits" }))
            return { ...refInfo(resolved), commits: commits.map(slimCommit) }
        },
    }),
    defineTool({
        name: "get_commit",
        group: "github",
        label: "Ler commit",
        risk: "read",
        description: "Detalhe de um commit: mensagem completa, autor, estatísticas e arquivos alterados com o diff (cortado nos maiores).",
        input: z.object({ repo, sha: z.string().trim().min(4).max(200).describe("SHA (ou branch/tag) do commit") }),
        execute: async ({ repo: rawRepo, sha }, context) => {
            const repoName = parseRepo(rawRepo)
            const commit = await withContext(`Commit ${sha}`, () => githubRequest<RawCommit>(`/repos/${repoName}/commits/${encodePath(sha)}`, { signal: context.signal, label: "opex: commit" }))
            return { repo: repoName, ...slimCommit(commit), sha: commit.sha, message: commit.commit.message, url: commit.html_url ?? null, stats: commit.stats ?? null, files: slimFiles(commit.files) }
        },
    }),
    defineTool({
        name: "compare_refs",
        group: "github",
        label: "Comparar branches",
        risk: "read",
        description: "Compara duas branches/refs (base...head): commits à frente/atrás, commits de head e arquivos alterados com o diff (cortado). base omitida = branch de consulta padrão do repositório.",
        input: z.object({ repo, base: ref, head: z.string().trim().min(1).max(200) }),
        execute: async ({ repo: rawRepo, base, head }, context) => {
            const resolved = await resolveRepoRef(rawRepo, base, context.signal)
            const compare = await withContext(`Comparação ${resolved.ref}...${head}`, () =>
                githubRequest<{ status: string; ahead_by: number; behind_by: number; total_commits: number; html_url?: string; commits: RawCommit[]; files?: RawFile[] }>(
                    `/repos/${resolved.repo}/compare/${encodePath(resolved.ref)}...${encodePath(head)}`,
                    { signal: context.signal, label: "opex: comparar" },
                ),
            )
            return {
                repo: resolved.repo,
                base: resolved.ref,
                baseSource: resolved.refSource,
                head,
                status: compare.status,
                aheadBy: compare.ahead_by,
                behindBy: compare.behind_by,
                totalCommits: compare.total_commits,
                url: compare.html_url ?? null,
                commits: compare.commits.slice(-50).map(slimCommit),
                files: slimFiles(compare.files),
            }
        },
    }),
]

const writeTools = [
    defineTool({
        name: "create_branch",
        group: "github",
        label: "Criar branch",
        risk: "write",
        confirmByDefault: true,
        description: "Cria uma branch no repositório a partir de outra branch, tag ou SHA (padrão: a branch de consulta padrão).",
        input: z.object({ repo, name: z.string().trim().min(1).max(200).describe("Nome da nova branch"), from: ref }),
        summarize: (input) => `Criar a branch ${input.name} em ${input.repo}${input.from ? ` a partir de ${input.from}` : ""}`,
        execute: async ({ repo: rawRepo, name, from }, context) => {
            if (!isValidBranchName(name)) throw new OpexToolError(`"${name}" não é um nome de branch válido.`)
            const source = await resolveRepoRef(rawRepo, from, context.signal)
            const sha = await resolveSha(source.repo, source.ref, context.signal)
            const created = await withContext(`Branch ${name}`, () =>
                githubRequest<{ ref: string; object: { sha: string } }>(`/repos/${source.repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${name}`, sha }, signal: context.signal, label: "opex: criar branch" }),
            ).catch((error: unknown) => {
                if (error instanceof GithubError && error.status === 422) throw new OpexToolError(`A branch "${name}" já existe em ${source.repo} (ou o nome é inválido).`)
                throw error
            })
            await audit(context.actorId, source.repo, AcaoAuditoria.CRIAR, { branch: name, origem: source.ref, sha })
            return { repo: source.repo, branch: name, from: source.ref, sha: created.object.sha }
        },
    }),
    defineTool({
        name: "write_repo_file",
        group: "github",
        label: "Gravar arquivo no repositório",
        risk: "write",
        confirmByDefault: true,
        description: `Cria ou substitui um arquivo de texto numa branch com um commit (conteúdo completo do arquivo, até ${REPO_WRITE_MAX_BYTES / 1024 / 1024} MB). Leia o arquivo antes para não perder conteúdo.`,
        input: z.object({ repo, path: filePath, content: z.string().describe("Conteúdo COMPLETO do arquivo"), message: z.string().trim().min(1).max(500).describe("Mensagem do commit"), branch }),
        summarize: (input) => `Gravar ${input.path} em ${input.repo} (${input.branch ? `branch ${input.branch}` : "branch de consulta padrão"}): "${firstLine(input.message)}"`,
        redact: (input) => ({ ...input, content: input.content.length > 2000 ? `${input.content.slice(0, 2000)}…(+${input.content.length - 2000} caracteres)` : input.content }),
        execute: async ({ repo: rawRepo, path, content, message, branch: rawBranch }, context) => {
            const bytes = Buffer.byteLength(content, "utf8")
            if (bytes > REPO_WRITE_MAX_BYTES) throw new OpexToolError(`Conteúdo grande demais (${(bytes / 1024 / 1024).toFixed(1)} MB; máximo ${REPO_WRITE_MAX_BYTES / 1024 / 1024} MB).`)
            const target = await writeTarget(rawRepo, rawBranch, context.signal)
            const filePathNorm = normalizeRepoPath(path)
            const existing = await withContext(`Branch ${target.ref}`, () => currentFileSha(target.repo, filePathNorm, target.ref, context.signal))
            const result = await withContext(`Gravar ${filePathNorm}`, () =>
                githubRequest<{ commit: { sha: string; html_url?: string } }>(`/repos/${target.repo}/contents/${encodePath(filePathNorm)}`, {
                    method: "PUT",
                    body: { message, content: Buffer.from(content, "utf8").toString("base64"), branch: target.ref, ...(existing ? { sha: existing } : {}) },
                    signal: context.signal,
                    label: "opex: gravar arquivo",
                }),
            )
            await audit(context.actorId, target.repo, existing ? AcaoAuditoria.ATUALIZAR : AcaoAuditoria.CRIAR, { arquivo: filePathNorm, branch: target.ref, commit: result.commit.sha, mensagem: firstLine(message) })
            return { ...refInfo(target), path: filePathNorm, created: !existing, commit: result.commit.sha, url: result.commit.html_url ?? null }
        },
    }),
    defineTool({
        name: "delete_repo_file",
        group: "github",
        label: "Excluir arquivo do repositório",
        risk: "destructive",
        description: "Exclui um arquivo de uma branch com um commit.",
        input: z.object({ repo, path: filePath, message: z.string().trim().min(1).max(500).describe("Mensagem do commit"), branch }),
        summarize: (input) => `Excluir ${input.path} de ${input.repo} (${input.branch ? `branch ${input.branch}` : "branch de consulta padrão"})`,
        execute: async ({ repo: rawRepo, path, message, branch: rawBranch }, context) => {
            const target = await writeTarget(rawRepo, rawBranch, context.signal)
            const filePathNorm = normalizeRepoPath(path)
            const existing = await withContext(`Branch ${target.ref}`, () => currentFileSha(target.repo, filePathNorm, target.ref, context.signal))
            if (!existing) throw new OpexToolError(`"${filePathNorm}" não existe na branch ${target.ref}.`)
            const result = await withContext(`Excluir ${filePathNorm}`, () =>
                githubRequest<{ commit: { sha: string; html_url?: string } }>(`/repos/${target.repo}/contents/${encodePath(filePathNorm)}`, {
                    method: "DELETE",
                    body: { message, sha: existing, branch: target.ref },
                    signal: context.signal,
                    label: "opex: excluir arquivo",
                }),
            )
            await audit(context.actorId, target.repo, AcaoAuditoria.EXCLUIR, { arquivo: filePathNorm, branch: target.ref, commit: result.commit.sha, mensagem: firstLine(message) })
            return { ...refInfo(target), path: filePathNorm, deleted: true, commit: result.commit.sha, url: result.commit.html_url ?? null }
        },
    }),
    defineTool({
        name: "delete_branch",
        group: "github",
        label: "Excluir branch",
        risk: "destructive",
        description: "Exclui uma branch do repositório. Recusa a branch padrão e as branches base/destino da central.",
        input: z.object({ repo, name: z.string().trim().min(1).max(200) }),
        summarize: (input) => `Excluir a branch ${input.name} de ${input.repo}`,
        execute: async ({ repo: rawRepo, name }, context) => {
            const repoName = parseRepo(rawRepo)
            if ((await protectedBranches(repoName, context.signal)).has(name)) throw new OpexToolError(`A branch "${name}" é a padrão do repositório ou da central: não pode ser excluída pelo agente.`)
            await withContext(`Branch ${name}`, () => githubRequest(`/repos/${repoName}/git/refs/heads/${encodePath(name)}`, { method: "DELETE", signal: context.signal, label: "opex: excluir branch" }))
            await audit(context.actorId, repoName, AcaoAuditoria.EXCLUIR, { branch: name })
            return { repo: repoName, branch: name, deleted: true }
        },
    }),
]

export const githubTools = [...readTools, ...writeTools]
