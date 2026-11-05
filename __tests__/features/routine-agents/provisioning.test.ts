import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEngramind, type FakeEngramind } from '../../helpers/fake-engramind'
import { createFakeCollection, type FakeCollection } from '../../helpers/fake-collection'

/**
 * Subagente de provisionamento (OPE-130): agente `opex/rotineiro-<slug>` no Engramind, token cifrado no
 * documento, canais base e extras decididos pelo modelo — idempotente ("Tentar de novo" não duplica) e
 * "Reprovisionar" só acrescenta.
 */

const holder = vi.hoisted(() => ({
  fake: null as unknown as FakeEngramind,
  agents: null as unknown as FakeCollection,
  settings: null as unknown as FakeCollection,
  planner: '{"subscribe":[],"create":[]}',
  plannerCalls: 0,
  failTokens: false,
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: async () => undefined, AcaoAuditoria: { EXECUTAR: 'EXECUTAR', ATUALIZAR: 'ATUALIZAR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async () => undefined }))
vi.mock('@/lib/db/models/RoutineAgent', () => ({
  get RoutineAgent() {
    return holder.agents
  },
  get RoutineAgentSettings() {
    return holder.settings
  },
}))
vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: async (...args: Parameters<FakeEngramind['engramindCall']>) => {
    if (holder.failTokens && args[0] === 'POST' && args[1].path === '/v1/tokens') throw new Error('Engramind recusou o token')
    return holder.fake.engramindCall(...args)
  },
  engramindTarget: async () => ({ baseUrl: 'http://engramind', token: 'admin-token' }),
}))
vi.mock('@/features/engramind/server/shared', () => ({ AcaoAuditoria: { EXECUTAR: 'EXECUTAR' }, auditEngramind: async () => undefined, engramindLog: { warn: () => undefined, info: () => undefined } }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => ({}) }))
vi.mock('@/features/engramind/server/memory-network', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/engramind/server/memory-network')>()
  return { ...original, ensureAppToken: async () => null }
})
vi.mock('@/lib/ai/stream', () => ({
  streamAi: async function* () {
    holder.plannerCalls++
    yield { type: 'delta', text: holder.planner }
  },
}))

import { provisionRoutineAgent } from '@/features/routine-agents/server/provisioning'
import { decryptRoutineToken } from '@/features/routine-agents/server/engramind'

const calls = (method: string, path: string) => holder.fake.state.calls.filter((call) => call.method === method && call.path === path)
const agentDoc = () => holder.agents.docs[0]!

beforeEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64')
  holder.fake = createFakeEngramind()
  holder.fake.state.channels.set('opex', { slug: 'opex', archived_at: null })
  holder.fake.state.channels.set('vagas/empresa-x', { slug: 'vagas/empresa-x', archived_at: null })
  holder.agents = createFakeCollection()
  holder.settings = createFakeCollection()
  holder.settings.insert({ _id: 'default', provider: 'anthropic', model: 'claude', variant: null, agent: null })
  holder.planner = '{"subscribe":[{"channel":"vagas/empresa-x","reason":"vagas da empresa"}],"create":[{"slug":"curriculos/backend","name":"Currículos","reason":"modelos de currículo"}]}'
  holder.plannerCalls = 0
  holder.failTokens = false
  holder.agents.insert({ name: 'Vagas', slug: 'vagas', objective: 'Candidatar-se', instructions: '', engine: 'opex', status: 'active', provisioning: { status: 'pending', steps: { agent: false, token: false, channels: false, extras: false, workdir: false }, channels: [], extras: [], warnings: [] }, engramindToken: null })
})

