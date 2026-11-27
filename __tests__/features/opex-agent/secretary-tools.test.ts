import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  store: null as unknown,
  persist: vi.fn(),
  statuses: vi.fn(),
  models: vi.fn(),
  instances: vi.fn(),
  contactsByJid: vi.fn(),
  listContacts: vi.fn(),
  notices: vi.fn(),
  loadPersonality: vi.fn(),
  writeVersion: vi.fn(),
  answer: vi.fn(),
  discard: vi.fn(),
  sendText: vi.fn(),
  testConnection: vi.fn(),
  conversations: vi.fn(),
  versions: vi.fn(),
}))

vi.mock('@/features/ai/server/settings', async (original) => ({
  ...(await original<object>()),
  loadFeature: async (_feature: string, schema: { parse: (value: unknown) => unknown }, defaults: unknown) =>
    mocks.store ? { settings: schema.parse(mocks.store), isDefault: false, updatedAt: null } : { settings: defaults, isDefault: true, updatedAt: null },
  persistFeature: mocks.persist,
  availability: mocks.testConnection,
}))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/catalog', async (original) => ({ ...(await original<object>()), getAiProviderStatuses: mocks.statuses, listAiModels: mocks.models }))
vi.mock('@/lib/integrations/runtime', async (original) => ({ ...(await original<object>()), getIntegration: async () => ({ version: 1 }), isIntegrationConfigured: () => true }))
vi.mock('@/features/evolution-api/server/instances', async (original) => ({ ...(await original<object>()), listInstances: mocks.instances }))
vi.mock('@/features/evolution-api/server/contacts', async (original) => ({ ...(await original<object>()), contactsByJid: mocks.contactsByJid, listContacts: mocks.listContacts }))
vi.mock('@/features/evolution-api/server/client', async (original) => ({ ...(await original<object>()), evolution: { sendText: mocks.sendText } }))
vi.mock('@/features/secretary-agent/server/models', async (original) => ({
  ...(await original<object>()),
  secretaryDb: vi.fn(),
  SecretaryNotice: { find: () => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: mocks.notices }) }) }) }) },
}))
vi.mock('@/features/secretary-agent/server/personality', async (original) => ({ ...(await original<object>()), loadPersonality: mocks.loadPersonality, writeVersion: mocks.writeVersion, listPersonalityVersions: mocks.versions }))
vi.mock('@/features/secretary-agent/server/conversations', async (original) => ({ ...(await original<object>()), listSecretaryConversations: mocks.conversations }))
vi.mock('@/features/secretary-agent/server/owner-questions', async (original) => ({ ...(await original<object>()), answerNotice: mocks.answer, discardNotice: mocks.discard }))

import { DEFAULT_SECRETARY_SETTINGS } from '@/features/secretary-agent/schemas'
import { emptyPersonality } from '@/features/secretary-agent/personality'
import { secretaryTools } from '@/features/opex-agent/server/tools/secretary'
import { OPEX_TOOLS, opexToolMetas } from '@/features/opex-agent/server/tools/registry'
import { OPEX_CLIENT_SERVER_TOOLS } from '@/features/opex-agent/server/client-tools/registry'
import { toolConfirms } from '@/features/opex-agent/tool-tree'
import { maddoxIncludesOwnerTool } from '@/features/maddox-agent/catalog'
import { isRoutineForbiddenToolGroup } from '@/features/routine-agents/constants'
import { MCP_OWNER_DESTRUCTIVE, MCP_OWNER_SCOPE, mcpOwnerGroupScope, mcpOwnerToolDecision } from '@/features/integrations/api-tokens/scopes'

/** Ferramentas do Agente Opex para o Agente Secretário (OPE-200): ler e alterar com as regras da tela. */

const context = { sessionId: 's1', actorId: 'local' }
const tool = (name: string) => secretaryTools.find((item) => item.name === name)!
const run = (name: string, input: unknown) => tool(name).execute(tool(name).input.parse(input), context)
const ana = '5531999999999@s.whatsapp.net'
const grupo = '120363000000000001@g.us'
const configured = { ...DEFAULT_SECRETARY_SETTINGS, main: { provider: 'opencode-go', model: 'kimi-k2', agent: null, variant: null, temperature: null }, instance: 'opex' }

