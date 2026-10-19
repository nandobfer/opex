import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

const mocks = vi.hoisted(() => ({
  publishAppEvent: vi.fn(async () => {}),
  publishToChannels: vi.fn(async () => {}),
  clientActorFor: vi.fn(),
}))

const store = vi.hoisted(() => ({ sessions: null as unknown, messages: null as unknown, actions: null as unknown, files: null as unknown }))
vi.mock('@/lib/db/models/Opex', () => {
  store.sessions = memoryModel()
  store.messages = memoryModel()
  store.actions = memoryModel()
  store.files = memoryModel()
  return { OpexSession: store.sessions, OpexMessage: store.messages, OpexPendingAction: store.actions, OpexFile: store.files }
})
vi.mock('@/lib/db', () => ({
  dbConnect: async () => {},
  recordAudit: async () => {},
  AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' },
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent, publishToChannels: mocks.publishToChannels }))
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: mocks.clientActorFor }))

import { createSession, getSessionDetail, listSessions, loadSession, publishSessionUpdated } from '@/features/opex-agent/server/sessions'
import { OWNER_SCOPE, clientOpexScope, sessionScopeOf } from '@/features/opex-agent/server/scope'
import type { ClientActor } from '@/features/auth/server/context'
import type { MemoryModel } from '../../helpers/memory-model'

const sessions = () => store.sessions as MemoryModel
const CLIENT_A = 'a'.repeat(24)
const CLIENT_B = 'b'.repeat(24)

const actor = (clientId: string, userId = 'u1'): ClientActor =>
  ({
    userId,
    displayName: `Usuário ${userId}`,
    username: userId,
    email: null,
    client: { _id: clientId, name: 'ACME' },
    isAdmin: false,
    preview: false,
  }) as unknown as ClientActor

beforeEach(() => {
  vi.clearAllMocks()
  sessions().docs.splice(0)
})

describe('sessões do Agente Opex por escopo', () => {
  it('o dono só lista as sessões do app (nunca as do portal) e cada usuário só as suas', async () => {
    const owner = await createSession('local', OWNER_SCOPE)
    const ana = await createSession('u1', clientOpexScope(actor(CLIENT_A, 'u1')))
    const bia = await createSession('u2', clientOpexScope(actor(CLIENT_A, 'u2')))
    const outro = await createSession('u3', clientOpexScope(actor(CLIENT_B, 'u3')))

    expect((await listSessions()).map((item) => item.id)).toEqual([owner.id])
    expect((await listSessions(clientOpexScope(actor(CLIENT_A, 'u1')))).map((item) => item.id)).toEqual([ana.id])
    expect((await listSessions(clientOpexScope(actor(CLIENT_A, 'u2')))).map((item) => item.id)).toEqual([bia.id])
    expect((await listSessions(clientOpexScope(actor(CLIENT_B, 'u3')))).map((item) => item.id)).toEqual([outro.id])
  })

  it('sessão de outro usuário ou cliente responde 404 (não revela existência)', async () => {
    const ana = await createSession('u1', clientOpexScope(actor(CLIENT_A, 'u1')))
    await expect(loadSession(ana.id, clientOpexScope(actor(CLIENT_A, 'u2')))).rejects.toMatchObject({ status: 404 })
    await expect(getSessionDetail(ana.id, clientOpexScope(actor(CLIENT_B, 'u1')))).rejects.toMatchObject({ status: 404 })
    await expect(loadSession(ana.id, OWNER_SCOPE)).rejects.toMatchObject({ status: 404 })
  })

  it('a sessão guarda cliente e usuário e reconstrói o escopo pelo ator atual', async () => {
    const ana = await createSession('u1', clientOpexScope(actor(CLIENT_A, 'u1')))
    const doc = await loadSession(ana.id, clientOpexScope(actor(CLIENT_A, 'u1')))
    expect(doc).toMatchObject({ clientId: CLIENT_A, userId: 'u1' })

    mocks.clientActorFor.mockResolvedValue(actor(CLIENT_A, 'u1'))
    expect(await sessionScopeOf(doc)).toEqual({ kind: 'client', actor: actor(CLIENT_A, 'u1') })
    expect(mocks.clientActorFor).toHaveBeenCalledWith('u1', CLIENT_A)
  })

  it('o evento de sessão vai para o canal privado do dono da sessão', async () => {
    const ana = await createSession('u1', clientOpexScope(actor(CLIENT_A, 'u1')))
    const owner = await createSession('local', OWNER_SCOPE)
    await publishSessionUpdated(ana.id)
    await publishSessionUpdated(owner.id)

    expect(mocks.publishToChannels).toHaveBeenCalledWith([`private-opex-${CLIENT_A}-u1`], 'opex-session-updated', { id: ana.id })
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('opex-session-updated', { id: owner.id })
  })
})
