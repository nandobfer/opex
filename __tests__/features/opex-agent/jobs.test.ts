import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel, type Doc } from '../../helpers/memory-model'

const mocks = vi.hoisted(() => ({
  parts: [] as unknown[],
  gate: null as Promise<void> | null,
  streamText: vi.fn(),
  publishAppEvent: vi.fn(async () => {}),
  publishToChannels: vi.fn(async () => {}),
  recordAudit: vi.fn(async () => {}),
  available: true,
  clientActorFor: vi.fn(),
  assertClientEnabled: vi.fn(async () => ({ enabled: true, disabledTools: [], enabledOptInTools: [] })),
  enabledNames: vi.fn(async () => ({ names: ['list_tasks', 'list_jobs', 'schedule_job'], config: {} })),
}))

vi.mock('ai', () => ({
  isLoopFinished: () => () => false,
  dynamicTool: (def: unknown) => def,
  streamText: (options: unknown) => {
    mocks.streamText(options)
    return {
      fullStream: (async function* () {
        if (mocks.gate) await mocks.gate
        for (const part of mocks.parts) yield part
      })(),
      responseMessages: Promise.resolve([{ role: 'assistant', content: 'Feito.' }]),
    }
  },
}))
vi.mock('@/lib/ai/stream', () => ({
  prepareModel: async () => ({ model: { id: 'modelo' }, dispose: async () => {} }),
  samplingOptions: () => ({}),
  describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: async () => {} }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', ABORTAR: 'ABORTAR', EXECUTAR: 'EXECUTAR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent, publishToChannels: mocks.publishToChannels }))
vi.mock('@/lib/storage/s3', () => ({ getFileObject: vi.fn(), getUploadUrl: vi.fn(), headFile: vi.fn(), copyFile: vi.fn(), deleteFile: vi.fn(), storageErrorInfo: () => ({ kind: 'unavailable', httpStatus: null, code: null }) }))
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: mocks.clientActorFor }))

function opexModel() {
  const model = memoryModel()
  const base = model.findOneAndUpdate
  return Object.assign(model, {
    createIndexes: async () => {},
    findOneAndUpdate: (filter: Doc, update: Doc, options?: { new?: boolean }) => ({
      lean: async () => {
        const [found] = (await model.find(filter).lean()) as Doc[]
        if (!found) return null
        const before = { ...found }
        const after = await base(filter, update).lean()
        return options?.new === false ? before : after
      },
    }),
    findByIdAndUpdate: (id: string, update: Doc) => base({ _id: id }, update),
  })
}
const store = vi.hoisted(() => ({ sessions: null as unknown, messages: null as unknown, jobs: null as unknown, clients: null as unknown, users: null as unknown }))
vi.mock('@/lib/db/models/Opex', () => {
  store.sessions = opexModel()
  store.messages = opexModel()
  store.jobs = opexModel()
  return { OpexSession: store.sessions, OpexMessage: store.messages, OpexPendingAction: opexModel(), OpexFile: opexModel(), OpexJob: store.jobs }
})
vi.mock('@/lib/db/models/Orcamento', () => {
  store.clients = memoryModel()
  return { OrcamentoClient: store.clients }
})
vi.mock('@/lib/db/models/User', () => {
  store.users = memoryModel()
  return { User: store.users }
})
vi.mock('@/features/ai/server/agent-memory-context', async () => (await import('../../helpers/memory-context')).memoryContextModule())
vi.mock('@/features/ai/server/self-memory/settings', async () => (await import('../../helpers/memory-context')).selfMemorySettingsModule())
vi.mock('@/features/opex-agent/server/settings', () => ({
  loadOpexSettings: async () => ({
    settings: { enabled: true, main: { provider: 'anthropic', model: 'claude-x', variant: null, temperature: null, maxOutputTokens: null }, title: { provider: null, model: null, variant: null }, instructions: 'Seja útil', titleInstructions: 'T', disabledTools: [], confirmationOverrides: {}, files: { maxPerMessage: 5, maxSizeMb: 10 } },
    isDefault: false,
    updatedAt: null,
  }),
  opexAvailability: async () => (mocks.available ? { available: true, reason: null } : { available: false, reason: 'Agente desativado' }),
}))
vi.mock('@/features/opex-agent/server/titler', () => ({ refreshSessionTitle: async () => {} }))
vi.mock('@/features/opex-agent/server/confirmations', () => ({ requestConfirmation: vi.fn(), refreshConfirmations: async (parts: unknown[]) => parts }))
vi.mock('@/features/opex-agent/server/tools/context', () => ({ nowContext: () => ({ iso: '2026-10-23T12:00:00.000Z', local: 'sexta', timeZone: 'America/Sao_Paulo' }) }))
vi.mock('@/features/opex-agent/server/tools/registry', () => ({ enabledOpexTools: () => [], findOpexTool: () => undefined, needsConfirmation: () => false }))
vi.mock('@/features/opex-agent/server/client-tools/registry', () => ({ enabledClientOpexServerTools: () => [], findOpexClientServerTool: () => undefined }))
vi.mock('@/features/opex-agent/server/client-config', () => ({
  assertClientOpexEnabled: mocks.assertClientEnabled,
  assertClientToolAllowed: vi.fn(),
  enabledClientToolNamesFor: mocks.enabledNames,
}))