const CONFIRMING = ['set_secretary_enabled', 'set_secretary_mode', 'set_secretary_instance', 'set_secretary_agent_model', 'update_secretary_audience', 'remove_secretary_subject', 'remove_secretary_personality_block', 'remove_secretary_variant', 'answer_secretary_question', 'discard_secretary_question']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.store = null
  mocks.persist.mockImplementation(async (_feature: string, next: unknown) => { mocks.store = next })
  mocks.statuses.mockResolvedValue([
    { id: 'opencode-go', name: 'OpenCode Go', configured: true, connected: true },
    { id: 'anthropic', name: 'Anthropic', configured: false, connected: false },
    { id: 'opencode', name: 'OpenCode', configured: true, connected: true },
    { id: 'jev', name: 'JEV', configured: true, connected: true },
  ])
  mocks.models.mockImplementation(async (provider: string) =>
    provider === 'jev' ? [{ id: 'jev-1', name: 'JEV 1', variants: [], group: null, contextWindow: null, free: false }] : [{ id: 'kimi-k2', name: 'Kimi K2', variants: ['high'], group: null, contextWindow: null, free: false }],
  )
  mocks.conversations.mockResolvedValue([
    { jid: ana, name: 'Ana', number: '5531999999999', isGroup: false, pictureUrl: null, lastMessageAt: null, chatId: '5531999999999', state: 'paused', pausedUntil: null },
    { jid: grupo, name: 'Família', number: null, isGroup: true, pictureUrl: null, lastMessageAt: null, chatId: 'g-120363000000000001', state: 'active', pausedUntil: null },
  ])
  mocks.versions.mockResolvedValue([{ _id: 'v1', origin: 'analysis', changes: [{}, {}], at: new Date('2026-11-20T10:00:00Z') }])
  mocks.instances.mockResolvedValue({ defaultInstance: 'opex', instances: [{ name: 'opex', state: 'connected', profileName: 'Burgos', number: '5531988887777' }], error: null })
  mocks.contactsByJid.mockImplementation(async (jids: string[]) => new Map(jids.filter((jid) => jid === ana || jid === grupo).map((jid) => [jid, { jid, name: jid === ana ? 'Ana' : 'Família', number: jid === ana ? '5531999999999' : null, isGroup: jid === grupo, pictureUrl: null, lastMessageAt: null }])))
  mocks.listContacts.mockResolvedValue([
    { jid: ana, name: 'Ana', number: '5531999999999', isGroup: false, pictureUrl: null, lastMessageAt: null },
    { jid: grupo, name: 'Família', number: null, isGroup: true, pictureUrl: null, lastMessageAt: null },
  ])
  mocks.notices.mockResolvedValue([{ _id: 'n-1', jid: ana, contactName: 'Ana', text: 'Posso confirmar a reunião?', excerpt: 'amanhã às 10h?', at: new Date('2026-11-26T12:00:00Z') }])
  mocks.loadPersonality.mockResolvedValue({ versionId: 'v1', snapshot: { base: emptyPersonality(), variants: [] } })
  mocks.writeVersion.mockResolvedValue('v2')
})

describe('registro das ferramentas do Secretário', () => {
  it('grupo secretary no agente do dono, fora do portal, liberado no Maddox e proibido nos rotineiros', () => {
    expect(secretaryTools).toHaveLength(18)
    for (const item of secretaryTools) {
      expect(item.group).toBe('secretary')
      expect(OPEX_TOOLS).toContain(item)
      expect(OPEX_CLIENT_SERVER_TOOLS.some((client) => client.name === item.name)).toBe(false)
      expect(maddoxIncludesOwnerTool(item)).toBe(true)
      // Só responder pergunta é destrutiva: pode enviar mensagem a um contato (irreversível).
      expect(item.risk === 'destructive').toBe(item.name === 'answer_secretary_question')
    }
    expect(isRoutineForbiddenToolGroup('secretary')).toBe(true)
  })

  it('só as mudanças sensíveis pedem confirmação, e por token exigem o escopo destrutivo', () => {
    const metas = opexToolMetas().filter((meta) => meta.group === 'secretary')
    expect(metas.filter((meta) => toolConfirms(meta)).map((meta) => meta.name).sort()).toEqual([...CONFIRMING].sort())
    for (const meta of metas) {
      const scopes = [MCP_OWNER_SCOPE, mcpOwnerGroupScope('secretary')]
      expect(mcpOwnerToolDecision(scopes, meta).ok).toBe(!CONFIRMING.includes(meta.name))
      expect(mcpOwnerToolDecision([...scopes, MCP_OWNER_DESTRUCTIVE], meta).ok).toBe(true)
    }
  })
})

