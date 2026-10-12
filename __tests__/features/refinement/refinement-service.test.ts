import { beforeEach, describe, expect, it, vi } from 'vitest'

const SPEC = '## Especificação técnica\n\n- critério de aceite\n- localização: /tarefas\n- edge case: vazio'

const mocks = vi.hoisted(() => {
    const fakeClient = {
        session: {
            get: vi.fn(async () => null),
            create: vi.fn(async ({ location }: { location: { directory: string } }) => ({ id: 'sess-1', location: { directory: location.directory } })),
            interrupt: vi.fn(async () => ({})),
            switchAgent: vi.fn(async () => ({})),
            switchModel: vi.fn(async () => ({})),
            prompt: vi.fn(async () => ({})),
            remove: vi.fn(async () => ({})),
            form: { reply: vi.fn(async () => ({})), cancel: vi.fn(async () => ({})) },
            instructions: { entry: { put: vi.fn(async () => ({})), remove: vi.fn(async () => ({})) } },
        },
        permission: { reply: vi.fn(async () => ({})) },
    }
    return {
        fakeClient,
        doc: null as Record<string, unknown> | null,
        central: { _id: 'a'.repeat(24), projectId: 'p1', projectName: 'Opex', config: {} } as Record<string, unknown> | null,
        centralEnabled: true,
        availability: { available: true, reason: null as string | null },
        run: vi.fn(),
        updateTask: vi.fn(async () => {}),
        recordAudit: vi.fn(async () => {}),
        publishAppEvent: vi.fn(async () => {}),
        publishWorkbenchEvent: vi.fn(),
        isActive: vi.fn(() => false),
        abort: vi.fn(),
        create: vi.fn(),
        updateOne: vi.fn(async () => ({})),
    }
})