import { cancelOpexJob, createOpexJob, finishJobTurn, listOpexJobs, runDueOpexJobs, updateOpexJob } from '@/features/opex-agent/server/jobs'
import { isTurnActive } from '@/features/opex-agent/server/hub'
import { sendMessage } from '@/features/opex-agent/server/runner'
import { formatJobDelay, opexJobInputSchema, resolveRunAt, type OpexJobInput } from '@/features/opex-agent/jobs'
import type { OpexServerScope } from '@/features/opex-agent/server/scope'

type Model = ReturnType<typeof opexModel>
const sessions = () => store.sessions as Model
const messages = () => store.messages as Model
const jobs = () => store.jobs as Model

const NOW = new Date('2026-10-23T12:00:00.000Z') // 09:00 em Brasília
const origin = { actorId: 'local', createdBy: 'user' as const }
const input = (patch: Partial<OpexJobInput> = {}): OpexJobInput => ({ title: 'Resumo dos PRs', prompt: 'Liste os PRs abertos', sessionId: null, when: 'now', amount: null, unit: null, date: null, time: null, ...patch })

const CLIENT = 'c'.repeat(24)
const USER = 'e'.repeat(24)
const OTHER_USER = 'f'.repeat(24)
const actor = (userId = USER) => ({ userId, displayName: 'ana', username: 'ana', email: null, client: { _id: CLIENT, name: 'ACME' }, isAdmin: false, preview: false })
const clientScope = (userId = USER): OpexServerScope => ({ kind: 'client', actor: actor(userId) as never })

async function newSession(owner: { clientId: string | null; userId: string } = { clientId: null, userId: 'local' }): Promise<string> {
  const doc = await sessions().create({ title: 'Conversa', summary: '', titleSource: 'auto', status: 'idle', nextSeq: 1, messageCount: 0, lastMessageAt: new Date(), ...owner })
  return String(doc._id)
}

const jobDoc = () => jobs().docs[0]!
const eventsOf = (event: string) => mocks.publishAppEvent.mock.calls.filter((call) => (call as unknown[])[0] === event).map((call) => (call as unknown[])[1])
const channelEvents = () => mocks.publishToChannels.mock.calls.map((call) => [(call as unknown[])[0], (call as unknown[])[1]])
const domainError = (code: string) => Object.assign(new Error(code), { code, status: 403 })

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.parts = [{ type: 'text-delta', id: 'x', text: 'Feito.' }, { type: 'finish', finishReason: 'stop', totalUsage: {} }]
  mocks.gate = null
  mocks.available = true
  mocks.clientActorFor.mockImplementation(async (userId: string) => actor(userId))
  mocks.enabledNames.mockResolvedValue({ names: ['list_tasks', 'list_jobs', 'schedule_job'], config: {} })
  for (const model of [sessions(), messages(), jobs()]) model.docs.splice(0)
  ;(store.clients as Model).docs.splice(0)
  ;(store.clients as Model).docs.push({ _id: CLIENT, name: 'ACME' })
  ;(store.users as Model).docs.splice(0)
  ;(store.users as Model).docs.push({ _id: USER, username: 'ana' })
})

