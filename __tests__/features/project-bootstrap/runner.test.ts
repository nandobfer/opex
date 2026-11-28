import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection } from '../../helpers/fake-collection'

/**
 * Motor do bootstrap (OPE-215): cada ponto de entrada que chega ao fim da etapa 2 (fim do turno, Tentar
 * novamente, volta depois do deploy com falha e a retomada depois de um reinício) passa pela conferência
 * no host ANTES da amarração; as etapas 3 e 4 não duplicam o que já foi criado.
 */

const SECRET = 'segredo-do-env-123'
const RESULT_BLOCK = '```json bootstrap-result\n{"port":4014,"healthPath":"/api/health","hasServer":true,"usesMongo":true,"branch":"qualquer"}\n```'

const mocks = vi.hoisted(() => ({
    active: new Map<string, AbortController>(),
    calls: [] as string[],
    turns: [] as { text: string; attach: boolean }[],
    turnText: '',
    turnOutcome: 'succeeded' as 'succeeded' | 'failed',
    missing: [] as string[],
    deployStatus: 'success' as 'success' | 'failed',
    /** Desfechos dos próximos deploys, em ordem (vazia = `deployStatus`). */
    deployQueue: [] as ('success' | 'failed')[],
    deployOutcome: 'success' as 'success' | 'failed',
    hostSkills: [{ id: 'bootstrap-docker', name: 'bootstrap-docker' }] as { id: string; name: string }[],
    skillListFails: false,
    probe: { outcome: 'attached', follow: true, message: null as string | null },
    settings: { enabled: true, agent: { agent: null, model: 'anthropic/claude', variant: null, fallbacks: [] }, timeoutMinutes: 60, instructions: '', skills: ['bootstrap-docker'] },
    recordAudit: vi.fn(async (_input: unknown) => {}),
    publishAppEvent: vi.fn(async (_event: string, _payload: unknown) => {}),
    publishWorkbenchEvent: vi.fn((_id: string, _event: unknown) => {}),
    client: {
        session: {
            get: vi.fn(async () => ({ id: 'sess-1' })),
            create: vi.fn(async () => ({ id: 'sess-1' })),
            update: vi.fn(async () => ({})),
            skill: vi.fn(async () => undefined),
            instructions: { entry: { put: vi.fn(async () => ({})) } },
            interrupt: vi.fn(async () => ({})),
            form: { cancel: vi.fn(async () => ({})) },
        },
    },
    store: null as unknown,
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', EXECUTAR: 'EXECUTAR' } }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent }))
vi.mock('@/features/agentic/server/hub', () => ({
    prepareHub: vi.fn(async () => {}),
    flushWorkbenchEvents: vi.fn(async () => {}),
    publishWorkbenchEvent: mocks.publishWorkbenchEvent,
    markWorkbenchActive: (id: string, controller: AbortController) => mocks.active.set(id, controller),
    clearWorkbenchActive: (id: string, controller: AbortController) => mocks.active.get(id) === controller && mocks.active.delete(id),
    isWorkbenchActive: (id: string) => mocks.active.has(id),
    abortWorkbenchRun: (id: string, reason: string) => mocks.active.get(id)?.abort(new Error(reason)),
}))
vi.mock('@/features/project-bootstrap/server/models', () => ({
    get ProjectBootstrap() {
        return mocks.store
    },
}))
vi.mock('@/features/project-bootstrap/server/settings', () => ({ loadProjectBootstrapSettings: async () => ({ settings: mocks.settings }), projectBootstrapBlockers: async () => [] }))
vi.mock('@/features/project-bootstrap/server/host', () => ({
    ensureHostDirectory: vi.fn(async () => {
        mocks.calls.push('mkdir')
    }),
    verifyDeliverables: vi.fn(async () => {
        mocks.calls.push('verify')
        return mocks.missing
    }),
    readBootstrapEnv: vi.fn(async () => `MONGODB_URI=mongodb://app:${SECRET}@mongo/app\n`),
    checkHostDirectory: vi.fn(),
}))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client', () => ({ getOpencodeClient: async () => mocks.client }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/opencode-skill-list', () => ({
    listOpencodeSkillsAt: async () => {
        if (mocks.skillListFails) throw new Error('OpenCode fora do ar')
        return { skills: mocks.hostSkills, directory: '/d', attempts: 1 }
    },
}))
vi.mock('@/lib/ai/opencode-run', () => ({
    runAgentTurn: vi.fn(async (_client: unknown, request: { text: string; attach?: boolean }) => {
        mocks.calls.push(request.attach ? 'attach' : 'turn')
        mocks.turns.push({ text: request.text, attach: request.attach === true })
        return { outcome: mocks.turnOutcome, text: mocks.turnText, message: mocks.turnOutcome === 'failed' ? 'falhou' : null, costUsd: 0, durationMs: 1 }
    }),
}))
vi.mock('@/features/agentic/server/model-fallback', () => ({ runWithFallback: (agent: unknown, text: string, run: (agent: unknown, text: string) => unknown) => run(agent, text), fallbackNotice: () => '' }))
vi.mock('@/features/agentic/server/reconnect', () => ({ probeReconnect: vi.fn(async () => mocks.probe) }))
vi.mock('@/lib/db/models/Project', () => ({ Project: { findOne: () => ({ select: () => ({ lean: async () => null }) }), findById: () => ({ select: () => ({ lean: async () => ({ name: 'app' }) }) }) } }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticCentral: { findOne: () => ({ select: () => ({ lean: async () => null }) }) } }))
vi.mock('@/features/github/server/links', () => ({
    createLink: vi.fn(async () => {
        mocks.calls.push('link')
        return { id: 'p'.repeat(24) }
    }),
}))
vi.mock('@/features/agentic/server/centrals', async () => {
    const { defaultCentralConfig } = await import('@/features/agentic/schemas')
    return {
        createCentral: vi.fn(async () => {
            mocks.calls.push('central')
            return { id: 'c'.repeat(24) }
        }),
        loadCentral: vi.fn(async () => ({ config: defaultCentralConfig('/home/u/code/app') })),
        updateCentral: vi.fn(async () => ({})),
    }
})
vi.mock('@/features/environments/server/service', () => ({
    createEnvironment: vi.fn(async () => {
        mocks.calls.push('environment')
        return { _id: 'e'.repeat(24) }
    }),
    updateEnvironment: vi.fn(async () => {
        mocks.calls.push('environment-update')
    }),
    getDeploy: vi.fn(async () => ({ log: 'compilando\nERRO: porta ocupada' })),
}))
vi.mock('@/features/environments/server/models', () => ({
    Environment: { findOne: () => ({ select: () => ({ lean: async () => null }) }), findById: () => ({ lean: async () => ({ name: 'app', slug: 'app', limits: null, composeOverrides: null }), select: () => ({ lean: async () => ({ lastDeployId: null }) }) }) },
    EnvironmentDeploy: { findById: () => ({ select: () => ({ lean: async () => ({ status: mocks.deployOutcome, error: mocks.deployOutcome === 'failed' ? 'Build falhou' : null }) }) }) },
}))
vi.mock('@/features/environments/server/deploy', () => {
    let seq = 0
    return {
        startDeploy: vi.fn(async () => {
            mocks.calls.push('deploy')
            mocks.deployOutcome = mocks.deployQueue.shift() ?? mocks.deployStatus
            return `d${++seq}`.padEnd(24, '0')
        }),
    }
})

import { resumeIfStale, startActivation } from '@/features/project-bootstrap/server/runner'
import { cancelProjectBootstrap, retryProjectBootstrap } from '@/features/project-bootstrap/server/service'

type Store = ReturnType<typeof createFakeCollection> & { exists: (filter: Record<string, unknown>) => Promise<unknown> }

function store(): Store {
    const collection = createFakeCollection() as Store
    collection.exists = async (filter) => ((await collection.countDocuments(filter)) > 0 ? { _id: 'x' } : null)
    // `$push` (lista de deploys e pedidos pendentes), que a coleção falsa não implementa.
    const updateOne = collection.updateOne
    collection.updateOne = (async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        const push = update.$push as Record<string, unknown> | undefined
        if (!push) return updateOne(filter, update)
        const doc = collection.docs.find((row) => Object.entries(filter).every(([key, value]) => String((row as Record<string, unknown>)[key]) === String(value)))
        if (!doc) return { matchedCount: 0, modifiedCount: 0 }
        for (const [key, value] of Object.entries(push)) (doc as Record<string, unknown>)[key] = [...(((doc as Record<string, unknown>)[key] as unknown[]) ?? []), value]
        return { matchedCount: 1, modifiedCount: 1 }
    }) as Store['updateOne']
    return collection
}