describe('provisionamento do agente rotineiro', () => {
  it('cadastra o agente, guarda o token cifrado, cria o canal próprio, assina os base e os extras do subagente', async () => {
    await provisionRoutineAgent(String(agentDoc()._id), 'create', 'local')
    const doc = agentDoc() as { provisioning: { status: string; extras: { channel: string; created: boolean; reason: string }[]; channels: string[] }; engramindToken: { prefix: string; secret: unknown } }
    expect(doc.provisioning.status).toBe('ok')
    expect(holder.fake.state.agents.has('opex/rotineiro-vagas')).toBe(true)
    expect(decryptRoutineToken(doc.engramindToken as never)).toMatch(/^eng\./)
    expect(JSON.stringify(doc.engramindToken.secret)).not.toContain('segredo')
    expect(holder.fake.state.channels.has('agentes/rotineiros/vagas')).toBe(true)
    expect(holder.fake.state.channels.has('agentes/rotineiros/global')).toBe(true)
    expect(holder.fake.state.channels.has('curriculos/backend')).toBe(true)
    const subscribed = holder.fake.state.subscriptions.filter((item) => item.agent === 'opex/rotineiro-vagas').map((item) => item.target)
    expect(subscribed).toEqual(expect.arrayContaining(['opex', 'agentes/rotineiros/global', 'agentes/rotineiros/vagas', 'vagas/empresa-x', 'curriculos/backend']))
    expect(doc.provisioning.extras).toEqual([
      { channel: 'vagas/empresa-x', name: 'vagas/empresa-x', reason: 'vagas da empresa', created: false },
      { channel: 'curriculos/backend', name: 'Currículos', reason: 'modelos de currículo', created: true },
    ])
  })

  it('falha no token → "Provisionamento com erro"; "Tentar de novo" retoma sem duplicar agente nem canais', async () => {
    holder.failTokens = true
    await provisionRoutineAgent(String(agentDoc()._id), 'create', 'local')
    expect(agentDoc()).toMatchObject({ provisioning: { status: 'error', error: 'Engramind recusou o token', steps: { agent: true, token: false } } })
    holder.failTokens = false
    await provisionRoutineAgent(String(agentDoc()._id), 'retry', 'local')
    expect(agentDoc()).toMatchObject({ provisioning: { status: 'ok' } })
    expect(calls('POST', '/v1/agents').filter((call) => (call.body as { slug: string }).slug === 'rotineiro-vagas')).toHaveLength(1)
    // Retomar com tudo pronto não reemite o token nem chama o subagente de novo.
    const tokens = calls('POST', '/v1/tokens').length
    const planner = holder.plannerCalls
    await provisionRoutineAgent(String(agentDoc()._id), 'retry', 'local')
    expect(calls('POST', '/v1/tokens')).toHaveLength(tokens)
    expect(holder.plannerCalls).toBe(planner)
  })

  it('reprovisionar reavalia os extras e só acrescenta (nunca remove os base nem os antigos)', async () => {
    await provisionRoutineAgent(String(agentDoc()._id), 'create', 'local')
    holder.fake.state.channels.set('vagas/empresa-y', { slug: 'vagas/empresa-y', archived_at: null })
    holder.planner = '{"subscribe":[{"channel":"vagas/empresa-y","reason":"nova empresa"}],"create":[]}'
    await provisionRoutineAgent(String(agentDoc()._id), 'reprovision', 'local')
    const doc = agentDoc() as { provisioning: { extras: { channel: string }[]; channels: string[] } }
    expect(doc.provisioning.extras.map((item) => item.channel)).toEqual(['vagas/empresa-x', 'curriculos/backend', 'vagas/empresa-y'])
    expect(doc.provisioning.channels).toEqual(['opex', 'agentes/rotineiros/global', 'agentes/rotineiros/vagas'])
  })

  it('sem o modelo do provisionamento, fica com erro acionável', async () => {
    holder.settings.docs.length = 0
    await provisionRoutineAgent(String(agentDoc()._id), 'create', 'local')
    expect(agentDoc()).toMatchObject({ provisioning: { status: 'error', error: expect.stringContaining('Configure o modelo do provisionamento') } })
  })
})
