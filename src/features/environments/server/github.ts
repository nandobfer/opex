import { githubRequest } from "@/features/github/client"
import { DomainError } from "@/lib/api/route"
import { EnvironmentOperation, type IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import type { EnvironmentActor } from "./access"
import { accessibleProject } from "./access"

export interface WorkflowRun {
    id: number
    name: string
    head_branch: string
    head_sha: string
    status: string
    conclusion: string | null
    html_url: string
    created_at: string
    updated_at: string
    run_started_at?: string
}
export interface Workflow {
    id: number
    name: string
    path: string
    state: string
}
const repoPath = (repo: string) => `/repos/${repo.split("/").map(encodeURIComponent).join("/")}`
export async function ciCd(actor: EnvironmentActor, repoId: string, workflow?: string, branch?: string, page = 1) {
    const project = await accessibleProject(actor, repoId)
    const path = repoPath(project.repo)
    const query = new URLSearchParams({ per_page: "50", page: String(page) })
    if (branch) query.set("branch", branch)
    const [workflows, runs] = await Promise.all([
        githubRequest<{ total_count: number; workflows: Workflow[] }>(`${path}/actions/workflows?per_page=100`),
        githubRequest<{ workflow_runs: WorkflowRun[] }>(
            `${path}/actions${workflow ? `/workflows/${encodeURIComponent(workflow)}` : ""}/runs?${query}`,
        ),
    ])
    const allWorkflows = [...workflows.workflows]
    for (let index = 2; allWorkflows.length < workflows.total_count && index <= 100; index++) {
        const next = await githubRequest<{ workflows: Workflow[] }>(
            `${path}/actions/workflows?per_page=100&page=${index}`,
        )
        if (!next.workflows.length) break
        allWorkflows.push(...next.workflows)
    }
    return { workflows: allWorkflows, runs: runs.workflow_runs, hasNext: runs.workflow_runs.length === 50 }
}
export async function dispatchAndWatch(
    op: IEnvironmentOperation & { _id: unknown },
    signal: AbortSignal,
    reconcile = false,
) {
    signal.throwIfAborted()
    const path = repoPath(op.repo)
    if (!op.repoConfig.workflow) throw new DomainError(409, "Configure o workflow de CD")
    let runId = op.runId
    if (!runId) {
        // A marca é persistida ANTES do disparo: após reinício nunca dispara novamente automaticamente.
        const before = op.cdRequestedAt?.getTime() ?? Date.now()
        let expectedSha = op.expectedSha
        if (!op.cdDispatched) {
            if (reconcile)
                throw new DomainError(
                    409,
                    "Não há disparo de CD comprovado; nenhum workflow será iniciado na reconciliação",
                )
            const branch = await githubRequest<{ commit: { sha: string } }>(
                `${path}/branches/${encodeURIComponent(op.config.branch)}`,
            )
            expectedSha = branch.commit.sha
            await EnvironmentOperation.updateOne(
                { _id: op._id },
                { $set: { stage: "CD disparado", cdDispatched: true, cdRequestedAt: new Date(before), expectedSha } },
            )
            await githubRequest(`${path}/actions/workflows/${encodeURIComponent(op.repoConfig.workflow)}/dispatches`, {
                method: "POST",
                body: { ref: op.config.branch },
            })
        }
        for (let i = 0; i < 30 && !runId; i++) {
            await delay(2000, signal)
            const runs = await githubRequest<{ workflow_runs: WorkflowRun[] }>(
                `${path}/actions/workflows/${encodeURIComponent(op.repoConfig.workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(op.config.branch)}&per_page=30`,
            )
            const matches = runs.workflow_runs.filter(
                (r) =>
                    r.head_sha === expectedSha &&
                    Date.parse(r.created_at) >= before - 1000 &&
                    Date.parse(r.created_at) <= before + 300000,
            )
            if (matches.length > 1)
                throw new DomainError(
                    409,
                    "Há mais de um run possível para o disparo. Verifique o GitHub antes de continuar.",
                )
            if (matches[0]) {
                runId = matches[0].id
                await EnvironmentOperation.updateOne(
                    { _id: op._id },
                    { $set: { runId, runUrl: matches[0].html_url, stage: "Aguardando CD" } },
                )
            }
        }
        if (!runId)
            throw new DomainError(
                502,
                "O GitHub não retornou o run do CD. Não repita o disparo sem conferir o histórico.",
            )
    }
    while (!signal.aborted) {
        const run = await githubRequest<WorkflowRun>(`${path}/actions/runs/${runId}`)
        if (run.status === "completed") {
            if (run.conclusion !== "success" && !reconcile)
                throw new DomainError(409, `CD terminou sem sucesso: ${run.conclusion}`)
            return { runId: run.id, runUrl: run.html_url, sha: run.head_sha, conclusion: run.conclusion }
        }
        await delay(5000, signal)
    }
    throw new Error("Acompanhamento do CD interrompido")
}
export async function delay(ms: number, signal: AbortSignal) {
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer)
            reject(new Error("Operação interrompida"))
        }
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort)
            resolve()
        }, ms)
        signal.addEventListener("abort", abort, { once: true })
    })
}