describe('jobs: módulo puro', () => {
  it('resolve "daqui a" e "em data e hora" no fuso de Brasília', () => {
    expect(resolveRunAt({ when: 'in', amount: 2, unit: 'hours', date: null, time: null }, NOW)).toEqual({ runAt: new Date('2026-10-23T14:00:00.000Z') })
    expect(resolveRunAt({ when: 'at', amount: null, unit: null, date: '2026-10-23', time: '18:30' }, NOW)).toEqual({ runAt: new Date('2026-10-23T21:30:00.000Z') })
  })

  it('recusa horário passado e agendamento além de um ano', () => {
    expect(resolveRunAt({ when: 'at', amount: null, unit: null, date: '2026-10-23', time: '08:00' }, NOW)).toEqual({ error: 'O horário escolhido já passou' })
    expect(resolveRunAt({ when: 'in', amount: 400, unit: 'days', date: null, time: null }, NOW)).toEqual({ error: 'Agende para no máximo um ano à frente' })
  })

  it('o schema exige os campos do tipo escolhido', () => {
    const result = opexJobInputSchema.safeParse(input({ when: 'at' }))
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['date', 'time'])
    expect(opexJobInputSchema.safeParse(input({ when: 'in', amount: 30, unit: 'minutes' })).success).toBe(true)
  })

  it('formata só atraso relevante', () => {
    expect(formatJobDelay(30_000)).toBeNull()
    expect(formatJobDelay(12 * 60_000)).toBe('12 min')
    expect(formatJobDelay(185 * 60_000)).toBe('3 h 5 min')
  })
})

