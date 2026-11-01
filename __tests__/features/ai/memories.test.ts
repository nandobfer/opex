import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEngramind, type FakeEngramind } from '../../helpers/fake-engramind'

/** Memórias dos agentes no Engramind (OPE-104): serviço, regras de escopo, autoria, auditoria e tempo real. */

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeEngramind, centrals: [] as { _id: string; projectName: string }[], clients: [] as { _id: string; name: string }[] }))
const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  publishToChannels: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishToChannels: mocks.publishToChannels }))
vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: (...args: Parameters<FakeEngramind['engramindCall']>) => holder.fake.engramindCall(...args),
  engramindTarget: async () => ({ baseUrl: 'http://engramind', token: 'admin-token' }),
}))
vi.mock('@/features/engramind/server/memory-network', () => ({
  agentTarget: async (consumer: string) => ({ baseUrl: 'http://engramind', token: `agent-token-${consumer}` }),
  ensureMemoryChannel: async (slug: string) => {
    if (!holder.fake.state.channels.has(slug)) holder.fake.state.channels.set(slug, { slug, archived_at: null })
    return 'created'
  },
  archiveMemoryChannel: async (slug: string) => {
    const channel = holder.fake.state.channels.get(slug)
    if (!channel) return false
    channel.archived_at = 'agora'
    return true
  },
}))
const lean = <T>(value: T) => ({ select: () => ({ lean: async () => value }), lean: async () => value })
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticCentral: { findById: (id: string) => lean(holder.centrals.find((item) => item._id === id) ?? null) } }))
vi.mock('@/lib/db/models/Orcamento', () => ({ OrcamentoClient: { findById: (id: string) => lean(holder.clients.find((item) => item._id === id) ?? null) } }))

import { archiveCentralMemories, createAgentMemory, deleteAgentMemory, getAgentMemory, listAgentMemories, updateAgentMemory } from '@/features/ai/server/agent-memory-service'
import { resetMemorySettingsCache } from '@/features/ai/server/memory-settings'

const CENTRAL = 'a'.repeat(24)
const OTHER_CENTRAL = 'b'.repeat(24)
const CLIENT = 'c'.repeat(24)
const agent = { consumer: 'desenvolvedor' as const, label: 'Agente desenvolvedor · OPE-1' }
const calls = (method: string, path: string) => holder.fake.state.calls.filter((call) => call.method === method && call.path === path)

beforeEach(() => {
  vi.clearAllMocks()
  holder.fake = createFakeEngramind()
  for (const slug of ['opex', 'agentes/opex/global', 'agentes/opex/dono', 'agentes/adversario', 'agentes/desenvolvedor/global']) holder.fake.state.channels.set(slug, { slug, archived_at: null })
  holder.centrals = [{ _id: CENTRAL, projectName: 'App' }, { _id: OTHER_CENTRAL, projectName: 'Outro' }]
  holder.clients = [{ _id: CLIENT, name: 'ACME' }]
  resetMemorySettingsCache()
})

