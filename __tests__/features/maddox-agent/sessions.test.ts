import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

/**
 * Serviços de sessão do Agente Maddox: modelo por sessão (criação e troca, conferidos no catálogo do
 * OpenCode), resposta às perguntas do OpenCode, reconciliação depois de reinício e exclusão (sessão e
 * cliente) removendo a sessão do OpenCode. Banco em memória; OpenCode sempre falso.
 */

const store = vi.hoisted(() => ({ sessions: null as unknown, messages: null as unknown }))
const mocks = vi.hoisted(() => ({
  audit: vi.fn(async () => {}),
  publishAppEvent: vi.fn(async () => {}),
  publishToChannels: vi.fn(async () => {}),
  catalog: [{ id: 'anthropic/claude', name: 'Claude', variants: ['high'] }] as { id: string; name: string; variants: string[] }[] | null,
  send: vi.fn(async () => ({ id: 'm1' })),
  interrupt: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  formReply: vi.fn(async () => ({})),
  formCancel: vi.fn(async () => ({})),
  assertClientEnabled: vi.fn(async () => {}),
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: mocks.audit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', EXECUTAR: 'EXECUTAR', ABORTAR: 'ABORTAR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent, publishToChannels: mocks.publishToChannels }))
vi.mock('@/lib/db/models/Opex', () => {
  store.sessions = memoryModel()
  store.messages = memoryModel()
  return { OpexSession: store.sessions, OpexMessage: store.messages, OpexPendingAction: memoryModel(), OpexJob: memoryModel(), OpexFile: memoryModel() }
})
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: vi.fn(async (userId: string, clientId: string) => ({ userId, client: { _id: clientId } })) }))
vi.mock('@/lib/ai/catalog', () => ({ listAiModels: async () => {
  if (!mocks.catalog) throw new Error('OpenCode fora do ar')
  return mocks.catalog
} }))
vi.mock('@/features/maddox-agent/server/runner', () => ({ sendMaddoxMessage: mocks.send }))
vi.mock('@/features/maddox-agent/server/opencode-session', () => ({ interruptOpencodeSession: mocks.interrupt, removeOpencodeSession: mocks.remove }))
vi.mock('@/features/maddox-agent/server/client-config', () => ({ assertClientMaddoxEnabled: mocks.assertClientEnabled }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: async () => ({ session: { form: { reply: mocks.formReply, cancel: mocks.formCancel } } }) }))
vi.mock('@/features/opex-agent/server/files', () => ({ deleteSessionFiles: vi.fn(async () => {}) }))

import { createMaddoxSession, updateMaddoxSession, MADDOX_OWNER_SCOPE, clientMaddoxScope } from '@/features/maddox-agent/server/sessions'
import { replyMaddoxForm } from '@/features/maddox-agent/server/requests'
import { deleteClientOpexData, deleteSession, listSessions, loadSession } from '@/features/opex-agent/server/sessions'
import { OWNER_SCOPE } from '@/features/opex-agent/server/scope'
import type { ClientActor } from '@/features/auth/server/context'

type Doc = Record<string, unknown> & { _id: unknown }
const sessions = () => store.sessions as ReturnType<typeof memoryModel>
const docOf = (id: string) => sessions().docs.find((doc) => String((doc as Doc)._id) === id) as Doc
const actor = { userId: 'u1', client: { _id: 'c1' } } as unknown as ClientActor

beforeEach(() => {
  vi.clearAllMocks()
  sessions().docs.splice(0)
  mocks.catalog = [{ id: 'anthropic/claude', name: 'Claude', variants: ['high'] }]
})

