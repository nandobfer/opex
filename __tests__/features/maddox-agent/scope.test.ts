import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

const store = vi.hoisted(() => ({ sessions: null as unknown }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: async () => {}, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: vi.fn(async () => {}), publishToChannels: vi.fn(async () => {}) }))
vi.mock('@/lib/db/models/Opex', () => {
  store.sessions = memoryModel()
  return { OpexSession: store.sessions, OpexMessage: memoryModel(), OpexPendingAction: memoryModel(), OpexJob: memoryModel(), OpexFile: memoryModel() }
})
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: vi.fn() }))

import { publishAppEvent } from '@/lib/pusher/channels'
import { createSession, listSessions, loadSession } from '@/features/opex-agent/server/sessions'
import { OWNER_SCOPE, sessionFilterOf, withAgent } from '@/features/opex-agent/server/scope'

const sessions = () => store.sessions as ReturnType<typeof memoryModel>
const MADDOX = withAgent(OWNER_SCOPE, 'maddox')

beforeEach(() => {
  vi.clearAllMocks()
  sessions().docs.splice(0)
})

describe('sessões separadas por agente', () => {
  it('o filtro trata a ausência de `agent` como Agente Opex', () => {
    expect(sessionFilterOf(OWNER_SCOPE)).toEqual({ clientId: null, agent: { $ne: 'maddox' } })
    expect(sessionFilterOf(MADDOX)).toEqual({ clientId: null, agent: 'maddox' })
  })

  it('cada agente lista só as próprias sessões (antigas sem `agent` são do Opex) e a do outro é 404', async () => {
    const old = await sessions().create({ title: 'Antiga', clientId: null, userId: 'local', lastMessageAt: new Date(), createdAt: new Date() })
    const maddox = await createSession('local', MADDOX)
    expect((await listSessions(OWNER_SCOPE)).map((item) => item.id)).toEqual([String(old._id)])
    expect((await listSessions(MADDOX)).map((item) => item.id)).toEqual([maddox.id])
    await expect(loadSession(maddox.id, OWNER_SCOPE)).rejects.toMatchObject({ status: 404 })
    await expect(loadSession(String(old._id), MADDOX)).rejects.toMatchObject({ status: 404 })
  })

  it('sessão do Maddox publica os eventos próprios no canal do dono', async () => {
    await createSession('local', MADDOX)
    expect(publishAppEvent).toHaveBeenCalledWith('maddox-session-updated', expect.objectContaining({ id: expect.any(String) }))
    expect(publishAppEvent).not.toHaveBeenCalledWith('opex-session-updated', expect.anything())
  })
})
