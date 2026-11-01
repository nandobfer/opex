import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rotina `opencode-sessions-cleanup` (OPE-106): exclui do OpenCode as sessões sem interação há X dias,
 * nunca as vinculadas ao Opex (mesa, fork, refinamento, revisão de PR, Adversário, Maddox) nem as em
 * execução. OpenCode sempre falso; banco em memória.
 */

const pageSize = vi.hoisted(() => ({ value: 2 }))
const store = vi.hoisted(() => ({ models: {} as Record<string, ReturnType<typeof import('../../helpers/memory-model').memoryModel>> }))
const oc = vi.hoisted(() => ({
  sessions: [] as { id: string; parentID?: string; time: { created: number; updated: number } }[],
  projects: [] as { id: string }[],
  active: {} as Record<string, { type: 'running' }>,
  removed: [] as string[],
  failOn: new Set<string>(),
  listCalls: [] as Record<string, unknown>[],
  unavailable: false,
  hang: null as null | 'list' | 'active' | 'project',
}))

/** Promessa que só termina quando o `signal` aborta (servidor que aceita a conexão e não responde). */
const hanging = (signal?: AbortSignal) =>
  new Promise<never>((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('abortado')), { once: true }))

vi.mock('@/lib/db', () => ({ dbConnect: async () => {} }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel: m } = await import('../../helpers/memory-model')
  store.models.workbench = m()
  store.models.fork = m()
  return { AgenticWorkbench: store.models.workbench, AgenticFork: store.models.fork }
})
vi.mock('@/lib/db/models/Refinement', async () => {
  const { memoryModel: m } = await import('../../helpers/memory-model')
  store.models.refinement = m()
  return { TaskRefinement: store.models.refinement }
})
vi.mock('@/lib/db/models/PrReview', async () => {
  const { memoryModel: m } = await import('../../helpers/memory-model')
  store.models.prReview = m()
  return { PrReview: store.models.prReview }
})
vi.mock('@/lib/db/models/Opex', async () => {
  const { memoryModel: m } = await import('../../helpers/memory-model')
  store.models.opex = m()
  return { OpexSession: store.models.opex }
})
vi.mock('@/features/adversarial-agent/server/models', async () => {
  const { memoryModel: m } = await import('../../helpers/memory-model')
  store.models.adversarial = m()
  return { AdversarialReview: store.models.adversarial, adversarialDb: async () => {} }
})
vi.mock('@opencode/client', () => ({ isSessionNotFoundError: (error: unknown) => (error as { notFound?: boolean })?.notFound === true }))
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => {
    if (oc.unavailable) throw new Error('sem conexão')
    return {
      session: {
        list: async (input: { limit: number; cursor?: string; project?: string; parentID?: string; order?: string }, options?: { signal?: AbortSignal }) => {
          oc.listCalls.push(input)
          if (oc.hang === 'list') return hanging(options?.signal)
          if (input.parentID) return { data: oc.sessions.filter((s) => s.parentID === input.parentID), cursor: { next: null } }
          const pool = input.project ? oc.sessions.filter((s) => s.id.startsWith(`${input.project}:`)) : oc.sessions.filter((s) => !s.id.includes(':'))
          const size = Math.min(input.limit, pageSize.value)
          const start = input.cursor ? Number(input.cursor) : 0
          const data = pool.slice(start, start + size)
          return { data, cursor: { next: start + size < pool.length ? String(start + size) : null } }
        },
        active: async (options?: { signal?: AbortSignal }) => (oc.hang === 'active' ? hanging(options?.signal) : oc.active),
        remove: async ({ sessionID }: { sessionID: string }) => {
          if (oc.failOn.has(sessionID)) throw new Error('falhou')
          oc.removed.push(sessionID)
        },
      },
      project: { list: async (options?: { signal?: AbortSignal }) => (oc.hang === 'project' ? hanging(options?.signal) : oc.projects) },
    }
  },
}))

import { OPENCODE_SESSION_SCAN_LIMIT, cleanupIdleOpencodeSessions, describeOpencodeSessionCleanup, planOpencodeSessionCleanup } from '@/features/opencode-service/server/session-retention'

const NOW = new Date('2026-11-01T12:00:00Z')
const daysAgo = (days: number) => NOW.getTime() - days * 86_400_000
const ses = (id: string, days: number, parentID?: string) => ({ id, ...(parentID ? { parentID } : {}), time: { created: daysAgo(days + 1), updated: daysAgo(days) } })

beforeEach(() => {
  for (const model of Object.values(store.models)) model.docs.splice(0)
  oc.sessions = []
  oc.projects = []
  oc.active = {}
  oc.removed = []
  oc.failOn = new Set()
  oc.listCalls = []
  oc.unavailable = false
  oc.hang = null
  pageSize.value = 2
})