const task = {
    id: 't1',
    code: 'OPX-1',
    title: 'Ajustar login',
    taskType: null,
    priority: 'medium',
    project: { id: 'p1', name: 'Opex', repo: 'org/opex', sigla: 'OPX' },
    createdAt: null,
    issue: null,
    totalTimeLogged: 0,
    description: 'Ajustar a tela de login.',
    technicalSpec: null,
    comments: [],
    history: [],
    timeLogs: [],
}

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/db/models/Refinement', () => ({
    TaskRefinement: {
        findOne: vi.fn(() => ({ lean: async () => mocks.doc, select: () => ({ lean: async () => mocks.doc }) })),
        findById: vi.fn(() => ({ lean: async () => mocks.doc })),
        create: mocks.create,
        updateOne: mocks.updateOne,
        deleteOne: vi.fn(async () => ({})),
    },
}))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticCentral: { findOne: vi.fn(() => ({ lean: async () => mocks.central })) } }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: vi.fn(async () => mocks.fakeClient) }))
vi.mock('@/lib/ai/opencode-run', () => ({ runAgentTurn: mocks.run }))
vi.mock('@/features/agentic/server/hub', () => ({
    prepareHub: vi.fn(),
    markWorkbenchActive: vi.fn(),
    clearWorkbenchActive: vi.fn(),
    isWorkbenchActive: mocks.isActive,
    abortWorkbenchRun: mocks.abort,
    dropWorkbenchEvents: vi.fn(),
    flushWorkbenchEvents: vi.fn(),
    publishWorkbenchEvent: mocks.publishWorkbenchEvent,
}))
vi.mock('@/features/agentic/logic', () => ({ parseCentralConfig: () => ({ enabled: mocks.centralEnabled, sessionDirectory: '/repo/opex' }) }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: vi.fn(async () => task), updateTask: mocks.updateTask }))
vi.mock('@/features/ai/server/settings', () => ({
    loadTaskRefinementSettings: vi.fn(async () => ({ settings: { enabled: true, model: 'anthropic/claude', agent: null, variant: null, instructions: 'Regras.', include: { comments: true, history: true } } })),
    availabilityOfTaskRefinement: vi.fn(async () => mocks.availability),
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

import { continueRefinement, getRefinementState, interruptRefinement, replyRefinementForm, startRefinement } from '@/features/refinement/server/service'

beforeEach(() => {
    vi.clearAllMocks()
    mocks.run.mockReset()
    mocks.updateTask.mockReset()
    mocks.updateTask.mockResolvedValue(undefined)
    mocks.doc = null
    mocks.central = { _id: 'a'.repeat(24), projectId: 'p1', projectName: 'Opex', config: {} }
    mocks.centralEnabled = true
    mocks.availability = { available: true, reason: null }
    mocks.isActive.mockReturnValue(false)
    mocks.create.mockImplementation(async (input: Record<string, unknown>) => {
        mocks.doc = {
            ...input,
            _id: 'c'.repeat(24),
            usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
            pendingForms: [],
            pendingPermissions: [],
            startedAt: new Date(),
            updatedAt: new Date(),
        }
        return { toObject: () => mocks.doc }
    })
    mocks.updateOne.mockImplementation(async (_filter: unknown, update: { $set?: Record<string, unknown> }) => {
        if (mocks.doc && update.$set) Object.assign(mocks.doc, update.$set)
        return {}
    })
})

describe('disponibilidade do refinamento', () => {
    it('sem central para o projeto explica o motivo e bloqueia', async () => {
        mocks.central = null
        const state = await getRefinementState('t1')
        expect(state.availability).toMatchObject({ available: false, centralId: null })
        expect(state.availability.reason).toContain('central de desenvolvimento')
    })

    it('central desativada bloqueia', async () => {
        mocks.centralEnabled = false
        const state = await getRefinementState('t1')
        expect(state.availability.available).toBe(false)
        expect(state.availability.reason).toContain('desativada')
    })

    it('feature indisponível (OpenCode) tem prioridade e não resolve a central', async () => {
        mocks.availability = { available: false, reason: 'OpenCode não está conectado' }
        const state = await getRefinementState('t1')
        expect(state.availability).toMatchObject({ available: false, reason: 'OpenCode não está conectado', sessionDirectory: null })
    })

    it('com central ativa devolve o diretório da central', async () => {
        const state = await getRefinementState('t1')
        expect(state.availability).toMatchObject({ available: true, reason: null, centralId: 'a'.repeat(24), sessionDirectory: '/repo/opex' })
    })
})

describe('iniciar o refinamento', () => {
    it('cria a sessão no diretório da central e grava a especificação na tarefa a cada rodada', async () => {
        mocks.run.mockImplementation(async (_client: unknown, _request: unknown, hooks: { onText?: (d: string) => void }) => {
            hooks.onText?.('- rascunho')
            hooks.onText?.(SPEC.slice('- rascunho'.length))
            return { outcome: 'succeeded', text: SPEC, message: null, costUsd: 0.2, durationMs: 10 }
        })
        await startRefinement('t1')
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't1', centralId: 'a'.repeat(24), sessionDirectory: '/repo/opex' }))
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'RefinamentoTarefa', acao: 'CRIAR' }))
        await vi.waitFor(() => expect(mocks.fakeClient.session.create).toHaveBeenCalledWith(expect.objectContaining({ location: { directory: '/repo/opex' } })))
        await vi.waitFor(() => expect(mocks.updateTask).toHaveBeenCalledWith('t1', { technicalSpec: '- critério de aceite\n- localização: /tarefas\n- edge case: vazio' }, 'local'))
    })

    it('não recria quando a tarefa já tem um refinamento', async () => {
        mocks.doc = { _id: 'c'.repeat(24), taskId: 't1', taskCode: 'OPX-1', taskTitle: 'x', projectId: 'p1', centralId: 'a'.repeat(24), runState: 'idle', resolved: false, usage: {}, pendingForms: [], pendingPermissions: [], startedAt: new Date(), updatedAt: new Date() }
        await startRefinement('t1')
        expect(mocks.create).not.toHaveBeenCalled()
        expect(mocks.run).not.toHaveBeenCalled()
    })
})