const docs = () => (mocks.store as Store).docs as unknown as Record<string, unknown>[]

function seed(extra: Record<string, unknown> = {}): string {
    const row = (mocks.store as Store).insert({
        repo: 'org/app',
        owner: 'org',
        name: 'app',
        visibility: 'private',
        mode: 'new',
        branch: 'main',
        directory: '/home/u/code/app',
        context: 'API em Node',
        technologies: [],
        entryColumnKey: 'todo',
        closedColumnKey: null,
        step: 'provision',
        status: 'running',
        phase: 'turn',
        attempt: 1,
        error: null,
        missing: [],
        notice: null,
        sessionId: null,
        activeSkills: null,
        pendingForms: [],
        pendingPermissions: [],
        turnStartedAt: null,
        reconnect: null,
        activationId: null,
        heartbeatAt: new Date(),
        stateAt: new Date(),
        result: null,
        created: { repoUrl: null, projectId: null, centralId: null, environmentId: null, deployId: null, port: null },
        deploys: [],
        usage: { costUsd: 0, inputTokens: 0, outputTokens: 0 },
        startedAt: new Date(),
        finishedAt: null,
        ...extra,
    })
    return String(row._id)
}

/** Espera as ativações em segundo plano (e as voltas encadeadas) terminarem. */
async function settle(): Promise<void> {
    for (let index = 0; index < 400; index++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        if (!mocks.active.size) {
            await new Promise((resolve) => setTimeout(resolve, 0))
            if (!mocks.active.size) return
        }
    }
    throw new Error('ativação não terminou')
}