describe('cleanupIdleOpencodeSessions', () => {
  it('exclui a sessão parada há mais de X dias e mantém a recente, percorrendo todas as páginas', async () => {
    oc.sessions = [ses('a', 40), ses('b', 5), ses('c', 31), ses('d', 60), ses('e', 1)]
    const result = await cleanupIdleOpencodeSessions(30, NOW)
    expect(oc.removed.sort()).toEqual(['a', 'c', 'd'])
    expect(result).toEqual({ scanned: 5, deleted: 3, protected: 0, failed: 0, truncated: false, outOfTime: false })
    // Mais antigas primeiro: o teto de leitura nunca corta justamente as candidatas.
    expect(oc.listCalls.every((call) => call.order === 'asc')).toBe(true)
    expect(oc.listCalls.length).toBeGreaterThan(1)
    expect(describeOpencodeSessionCleanup(result)).toBe('3 sessão(ões) do OpenCode excluída(s) — 5 lida(s)')
  })

  it('nunca exclui sessão vinculada a mesa, fork, refinamento, skill, revisão de PR, Adversário ou Maddox (arquivada inclusive)', async () => {
    oc.sessions = ['wb', 'fork', 'ref', 'skill', 'pr', 'adv', 'maddox', 'livre'].map((id) => ses(id, 90))
    await store.models.workbench!.create({ sessionId: 'wb' })
    await store.models.workbench!.create({ sessionId: null })
    await store.models.fork!.create({ sessionId: 'fork' })
    await store.models.refinement!.create({ sessionId: 'ref', activeSkill: null })
    await store.models.refinement!.create({ sessionId: null, activeSkill: { sessionId: 'skill', skillId: 's' } })
    await store.models.prReview!.create({ sessionId: 'pr' })
    await store.models.adversarial!.create({ sessionId: 'adv' })
    await store.models.opex!.create({ agent: 'maddox', archived: true, opencodeSessionId: 'maddox' })

    const result = await cleanupIdleOpencodeSessions(30, NOW)

    expect(oc.removed).toEqual(['livre'])
    expect(result.protected).toBe(7)
  })

  it('nunca exclui sessão em execução nem a árvore de uma sessão protegida (pai ou filha)', async () => {
    oc.sessions = [ses('run', 90), ses('pai', 90), ses('filha', 90, 'pai'), ses('raiz', 90), ses('sub', 90, 'raiz'), ses('solta', 90)]
    oc.active = { run: { type: 'running' }, sub: { type: 'running' } }
    await store.models.workbench!.create({ sessionId: 'pai' })
    await cleanupIdleOpencodeSessions(30, NOW)
    expect(oc.removed).toEqual(['solta'])
  })

  it('árvore com subsessão recente não sai; árvore toda parada sai pela raiz', async () => {
    const plan = planOpencodeSessionCleanup([ses('r1', 90), ses('f1', 2, 'r1'), ses('r2', 90), ses('f2', 60, 'r2')], new Set(), daysAgo(30))
    expect(plan.roots).toEqual(['r2'])
  })

  it('também percorre as sessões de cada projeto, sem duplicar', async () => {
    oc.sessions = [ses('a', 40), ses('p1:x', 40), ses('p1:y', 2)]
    oc.projects = [{ id: 'p1' }]
    await cleanupIdleOpencodeSessions(30, NOW)
    expect(oc.removed.sort()).toEqual(['a', 'p1:x'])
  })

  it('falha numa exclusão não interrompe as demais; OpenCode indisponível vira erro claro', async () => {
    oc.sessions = [ses('a', 40), ses('b', 40)]
    oc.failOn = new Set(['a'])
    const result = await cleanupIdleOpencodeSessions(30, NOW)
    expect(result).toMatchObject({ deleted: 1, failed: 1 })
    expect(oc.removed).toEqual(['b'])

    oc.unavailable = true
    await expect(cleanupIdleOpencodeSessions(30, NOW)).rejects.toThrow('OpenCode indisponível para limpar as sessões')
  })

  it('regressão F1: OpenCode que não responde à listagem não trava a rotina (erro pelo prazo da leitura)', async () => {
    oc.sessions = [ses('a', 40)]
    oc.hang = 'list'
    await expect(cleanupIdleOpencodeSessions(30, NOW, { requestTimeoutMs: 20 })).rejects.toThrow('Não foi possível listar as sessões do OpenCode')
    oc.hang = 'active'
    await expect(cleanupIdleOpencodeSessions(30, NOW, { requestTimeoutMs: 20 })).rejects.toThrow('Não foi possível listar as sessões do OpenCode')
    // `project.list` pendurado: segue só com a listagem padrão.
    oc.hang = 'project'
    expect(await cleanupIdleOpencodeSessions(30, NOW, { requestTimeoutMs: 20 })).toMatchObject({ deleted: 1 })
    expect(oc.removed).toEqual(['a'])
  })

  it('regressão F1: orçamento de tempo esgotado para as exclusões e avisa no resumo', async () => {
    oc.sessions = [ses('a', 40), ses('b', 40)]
    const result = await cleanupIdleOpencodeSessions(30, NOW, { budgetMs: 0 })
    expect(result).toMatchObject({ deleted: 0, outOfTime: true })
    expect(oc.removed).toEqual([])
    expect(describeOpencodeSessionCleanup(result)).toMatch(/tempo esgotado/)
  })

  it('regressão F2: leitura no teto avisa no resumo e confere as subsessões que ficaram de fora antes de excluir a raiz', async () => {
    pageSize.value = 500
    const old = Array.from({ length: OPENCODE_SESSION_SCAN_LIMIT - 1 }, (_, i) => ses(`s${i}`, 60))
    // Raiz mais antiga dentro da leitura; a subsessão recente dela fica além do teto.
    oc.sessions = [ses('raiz', 90), ...old, ses('filha', 1, 'raiz')]
    const result = await cleanupIdleOpencodeSessions(30, NOW)
    expect(result.truncated).toBe(true)
    expect(result.scanned).toBe(OPENCODE_SESSION_SCAN_LIMIT)
    expect(oc.removed).not.toContain('raiz')
    expect(oc.removed.length).toBe(199)
    expect(describeOpencodeSessionCleanup(result)).toMatch(/teto de 5000 atingido/)
  })
})