describe('modelo da sessão', () => {
  it('criar com modelo e variante do catálogo grava a troca, audita e publica o evento do Maddox; com texto, já envia', async () => {
    const { session, message } = await createMaddoxSession({ model: 'anthropic/claude', variant: 'high', text: 'Oi' }, 'local', MADDOX_OWNER_SCOPE)
    expect(docOf(session.id)).toMatchObject({ agent: 'maddox', modelOverride: { model: 'anthropic/claude', variant: 'high' } })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'CRIAR', entidadeId: session.id }))
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('maddox-session-updated', { id: session.id })
    expect(mocks.send).toHaveBeenCalledWith(session.id, { text: 'Oi' }, 'local', MADDOX_OWNER_SCOPE)
    expect(message).toEqual({ id: 'm1' })
  })

  it('modelo ou variante fora do catálogo são recusados sem criar a sessão; catálogo indisponível dá 502', async () => {
    await expect(createMaddoxSession({ model: 'x/y' }, 'local', MADDOX_OWNER_SCOPE)).rejects.toMatchObject({ status: 400, code: 'AI_MODEL_NOT_FOUND' })
    await expect(createMaddoxSession({ model: 'anthropic/claude', variant: 'max' }, 'local', MADDOX_OWNER_SCOPE)).rejects.toMatchObject({ status: 400, code: 'AI_VARIANT_NOT_FOUND' })
    mocks.catalog = null
    await expect(createMaddoxSession({ model: 'anthropic/claude' }, 'local', MADDOX_OWNER_SCOPE)).rejects.toMatchObject({ status: 502, code: 'MADDOX_UNAVAILABLE' })
    expect(sessions().docs).toHaveLength(0)
  })

  it('trocar o modelo vale só para a sessão; `null` volta ao padrão; cada troca é auditada e publicada', async () => {
    const { session } = await createMaddoxSession({}, 'local', MADDOX_OWNER_SCOPE)
    vi.clearAllMocks()
    const changed = await updateMaddoxSession(session.id, { model: 'anthropic/claude', variant: 'high' }, 'local', MADDOX_OWNER_SCOPE)
    expect(docOf(session.id).modelOverride).toEqual({ model: 'anthropic/claude', variant: 'high' })
    expect(changed.id).toBe(session.id)
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'ATUALIZAR', antes: { modelo: 'padrão', variante: null }, depois: { modelo: 'anthropic/claude', variante: 'high' } }))
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('maddox-session-updated', { id: session.id })

    await updateMaddoxSession(session.id, { model: null }, 'local', MADDOX_OWNER_SCOPE)
    expect(docOf(session.id).modelOverride).toBeNull()
    expect(mocks.audit).toHaveBeenLastCalledWith(expect.objectContaining({ depois: { modelo: 'padrão', variante: null } }))
  })

  it('troca para modelo fora do catálogo é recusada e mantém o modelo anterior; sessão do Agente Opex é 404', async () => {
    const { session } = await createMaddoxSession({ model: 'anthropic/claude' }, 'local', MADDOX_OWNER_SCOPE)
    await expect(updateMaddoxSession(session.id, { model: 'x/y' }, 'local', MADDOX_OWNER_SCOPE)).rejects.toMatchObject({ code: 'AI_MODEL_NOT_FOUND' })
    expect(docOf(session.id).modelOverride).toEqual({ model: 'anthropic/claude', variant: null })
    const opex = await sessions().create({ title: 'Opex', clientId: null, userId: 'local', lastMessageAt: new Date() })
    await expect(updateMaddoxSession(String(opex._id), { model: null }, 'local', MADDOX_OWNER_SCOPE)).rejects.toMatchObject({ status: 404 })
  })
})