describe('jobs do dono', () => {
  it('"agora" com sessão nova: cria a sessão com o título do job, envia o prompt como job e conclui ao fim do turno', async () => {
    const job = await createOpexJob(input(), origin, undefined, NOW)
    expect(job.status).toBe('running')
    expect(job.origin).toEqual({ kind: 'owner' })
    expect(sessions().docs[0]).toMatchObject({ title: 'Resumo dos PRs', clientId: null })
    await vi.waitFor(() => expect(jobDoc().status).toBe('done'))

    const user = messages().docs.find((doc) => doc.role === 'user')!
    expect(user).toMatchObject({ kind: 'job', text: 'Liste os PRs abertos', job: { id: job.id, title: 'Resumo dos PRs' } })
    const modelText = JSON.parse(user.modelMessages as string)[0].content as string
    expect(modelText).toContain('[Job "Resumo dos PRs", agendado pelo usuário')
    expect(modelText.endsWith('Liste os PRs abertos')).toBe(true)
    expect(jobDoc()).toMatchObject({ resultSessionId: expect.anything(), delayMs: 0, error: null, clientId: null, userId: 'local' })
    expect(jobDoc().purgeAt).toBeInstanceOf(Date)
    expect(eventsOf('opex-job-finished')).toEqual([{ id: job.id, title: 'Resumo dos PRs', status: 'done', sessionId: String(sessions().docs[0]!._id), error: null, origin: 'owner' }])
    expect(mocks.publishToChannels.mock.calls.filter((call) => String((call as unknown[])[1]).startsWith('opex-job'))).toEqual([])
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'JobAgenteOpex', acao: 'EXECUTAR', depois: expect.objectContaining({ resultado: 'done' }) }))
  })

  it('agendado: espera o horário; o tick atrasado executa e registra o atraso', async () => {
    const sessionId = await newSession()
    await createOpexJob(input({ sessionId, when: 'in', amount: 30, unit: 'minutes' }), origin, undefined, NOW)
    expect(jobDoc().status).toBe('scheduled')
    expect(await runDueOpexJobs(new Date(NOW.getTime() + 10 * 60_000))).toEqual([])

    const late = new Date(NOW.getTime() + 45 * 60_000)
    expect(await runDueOpexJobs(late)).toHaveLength(1)
    await vi.waitFor(() => expect(jobDoc().status).toBe('done'))
    expect(jobDoc().delayMs).toBe(15 * 60_000)
    expect(String(jobDoc().resultSessionId)).toBe(sessionId)
    const modelText = JSON.parse(messages().docs.find((doc) => doc.role === 'user')!.modelMessages as string)[0].content as string
    expect(modelText).toContain('executado com 15 min de atraso')
  })

  it('agente desligado ou indisponível: o job do dono continua agendado e roda depois, com atraso', async () => {
    mocks.available = false
    const job = await createOpexJob(input(), origin, undefined, NOW)
    expect(job.status).toBe('scheduled')
    expect(await runDueOpexJobs(new Date(NOW.getTime() + 5 * 60_000))).toEqual([])
    expect(jobDoc()).toMatchObject({ status: 'scheduled' })
    expect(jobDoc().startedAt).toBeUndefined()

    mocks.available = true
    expect(await runDueOpexJobs(new Date(NOW.getTime() + 20 * 60_000))).toHaveLength(1)
    await vi.waitFor(() => expect(jobDoc().status).toBe('done'))
    expect(jobDoc().delayMs).toBe(20 * 60_000)
  })

  it('sessão respondendo: o job espera na fila e roda depois do turno atual', async () => {
    const sessionId = await newSession()
    let release: () => void = () => {}
    mocks.gate = new Promise<void>((resolve) => (release = resolve))
    await sendMessage(sessionId, { text: 'Primeira' }, 'local')
    await createOpexJob(input({ sessionId }), origin, undefined, NOW)
    expect(jobDoc().status).toBe('running')
    expect(messages().docs.filter((doc) => doc.kind === 'job')).toHaveLength(0)
    mocks.gate = null
    release()
    await vi.waitFor(() => expect(jobDoc().status).toBe('done'))
    expect(messages().docs.filter((doc) => doc.kind === 'job')).toHaveLength(1)
    await vi.waitFor(() => expect(isTurnActive(sessionId)).toBe(false))
  })

  it('confirmação pendente termina como "aguardando confirmação"; falha do turno vira erro', async () => {
    const [a, b] = await Promise.all([jobs().create({ title: 'A', status: 'running', runAt: NOW, startedAt: NOW, clientId: null, userId: 'local' }), jobs().create({ title: 'B', status: 'running', runAt: NOW, startedAt: NOW, clientId: null, userId: 'local' })])
    await finishJobTurn(String(a._id), { status: 'complete', error: null, pendingConfirmation: true })
    await finishJobTurn(String(b._id), { status: 'error', error: 'Credencial recusada', pendingConfirmation: false })
    expect(jobs().docs.map((doc) => [doc.status, doc.error])).toEqual([
      ['awaiting_confirmation', null],
      ['error', 'Credencial recusada'],
    ])
  })

  it('sessão escolhida excluída: o job falha com motivo acionável', async () => {
    const sessionId = await newSession()
    await createOpexJob(input({ sessionId, when: 'in', amount: 5, unit: 'minutes' }), origin, undefined, NOW)
    sessions().docs.splice(0)
    await runDueOpexJobs(new Date(NOW.getTime() + 6 * 60_000))
    expect(jobDoc()).toMatchObject({ status: 'error', error: expect.stringContaining('A sessão escolhida para o job foi excluída') })
  })

  it('regressão: job "executando" sem turno vivo nem fila é marcado como perdido', async () => {
    const sessionId = await newSession()
    await jobs().create({ title: 'Perdido', status: 'running', runAt: NOW, startedAt: NOW, resultSessionId: sessionId, clientId: null, userId: 'local' })
    await runDueOpexJobs(new Date(NOW.getTime() + 5 * 60_000))
    expect(jobDoc()).toMatchObject({ status: 'error', error: expect.stringContaining('servidor reiniciou') })
  })

  it('editar e cancelar só enquanto agendado; horário passado é recusado', async () => {
    const job = await createOpexJob(input({ when: 'in', amount: 1, unit: 'hours' }), origin, undefined, NOW)
    const updated = await updateOpexJob(job.id, input({ title: 'Novo', when: 'at', date: '2026-10-23', time: '20:00' }), 'local', undefined, NOW)
    expect(updated).toMatchObject({ title: 'Novo', runAt: '2026-10-23T23:00:00.000Z', status: 'scheduled' })
    await expect(updateOpexJob(job.id, input({ when: 'at', date: '2026-10-22', time: '20:00' }), 'local', undefined, NOW)).rejects.toMatchObject({ status: 400, code: 'OPEX_JOB_INVALID_SCHEDULE' })

    expect((await cancelOpexJob(job.id, 'local', undefined, NOW)).status).toBe('canceled')
    await expect(cancelOpexJob(job.id, 'local', undefined, NOW)).rejects.toMatchObject({ status: 409, code: 'OPEX_JOB_NOT_SCHEDULED' })
    await expect(updateOpexJob(job.id, input(), 'local', undefined, NOW)).rejects.toMatchObject({ status: 409 })
    expect((await listOpexJobs({ filter: 'scheduled' })).map((item) => item.id)).toEqual([])
    expect((await listOpexJobs({ filter: 'finished' })).map((item) => item.status)).toEqual(['canceled'])
  })

  it('sessão escolhida inexistente recusa o agendamento (400)', async () => {
    await expect(createOpexJob(input({ sessionId: 'a'.repeat(24) }), origin, undefined, NOW)).rejects.toMatchObject({ status: 400, code: 'OPEX_JOB_SESSION_NOT_FOUND' })
    expect(jobs().docs).toHaveLength(0)
  })
})