describe('consulta e alteração', () => {
  it('consultar não grava, não envia mensagem nem testa conexão, e traz as perguntas pendentes', async () => {
    mocks.store = configured
    const view = (await run('get_secretary_settings', {})) as Record<string, unknown>
    expect(view).toMatchObject({ status: 'Desligado', mode: 'Responder', instance: { name: 'opex', connection: 'Conectada' }, models: { agent: { summary: 'OpenCode Go · Kimi K2' } }, readiness: { canEnable: true } })
    expect(view.pendingQuestions).toEqual([{ ref: 'n-1', contact: 'Ana', question: 'Posso confirmar a reunião?', excerpt: 'amanhã às 10h?', askedAt: '2026-11-26T12:00:00.000Z' }])
    expect(mocks.persist).not.toHaveBeenCalled()
    expect(mocks.sendText).not.toHaveBeenCalled()
    expect(mocks.answer).not.toHaveBeenCalled()
    expect(mocks.testConnection).not.toHaveBeenCalled()
    expect(mocks.writeVersion).not.toHaveBeenCalled()
  })

  it('leitura → gravação → leitura: limite, assunto bloqueado e nunca responder aparecem pelo nome', async () => {
    mocks.store = configured
    await run('update_secretary_settings', { repliesPerHour: 30 })
    await run('update_secretary_subjects', { upsert: [{ list: 'blocked', name: 'Política' }] })
    await run('update_secretary_audience', { addNeverAnswer: ['Família'] })
    expect(mocks.persist).toHaveBeenCalledTimes(3)
    expect(mocks.persist).toHaveBeenLastCalledWith('secretary-agent', expect.objectContaining({ criteria: expect.objectContaining({ audience: expect.objectContaining({ blocked: [grupo] }) }) }), 'local', expect.anything())
    const view = (await run('get_secretary_settings', {})) as { limits: unknown; criteria: { audience: { neverAnswer: string[] }; subjects: { blocked: unknown[] } } }
    expect(view.limits).toEqual({ repliesPerConversationPerHour: 30, dailyBudgetUsd: 2 })
    expect(view.criteria.audience.neverAnswer).toEqual(['Família'])
    expect(view.criteria.subjects.blocked).toEqual([{ name: 'Política' }])
    await run('remove_secretary_subject', { name: 'politica' })
    expect((mocks.store as typeof configured).criteria.subjects.blocked).toEqual([])
  })

  it('ligar sem modelo e sem instância explica o que falta e não grava nada', async () => {
    await expect(run('set_secretary_enabled', { enabled: true })).rejects.toThrow(/Escolha o provedor para ligar o agente; Escolha o modelo para ligar o agente; Escolha a instância do WhatsApp\. Nada foi alterado/)
    expect(mocks.persist).not.toHaveBeenCalled()
  })

  it('liga com tudo configurado e troca o modo para Só observar', async () => {
    mocks.store = configured
    await run('set_secretary_enabled', { enabled: true })
    await run('set_secretary_mode', { mode: 'observe' })
    expect(mocks.store).toMatchObject({ enabled: true, mode: 'observe' })
    expect(tool('set_secretary_mode').summarize!({ mode: 'observe' })).toBe('Trocar o modo do Agente Secretário para Só observar: ele deixa de enviar mensagens e só registra as decisões')
  })

  it('modelo inexistente, provedor sem chave e "Só os escolhidos" sem conversa são recusados; o estado fica', async () => {
    mocks.store = configured
    await expect(run('set_secretary_agent_model', { provider: 'opencode-go', model: 'nao-existe' })).rejects.toThrow('O modelo "nao-existe" não existe no OpenCode Go')
    await expect(run('set_secretary_agent_model', { provider: 'anthropic', model: 'claude' })).rejects.toThrow('Anthropic não está configurado')
    await expect(run('update_secretary_audience', { whoCanBeAnswered: 'selected' })).rejects.toThrow('Escolha ao menos uma conversa, ou responda a todos')
    expect(mocks.persist).not.toHaveBeenCalled()
    expect(mocks.store).toEqual(configured)
  })

  it('troca o modelo pelo nome do catálogo, gravando o identificador', async () => {
    mocks.store = configured
    await run('set_secretary_agent_model', { provider: 'opencode-go', model: 'kimi k2', variant: 'high' })
    expect((mocks.store as typeof configured).main).toMatchObject({ provider: 'opencode-go', model: 'kimi-k2', variant: 'high' })
  })

  it('conversa ambígua ou inexistente é recusada com os candidatos', async () => {
    mocks.store = configured
    mocks.listContacts.mockResolvedValueOnce([
      { jid: ana, name: 'Ana', number: '5531999999999', isGroup: false, pictureUrl: null, lastMessageAt: null },
      { jid: '5511999999999@s.whatsapp.net', name: 'Ana', number: '5511999999999', isGroup: false, pictureUrl: null, lastMessageAt: null },
    ])
    await expect(run('update_secretary_audience', { addNeverAnswer: ['ana'] })).rejects.toThrow(/Mais de uma conversa.*\+5531999999999.*\+5511999999999/)
    await expect(run('update_secretary_audience', { addNeverAnswer: ['Zé'] })).rejects.toThrow('Nenhuma conversa encontrada para "Zé"')
    expect(mocks.persist).not.toHaveBeenCalled()
  })

  it('responder e descartar pergunta usam o serviço da aba Avisos com o ator', async () => {
    await run('answer_secretary_question', { ref: 'n-1', answer: 'Pode confirmar' })
    await run('discard_secretary_question', { ref: 'n-2' })
    expect(mocks.answer).toHaveBeenCalledWith('n-1', 'Pode confirmar', 'local')
    expect(mocks.discard).toHaveBeenCalledWith('n-2', 'local')
  })

  it('personalidade: bloco e variante gravam versão com a versão lida', async () => {
    mocks.store = configured
    await run('update_secretary_personality_block', { title: 'tom e formalidade', content: 'Direto e brincalhão' })
    expect(mocks.writeVersion).toHaveBeenLastCalledWith(expect.objectContaining({ base: { blocks: expect.arrayContaining([{ key: 'tom', title: 'Tom e formalidade', content: 'Direto e brincalhão' }]) } }), 'edit', 'local', 'v1')
    await run('set_secretary_variant', { conversation: 'Ana', blocks: [{ title: 'Tom e formalidade', content: 'Mais carinhoso' }] })
    expect(mocks.writeVersion).toHaveBeenLastCalledWith({ base: emptyPersonality(), variants: [{ jid: ana, title: 'Ana', origin: 'owner', blocks: [{ key: 'tom', title: 'Tom e formalidade', content: 'Mais carinhoso' }] }] }, 'edit', 'local', 'v1')
    await expect(run('remove_secretary_variant', { conversation: 'Ana' })).rejects.toThrow('Não há variantes')
  })

  it('variante que ficaria sem nenhum bloco é recusada, orientando remove_secretary_variant', async () => {
    mocks.store = configured
    const variant = { jid: ana, title: 'Ana', origin: 'owner' as const, blocks: [{ key: 'tom', title: 'Tom e formalidade', content: 'Carinhoso' }] }
    mocks.loadPersonality.mockResolvedValue({ versionId: 'v1', snapshot: { base: emptyPersonality(), variants: [variant] } })
    await expect(run('set_secretary_variant', { conversation: 'Ana', blocks: [{ title: 'Tom e formalidade', content: '' }] })).rejects.toThrow(/ficaria sem nenhum bloco.*remove_secretary_variant/)
    expect(mocks.writeVersion).not.toHaveBeenCalled()
    await run('remove_secretary_variant', { conversation: 'Ana' })
    expect(mocks.writeVersion).toHaveBeenCalledWith({ base: emptyPersonality(), variants: [] }, 'edit', 'local', 'v1')
  })

  it('remover bloco: o fixo é esvaziado e o extra sai; título inexistente é recusado', async () => {
    const base = emptyPersonality()
    base.blocks = base.blocks.map((block) => (block.key === 'tom' ? { ...block, content: 'Direto' } : block))
    base.blocks.push({ key: 'trabalho', title: 'Trabalho', content: 'Sou dev' })
    mocks.loadPersonality.mockResolvedValue({ versionId: 'v1', snapshot: { base, variants: [] } })
    await expect(run('remove_secretary_personality_block', { title: 'Tom e formalidade' })).resolves.toMatchObject({ result: expect.stringContaining('esvaziado') })
    const fixed = mocks.writeVersion.mock.calls[0][0] as { base: { blocks: { key: string; content: string }[] } }
    expect(fixed.base.blocks.find((block) => block.key === 'tom')).toMatchObject({ content: '' })
    await expect(run('remove_secretary_personality_block', { title: 'trabalho' })).resolves.toMatchObject({ result: 'Bloco extra removido' })
    const extra = mocks.writeVersion.mock.calls[1][0] as { base: { blocks: { key: string }[] } }
    expect(extra.base.blocks.some((block) => block.key === 'trabalho')).toBe(false)
    await expect(run('remove_secretary_personality_block', { title: 'Inexistente' })).rejects.toThrow('Bloco "Inexistente" não encontrado')
  })

  it('get_secretary_personality: blocos, variantes pelo nome da conversa e versões', async () => {
    mocks.store = configured
    mocks.loadPersonality.mockResolvedValue({ versionId: 'v1', snapshot: { base: emptyPersonality(), variants: [{ jid: ana, title: 'Com a Ana', origin: 'owner', blocks: [{ key: 'tom', title: 'Tom e formalidade', content: 'Carinhoso' }] }] } })
    const view = (await run('get_secretary_personality', {})) as { base: unknown[]; variants: unknown[]; recentVersions: unknown[] }
    expect(view.base).toHaveLength(8)
    expect(view.variants).toEqual([{ conversation: 'Ana', title: 'Com a Ana', origin: 'Dono', blocks: [{ title: 'Tom e formalidade', content: 'Carinhoso' }] }])
    expect(view.recentVersions).toEqual([{ at: '2026-11-20T10:00:00.000Z', origin: 'Análise', blocksChanged: 2 }])
    expect(JSON.stringify(view)).not.toContain('@s.whatsapp.net')
  })

  it('trocar instância: grava a existente, recusa a inexistente e a Evolution fora do ar', async () => {
    mocks.store = configured
    mocks.instances.mockResolvedValue({ defaultInstance: 'opex', instances: [{ name: 'opex', state: 'connected', profileName: 'Burgos', number: null }, { name: 'pessoal', state: 'connected', profileName: null, number: null }], error: null })
    await run('set_secretary_instance', { instance: 'Pessoal' })
    expect((mocks.store as typeof configured).instance).toBe('pessoal')
    await expect(run('set_secretary_instance', { instance: 'trabalho' })).rejects.toThrow('A instância "trabalho" não existe na Evolution. Disponíveis: opex, pessoal')
    mocks.instances.mockResolvedValue({ defaultInstance: null, instances: [], error: 'Evolution API fora do ar' })
    await expect(run('set_secretary_instance', { instance: 'opex' })).rejects.toThrow('Não foi possível ler as instâncias da Evolution API: Evolution API fora do ar')
    expect(mocks.persist).toHaveBeenCalledTimes(1)
  })

  it('modelos secundários (mídia, JEV na decisão) e preço são conferidos no catálogo e gravados pelo identificador', async () => {
    mocks.store = configured
    await run('update_secretary_settings', {
      mediaModel: { sameAsAgent: false, provider: 'opencode-go', model: 'Kimi K2' },
      decisionModel: { sameAsAgent: false, provider: 'jev', model: 'JEV 1' },
      prices: [{ provider: 'opencode-go', model: 'kimi k2', inputPerMTok: 1, outputPerMTok: 2 }],
    })
    const saved = mocks.store as typeof configured
    expect(saved.media.model).toMatchObject({ sameAsAgent: false, provider: 'opencode-go', model: 'kimi-k2' })
    expect(saved.decision.model).toMatchObject({ sameAsAgent: false, provider: 'jev', model: 'jev-1' })
    expect(saved.pricing).toEqual({ 'opencode-go/kimi-k2': { inputPerMTok: 1, outputPerMTok: 2 } })
    await expect(run('update_secretary_settings', { analysisModel: { sameAsAgent: false, provider: 'opencode-go' } })).rejects.toThrow('Informe o provedor e o modelo')
    await expect(run('update_secretary_settings', { analysisModel: { sameAsAgent: false, provider: 'opencode-go', model: 'gpt-x' } })).rejects.toThrow('O modelo "gpt-x" não existe no OpenCode Go')
    await expect(run('update_secretary_settings', {})).rejects.toThrow('Informe o que mudar')
    expect(mocks.persist).toHaveBeenCalledTimes(1)
  })

  it('assuntos: "Só os liberados" com assunto, e o mesmo nome nas duas listas é recusado', async () => {
    mocks.store = configured
    await expect(run('update_secretary_subjects', { about: 'only' })).rejects.toThrow('Cadastre ao menos um assunto liberado')
    await run('update_secretary_subjects', { about: 'only', upsert: [{ list: 'allowed', name: 'Orçamento' }] })
    expect((mocks.store as typeof configured).criteria.subjects).toMatchObject({ mode: 'only', allowed: [{ name: 'Orçamento' }] })
    await expect(run('update_secretary_subjects', { upsert: [{ list: 'blocked', name: 'orcamento' }] })).rejects.toThrow('O assunto "Orçamento" já está nos assuntos liberados')
    expect(mocks.persist).toHaveBeenCalledTimes(1)
  })

  it('list_secretary_model_options: o JEV só em quem decide o assunto; com o provedor, os modelos', async () => {
    const main = (await run('list_secretary_model_options', {})) as { providers: { provider: string }[] }
    expect(main.providers.map((item) => item.provider)).toEqual(['opencode-go', 'anthropic'])
    const decision = (await run('list_secretary_model_options', { role: 'decision' })) as { providers: { provider: string }[] }
    expect(decision.providers.map((item) => item.provider)).toEqual(['opencode-go', 'anthropic', 'jev'])
    await expect(run('list_secretary_model_options', { role: 'main', provider: 'opencode-go' })).resolves.toEqual({ role: 'o agente', provider: 'OpenCode Go', models: [{ id: 'kimi-k2', name: 'Kimi K2', variants: ['high'] }] })
    await expect(run('list_secretary_model_options', { role: 'media', provider: 'jev' })).rejects.toThrow('não é aceito para a mídia')
  })

  it('find_secretary_conversations: busca pelo nome com estado e listas, sem JID', async () => {
    mocks.store = { ...configured, criteria: { ...configured.criteria, audience: { ...configured.criteria.audience, blocked: [grupo] } } }
    const all = (await run('find_secretary_conversations', {})) as { total: number }
    expect(all.total).toBe(2)
    await expect(run('find_secretary_conversations', { query: 'familia' })).resolves.toEqual({ total: 1, conversations: [{ name: 'Família', type: 'Grupo', state: 'Ativo', selected: false, neverAnswer: true }] })
    mocks.store = { ...configured, instance: null }
    await expect(run('find_secretary_conversations', {})).rejects.toThrow('Escolha antes a instância')
  })

  it('os resumos de confirmação dizem o efeito concreto', () => {
    expect(tool('set_secretary_enabled').summarize!({ enabled: true })).toContain('no modo Responder ele passa a responder pelo WhatsApp')
    expect(tool('set_secretary_enabled').summarize!({ enabled: false })).toContain('para de responder')
    expect(tool('set_secretary_mode').summarize!({ mode: 'reply' })).toContain('passa a enviar mensagens')
    expect(tool('set_secretary_instance').summarize!({ instance: 'pessoal' })).toContain('passa a ler e responder as conversas desse número')
    expect(tool('remove_secretary_subject').summarize!({ name: 'Política', list: 'blocked' })).toContain('volta a poder responder sobre esse assunto')
    expect(tool('answer_secretary_question').summarize!({ ref: 'n-1', answer: 'Pode' })).toContain('enviando mensagem ao contato')
  })
})
