import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Acompanhamento do run do GitHub Actions da prévia remota (OPE-214): o servidor lê o run pela
 * integração GitHub (API mockada, sem rede) e escreve no log do build as etapas, o log dos jobs e o
 * trecho da falha; a saída do script depois da URL fica retida até o acompanhamento acabar.
 */

const gh = vi.hoisted(() => {
  class GithubError extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly status = 0,
    ) {
      super(message)
    }
  }
  return { GithubError, full: vi.fn(), text: vi.fn() }
})
vi.mock('@/features/github/client', () => ({ GithubError: gh.GithubError, githubRequestFull: gh.full, githubRequestText: gh.text }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { createRunFollower, followGithubRun } from '@/features/agentic/server/github-run-follow'

type Run = { status: string; conclusion: string | null }
type Job = { id: number; name: string; status: string; conclusion: string | null; steps: { name: string; number: number; status: string; conclusion: string | null }[] }

/** Cada consulta devolve o próximo estado (o último se repete). `seenAt[i]` = saída escrita antes do estado i. */
function scenario(states: { run: Run; jobs: Job[] }[]) {
  let index = -1
  const seenAt: string[] = []
  gh.full.mockImplementation(async (path: string) => {
    if (!path.includes('/jobs')) {
      index = Math.min(index + 1, states.length - 1)
      seenAt[index] ??= out
    }
    const state = states[Math.max(index, 0)]!
    return { data: path.includes('/jobs') ? { jobs: state.jobs } : state.run, notModified: false, etag: null, status: 200, next: null, rateRemaining: 5000 }
  })
  return seenAt
}

/** Log por etapa (`/jobs/{id}/steps/{n}/logs`) e do job inteiro (`/jobs/{id}/logs`), por caminho. */
function logs(byPath: Record<string, string | (() => string | null)>) {
  gh.text.mockImplementation(async (path: string) => {
    const entry = Object.entries(byPath).find(([suffix]) => path.endsWith(suffix))?.[1]
    const value = typeof entry === 'function' ? entry() : entry
    if (value === undefined || value === null) throw new gh.GithubError('Não encontrado', 'NOT_FOUND', 404)
    return value
  })
}

const step = (number: number, name: string, status: string, conclusion: string | null = null) => ({ number, name, status, conclusion })
const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '')

let out = ''
const write = (text: string) => {
  out += text
}

beforeEach(() => {
  vi.clearAllMocks()
  out = ''
})

describe('followGithubRun', () => {
  it('caminho feliz: fila → etapa → log da etapa antes da linha de fim → job concluído', async () => {
    scenario([
      { run: { status: 'queued', conclusion: null }, jobs: [] },
      { run: { status: 'in_progress', conclusion: null }, jobs: [{ id: 9, name: 'preview', status: 'in_progress', conclusion: null, steps: [step(1, 'Checkout', 'in_progress')] }] },
      { run: { status: 'completed', conclusion: 'success' }, jobs: [{ id: 9, name: 'preview', status: 'completed', conclusion: 'success', steps: [step(1, 'Checkout', 'completed', 'success')] }] },
    ])
    let calls = 0
    // O log da etapa pode demorar uma consulta para sair: 404 na primeira, texto na seguinte.
    logs({ '/jobs/9/steps/1/logs': () => (++calls === 1 ? null : '2026-11-27T22:15:01Z docker buildx build ok\n') })
    const result = await followGithubRun({ repo: 'org/app', runId: 42, signal: new AbortController().signal, write, pollMs: 0 })
    expect(result).toEqual({ followed: true, conclusion: 'success', failure: null })
    const text = strip(out)
    expect(text).toContain('aguardando um runner')
    const order = ['▶ Etapa 1/1 · Checkout', 'docker buildx build ok', '✔ Checkout', '✔ Job preview concluído', 'GitHub Actions concluído'].map((part) => text.indexOf(part))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(text.split('docker buildx build ok')).toHaveLength(2)
    expect(gh.full.mock.calls[0]![0]).toBe('/repos/org/app/actions/runs/42')
  })

  it('F1: com o log do job em 404 durante a execução, o log de uma etapa concluída aparece antes de o job terminar', async () => {
    const running = (steps: Job['steps']) => ({ run: { status: 'in_progress', conclusion: null }, jobs: [{ id: 3, name: 'preview', status: 'in_progress', conclusion: null, steps }] })
    const seenAt = scenario([
      running([step(1, 'Testes completos (antes do build)', 'completed', 'success'), step(2, 'Build e artefato', 'in_progress')]),
      running([step(1, 'Testes completos (antes do build)', 'completed', 'success'), step(2, 'Build e artefato', 'in_progress')]),
      { run: { status: 'completed', conclusion: 'success' }, jobs: [{ id: 3, name: 'preview', status: 'completed', conclusion: 'success', steps: [step(1, 'Testes completos (antes do build)', 'completed', 'success'), step(2, 'Build e artefato', 'completed', 'success')] }] },
    ])
    logs({ '/jobs/3/steps/1/logs': 'Test Files  152 passed\n', '/jobs/3/steps/2/logs': '#12 [build 5/9] RUN pnpm build\n' })
    await followGithubRun({ repo: 'org/app', runId: 1, signal: new AbortController().signal, write, pollMs: 0 })
    // Antes do estado concluído: a saída real da etapa de testes já está no log, e o início da etapa 2 vem depois dela.
    const before = strip(seenAt[2]!)
    expect(before).toContain('Test Files  152 passed')
    expect(before.indexOf('Test Files  152 passed')).toBeLessThan(before.indexOf('▶ Etapa 2/2 · Build e artefato'))
    expect(before).not.toContain('Job preview concluído')
    // O log do job inteiro não é consultado (as etapas já trouxeram tudo), e nada se repete.
    expect(gh.text.mock.calls.some(([path]) => String(path).endsWith('/jobs/3/logs'))).toBe(false)
    expect(strip(out).split('Test Files  152 passed')).toHaveLength(2)
    expect(strip(out)).toContain('RUN pnpm build')
  })

  it('sem log por etapa: avisa uma vez e usa o log do job inteiro quando o job termina', async () => {
    scenario([{ run: { status: 'completed', conclusion: 'success' }, jobs: [{ id: 4, name: 'preview', status: 'completed', conclusion: 'success', steps: [step(1, 'Testes', 'completed', 'success'), step(2, 'Build', 'completed', 'success')] }] }])
    logs({ '/jobs/4/logs': 'log completo do job\n' })
    await followGithubRun({ repo: 'org/app', runId: 1, signal: new AbortController().signal, write, pollMs: 0 })
    const text = strip(out)
    expect(text.split('o log desta etapa não ficou disponível')).toHaveLength(2)
    expect(text).toContain('✔ Build')
    expect(text.indexOf('log completo do job')).toBeLessThan(text.indexOf('✔ Job preview concluído'))
  })

  it('F2: run concluído com a lista de jobs ainda vazia continua consultando até os jobs aparecerem', async () => {
    const done = { run: { status: 'completed', conclusion: 'failure' }, jobs: [] as Job[] }
    scenario([done, done, { ...done, jobs: [{ id: 6, name: 'preview', status: 'completed', conclusion: 'failure', steps: [step(1, 'Testes', 'completed', 'failure')] }] }])
    logs({ '/jobs/6/steps/1/logs': '##[error]Process completed with exit code 1.\n' })
    const result = await followGithubRun({ repo: 'org/app', runId: 1, signal: new AbortController().signal, write, pollMs: 0 })
    expect(result.failure).toContain('etapa 1 "Testes"')
    expect(strip(out)).toContain('Process completed with exit code 1.')
    expect(strip(out)).not.toContain('GitHub Actions concluído')
  })

  it('F2: run concluído que nunca lista jobs encerra com aviso depois de algumas consultas', async () => {
    scenario([{ run: { status: 'completed', conclusion: 'success' }, jobs: [] }])
    const result = await followGithubRun({ repo: 'org/app', runId: 1, signal: new AbortController().signal, write, pollMs: 0 })
    expect(result.followed).toBe(true)
    expect(gh.full.mock.calls.length).toBeGreaterThan(2)
    expect(strip(out)).toContain('o GitHub não listou nenhum job deste run')
  })

  it('run com falha: bloco com o job, a etapa e o trecho do log', async () => {
    scenario([{ run: { status: 'completed', conclusion: 'failure' }, jobs: [{ id: 5, name: 'preview', status: 'completed', conclusion: 'failure', steps: [step(1, 'Testes completos (antes do build)', 'completed', 'failure')] }] }])
    logs({ '/jobs/5/steps/1/logs': '2026-11-27T22:15:01Z FAIL soma.test.ts\n2026-11-27T22:15:02Z ##[error]Process completed with exit code 1.\n' })
    const result = await followGithubRun({ repo: 'org/app', runId: 1, signal: new AbortController().signal, write, pollMs: 0 })
    expect(result.conclusion).toBe('failure')
    expect(result.failure).toContain('etapa 1 "Testes completos (antes do build)"')
    expect(result.failure).toContain('FAIL soma.test.ts')
    expect(strip(out)).toContain('✖ GitHub Actions falhou')
    expect(strip(out)).toContain('Process completed with exit code 1.')
  })

  it('token sem acesso (403): linha de aviso no log e termina sem lançar', async () => {
    gh.full.mockRejectedValue(new gh.GithubError('O GitHub negou o acesso (confira as permissões do token)', 'FORBIDDEN', 403))
    const result = await followGithubRun({ repo: 'org/app', runId: 1, signal: new AbortController().signal, write, pollMs: 0 })
    expect(result.followed).toBe(false)
    expect(strip(out)).toContain('Não foi possível acompanhar o GitHub Actions pela integração GitHub: O GitHub negou o acesso')
  })

  it('falhas de rede seguidas: desiste com aviso depois de algumas tentativas', async () => {
    gh.full.mockRejectedValue(new gh.GithubError('Não foi possível conectar ao GitHub', 'UNAVAILABLE'))
    const result = await followGithubRun({ repo: 'org/app', runId: 1, signal: new AbortController().signal, write, pollMs: 0 })
    expect(result.followed).toBe(false)
    expect(gh.full.mock.calls.length).toBeGreaterThan(1)
    expect(strip(out)).toContain('Não foi possível conectar ao GitHub')
  })

  it('interrupção encerra o acompanhamento', async () => {
    scenario([{ run: { status: 'in_progress', conclusion: null }, jobs: [] }])
    const controller = new AbortController()
    const done = followGithubRun({ repo: 'org/app', runId: 1, signal: controller.signal, write, pollMs: 60_000 })
    await vi.waitFor(() => expect(gh.full).toHaveBeenCalled())
    controller.abort()
    expect(await done).toEqual({ followed: false, conclusion: null, failure: null })
  })
})

describe('createRunFollower', () => {
  it('passa a saída até a URL, retém o resto até o fim do run e devolve o trecho da falha', async () => {
    scenario([{ run: { status: 'completed', conclusion: 'failure' }, jobs: [{ id: 5, name: 'preview', status: 'completed', conclusion: 'failure', steps: [step(1, 'Build', 'completed', 'failure')] }] }])
    gh.text.mockResolvedValue('##[error]docker build falhou\n')
    const follower = createRunFollower({ repo: 'Org/App', signal: new AbortController().signal, write, pollMs: 0 })
    follower.output('remote: Create a pull request\nPrévia GitHub: https://github.com/org/app/')
    follower.output('actions/runs/42\n[preview] Testes/build remoto falharam (failure)\n')
    const failure = await follower.finish()
    const text = strip(out)
    expect(text.indexOf('actions/runs/42')).toBeLessThan(text.indexOf('docker build falhou'))
    expect(text.indexOf('GitHub Actions falhou')).toBeLessThan(text.indexOf('[preview] Testes/build remoto falharam'))
    expect(failure).toContain('docker build falhou')
  })

  it('abort: libera a saída retida na hora e o acompanhamento para de consultar e de escrever', async () => {
    scenario([{ run: { status: 'in_progress', conclusion: null }, jobs: [] }])
    const follower = createRunFollower({ repo: 'org/app', signal: new AbortController().signal, write, pollMs: 60_000 })
    follower.output('Prévia GitHub: https://github.com/org/app/actions/runs/7\nretido\n')
    await vi.waitFor(() => expect(gh.full).toHaveBeenCalled())
    const calls = gh.full.mock.calls.length
    follower.abort()
    expect(strip(out)).toContain('retido')
    const after = out
    expect(await follower.finish()).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(gh.full.mock.calls.length).toBe(calls)
    expect(out).toBe(after)
  })

  it('URL de outro repositório não liga o acompanhamento', async () => {
    const follower = createRunFollower({ repo: 'org/app', signal: new AbortController().signal, write, pollMs: 0 })
    follower.output('Prévia GitHub: https://github.com/outro/repo/actions/runs/1\nfim\n')
    expect(await follower.finish()).toBeNull()
    expect(gh.full).not.toHaveBeenCalled()
    expect(out).toBe('Prévia GitHub: https://github.com/outro/repo/actions/runs/1\nfim\n')
  })

  it('acompanhamento que não termina a tempo: aviso e libera a saída retida', async () => {
    scenario([{ run: { status: 'in_progress', conclusion: null }, jobs: [] }])
    const follower = createRunFollower({ repo: 'org/app', signal: new AbortController().signal, write, pollMs: 60_000, finishTimeoutMs: 10 })
    follower.output('Prévia GitHub: https://github.com/org/app/actions/runs/7\ndepois\n')
    expect(await follower.finish()).toBeNull()
    const text = strip(out)
    expect(text).toContain('não terminou a tempo')
    expect(text.indexOf('não terminou a tempo')).toBeLessThan(text.indexOf('depois'))
  })
})
