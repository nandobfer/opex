import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rotina `opencode-sessions-cleanup` (OPE-106): exclui do OpenCode as sessões sem interação há X dias,
 * nunca as vinculadas ao Opex (mesa, fork, refinamento, revisão de PR, Adversário, Maddox) nem as em
 * execução. OpenCode sempre falso; banco em memória.
 */

const store = vi.hoisted(() => ({ models: {} as Record<string, ReturnType<typeof import('../../helpers/memory-model').memoryModel>> }))
const oc = vi.hoisted(() => ({
  sessions: [] as { id: string; parentID?: string; time: { created: number; updated: number } }[],
  projects: [] as { id: string }[],
  active: {} as Record<string, { type: 'running' }>,
  removed: [] as string[],
  failOn: new Set<string>(),
  listCalls: [] as Record<string, unknown>[],
  unavailable: false,
}))

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
        list: async (input: { limit: number; cursor?: string; project?: string }) => {
          oc.listCalls.push(input)
          const pool = input.project ? oc.sessions.filter((s) => s.id.startsWith(`${input.project}:`)) : oc.sessions.filter((s) => !s.id.includes(':'))
          const start = input.cursor ? Number(input.cursor) : 0
          const data = pool.slice(start, start + 2)
          return { data, cursor: { next: start + 2 < pool.length ? String(start + 2) : null } }
        },
        active: async () => oc.active,
        remove: async ({ sessionID }: { sessionID: string }) => {
          if (oc.failOn.has(sessionID)) throw new Error('falhou')
          oc.removed.push(sessionID)
        },
      },
      project: { list: async () => oc.projects },
    }
  },
}))

import { cleanupIdleOpencodeSessions, describeOpencodeSessionCleanup, planOpencodeSessionCleanup } from '@/features/opencode-service/server/session-retention'

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
})

describe('cleanupIdleOpencodeSessions', () => {
  it('exclui a sessão parada há mais de X dias e mantém a recente, percorrendo todas as páginas', async () => {
    oc.sessions = [ses('a', 40), ses('b', 5), ses('c', 31), ses('d', 60), ses('e', 1)]
    const result = await cleanupIdleOpencodeSessions(30, NOW)
    expect(oc.removed.sort()).toEqual(['a', 'c', 'd'])
    expect(result).toEqual({ scanned: 5, deleted: 3, protected: 0, failed: 0 })
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
})