describe('jobs do portal do cliente', () => {
  it('cria no escopo do usuário: sessão nova do usuário, eventos no app e no canal do usuário', async () => {
    const job = await createOpexJob(input(), { actorId: USER, createdBy: 'agent' }, clientScope(), NOW)
    expect(job.origin).toEqual({ kind: 'client', clientId: CLIENT, clientName: 'ACME', userId: USER, userName: 'ana' })
    expect(sessions().docs[0]).toMatchObject({ clientId: CLIENT, userId: USER, title: 'Resumo dos PRs' })
    await vi.waitFor(() => expect(jobDoc().status).toBe('done'))
    expect(jobDoc()).toMatchObject({ clientId: CLIENT, userId: USER })
    expect(mocks.clientActorFor).toHaveBeenCalledWith(USER, CLIENT)
    expect(eventsOf('opex-job-finished')).toEqual([expect.objectContaining({ id: job.id, status: 'done', origin: 'client' })])
    expect(channelEvents()).toEqual(expect.arrayContaining([[[`private-opex-${CLIENT}-${USER}`], 'opex-job-updated'], [[`private-opex-${CLIENT}-${USER}`], 'opex-job-finished']]))
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'JobAgenteOpex', acao: 'EXECUTAR', userId: USER }))
  })

  it('escopo: o usuário só vê e mexe nos próprios jobs; sessão de outro escopo é recusada', async () => {
    const ownerJob = await createOpexJob(input({ when: 'in', amount: 1, unit: 'hours' }), origin, undefined, NOW)
    const mine = await createOpexJob(input({ title: 'Meu', when: 'in', amount: 1, unit: 'hours' }), { actorId: USER, createdBy: 'user' }, clientScope(), NOW)
    await createOpexJob(input({ title: 'Do colega', when: 'in', amount: 1, unit: 'hours' }), { actorId: OTHER_USER, createdBy: 'user' }, clientScope(OTHER_USER), NOW)

    expect((await listOpexJobs({}, clientScope())).map((item) => item.title)).toEqual(['Meu'])
    await expect(cancelOpexJob(ownerJob.id, USER, clientScope(), NOW)).rejects.toMatchObject({ status: 404 })
    const ownerSession = await newSession()
    await expect(createOpexJob(input({ sessionId: ownerSession }), { actorId: USER, createdBy: 'user' }, clientScope(), NOW)).rejects.toMatchObject({ status: 400, code: 'OPEX_JOB_SESSION_NOT_FOUND' })
    expect((await cancelOpexJob(mine.id, USER, clientScope(), NOW)).status).toBe('canceled')
  })

  it('o dono vê todos e filtra por origem e cliente', async () => {
    await createOpexJob(input({ title: 'Dono', when: 'in', amount: 1, unit: 'hours' }), origin, undefined, NOW)
    await createOpexJob(input({ title: 'Portal', when: 'in', amount: 2, unit: 'hours' }), { actorId: USER, createdBy: 'user' }, clientScope(), NOW)
    expect((await listOpexJobs({ filter: 'scheduled' })).map((item) => item.title)).toEqual(['Dono', 'Portal'])
    expect((await listOpexJobs({ origin: 'owner' })).map((item) => item.title)).toEqual(['Dono'])
    expect((await listOpexJobs({ origin: 'client' })).map((item) => item.title)).toEqual(['Portal'])
    expect((await listOpexJobs({ origin: 'client', clientId: 'd'.repeat(24) })).map((item) => item.title)).toEqual([])
  })

  it('o dono não edita job do portal (403), mas cancela e reexecuta mantendo cliente, usuário e sessão', async () => {
    const sessionId = await newSession({ clientId: CLIENT, userId: USER })
    const job = await createOpexJob(input({ sessionId, when: 'in', amount: 1, unit: 'hours' }), { actorId: USER, createdBy: 'user' }, clientScope(), NOW)
    await expect(updateOpexJob(job.id, input({ title: 'X', when: 'in', amount: 2, unit: 'hours' }), 'local', undefined, NOW)).rejects.toMatchObject({ status: 403, code: 'OPEX_JOB_CLIENT_READONLY' })
    expect((await cancelOpexJob(job.id, 'local', undefined, NOW)).status).toBe('canceled')

    const rerun = await createOpexJob({ ...input({ sessionId: null, when: 'in', amount: 5, unit: 'minutes' }), sourceJobId: job.id }, origin, undefined, NOW)
    expect(rerun).toMatchObject({ sessionId, sourceJobId: job.id, origin: expect.objectContaining({ kind: 'client', userId: USER }) })
    expect(jobs().docs.at(-1)).toMatchObject({ clientId: CLIENT, userId: USER })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'CRIAR', userId: 'local', depois: expect.objectContaining({ reexecucaoDe: job.id }) }))
  })

  it.each([
    ['UNAUTHENTICATED', 'O usuário foi desativado ou removido'],
    ['FORBIDDEN', 'O usuário não está mais vinculado ao cliente'],
    ['CLIENT_INACTIVE', 'O cliente foi desativado ou excluído'],
    ['CLIENT_NOT_FOUND', 'O cliente foi desativado ou excluído'],
  ])('ator inválido na execução (%s) vira erro com motivo', async (code, reason) => {
    await createOpexJob(input({ when: 'in', amount: 5, unit: 'minutes' }), { actorId: USER, createdBy: 'user' }, clientScope(), NOW)
    mocks.clientActorFor.mockRejectedValue(domainError(code))
    await runDueOpexJobs(new Date(NOW.getTime() + 6 * 60_000))
    expect(jobDoc()).toMatchObject({ status: 'error', error: reason })
  })

  it('agente desativado para o cliente ou grupo de jobs desligado: erro com motivo', async () => {
    await createOpexJob(input({ when: 'in', amount: 5, unit: 'minutes' }), { actorId: USER, createdBy: 'user' }, clientScope(), NOW)
    mocks.assertClientEnabled.mockRejectedValueOnce(domainError('OPEX_CLIENT_DISABLED'))
    await runDueOpexJobs(new Date(NOW.getTime() + 6 * 60_000))
    expect(jobDoc()).toMatchObject({ status: 'error', error: 'O Agente Opex foi desativado para este cliente' })

    jobs().docs.splice(0)
    await createOpexJob(input({ when: 'in', amount: 5, unit: 'minutes' }), { actorId: USER, createdBy: 'user' }, clientScope(), NOW)
    mocks.enabledNames.mockResolvedValue({ names: ['list_tasks'], config: {} })
    await runDueOpexJobs(new Date(NOW.getTime() + 6 * 60_000))
    expect(jobDoc()).toMatchObject({ status: 'error', error: 'Os jobs foram desativados para este cliente' })
    expect(sessions().docs).toHaveLength(0)
  })

  it('job do portal não espera o agente do dono: com o agente indisponível, falha com o motivo', async () => {
    await createOpexJob(input({ when: 'in', amount: 5, unit: 'minutes' }), { actorId: USER, createdBy: 'user' }, clientScope(), NOW)
    mocks.available = false
    await runDueOpexJobs(new Date(NOW.getTime() + 6 * 60_000))
    expect(jobDoc()).toMatchObject({ status: 'error', error: 'Agente desativado' })
  })
})
