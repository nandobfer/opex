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
            skill: vi.fn(async () => undefined),
        },
        permission: { reply: vi.fn(async () => ({})) },
        skill: { list: vi.fn(async () => ({ location: {}, data: [] as Record<string, unknown>[] })) },
    }
    return {
        fakeClient,
        settings: {} as Record<string, unknown>,
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
        probe: vi.fn(),
        liveChat: false,
        deliverLive: vi.fn(async () => undefined),
        eventWrite: vi.fn(async () => ({})),
        runWrite: vi.fn(async () => ({})),
        link: null as { id: string; centralId: string; stage: string; refinementModel: { model: string; variant: string | null } | null } | null,
        sync: vi.fn(),
        delegate: vi.fn(async () => undefined),
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

// Métricas dos agentes (OPE-122): os fatos e as execuções do Refinador, sem banco.
vi.mock('@/features/agent-metrics/server/record', () => ({ recordAgentEvent: mocks.eventWrite, recordAgentRun: mocks.runWrite }))
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
    loadTaskRefinementSettings: vi.fn(async () => ({ settings: { enabled: true, model: 'anthropic/claude', agent: null, variant: null, instructionsSource: 'text', instructions: 'Regras.', skill: null, include: { comments: true, history: true }, ...mocks.settings } })),
    availabilityOfTaskRefinement: vi.fn(async () => mocks.availability),
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent }))
vi.mock('@/features/agentic/server/reconnect', () => ({ probeReconnect: mocks.probe }))
vi.mock('@/features/agentic/server/live-chat', () => ({ liveChatEnabled: vi.fn(async () => mocks.liveChat), deliverLiveMessage: mocks.deliverLive }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
// Vínculo com a mesa de trabalho (OPE-137): sem mesa por padrão; cada caso define a etapa dela.
vi.mock('@/features/refinement/server/workbench-link', () => ({
    linkedWorkbench: vi.fn(async () => mocks.link),
    inRefinementStage: (link: { stage: string } | null) => Boolean(link && (link.stage === 'refining' || link.stage === 'spec_ready')),
    pastRefinement: (link: { stage: string } | null) => Boolean(link && link.stage !== 'refining' && link.stage !== 'spec_ready'),
    syncLinkedWorkbench: mocks.sync,
    delegateToWorkbench: mocks.delegate,
}))

import { closeRefinement, continueRefinement, getRefinementState, interruptRefinement, queueRefinementStart, reconnectRefinement, releaseRefinementSession, replyRefinementForm, sendRefinementMessage, startRefinement } from '@/features/refinement/server/service'

beforeEach(() => {
    vi.clearAllMocks()
    mocks.run.mockReset()
    mocks.updateTask.mockReset()
    mocks.updateTask.mockResolvedValue(undefined)
    mocks.doc = null
    mocks.link = null
    mocks.settings = {}
    mocks.fakeClient.skill.list.mockResolvedValue({ location: {}, data: [] })
    mocks.fakeClient.session.skill.mockResolvedValue(undefined)
    mocks.central = { _id: 'a'.repeat(24), projectId: 'p1', projectName: 'Opex', config: {} }
    mocks.centralEnabled = true
    mocks.liveChat = false
    mocks.availability = { available: true, reason: null }
    mocks.isActive.mockReturnValue(false)
    mocks.probe.mockResolvedValue({ outcome: 'attached', follow: true, message: null })
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
        // Métricas do Refinador (OPE-122): o início do refinamento vira fato e o turno vira execução.
        await vi.waitFor(() => expect(mocks.eventWrite).toHaveBeenCalledWith(expect.objectContaining({ agent: 'refinador', type: 'refinement-started', taskId: 't1', dedupKey: 'refinement-started:cccccccccccccccccccccccc' })))
        await vi.waitFor(() => expect(mocks.runWrite).toHaveBeenCalledWith(expect.objectContaining({ agent: 'refinador', kind: 'refinement-turn', ok: true })))
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

describe('chat durante a execução', () => {
    const running = (patch: Record<string, unknown> = {}) => ({ _id: 'c'.repeat(24), taskId: 't1', taskCode: 'OPX-1', taskTitle: 'x', projectId: 'p1', centralId: 'a'.repeat(24), sessionId: 'sess-1', runState: 'running', resolved: false, finalizing: false, usage: {}, pendingForms: [], pendingPermissions: [], startedAt: new Date(), updatedAt: new Date(), ...patch })

    it('com o agente refinando, entrega ao turno do refinamento (central do refinamento + auditoria) e o estado traz a opção', async () => {
        mocks.doc = running()
        mocks.isActive.mockReturnValue(true)
        mocks.liveChat = true
        const state = await sendRefinementMessage('t1', 'considere o módulo X')
        expect(mocks.deliverLive).toHaveBeenCalledWith({ runId: 'c'.repeat(24), centralId: 'a'.repeat(24), label: 'o refinamento', audit: { entidade: 'RefinamentoTarefa', contexto: { tarefa: 'OPX-1' } } }, 'considere o módulo X')
        expect(state.refinement?.liveChat).toBe(true)
    })

    it('parado ou consolidando a especificação: recusa sem entregar', async () => {
        mocks.doc = running({ runState: 'idle' })
        await expect(sendRefinementMessage('t1', 'x')).rejects.toMatchObject({ status: 409, code: 'REFINEMENT_NOT_RUNNING' })
        mocks.doc = running({ finalizing: true })
        mocks.isActive.mockReturnValue(true)
        await expect(sendRefinementMessage('t1', 'x')).rejects.toMatchObject({ status: 409, code: 'REFINEMENT_FINALIZING' })
        expect(mocks.deliverLive).not.toHaveBeenCalled()
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

    it('turno concluído com a especificação marca como esclarecido, grava na tarefa e registra as métricas', async () => {
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

    describe('instruções por skill do OpenCode', () => {
        const grill = { id: 'grill-me', name: 'grill-me', description: 'Interroga', path: '/skills/grill-me/SKILL.md', content: '# Grill me' }
        const instructionsValue = () => (mocks.fakeClient.session.instructions.entry.put.mock.calls[0]![0] as { value: string }).value

        it('ativa a skill na sessão (uma vez) e a entrada durável leva só o protocolo', async () => {
            mocks.settings = { instructionsSource: 'skill', skill: 'grill-me' }
            mocks.fakeClient.skill.list.mockResolvedValue({ location: {}, data: [grill] })
            mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
            await startRefinement('t1')
            await vi.waitFor(() => expect(mocks.fakeClient.session.skill).toHaveBeenCalledWith({ sessionID: 'sess-1', id: 'grill-me', resume: false }))
            expect(mocks.fakeClient.skill.list).toHaveBeenCalledWith({ location: { directory: '/repo/opex' } })
            await vi.waitFor(() => expect(mocks.fakeClient.session.instructions.entry.put).toHaveBeenCalled())
            expect(instructionsValue()).toContain('Protocolo do refinamento')
            expect(instructionsValue()).toContain('grill-me')
            expect(instructionsValue()).not.toContain('Regras.')
            expect(mocks.updateOne).toHaveBeenCalledWith({ _id: 'c'.repeat(24) }, { $set: { activeSkill: { sessionId: 'sess-1', skillId: 'grill-me' } } })
        })

        it('não reativa a skill já ativa na mesma sessão (Continuar)', async () => {
            mocks.settings = { instructionsSource: 'skill', skill: 'grill-me' }
            mocks.fakeClient.skill.list.mockResolvedValue({ location: {}, data: [grill] })
            mocks.fakeClient.session.get.mockResolvedValueOnce({ id: 'sess-1' } as never)
            mocks.doc = {
                _id: 'c'.repeat(24), taskId: 't1', taskCode: 'OPX-1', taskTitle: 'Ajustar login', projectId: 'p1', centralId: 'a'.repeat(24),
                sessionId: 'sess-1', sessionDirectory: '/repo/opex', runState: 'interrupted', resolved: false, pendingForms: [], pendingPermissions: [], pendingSessionDeletions: [],
                activeSkill: { sessionId: 'sess-1', skillId: 'grill-me' }, usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }, startedAt: new Date(), updatedAt: new Date(),
            }
            mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
            await continueRefinement('t1')
            await vi.waitFor(() => expect(mocks.fakeClient.session.instructions.entry.put).toHaveBeenCalled())
            expect(mocks.fakeClient.session.skill).not.toHaveBeenCalled()
            expect(instructionsValue()).not.toContain('Regras.')
        })

        it('Reconectar sem a skill ativa na sessão mantém o texto (não diz que a skill está ativa)', async () => {
            mocks.settings = { instructionsSource: 'skill', skill: 'grill-me' }
            mocks.fakeClient.skill.list.mockResolvedValue({ location: {}, data: [grill] })
            mocks.doc = {
                _id: 'c'.repeat(24), taskId: 't1', taskCode: 'OPX-1', taskTitle: 'Ajustar login', projectId: 'p1', centralId: 'a'.repeat(24),
                sessionId: 'sess-1', sessionDirectory: '/repo/opex', runState: 'interrupted', resolved: false, pendingForms: [], pendingPermissions: [], pendingSessionDeletions: [],
                activeSkill: null, turnStartedAt: new Date(), usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }, startedAt: new Date(), updatedAt: new Date(),
            }
            mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
            await reconnectRefinement('t1')
            await vi.waitFor(() => expect(mocks.fakeClient.session.instructions.entry.put).toHaveBeenCalled())
            expect(mocks.fakeClient.session.skill).not.toHaveBeenCalled()
            expect(instructionsValue()).toContain('Regras.')
            expect(instructionsValue()).not.toContain('ativada nesta sessão')
        })

        it('skill ausente no OpenCode cai nas instruções de texto e avisa na saída', async () => {
            mocks.settings = { instructionsSource: 'skill', skill: 'sumiu' }
            mocks.fakeClient.skill.list.mockResolvedValue({ location: {}, data: [grill] })
            mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
            await startRefinement('t1')
            await vi.waitFor(() => expect(mocks.fakeClient.session.instructions.entry.put).toHaveBeenCalled())
            expect(mocks.fakeClient.session.skill).not.toHaveBeenCalled()
            expect(instructionsValue()).toContain('Regras.')
            expect(mocks.publishWorkbenchEvent).toHaveBeenCalledWith('c'.repeat(24), expect.objectContaining({ type: 'notice', level: 'warn', message: expect.stringContaining('sumiu') }))
        })

        it('falha ao ativar (ou OpenCode sem listar) também cai no texto', async () => {
            mocks.settings = { instructionsSource: 'skill', skill: 'grill-me' }
            mocks.fakeClient.skill.list.mockResolvedValue({ location: {}, data: [grill] })
            mocks.fakeClient.session.skill.mockRejectedValue(new Error('404'))
            mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
            await startRefinement('t1')
            await vi.waitFor(() => expect(mocks.fakeClient.session.instructions.entry.put).toHaveBeenCalled())
            expect(instructionsValue()).toContain('Regras.')
            expect(mocks.publishWorkbenchEvent).toHaveBeenCalledWith('c'.repeat(24), expect.objectContaining({ type: 'notice', message: expect.stringContaining('Não foi possível ativar a skill') }))
        })
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

describe('reconectar', () => {
    const docBase = (patch: Record<string, unknown> = {}) => ({
        _id: 'c'.repeat(24),
        taskId: 't1',
        taskCode: 'OPX-1',
        taskTitle: 'x',
        projectId: 'p1',
        centralId: 'a'.repeat(24),
        sessionId: 'sess-1',
        runState: 'interrupted',
        resolved: false,
        usage: {},
        pendingForms: [],
        pendingPermissions: [],
        turnStartedAt: new Date(1000),
        startedAt: new Date(),
        updatedAt: new Date(),
        ...patch,
    })

    it('acompanha a sessão existente sem criar outra, sem prompt e sem trocar agente/modelo', async () => {
        mocks.doc = docBase()
        mocks.probe.mockResolvedValue({ outcome: 'attached', follow: true, message: null })
        mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
        await reconnectRefinement('t1')
        await vi.waitFor(() => expect(mocks.run).toHaveBeenCalled())
        const turnRequest = mocks.run.mock.calls[0]![1] as { attach?: boolean; text: string; sessionId: string }
        expect(turnRequest.attach).toBe(true)
        expect(turnRequest.text).toBe('')
        expect(turnRequest.sessionId).toBe('sess-1')
        expect(mocks.probe).toHaveBeenCalledWith('sess-1', 1000)
        expect(mocks.fakeClient.session.create).not.toHaveBeenCalled()
        const recorded = mocks.updateOne.mock.calls.some((call) => (call[1] as { $set?: { reconnect?: { outcome?: string } } }).$set?.reconnect?.outcome === 'attached')
        expect(recorded).toBe(true)
    })

    it('turno que terminou durante a queda recupera o resultado e conclui gravando a especificação', async () => {
        mocks.doc = docBase()
        mocks.probe.mockResolvedValue({ outcome: 'recovered', follow: true, message: null })
        mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
        await reconnectRefinement('t1')
        await vi.waitFor(() => expect(mocks.updateTask).toHaveBeenCalledWith('t1', { technicalSpec: '- critério de aceite\n- localização: /tarefas\n- edge case: vazio' }, 'local'))
        await vi.waitFor(() => expect(mocks.fakeClient.session.remove).toHaveBeenCalledWith({ sessionID: 'sess-1' }, expect.anything()))
    })

    it('sem execução para acompanhar não dispara turno e registra o desfecho definitivo', async () => {
        mocks.doc = docBase()
        mocks.probe.mockResolvedValue({ outcome: 'nothing', follow: false, message: 'Não há execução em andamento nesta sessão do OpenCode' })
        await reconnectRefinement('t1')
        expect(mocks.run).not.toHaveBeenCalled()
        const recorded = mocks.updateOne.mock.calls.some((call) => (call[1] as { $set?: { reconnect?: { outcome?: string } } }).$set?.reconnect?.outcome === 'nothing')
        expect(recorded).toBe(true)
    })

    it('sem sessão do OpenCode responde 409', async () => {
        mocks.doc = docBase({ sessionId: null })
        await expect(reconnectRefinement('t1')).rejects.toMatchObject({ code: 'REFINEMENT_NO_SESSION' })
    })

    it('estado que não está falho nem interrompido responde 409', async () => {
        mocks.doc = docBase({ runState: 'idle' })
        await expect(reconnectRefinement('t1')).rejects.toMatchObject({ code: 'REFINEMENT_INVALID_STATE' })
    })

    it('com turno vivo no processo não faz nada (no-op)', async () => {
        mocks.doc = docBase({ runState: 'running' })
        mocks.isActive.mockReturnValue(true)
        await reconnectRefinement('t1')
        expect(mocks.probe).not.toHaveBeenCalled()
        expect(mocks.run).not.toHaveBeenCalled()
    })
})

describe('refinamento na mesa de trabalho (OPE-137)', () => {
    const existing = (patch: Record<string, unknown> = {}) => ({ _id: 'c'.repeat(24), taskId: 't1', taskCode: 'OPX-1', taskTitle: 'x', projectId: 'p1', centralId: 'a'.repeat(24), sessionId: 'sess-1', runState: 'idle', resolved: false, usage: {}, pendingForms: [], pendingPermissions: [], startedAt: new Date(), updatedAt: new Date(), turnStartedAt: new Date(), ...patch })
    const promptOf = (index = 0) => (mocks.run.mock.calls[index]![1] as { text: string }).text

    it('mesa do planejamento em diante bloqueia com o motivo (item 18) e recusa iniciar', async () => {
        mocks.link = { id: 'w1', centralId: 'a'.repeat(24), stage: 'planning', refinementModel: null }
        const state = await getRefinementState('t1')
        expect(state.availability).toMatchObject({ available: false, reason: 'A tarefa já está em desenvolvimento na mesa de trabalho' })
        expect(state.workbench).toEqual({ id: 'w1', stage: 'planning' })
        await expect(startRefinement('t1')).rejects.toMatchObject({ code: 'REFINEMENT_WORKBENCH_ADVANCED' })
        expect(mocks.create).not.toHaveBeenCalled()
    })

    it('o estado traz o modelo do Agente Refinador (base do Modelo do Refinamento)', async () => {
        const state = await getRefinementState('t1')
        expect(state.refinerModel).toEqual({ agent: null, model: 'anthropic/claude', variant: null })
    })

    it('as informações adicionais da tela inicial vão no primeiro prompt', async () => {
        mocks.run.mockReturnValue(new Promise(() => undefined))
        await startRefinement('t1', { text: 'Use o componente X', fromWorkbench: true })
        await vi.waitFor(() => expect(mocks.run).toHaveBeenCalled())
        expect(promptOf()).toContain('## Informações adicionais do dono')
        expect(promptOf()).toContain('Use o componente X')
        expect(mocks.publishWorkbenchEvent).toHaveBeenCalledWith('c'.repeat(24), { type: 'user', text: 'Use o componente X' })
    })

    it('sem vaga: guarda o pedido e não inicia o turno', async () => {
        await queueRefinementStart('t1', { text: 'pedido', fileIds: [], modelOverrides: null })
        expect(mocks.doc).toMatchObject({ queuedStart: expect.objectContaining({ text: 'pedido', fileIds: [] }) })
        expect(mocks.run).not.toHaveBeenCalled()
        expect(mocks.sync).toHaveBeenCalledWith('t1')
    })

    it('o turno usa o "Modelo do Refinamento" trocado na mesa (mesmo agente)', async () => {
        mocks.link = { id: 'w1', centralId: 'a'.repeat(24), stage: 'refining', refinementModel: { model: 'openai/gpt-5', variant: 'high' } }
        mocks.run.mockReturnValue(new Promise(() => undefined))
        await startRefinement('t1', { fromWorkbench: true })
        await vi.waitFor(() => expect(mocks.run).toHaveBeenCalled())
        expect((mocks.run.mock.calls[0]![1] as { agent: unknown }).agent).toEqual({ agent: null, model: 'openai/gpt-5', variant: 'high' })
    })

    it('concluído com a mesa em Refinando: a sessão fica para o Continuar refinamento', async () => {
        mocks.link = { id: 'w1', centralId: 'a'.repeat(24), stage: 'refining', refinementModel: null }
        mocks.run.mockResolvedValue({ outcome: 'succeeded', text: SPEC, message: null, costUsd: 0, durationMs: 1 })
        await startRefinement('t1', { fromWorkbench: true })
        await vi.waitFor(() => expect(mocks.doc).toMatchObject({ resolved: true, runState: 'idle' }))
        expect(mocks.fakeClient.session.remove).not.toHaveBeenCalled()
    })

    it('a mesa saiu do refinamento: a sessão é desvinculada e excluída', async () => {
        mocks.doc = existing({ resolved: true })
        await releaseRefinementSession('t1')
        expect(mocks.fakeClient.session.remove).toHaveBeenCalledWith({ sessionID: 'sess-1' }, expect.anything())
    })

    it('Encerrar refinamento só com a mesa em Refinando', async () => {
        mocks.doc = existing()
        await expect(closeRefinement('t1')).rejects.toMatchObject({ code: 'REFINEMENT_CLOSE_UNAVAILABLE' })
        mocks.link = { id: 'w1', centralId: 'a'.repeat(24), stage: 'spec_ready', refinementModel: null }
        await expect(closeRefinement('t1')).rejects.toMatchObject({ code: 'REFINEMENT_CLOSE_UNAVAILABLE' })
    })

    it('Encerrar refinamento para o agente, dispensa a pergunta aberta e marca encerrado (mesa sincroniza)', async () => {
        mocks.link = { id: 'w1', centralId: 'a'.repeat(24), stage: 'refining', refinementModel: null }
        mocks.doc = existing({ runState: 'running', pendingForms: [{ id: 'f1' }] })
        mocks.isActive.mockReturnValue(true)
        const state = await closeRefinement('t1')
        expect(mocks.fakeClient.session.form.cancel).toHaveBeenCalledWith({ sessionID: 'sess-1', formID: 'f1' })
        expect(mocks.fakeClient.session.interrupt).toHaveBeenCalledWith({ sessionID: 'sess-1' })
        expect(mocks.abort).toHaveBeenCalledWith('c'.repeat(24), 'Refinamento encerrado pelo usuário')
        expect(mocks.doc!.closedAt).toBeInstanceOf(Date)
        expect(state.refinement).toMatchObject({ closed: true, concluded: true })
        expect(mocks.sync).toHaveBeenCalledWith('t1')
    })

    it('Encerrar com o agente parado fica parado sem erro', async () => {
        mocks.link = { id: 'w1', centralId: 'a'.repeat(24), stage: 'refining', refinementModel: null }
        mocks.doc = existing({ runState: 'failed', error: 'caiu' })
        await closeRefinement('t1')
        expect(mocks.doc).toMatchObject({ runState: 'idle', error: null })
    })

    it('Continuar sem turno anterior (pedido que aguardou vaga) começa pelo primeiro prompt', async () => {
        mocks.doc = existing({ sessionId: null, turnStartedAt: null, lastPrompt: null })
        mocks.run.mockReturnValue(new Promise(() => undefined))
        await continueRefinement('t1', { text: 'guardado', fromWorkbench: true })
        await vi.waitFor(() => expect(mocks.run).toHaveBeenCalled())
        expect(promptOf()).toContain('Comece lendo a tarefa')
        expect(promptOf()).toContain('guardado')
    })

    it('Continuar refinamento concluído retoma a mesma conversa pedindo o que faltar', async () => {
        mocks.doc = existing({ resolved: true })
        mocks.run.mockReturnValue(new Promise(() => undefined))
        await continueRefinement('t1', { fromWorkbench: true })
        await vi.waitFor(() => expect(mocks.run).toHaveBeenCalled())
        expect(promptOf()).toContain('O dono quer continuar o refinamento')
        expect((mocks.run.mock.calls[0]![1] as { sessionId: string }).sessionId).toBe('sess-1')
    })

    it('Continuar sem a sessão anterior (excluída ao concluir na página) reenvia a tarefa com a especificação', async () => {
        mocks.doc = existing({ resolved: true, sessionId: null })
        mocks.run.mockReturnValue(new Promise(() => undefined))
        await continueRefinement('t1', { fromWorkbench: true })
        await vi.waitFor(() => expect(mocks.run).toHaveBeenCalled())
        expect(promptOf()).toContain('já foi refinada antes')
    })

    it('Continuar pela página com a mesa em Especificação pronta passa pela mesa (vaga da central)', async () => {
        mocks.link = { id: 'w1', centralId: 'a'.repeat(24), stage: 'spec_ready', refinementModel: null }
        mocks.doc = existing({ resolved: true })
        await continueRefinement('t1')
        expect(mocks.delegate).toHaveBeenCalledWith('w1', 'continue-refinement')
        expect(mocks.run).not.toHaveBeenCalled()
    })
})