describe('memórias dos agentes no Engramind', () => {
  it('criar grava no canal da lista com a origem do dono, a categoria padrão, auditoria e tempo real', async () => {
    const result = await createAgentMemory('opex-global', 'Responda sempre em português.', 'local')
    expect(calls('POST', '/v1/memories')[0]!.body).toMatchObject({ channel: 'agentes/opex/global', text: 'Responda sempre em português.', category: 'PROJECT_RULES', origin: { source: 'dono', label: 'Dono' }, status: 'active' })
    // Admin do Opex (sem token de agente).
    expect(calls('POST', '/v1/memories')[0]!.token).toBeNull()
    expect(result.memoria).toMatchObject({ texto: 'Responda sempre em português.', categoria: 'PROJECT_RULES', fixada: false, ativa: true, doDono: true, origin: null, resumoPendente: true, resumo: 'Responda sempre em português' })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'MemoriaAgente', acao: 'CRIAR', depois: expect.objectContaining({ agente: 'opex-global', texto: 'Responda sempre em português.', origem: 'Dono' }) }))
    expect(mocks.publishToChannels).toHaveBeenCalledWith(['private-integration-ai'], 'ai-memories-updated', { agentId: 'opex-global' })
  })

  it('listar mostra ativas (fixadas primeiro) e depois as inativas; o resumo é o título do Redator', async () => {
    const a = holder.fake.createMemory('agentes/opex/global', { text: 'Primeira regra. Detalhe.' }, null).memory
    const b = holder.fake.createMemory('agentes/opex/global', { text: 'Segunda regra.' }, null).memory
    const c = holder.fake.createMemory('agentes/opex/global', { text: 'Terceira regra.' }, null).memory
    Object.assign(a, { title: 'Título do Redator', title_state: 'ready' })
    Object.assign(b, { status: 'archived' })
    Object.assign(c, { status: 'permanent' })
    holder.fake.createMemory('agentes/opex/dono', { text: 'De outra lista.' }, null)
    const list = await listAgentMemories('opex-global')
    expect(list.map((item) => item.texto)).toEqual(['Terceira regra.', 'Primeira regra. Detalhe.', 'Segunda regra.'])
    expect(list[1]).toMatchObject({ resumo: 'Título do Redator', resumoPendente: false })
    expect(list[2]).toMatchObject({ ativa: false, fixada: false })
  })

  it('editar envia a versão lida; versão diferente recusa com a mensagem de conflito', async () => {
    const { memoria } = await createAgentMemory('opex-global', 'Regra antiga.', 'local')
    await updateAgentMemory('opex-global', memoria.id, { texto: 'Regra nova.', versao: memoria.versao }, 'local')
    expect(calls('PATCH', `/v1/memories/${memoria.id}`)[0]!.body).toEqual({ text: 'Regra nova.', expected_version: 1 })
    await expect(updateAgentMemory('opex-global', memoria.id, { texto: 'Outra.', versao: 1 }, 'local')).rejects.toMatchObject({ status: 409, code: 'MEMORY_VERSION_CONFLICT', message: 'Esta memória mudou enquanto você editava. Confira a versão atual.' })
  })

  it('fixar, inativar (uma fixada é desafixada antes) e reativar como ativa', async () => {
    const { memoria } = await createAgentMemory('opex-global', 'Regra fixa.', 'local', { fixada: true })
    expect(memoria.fixada).toBe(true)
    const inactive = await updateAgentMemory('opex-global', memoria.id, { ativa: false }, 'local')
    expect(holder.fake.state.calls.filter((call) => call.path.startsWith(`/v1/memories/${memoria.id}/`)).map((call) => call.path.split('/').pop())).toEqual(['unpin', 'archive'])
    expect(inactive.memoria).toMatchObject({ ativa: false, fixada: false })
    const active = await updateAgentMemory('opex-global', memoria.id, { ativa: true }, 'local')
    expect(active.memoria).toMatchObject({ ativa: true, fixada: false })
    expect(mocks.recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ acao: 'ATUALIZAR', depois: expect.objectContaining({ acoes: ['ativar'] }) }))
  })

  it('excluir apaga de vez; memória de outra lista é 404', async () => {
    const { memoria } = await createAgentMemory('opex-global', 'Some.', 'local')
    await expect(getAgentMemory('opex-owner', memoria.id)).rejects.toMatchObject({ status: 404 })
    await deleteAgentMemory('opex-global', memoria.id, 'local')
    expect(holder.fake.state.memories.has(memoria.id)).toBe(false)
    expect(mocks.recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ acao: 'EXCLUIR', antes: expect.objectContaining({ texto: 'Some.' }) }))
  })

  it('limites e categorias vêm do Engramind', async () => {
    holder.fake.state.settings['memory.text_max'] = 20
    await expect(createAgentMemory('opex-global', 'x'.repeat(21), 'local')).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Até 20 caracteres' })
    await expect(createAgentMemory('opex-global', 'Ok curto', 'local', { categoria: 'INEXISTENTE' })).rejects.toMatchObject({ status: 400, code: 'CATEGORY_NOT_FOUND' })
    const { memoria } = await createAgentMemory('opex-global', 'Ok curto', 'local', { categoria: 'NAMING' })
    expect(memoria.categoria).toBe('NAMING')
  })

  it('texto igual ao de outra memória da lista não grava: devolve a existente (duplicada)', async () => {
    const first = await createAgentMemory('opex-global', 'Mesma regra.', 'local')
    const second = await createAgentMemory('opex-global', 'Mesma regra.', 'local')
    expect(second).toMatchObject({ duplicada: true, memoria: { id: first.memoria.id } })
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1)
  })

  it('lista desconhecida, central e cliente: as regras de escopo continuam', async () => {
    await expect(listAgentMemories('desconhecida')).rejects.toMatchObject({ status: 404, code: 'AI_AGENT_NOT_FOUND' })
    await expect(listAgentMemories('developer-central')).rejects.toMatchObject({ status: 400, code: 'CENTRAL_REQUIRED' })
    await expect(listAgentMemories('developer-central', 'f'.repeat(24))).rejects.toMatchObject({ status: 404, code: 'CENTRAL_NOT_FOUND' })
    await expect(listAgentMemories('developer-global', CENTRAL)).rejects.toMatchObject({ status: 400, code: 'CENTRAL_NOT_ALLOWED' })
    await expect(listAgentMemories('opex-client-specific')).rejects.toMatchObject({ status: 400, code: 'CLIENT_REQUIRED' })
    await expect(listAgentMemories('opex-client-specific', { clientId: 'd'.repeat(24) })).rejects.toMatchObject({ status: 404, code: 'CLIENT_NOT_FOUND' })
    await expect(listAgentMemories('opex-global', { clientId: CLIENT })).rejects.toMatchObject({ status: 400, code: 'CLIENT_NOT_ALLOWED' })
  })

  it('central nova sem canal: listar devolve vazio e a primeira gravação cria o canal; memória de outra central é 404', async () => {
    expect(await listAgentMemories('developer-central', CENTRAL)).toEqual([])
    const { memoria } = await createAgentMemory('developer-central', 'Use pnpm.', 'local', { centralId: CENTRAL })
    expect(holder.fake.state.channels.has(`agentes/desenvolvedor/central/${CENTRAL}`)).toBe(true)
    expect(memoria.centralId).toBe(CENTRAL)
    await expect(getAgentMemory('developer-central', memoria.id, OTHER_CENTRAL)).rejects.toMatchObject({ status: 404 })
    expect(mocks.publishToChannels).toHaveBeenCalledWith(['private-integration-ai'], 'ai-memories-updated', { agentId: 'developer-central', centralId: CENTRAL })
  })

  it('lista de um cliente específico grava no canal do cliente', async () => {
    const { memoria } = await createAgentMemory('opex-client-specific', 'Cliente prefere relatórios em PDF.', 'local', { clientId: CLIENT })
    expect(holder.fake.state.memories.get(memoria.id)!.channel).toBe(`agentes/opex/clientes/${CLIENT}`)
    expect(memoria.clientId).toBe(CLIENT)
  })

  it('agente sozinho grava com o próprio token e a própria origem; edita a do dono, mas não exclui nem inativa', async () => {
    const own = await createAgentMemory('developer-global', 'Rode os testes afetados.', 'local', { agent })
    const call = calls('POST', '/v1/memories')[0]!
    expect(call.token).toBe('agent-token-desenvolvedor')
    expect(call.body).toMatchObject({ origin: { source: 'desenvolvedor', label: 'Agente desenvolvedor · OPE-1' } })
    expect(own.memoria).toMatchObject({ doDono: false, origin: { source: 'desenvolvedor' }, autor: 'Agente desenvolvedor' })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ ator: 'agente:desenvolvedor' }) }))

    const owner = await createAgentMemory('developer-global', 'Regra do dono.', 'local')
    await expect(updateAgentMemory('developer-global', owner.memoria.id, { texto: 'Regra do dono, revisada.' }, 'local', { agent })).resolves.toMatchObject({ memoria: { texto: 'Regra do dono, revisada.' } })
    await expect(updateAgentMemory('developer-global', owner.memoria.id, { ativa: false }, 'local', { agent })).rejects.toMatchObject({ status: 403, code: 'OWNER_MEMORY_PROTECTED' })
    await expect(deleteAgentMemory('developer-global', owner.memoria.id, 'local', {}, { agent })).rejects.toMatchObject({ status: 403, code: 'OWNER_MEMORY_PROTECTED' })
    // A do próprio agente (e a do Mentor) ele exclui.
    await deleteAgentMemory('developer-global', own.memoria.id, 'local', {}, { agent })
    expect(holder.fake.state.memories.has(own.memoria.id)).toBe(false)
  })

  it('Mentor com token próprio: grava como agente mentor, audita agente:mentor, mostra o rótulo do Mentor e edita a do dono', async () => {
    const mentor = { consumer: 'mentor' as const, label: 'Mentor · OPE-12' }
    const { memoria } = await createAgentMemory('adversarial', 'Confira o skeleton.', 'local', { agent: mentor, auditContext: { mesa: 'w1' } })
    const call = calls('POST', '/v1/memories')[0]!
    expect(call.token).toBe('agent-token-mentor')
    expect(call.body).toMatchObject({ origin: { source: 'mentor', label: 'Mentor · OPE-12' } })
    expect(memoria).toMatchObject({ origin: { source: 'mentor' }, doDono: false, autor: 'Mentor · OPE-12' })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ ator: 'agente:mentor', origem: 'Mentor · OPE-12', mesa: 'w1' }) }))

    const owner = await createAgentMemory('adversarial', 'Regra do dono.', 'local')
    await expect(updateAgentMemory('adversarial', owner.memoria.id, { texto: 'Regra do dono, fundida pelo Mentor.' }, 'local', { agent: mentor })).resolves.toMatchObject({ memoria: { texto: 'Regra do dono, fundida pelo Mentor.' } })
  })

  it('Mentor: origem preservada, sem selo do dono', async () => {
    const { memoria } = await createAgentMemory('adversarial', 'Confira os providers.', 'local', { origin: { source: 'mentor', label: 'Mentor · OPE-12' }, auditContext: { execucao: 'r1' } })
    expect(memoria).toMatchObject({ origin: { source: 'mentor', label: 'Mentor · OPE-12' }, doDono: false, autor: 'Mentor · OPE-12' })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ origem: 'Mentor · OPE-12', execucao: 'r1' }) }))
  })

  it('excluir a central arquiva o canal dela (recuperável) e nunca lança', async () => {
    holder.fake.state.channels.set(`agentes/desenvolvedor/central/${CENTRAL}`, { slug: `agentes/desenvolvedor/central/${CENTRAL}`, archived_at: null })
    expect(await archiveCentralMemories(CENTRAL)).toBe(true)
    expect(holder.fake.state.channels.get(`agentes/desenvolvedor/central/${CENTRAL}`)!.archived_at).not.toBeNull()
    expect(await archiveCentralMemories(OTHER_CENTRAL)).toBe(false)
  })
})
