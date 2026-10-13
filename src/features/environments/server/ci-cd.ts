import { GithubError, githubRequest, githubRequestFull } from "@/features/github/client"
import { DomainError } from "@/lib/api/route"

/**
 * Integração com o **CI/CD** do GitHub (Actions): lista workflows e runs, dispara o workflow de CD
 * na branch do ambiente e localiza o run disparado. O Opex **não** altera o pipeline do repositório;
 * apenas dispara e acompanha o workflow configurado.
 */

export interface CiCdWorkflowDto {
    id: number
    name: string
    path: string
    state: string
}

export interface CiCdRunDto {
    id: number
    runNumber: number
    name: string
    workflowName: string | null
    branch: string | null
    event: string
    status: string
    conclusion: string | null
    htmlUrl: string
    createdAt: string
    updatedAt: string
}

interface GithubWorkflow {
    id: number
    name: string
    path: string
    state: string
}

interface GithubRun {
    id: number
    name: string
    run_number: number
    event: string
    status: string
    conclusion: string | null
    html_url: string
    created_at: string
    updated_at: string
    head_branch: string | null
    workflow_id: number
}

function wrapError(error: unknown): never {
    if (error instanceof GithubError) throw new DomainError(error.status === 404 ? 404 : 502, error.message, error.code)
    throw error
}

export async function listWorkflows(repo: string): Promise<CiCdWorkflowDto[]> {
    try {
        const data = await githubRequest<{ workflows: GithubWorkflow[] }>(`/repos/${repo}/actions/workflows?per_page=100`, { label: "actions workflows" })
        return (data.workflows ?? []).map((workflow) => ({ id: workflow.id, name: workflow.name, path: workflow.path, state: workflow.state }))
    } catch (error) {
        wrapError(error)
    }
}

export async function listRuns(repo: string, options: { workflow?: string; branch?: string; limit?: number } = {}): Promise<CiCdRunDto[]> {
    const params = new URLSearchParams({ per_page: String(Math.min(options.limit ?? 30, 100)) })
    if (options.branch) params.set("branch", options.branch)
    const base = options.workflow ? `/repos/${repo}/actions/workflows/${encodeURIComponent(options.workflow)}/runs` : `/repos/${repo}/actions/runs`
    try {
        const data = await githubRequest<{ workflow_runs: GithubRun[] }>(`${base}?${params.toString()}`, { label: "actions runs" })
        return (data.workflow_runs ?? []).map((run) => ({
            id: run.id,
            runNumber: run.run_number,
            name: run.name,
            workflowName: null,
            branch: run.head_branch,
            event: run.event,
            status: run.status,
            conclusion: run.conclusion,
            htmlUrl: run.html_url,
            createdAt: run.created_at,
            updatedAt: run.updated_at,
        }))
    } catch (error) {
        wrapError(error)
    }
}

/** Dispara um workflow `workflow_dispatch` na branch (`ref`). Devolve o instante do disparo (ISO). */
export async function dispatchWorkflow(repo: string, workflowFile: string, ref: string, inputs: Record<string, string> = {}): Promise<string> {
    try {
        await githubRequestFull(`/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`, {
            method: "POST",
            body: { ref, inputs },
            label: "actions dispatch",
        })
        return new Date().toISOString()
    } catch (error) {
        wrapError(error)
    }
}

/**
 * Localiza o run disparado (mesmo workflow, na branch, criado a partir de `sinceIso`). Sem
 * correspondência devolve `null` (a tela mostra "aguardando" e tenta de novo) — nunca "o último run".
 */
export async function findRunAfterDispatch(repo: string, workflowFile: string, branch: string, sinceIso: string): Promise<CiCdRunDto | null> {
    const runs = await listRuns(repo, { workflow: workflowFile, branch, limit: 20 })
    const since = new Date(sinceIso).getTime()
    return runs.find((run) => run.event === "workflow_dispatch" && new Date(run.createdAt).getTime() >= since - 5_000) ?? null
}

export async function getRun(repo: string, runId: string): Promise<CiCdRunDto | null> {
    try {
        const data = await githubRequestFull<GithubRun>(`/repos/${repo}/actions/runs/${runId}`, { label: "actions run" })
        const run = data.data
        return {
            id: run.id,
            runNumber: run.run_number,
            name: run.name,
            workflowName: null,
            branch: run.head_branch,
            event: run.event,
            status: run.status,
            conclusion: run.conclusion,
            htmlUrl: run.html_url,
            createdAt: run.created_at,
            updatedAt: run.updated_at,
        }
    } catch (error) {
        if (error instanceof GithubError && error.status === 404) return null
        wrapError(error)
    }
}

export function isRunFinished(run: CiCdRunDto): boolean {
    return run.status === "completed"
}
