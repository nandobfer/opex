import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_UNIVERSE_LAYOUT } from '@engramind/client'

/**
 * OPE-142: layout dos universos de memórias. Sem configuração gravada vale o padrão da lib (anéis); gravar valida
 * com o schema da lib (modo restritivo, nada é gravado quando inválido), audita, publica o evento só nas telas
 * (sem SSE) e restaurar volta ao padrão.
 */

const mocks = vi.hoisted(() => ({
  state: null as null | { universeLayout?: { config: Record<string, unknown>; updatedAt: Date } | null },
  updates: [] as unknown[],
  audits: [] as { id: string; acao: string; depois?: Record<string, unknown>; antes?: Record<string, unknown> }[],
  published: [] as { payload: unknown; options: unknown }[],
  warn: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@/features/engramind/server/models', () => ({
  ENGRAMIND_STATE_ID: 'engramind',
  engramindDb: async () => {},
  EngramindState: {
    findById: () => ({ select: () => ({ lean: async () => mocks.state }) }),
    updateOne: async (_filter: unknown, update: { $set: { universeLayout: { config: Record<string, unknown>; updatedAt: Date } | null } }) => {
      mocks.updates.push(update.$set)
      mocks.state = { universeLayout: update.$set.universeLayout }
    },
  },
}))
vi.mock('@/features/engramind/server/shared', () => ({
  AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR' },
  auditEngramind: async (_actor: string, id: string, acao: string, depois?: Record<string, unknown>, antes?: Record<string, unknown>) => {
    mocks.audits.push({ id, acao, depois, antes })
  },
  engramindLog: { info: mocks.info, warn: mocks.warn },
  publishEngramind: async (payload: unknown, options?: unknown) => {
    mocks.published.push({ payload, options })
  },
}))

import { getUniverseLayout, resetUniverseLayout, saveUniverseLayout } from '@/features/engramind/server/universe-layout'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = null
  mocks.updates = []
  mocks.audits = []
  mocks.published = []
})

describe('layout dos universos (serviço)', () => {
  it('sem configuração gravada: o padrão da lib (anéis concêntricos, mais novas por dentro)', async () => {
    const layout = await getUniverseLayout()
    expect(layout).toEqual({ config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null })
    expect(layout.config).toMatchObject({ layout: 'rings', firstRadius: 150, ringGap: 58, slot: 46, order: 'newest-inside', angleJitter: 0 })
  })

  it('grava a configuração completa, audita (antes e depois) e avisa só as telas (sem SSE)', async () => {
    const result = await saveUniverseLayout({ layout: 'spiral', spiralSpacing: 60 }, 'local')
    expect(result.isDefault).toBe(false)
    expect(result.config).toEqual({ ...DEFAULT_UNIVERSE_LAYOUT, layout: 'spiral', spiralSpacing: 60 })
    expect(mocks.updates).toHaveLength(1)
    expect(mocks.audits[0]).toMatchObject({ id: 'universe-layout', acao: 'ATUALIZAR', depois: { layout: 'spiral', spiralSpacing: 60 }, antes: { layout: 'rings' } })
    expect(mocks.published).toEqual([{ payload: { type: 'universe-layout' }, options: { live: false } }])
    expect((await getUniverseLayout()).config.layout).toBe('spiral')
  })

  it('valor fora do intervalo ou campo desconhecido: recusa com 400 e as mensagens por campo, sem gravar nada', async () => {
    await expect(saveUniverseLayout({ ringGap: 5, cor: 'azul' }, 'local')).rejects.toMatchObject({ status: 400, code: 'UNIVERSE_LAYOUT_INVALID', message: expect.stringContaining('Distância entre anéis: o mínimo é 16 px') })
    await expect(saveUniverseLayout({ particleMinPx: 40, particleMaxPx: 20 }, 'local')).rejects.toMatchObject({ status: 400 })
    expect(mocks.updates).toEqual([])
    expect(mocks.audits).toEqual([])
    expect(mocks.published).toEqual([])
  })

  it('restaurar apaga a configuração, volta ao padrão e avisa as telas', async () => {
    await saveUniverseLayout({ ringGap: 84 }, 'local')
    mocks.published = []
    const result = await resetUniverseLayout('local')
    expect(result).toEqual({ config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null })
    expect(mocks.updates.at(-1)).toEqual({ universeLayout: null })
    expect(mocks.audits.at(-1)).toMatchObject({ antes: { ringGap: 84 }, depois: { ringGap: 58 } })
    expect(mocks.published).toEqual([{ payload: { type: 'universe-layout' }, options: { live: false } }])
    expect((await getUniverseLayout()).isDefault).toBe(true)
  })

  it('configuração gravada que ficou inválida cai no padrão, com aviso no log', async () => {
    mocks.state = { universeLayout: { config: { ringGap: 9999 }, updatedAt: new Date() } }
    const layout = await getUniverseLayout()
    expect(layout.isDefault).toBe(true)
    expect(layout.config).toEqual(DEFAULT_UNIVERSE_LAYOUT)
    expect(mocks.warn).toHaveBeenCalled()
  })
})