/** A conferência no host acontece (e antes do passo que depende dela). */
function expectBefore(first: string, then: string): void {
    expect(mocks.calls).toContain(first)
    expect(mocks.calls).toContain(then)
    expect(mocks.calls.indexOf(first)).toBeLessThan(mocks.calls.indexOf(then))
}

const current = (id: string) => docs().find((row) => String(row._id) === id)!

beforeEach(() => {
    mocks.store = store()
    mocks.active.clear()
    mocks.calls = []
    mocks.turns = []
    mocks.turnText = `Pronto.\n${RESULT_BLOCK}`
    mocks.turnOutcome = 'succeeded'
    mocks.missing = []
    mocks.deployStatus = 'success'
    mocks.deployQueue = []
    mocks.hostSkills = [{ id: 'bootstrap-docker', name: 'bootstrap-docker' }]
    mocks.skillListFails = false
    mocks.probe = { outcome: 'attached', follow: true, message: null }
    vi.clearAllMocks()
})

describe('fim do turno', () => {
    it('confere as entregas no host antes da amarração e conclui com o deploy', async () => {
        const id = seed()
        await startActivation(id, { kind: 'turn', prompt: 'Provisione' }, { previous: null })
        await settle()
        expect(mocks.calls).toEqual(['mkdir', 'turn', 'verify', 'link', 'central', 'environment', 'deploy'])
        const doc = current(id)
        expect(doc).toMatchObject({ status: 'done', step: 'done' })
        // A branch é a decidida na etapa 1, mesmo que o agente diga outra.
        expect(doc.result).toMatchObject({ port: 4014, branch: 'main' })
        expect(doc.created).toMatchObject({ projectId: 'p'.repeat(24), centralId: 'c'.repeat(24), environmentId: 'e'.repeat(24), port: 4014 })
        expect(mocks.client.session.create).toHaveBeenCalledWith(expect.objectContaining({ permissions: [{ action: 'skill', resource: '*', effect: 'deny' }, { action: 'skill', resource: 'bootstrap-docker', effect: 'allow' }] }))
        expect(mocks.client.session.skill).toHaveBeenCalledWith({ sessionID: 'sess-1', id: 'bootstrap-docker', resume: false })
    })

    it('com pendências, falha listando o que faltou e não amarra nada', async () => {
        mocks.missing = ['push', 'port']
        const id = seed()
        await startActivation(id, { kind: 'turn', prompt: 'Provisione' }, { previous: null })
        await settle()
        expect(mocks.calls).toEqual(['mkdir', 'turn', 'verify'])
        expect(current(id)).toMatchObject({ status: 'failed', step: 'provision', missing: ['o push do último commit na branch', 'a porta anotada em /home/used_ports'] })
    })

    it('sem o resumo final, aguarda o dono sem conferir', async () => {
        mocks.turnText = 'Qual banco você prefere: PostgreSQL ou MongoDB?'
        const id = seed()
        await startActivation(id, { kind: 'turn', prompt: 'Provisione' }, { previous: null })
        await settle()
        expect(mocks.calls).toEqual(['mkdir', 'turn'])
        expect(current(id)).toMatchObject({ status: 'waiting', notice: expect.stringContaining('sem o resumo final') })
    })

    it('skill escolhida que não existe no host (ou a lista que falha) bloqueia antes de abrir a sessão', async () => {
        mocks.hostSkills = []
        const id = seed()
        await startActivation(id, { kind: 'turn', prompt: 'Provisione' }, { previous: null })
        await settle()
        expect(current(id)).toMatchObject({ status: 'failed', error: expect.stringContaining('"bootstrap-docker" não está instalada') })
        expect(mocks.client.session.create).not.toHaveBeenCalled()
        mocks.skillListFails = true
        const other = seed()
        await startActivation(other, { kind: 'turn', prompt: 'Provisione' }, { previous: null })
        await settle()
        expect(current(other)).toMatchObject({ status: 'failed', error: expect.stringContaining('listar as skills') })
        expect(mocks.calls).not.toContain('turn')
    })
})