describe('responder e interromper', () => {
    it('responde a pergunta do agente na sessão do refinamento', async () => {
        mocks.doc = { _id: 'c'.repeat(24), taskId: 't1', taskCode: 'OPX-1', taskTitle: 'x', projectId: 'p1', centralId: 'a'.repeat(24), sessionId: 'sess-1', runState: 'running', resolved: false, usage: {}, pendingForms: [{ id: 'f1' }], pendingPermissions: [], startedAt: new Date(), updatedAt: new Date() }
        await replyRefinementForm('t1', 'f1', { answer: { q1: 'sim' } })
        expect(mocks.fakeClient.session.form.reply).toHaveBeenCalledWith({ sessionID: 'sess-1', formID: 'f1', answer: { q1: 'sim' } })
    })

    it('responde uma pergunta inexistente com 404', async () => {
        mocks.doc = { _id: 'c'.repeat(24), taskId: 't1', taskCode: 'OPX-1', taskTitle: 'x', projectId: 'p1', centralId: 'a'.repeat(24), sessionId: 'sess-1', runState: 'running', resolved: false, usage: {}, pendingForms: [], pendingPermissions: [], startedAt: new Date(), updatedAt: new Date() }
        await expect(replyRefinementForm('t1', 'f1', { answer: {} })).rejects.toMatchObject({ code: 'FORM_NOT_FOUND' })
    })

    it('interromper aborta o turno em andamento', async () => {
        mocks.doc = { _id: 'c'.repeat(24), taskId: 't1', taskCode: 'OPX-1', taskTitle: 'x', projectId: 'p1', centralId: 'a'.repeat(24), sessionId: 'sess-1', runState: 'running', resolved: false, usage: {}, pendingForms: [], pendingPermissions: [], startedAt: new Date(), updatedAt: new Date() }
        mocks.isActive.mockReturnValue(true)
        await interruptRefinement('t1')
        expect(mocks.abort).toHaveBeenCalledWith('c'.repeat(24), 'Interrompido pelo usuário')
    })
})

