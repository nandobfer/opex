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
  /** Respostas da identidade (D8), consumidas antes do `planner` dos canais. */
  identity: [] as string[],
  prompts: [] as string[],
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
  streamAi: async function* (input: { instructions: string; prompt: string }) {
    holder.plannerCalls++
    holder.prompts.push(input.prompt)
    const identity = input.instructions.includes('Gere a identidade')
    yield { type: 'delta', text: identity ? (holder.identity.shift() ?? '{}') : holder.planner }
  },
}))

import { provisionRoutineAgent } from '@/features/routine-agents/server/provisioning'
import { decryptRoutineToken } from '@/features/routine-agents/server/engramind'
import { pendingRoutineNameKey, pendingRoutineSlug } from '@/features/routine-agents/slug'

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
  holder.identity = []
  holder.prompts = []
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

describe('identidade gerada pelo subagente (critério aprovado OPE-130, D8)', () => {
  const pending = (overrides: Record<string, unknown> = {}) => {
    holder.agents.docs.length = 0
    const doc = holder.agents.insert({ name: '', slug: 'x', objective: '', instructions: 'Procurar vagas de backend remotas na Gupy e se candidatar', engine: 'opex', status: 'active', provisioning: { status: 'pending', steps: { identity: false, agent: false, token: false, channels: false, extras: false, workdir: false }, channels: [], extras: [], warnings: [] }, engramindToken: null, ...overrides })
    doc.slug = (overrides.slug as string) ?? pendingRoutineSlug(String(doc._id))
    doc.nameKey = pendingRoutineNameKey(String(doc._id))
    return doc
  }

  it('sem nome nem objetivo: gera os dois (só o papel), fixa o slug definitivo e cadastra o agente com "Agente <nome>"', async () => {
    const doc = pending()
    holder.identity = ['{"name":"Recrutador","objective":"Candidatar-se às vagas de backend remotas."}']
    await provisionRoutineAgent(String(doc._id), 'create', 'local')
    expect(agentDoc()).toMatchObject({ name: 'Recrutador', nameKey: 'recrutador', slug: 'recrutador', objective: 'Candidatar-se às vagas de backend remotas.', generated: { name: true, objective: true }, provisioning: { status: 'ok' } })
    expect(holder.fake.state.agents.has('opex/rotineiro-recrutador')).toBe(true)
    expect(holder.fake.state.channels.has('agentes/rotineiros/recrutador')).toBe(true)
    expect(holder.prompts[0]).toContain('Desenvolvedor')
  })

  it('nome preenchido pelo dono nunca é trocado: só o objetivo é gerado', async () => {
    const doc = pending({ name: 'Vagas', slug: 'vagas' })
    holder.identity = ['{"name":"Outro","objective":"Objetivo gerado."}']
    await provisionRoutineAgent(String(doc._id), 'create', 'local')
    expect(agentDoc()).toMatchObject({ name: 'Vagas', slug: 'vagas', objective: 'Objetivo gerado.', generated: { objective: true } })
    expect((agentDoc() as { generated: { name?: boolean } }).generated.name).toBeUndefined()
  })

  it('resposta recusada tenta uma vez de novo com o motivo; duas recusas → com erro acionável e "Tentar de novo" retoma', async () => {
    const doc = pending()
    holder.identity = ['{"name":"Agente Recrutador","objective":"x"}', '{"name":"Desenvolvedor","objective":"x"}']
    await provisionRoutineAgent(String(doc._id), 'create', 'local')
    expect(holder.prompts[1]).toContain('A resposta anterior foi recusada')
    expect(agentDoc()).toMatchObject({ name: '', provisioning: { status: 'error', error: expect.stringContaining('Não foi possível gerar o nome do agente') } })
    expect(holder.fake.state.agents.size).toBe(0)
    holder.identity = ['{"name":"Recrutador","objective":"Objetivo."}']
    await provisionRoutineAgent(String(doc._id), 'retry', 'local')
    expect(agentDoc()).toMatchObject({ name: 'Recrutador', slug: 'recrutador', provisioning: { status: 'ok' } })
  })

  it('modo identity (edição com o nome esvaziado): gera só o nome e não troca o slug nem os canais', async () => {
    await provisionRoutineAgent(String(agentDoc()._id), 'create', 'local')
    const agentsBefore = holder.fake.state.agents.size
    agentDoc().name = ''
    holder.identity = ['{"name":"Caçador"}']
    await provisionRoutineAgent(String(agentDoc()._id), 'identity', 'local')
    expect(agentDoc()).toMatchObject({ name: 'Caçador', slug: 'vagas', provisioning: { status: 'ok' } })
    expect(holder.fake.state.agents.size).toBe(agentsBefore)
  })
})