describe('Tentar novamente', () => {
    it('com pendências, pede ao agente na mesma sessão que complete e confere de novo antes de amarrar', async () => {
        const id = seed({ status: 'failed', missing: ['a porta anotada em /home/used_ports'], sessionId: 'sess-1' })
        await retryProjectBootstrap(id, 'local')
        await settle()
        expect(mocks.turns[0]!.text).toContain('falta a porta anotada em /home/used_ports')
        expect(mocks.client.session.create).not.toHaveBeenCalled()
        // A sessão existente recebe as permissões das skills e a ativação antes do turno.
        expect(mocks.client.session.update).toHaveBeenCalledWith({ sessionID: 'sess-1', permissions: [{ action: 'skill', resource: '*', effect: 'deny' }, { action: 'skill', resource: 'bootstrap-docker', effect: 'allow' }] })
        expect(mocks.client.session.skill).toHaveBeenCalledWith({ sessionID: 'sess-1', id: 'bootstrap-docker', resume: false })
        expectBefore('mkdir', 'turn')
        expectBefore('verify', 'link')
        expect(current(id).status).toBe('done')
    })

    it('na amarração, refaz só a etapa (sem turno do agente nem nova conferência)', async () => {
        const id = seed({ step: 'link', phase: 'central', status: 'failed', result: { port: 4014, healthPath: '/', hasServer: true, usesMongo: false, branch: 'main' }, created: { repoUrl: null, projectId: 'p'.repeat(24), centralId: null, environmentId: null, deployId: null, port: 4014 } })
        await retryProjectBootstrap(id, 'local')
        await settle()
        expect(mocks.calls).toEqual(['central', 'environment', 'deploy'])
    })
})