describe('turno e conclusão', () => {
    it('publica a saída do agente no barramento (regressão: o modal ficava vazio)', async () => {
        mocks.run.mockImplementation(async (_client: unknown, _request: unknown, hooks: { publish?: (event: unknown) => void }) => {
            hooks.publish?.({ type: 'text', text: 'olá' })
            return { outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 }
        })
        await startRefinement('t1')
        await vi.waitFor(() => expect(mocks.publishWorkbenchEvent).toHaveBeenCalledWith('c'.repeat(24), { type: 'text', text: 'olá' }))
    })

    it('turno concluído sem a especificação não marca como esclarecido nem salva', async () => {
        mocks.run.mockResolvedValue({ outcome: 'succeeded', text: 'Só perguntas, sem a seção de especificação técnica.', message: null, costUsd: 0, durationMs: 1 })
        await startRefinement('t1')
        await vi.waitFor(() => expect(mocks.updateOne).toHaveBeenCalledWith({ _id: 'c'.repeat(24) }, expect.objectContaining({ $set: expect.objectContaining({ runState: 'idle' }) })))
        const markedResolved = mocks.updateOne.mock.calls.some((call) => (call[1] as { $set?: { resolved?: boolean } } | undefined)?.$set?.resolved === true)
        expect(markedResolved).toBe(false)
        expect(mocks.updateTask).not.toHaveBeenCalled()
    })

    it('turno concluído com a especificação marca como esclarecido e grava na tarefa', async () => {
        mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
        await startRefinement('t1')
        await vi.waitFor(() =>
            expect(mocks.updateOne).toHaveBeenCalledWith({ _id: 'c'.repeat(24) }, expect.objectContaining({ $set: expect.objectContaining({ runState: 'idle', resolved: true }) })),
        )
        await vi.waitFor(() => expect(mocks.updateTask).toHaveBeenCalledWith('t1', { technicalSpec: '- critério de aceite\n- localização: /tarefas\n- edge case: vazio' }, 'local'))
    })

    it('aplica as instruções e o protocolo como entrada durável da sessão', async () => {
        mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
        await startRefinement('t1')
        await vi.waitFor(() => expect(mocks.fakeClient.session.instructions.entry.put).toHaveBeenCalledWith(expect.objectContaining({ sessionID: 'sess-1', key: 'opex-refinement' })))
        const instructions = (mocks.fakeClient.session.instructions.entry.put.mock.calls[0]![0] as { value: string }).value
        expect(instructions).toContain('Regras.')
        expect(instructions).toContain('Protocolo do refinamento')
    })

    it('turno sem a especificação dispara a consolidação automática e conclui sem exigir Continuar', async () => {
        mocks.run
            .mockResolvedValueOnce({ outcome: 'succeeded', text: 'Tudo esclarecido!', message: null, costUsd: 0, durationMs: 1 })
            .mockResolvedValueOnce({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
        await startRefinement('t1')
        await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(2), { timeout: 3000 })
        // A segunda rodada é a consolidação, sem novas perguntas.
        const secondText = (mocks.run.mock.calls[1]![1] as { text: string }).text
        expect(secondText).toContain('NÃO faça novas perguntas')
        await vi.waitFor(() => expect(mocks.updateTask).toHaveBeenCalledWith('t1', { technicalSpec: '- critério de aceite\n- localização: /tarefas\n- edge case: vazio' }, 'local'))
        await vi.waitFor(() => expect(mocks.fakeClient.session.remove).toHaveBeenCalledWith({ sessionID: 'sess-1' }, expect.anything()))
        const markedResolved = mocks.updateOne.mock.calls.some((call) => (call[1] as { $set?: { resolved?: boolean } } | undefined)?.$set?.resolved === true)
        expect(markedResolved).toBe(true)
    })

    it('falha ao gravar a especificação não marca como esclarecido nem exclui a sessão', async () => {
        mocks.updateTask.mockRejectedValueOnce(new Error('banco fora do ar'))
        mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
        await startRefinement('t1')
        await vi.waitFor(() => expect(mocks.updateOne).toHaveBeenCalledWith({ _id: 'c'.repeat(24) }, expect.objectContaining({ $set: expect.objectContaining({ runState: 'idle' }) })))
        const markedResolved = mocks.updateOne.mock.calls.some((call) => (call[1] as { $set?: { resolved?: boolean } } | undefined)?.$set?.resolved === true)
        expect(markedResolved).toBe(false)
        expect(mocks.fakeClient.session.remove).not.toHaveBeenCalled()
    })

    it('ao concluir, desvincula a sessão e a exclui no OpenCode', async () => {
        mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
        await startRefinement('t1')
        await vi.waitFor(() => expect(mocks.fakeClient.session.remove).toHaveBeenCalledWith({ sessionID: 'sess-1' }, expect.anything()))
        const detached = mocks.updateOne.mock.calls.some(
            (call) => (call[1] as { $set?: { sessionId?: unknown } } | undefined)?.$set?.sessionId === null && (call[1] as { $addToSet?: { pendingSessionDeletions?: string } } | undefined)?.$addToSet?.pendingSessionDeletions === 'sess-1',
        )
        expect(detached).toBe(true)
    })
})

describe('continuar', () => {
    it('encerrado sem a especificação (idle) continua consolidando, sem novas perguntas', async () => {
        mocks.doc = { _id: 'c'.repeat(24), taskId: 't1', taskCode: 'OPX-1', taskTitle: 'x', projectId: 'p1', centralId: 'a'.repeat(24), sessionId: 'sess-1', runState: 'idle', resolved: false, usage: {}, pendingForms: [], pendingPermissions: [], startedAt: new Date(), updatedAt: new Date() }
        mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
        await continueRefinement('t1')
        await vi.waitFor(() => expect(mocks.run).toHaveBeenCalled())
        expect((mocks.run.mock.calls[0]![1] as { text: string }).text).toContain('NÃO faça novas perguntas')
    })

    it('interrompido/falho continua o esclarecimento (pode perguntar de novo)', async () => {
        mocks.doc = { _id: 'c'.repeat(24), taskId: 't1', taskCode: 'OPX-1', taskTitle: 'x', projectId: 'p1', centralId: 'a'.repeat(24), sessionId: 'sess-1', runState: 'interrupted', resolved: false, usage: {}, pendingForms: [], pendingPermissions: [], startedAt: new Date(), updatedAt: new Date() }
        mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
        await continueRefinement('t1')
        await vi.waitFor(() => expect(mocks.run).toHaveBeenCalled())
        expect((mocks.run.mock.calls[0]![1] as { text: string }).text).toContain('Retome o refinamento')
    })
})