describe('perguntas do OpenCode', () => {
  async function sessionWithForm(scope = MADDOX_OWNER_SCOPE) {
    const { session } = await createMaddoxSession({}, scope.kind === 'client' ? 'u1' : 'local', scope)
    Object.assign(docOf(session.id), { opencodeSessionId: 'ses_oc', status: 'awaiting_confirmation', pendingRequests: [{ id: 'f1', kind: 'form', partId: 'p1' }] })
    return session.id
  }

  it('responder envia a resposta ao OpenCode, fecha o pedido (a sessão volta a responder) e audita', async () => {
    const id = await sessionWithForm()
    await expect(replyMaddoxForm('f1', { answer: { nome: 'Ana' } }, 'local', MADDOX_OWNER_SCOPE)).resolves.toEqual({ id: 'f1', status: 'answered' })
    expect(mocks.formReply).toHaveBeenCalledWith({ sessionID: 'ses_oc', formID: 'f1', answer: { nome: 'Ana' } })
    expect(docOf(id)).toMatchObject({ pendingRequests: [], status: 'running' })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entidadeId: id, depois: { pergunta: 'f1', situacao: 'answered' } }))
  })

  it('dispensar cancela no OpenCode; pergunta já respondida dá 409', async () => {
    await sessionWithForm()
    await expect(replyMaddoxForm('f1', { cancel: true }, 'local', MADDOX_OWNER_SCOPE)).resolves.toEqual({ id: 'f1', status: 'cancelled' })
    expect(mocks.formCancel).toHaveBeenCalledWith({ sessionID: 'ses_oc', formID: 'f1' })
    await expect(replyMaddoxForm('f1', { cancel: true }, 'local', MADDOX_OWNER_SCOPE)).rejects.toMatchObject({ status: 409 })
  })

  it('portal: confere o Maddox ligado para o cliente e só alcança as sessões do próprio usuário', async () => {
    const scope = clientMaddoxScope(actor)
    await sessionWithForm(scope)
    await expect(replyMaddoxForm('f1', { answer: {} }, 'local', MADDOX_OWNER_SCOPE)).rejects.toMatchObject({ status: 409 })
    await expect(replyMaddoxForm('f1', { answer: {} }, 'u1', scope)).resolves.toMatchObject({ status: 'answered' })
    expect(mocks.assertClientEnabled).toHaveBeenCalled()
    mocks.assertClientEnabled.mockRejectedValueOnce(Object.assign(new Error('Agente Maddox desligado'), { status: 403 }))
    await expect(replyMaddoxForm('f1', { answer: {} }, 'u1', scope)).rejects.toMatchObject({ status: 403 })
  })
})

describe('reinício e exclusão', () => {
  it('Maddox "aguardando confirmação" sem turno vivo vira erro com aviso e interrompe a sessão do OpenCode', async () => {
    const { session } = await createMaddoxSession({}, 'local', MADDOX_OWNER_SCOPE)
    Object.assign(docOf(session.id), { opencodeSessionId: 'ses_oc', status: 'awaiting_confirmation', pendingRequests: [{ id: 'q1', kind: 'permission', partId: 'p1' }] })
    const loaded = await loadSession(session.id, MADDOX_OWNER_SCOPE)
    expect(loaded).toMatchObject({ status: 'error', lastError: expect.stringContaining('servidor reiniciou') })
    expect(docOf(session.id)).toMatchObject({ status: 'error', pendingRequests: [] })
    expect(mocks.interrupt).toHaveBeenCalledWith('ses_oc')
  })

  it('Agente Opex "aguardando confirmação" continua aguardando (a ação fica gravada no Opex)', async () => {
    const opex = await sessions().create({ title: 'Opex', clientId: null, userId: 'local', status: 'awaiting_confirmation', lastMessageAt: new Date() })
    expect((await listSessions(OWNER_SCOPE)).find((item) => item.id === String(opex._id))?.status).toBe('awaiting_confirmation')
    expect(mocks.interrupt).not.toHaveBeenCalled()
  })

  it('excluir a sessão do Maddox remove a sessão do OpenCode e publica o evento próprio', async () => {
    const { session } = await createMaddoxSession({}, 'local', MADDOX_OWNER_SCOPE)
    Object.assign(docOf(session.id), { opencodeSessionId: 'ses_oc' })
    await deleteSession(session.id, 'local', MADDOX_OWNER_SCOPE)
    expect(mocks.remove).toHaveBeenCalledWith('ses_oc')
    expect(sessions().docs).toHaveLength(0)
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('maddox-session-deleted', { id: session.id })
  })

  it('excluir o cliente apaga as sessões dos dois agentes e remove do OpenCode só as do Maddox', async () => {
    const scope = clientMaddoxScope(actor)
    const { session } = await createMaddoxSession({}, 'u1', scope)
    Object.assign(docOf(session.id), { opencodeSessionId: 'ses_cliente' })
    await sessions().create({ title: 'Opex do cliente', clientId: 'c1', userId: 'u1', lastMessageAt: new Date() })
    await sessions().create({ title: 'Outro cliente', clientId: 'c2', userId: 'u2', agent: 'maddox', opencodeSessionId: 'ses_outro', lastMessageAt: new Date() })
    await deleteClientOpexData('c1')
    expect(mocks.remove).toHaveBeenCalledTimes(1)
    expect(mocks.remove).toHaveBeenCalledWith('ses_cliente')
    expect(sessions().docs.map((doc) => (doc as Doc).clientId)).toEqual(['c2'])
  })
})