describe('deploy com falha', () => {
    it('volta à conversa com o erro e o log, confere de novo e refaz o deploy', async () => {
        // O primeiro deploy falha; o segundo passa.
        mocks.deployQueue = ['failed', 'success']
        const id = seed()
        await startActivation(id, { kind: 'turn', prompt: 'Provisione' }, { previous: null })
        await settle()
        expect(mocks.calls).toEqual(['mkdir', 'turn', 'verify', 'link', 'central', 'environment', 'deploy', 'mkdir', 'turn', 'verify', 'environment-update', 'deploy'])
        // A volta ao agente prepara a sessão de novo (permissões), sem reativar a skill já ativa nela.
        expect(mocks.client.session.update).toHaveBeenCalledWith({ sessionID: 'sess-1', permissions: [{ action: 'skill', resource: '*', effect: 'deny' }, { action: 'skill', resource: 'bootstrap-docker', effect: 'allow' }] })
        expect(mocks.client.session.skill).toHaveBeenCalledTimes(1)
        expect(mocks.turns[1]!.text).toContain('Build falhou')
        expect(mocks.turns[1]!.text).toContain('ERRO: porta ocupada')
        const doc = current(id)
        expect(doc).toMatchObject({ status: 'done', attempt: 2 })
        expect((doc.deploys as { status: string }[]).map((item) => item.status)).toEqual(['failed', 'success'])
    })
})

describe('retomada depois de um reinício', () => {
    it('religa a mesma sessão (attach) sem reenviar o prompt e confere antes de amarrar', async () => {
        const id = seed({ sessionId: 'sess-1', turnStartedAt: new Date(), heartbeatAt: new Date(Date.now() - 10 * 60_000), stateAt: new Date(Date.now() - 10 * 60_000), activationId: 'velha' })
        expect(await resumeIfStale(current(id) as never)).toBe(true)
        await settle()
        expect(mocks.turns[0]).toEqual({ text: '', attach: true })
        expect(mocks.client.session.instructions.entry.put).not.toHaveBeenCalled()
        // Reconectar não ativa skill nem cria pasta.
        expect(mocks.client.session.skill).not.toHaveBeenCalled()
        expect(mocks.calls).not.toContain('mkdir')
        expectBefore('verify', 'link')
    })

    it('na etapa 4, refaz o deploy sem duplicar o vínculo e a central', async () => {
        const id = seed({ step: 'deploy', phase: 'deploy', result: { port: 4014, healthPath: '/', hasServer: true, usesMongo: false, branch: 'main' }, created: { repoUrl: null, projectId: 'p'.repeat(24), centralId: 'c'.repeat(24), environmentId: 'e'.repeat(24), deployId: null, port: 4014 }, heartbeatAt: new Date(0), stateAt: new Date(0) })
        await resumeIfStale(current(id) as never)
        await settle()
        expect(mocks.calls).toEqual(['environment-update', 'deploy'])
    })

    it('sessão perdida vira falha acionável; com batimento recente, nada acontece', async () => {
        const recent = seed({ sessionId: 'sess-1' })
        expect(await resumeIfStale(current(recent) as never)).toBe(false)
        mocks.probe = { outcome: 'nothing', follow: false, message: 'A sessão do OpenCode não existe mais' }
        const lost = seed({ sessionId: 'sess-1', heartbeatAt: new Date(0), stateAt: new Date(0) })
        expect(await resumeIfStale(current(lost) as never)).toBe(false)
        expect(current(lost)).toMatchObject({ status: 'failed', error: expect.stringContaining('Tentar novamente') })
    })
})

describe('cancelar e sigilo', () => {
    it('cancelar para o agente e não apaga nada do que foi criado', async () => {
        const id = seed({ step: 'deploy', status: 'failed', created: { repoUrl: null, projectId: 'p'.repeat(24), centralId: 'c'.repeat(24), environmentId: null, deployId: null, port: 4014 } })
        const dto = await cancelProjectBootstrap(id, 'local')
        expect(dto.status).toBe('cancelled')
        expect(dto.created).toMatchObject({ projectId: 'p'.repeat(24), centralId: 'c'.repeat(24), port: 4014 })
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ status: 'cancelado' }) }))
    })

    it('o .env nunca vai para a auditoria nem para os eventos', async () => {
        const id = seed()
        await startActivation(id, { kind: 'turn', prompt: 'Provisione' }, { previous: null })
        await settle()
        expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain(SECRET)
        expect(JSON.stringify(mocks.publishAppEvent.mock.calls)).not.toContain(SECRET)
        expect(JSON.stringify(mocks.publishWorkbenchEvent.mock.calls)).not.toContain(SECRET)
        expect(mocks.publishAppEvent.mock.calls.every(([, payload]) => Object.keys(payload as object).join() === 'id')).toBe(true)
    })
})
