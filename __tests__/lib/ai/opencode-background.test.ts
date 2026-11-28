import { describe, expect, it, vi } from 'vitest'
import { cancelBackgroundWork, hasBackgroundWork, sessionBackgroundWork } from '@/lib/ai/opencode-background'
import { probeAttachSession } from '@/lib/ai/opencode-run'
import type { OpencodeClient } from '@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client'

/** Pendências da sessão do OpenCode (OPE-216): jobs em segundo plano, subagentes e caixa de entrada. */

vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/consumption', () => ({ recordAiConsumption: vi.fn(async () => {}) }))

function client(parts: { jobs?: unknown[] | Error; children?: string[]; tree?: Record<string, string[]>; active?: Record<string, unknown>; inbox?: unknown[] | Error; info?: unknown }) {
  const reject = (value: unknown) => (value instanceof Error ? Promise.reject(value) : Promise.resolve(value))
  return {
    session: {
      get: vi.fn(async () => parts.info ?? { id: 's1', time: { idle: 1 }, outcome: 'succeeded' }),
      active: vi.fn(async () => parts.active ?? {}),
      // Árvore de subsessões por `parentID` (sem `tree`, `children` são os filhos de s1).
      list: vi.fn(async ({ parentID }: { parentID: string }) => ({ data: ((parts.tree ?? { s1: parts.children ?? [] })[parentID] ?? []).map((id) => ({ id })) })),
      interrupt: vi.fn(async () => ({ interrupted: true })),
      inbox: { list: vi.fn(async () => reject(parts.inbox ?? [])) },
    },
    ...(parts.jobs === undefined ? {} : { experimental: { job: { list: vi.fn(async () => reject(parts.jobs)), cancel: vi.fn(async () => undefined) } } }),
  } as unknown as OpencodeClient & { session: { interrupt: ReturnType<typeof vi.fn> }; experimental: { job: { cancel: ReturnType<typeof vi.fn> } } }
}

describe('sessionBackgroundWork', () => {
  it('conta os jobs rodando por tipo e a caixa de entrada', async () => {
    const work = await sessionBackgroundWork(client({ jobs: [{ id: 'a', kind: 'subagent' }, { id: 'b', kind: 'subagent' }, { id: 'c', kind: 'shell' }, { id: 'd', kind: 'image' }], inbox: [{}] }), 's1')
    expect(work).toEqual({ subagents: 2, shells: 1, other: 1, inbox: 1, ok: true })
    expect(hasBackgroundWork(work)).toBe(true)
  })

  it('F3: lista os jobs dos descendentes (o neto que ainda roda conta)', async () => {
    const fake = client({ jobs: [{ id: 'neto', kind: 'subagent', sessionID: 'filho' }] })
    const work = await sessionBackgroundWork(fake, 's1')
    expect(work.subagents).toBe(1)
    const list = (fake as unknown as { experimental: { job: { list: ReturnType<typeof vi.fn> } } }).experimental.job.list
    expect(list).toHaveBeenCalledWith({ sessionID: 's1', status: 'running', descendants: true }, expect.anything())
  })

  it('F3: sem a API de jobs, desce pela árvore e conta o neto ativo sob um filho ocioso', async () => {
    const work = await sessionBackgroundWork(client({ tree: { s1: ['filho'], filho: ['neto'] }, active: { neto: { type: 'running' } } }), 's1')
    expect(work.subagents).toBe(1)
  })

  it('sem a API de jobs, conta só os subagentes filhos que est\u00e3o ativos', async () => {
    const work = await sessionBackgroundWork(client({ children: ['c1', 'c2', 'c3'], active: { c1: { type: 'running' }, c3: { type: 'running' } } }), 's1')
    expect(work).toMatchObject({ subagents: 2, shells: 0, ok: true })
  })

  it('nenhuma leitura respondeu: ok false (sem pend\u00eancia)', async () => {
    const broken = client({ jobs: new Error('x'), inbox: new Error('x') })
    ;(broken.session as unknown as { list: unknown }).list = vi.fn(async () => Promise.reject(new Error('x')))
    const work = await sessionBackgroundWork(broken, 's1')
    expect(work.ok).toBe(false)
    expect(hasBackgroundWork(work)).toBe(false)
  })
})

describe('cancelBackgroundWork', () => {
  it('cancela cada job rodando da sess\u00e3o', async () => {
    const fake = client({ jobs: [{ id: 'a', kind: 'subagent' }, { id: 'b', kind: 'shell' }] })
    expect(await cancelBackgroundWork(fake, 's1')).toBe(2)
    expect(fake.experimental.job.cancel.mock.calls.map(([input]) => input)).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('sem a API de jobs, interrompe os subagentes ativos', async () => {
    const fake = client({ children: ['c1'], active: { c1: { type: 'running' } } })
    expect(await cancelBackgroundWork(fake, 's1')).toBe(1)
    expect(fake.session.interrupt).toHaveBeenCalledWith({ sessionID: 'c1' }, expect.anything())
  })
})

describe('probeAttachSession com trabalho em segundo plano', () => {
  it('sess\u00e3o parada aguardando subagentes conta como em andamento (h\u00e1 o que acompanhar)', async () => {
    const probe = await probeAttachSession(client({ jobs: [{ id: 'a', kind: 'subagent' }] }), 's1', 0)
    expect(probe).toMatchObject({ kind: 'running', background: { subagents: 1 } })
  })

  it('sess\u00e3o parada e quieta segue como terminada', async () => {
    const probe = await probeAttachSession(client({ jobs: [] }), 's1', 0)
    expect(probe).toMatchObject({ kind: 'finished', outcome: 'succeeded' })
  })
})
