import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Nome do agente rotineiro no Engramind (OPE-170): nasce "Agente <nome>" (sem duplicar o prefixo, até
 * 120 caracteres) e o reprovisionamento de um agente que já existe não o renomeia.
 */

const holder = vi.hoisted(() => ({
  exists: false,
  calls: [] as { method: string; path: string; body?: Record<string, unknown> }[],
}))

vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: async (method: string, request: { path: string; body?: Record<string, unknown> }) => {
    holder.calls.push({ method, path: request.path, body: request.body })
    if (method === 'GET') {
      if (holder.exists) return { slug: 'rotineiro-x' }
      throw Object.assign(new Error('não encontrado'), { code: 'AGENT_NOT_FOUND' })
    }
    return { created: true }
  },
  engramindTarget: async () => ({ baseUrl: 'http://engramind', token: 'admin-token' }),
}))
vi.mock('@/features/engramind/server/errors', () => ({ engramindCodeOf: (error: unknown) => (error as { code?: string }).code ?? null }))

import { ensureRoutineEngramindAgent } from '@/features/routine-agents/server/engramind'

const target = { baseUrl: 'http://engramind', token: 'app-token' }
const posted = () => holder.calls.filter((call) => call.method === 'POST' && call.path === '/v1/agents').map((call) => call.body)

beforeEach(() => {
  holder.exists = false
  holder.calls = []
})

describe('nome do agente rotineiro no Engramind', () => {
  it('cadastra com "Agente <nome>", sem mudar app, slug nem descrição', async () => {
    await expect(ensureRoutineEngramindAgent('curador', 'Curador', 'Cuidar do acervo', target)).resolves.toBe('created')
    expect(posted()).toEqual([{ app: 'opex', slug: 'rotineiro-curador', name: 'Agente Curador', description: 'Cuidar do acervo' }])
  })

  it('não duplica o prefixo quando o nome já começa com "Agente "', async () => {
    await ensureRoutineEngramindAgent('curador', 'Agente Curador', '', target)
    expect(posted()[0]?.name).toBe('Agente Curador')
  })

  it('respeita o limite de 120 caracteres', async () => {
    await ensureRoutineEngramindAgent('longo', 'X'.repeat(200), '', target)
    const name = String(posted()[0]?.name)
    expect(name).toHaveLength(120)
    expect(name.startsWith('Agente X')).toBe(true)
  })

  it('reprovisionar um agente que já existe não o renomeia', async () => {
    holder.exists = true
    await expect(ensureRoutineEngramindAgent('curador', 'Curador', '', target)).resolves.toBe('exists')
    expect(posted()).toEqual([])
  })
})
