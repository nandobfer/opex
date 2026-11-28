import { describe, expect, it } from 'vitest'
import { defaultStepIndex, stepperState } from '@/features/project-bootstrap/steps'
import { canMessage, createdRows, createdSummary, stepNoticeView } from '@/features/project-bootstrap/view'
import { submitBlockReason } from '@/features/project-bootstrap/form-state'
import { isBootstrapStale } from '@/features/project-bootstrap/liveness'
import { resolveSkills, skillsToActivate } from '@/features/project-bootstrap/skills'
import type { ProjectBootstrapDto } from '@/features/project-bootstrap/types'

const created = { repoUrl: 'https://github.com/org/app', projectId: null, centralId: null, environmentId: null, deployId: null, port: null }
const base = { step: 'provision', status: 'running', phase: 'turn', error: null, notice: null, pendingForms: [], pendingPermissions: [], running: true, created, deploys: [], result: null, repo: 'org/app' } as unknown as ProjectBootstrapDto

describe('stepperState', () => {
    it('etapas anteriores concluídas, a atual com o estado e o progresso, as seguintes paradas', () => {
        const states = stepperState({ step: 'link', status: 'running', phase: 'central', attempt: 1 })
        expect(states.map((state) => state.status)).toEqual(['done', 'done', 'running', 'idle', 'idle'])
        expect(states[2]!.progress).toBeGreaterThan(0.5)
    })

    it('volta ao agente depois de um deploy com falha mostra a tentativa', () => {
        const states = stepperState({ step: 'provision', status: 'running', phase: 'turn', attempt: 3 })
        expect(states[1]).toMatchObject({ status: 'running', badge: 'Tentativa 3' })
        expect(states.slice(2).map((state) => state.status)).toEqual(['idle', 'idle', 'idle'])
    })

    it('falha e aguardando têm cores próprias; concluído marca tudo', () => {
        expect(stepperState({ step: 'deploy', status: 'failed', phase: 'deploy', attempt: 1 })[3]!.status).toBe('failed')
        expect(stepperState({ step: 'provision', status: 'waiting', phase: 'turn', attempt: 1 })[1]!.status).toBe('waiting')
        expect(stepperState({ step: 'done', status: 'done', phase: null, attempt: 1 }).every((state) => state.status === 'done')).toBe(true)
        expect(defaultStepIndex({ step: 'done', status: 'done' })).toBe(4)
    })
})

describe('painéis da página', () => {
    it('falha pede Tentar novamente; aguardando por pergunta não', () => {
        expect(stepNoticeView({ ...base, status: 'failed', error: 'Faltou' }, 'provision')).toEqual({ tone: 'failed', message: 'Faltou', retry: true })
        expect(stepNoticeView({ ...base, status: 'waiting', pendingForms: [{ id: 'f1' }] as never }, 'provision')).toMatchObject({ tone: 'waiting', retry: false })
        expect(stepNoticeView({ ...base, status: 'waiting', running: false, notice: 'Sem resumo' }, 'provision')).toMatchObject({ tone: 'waiting', message: 'Sem resumo', retry: true })
        expect(stepNoticeView(base, 'link').tone).toBeNull()
    })

    it('mensagem ao agente só na etapa 2 aberta', () => {
        expect(canMessage(base)).toBe(true)
        expect(canMessage({ ...base, phase: 'verify' })).toBe(false)
        expect(canMessage({ ...base, running: false, status: 'failed' })).toBe(true)
        expect(canMessage({ ...base, step: 'deploy' })).toBe(false)
    })

    it('linhas do que foi criado e o resumo do cancelamento', () => {
        const rows = createdRows({ ...base, step: 'link', phase: 'central', created: { ...created, projectId: 'p1' } })
        expect(rows).toMatchObject({ link: 'done', central: 'running', environment: 'pending', deploy: 'pending' })
        expect(createdSummary({ ...base, created: { ...created, projectId: 'p1', centralId: 'c1', port: 4014 } })).toEqual(['Repositório org/app', 'Vínculo do GitHub (projeto)', 'Central de desenvolvimento', 'Porta 4014 anotada em /home/used_ports'])
        expect(createdSummary(base)).toEqual([])
    })
})

describe('submitBlockReason', () => {
    const ok = { blockers: 0, repo: { loading: false, check: { blocked: false, message: 'Livre' }, error: null }, directory: { loading: false, check: { kind: 'free' as const, reason: null }, error: null } }

    it('libera o envio com tudo certo e bloqueia pelos motivos da tela', () => {
        expect(submitBlockReason(ok)).toBeNull()
        expect(submitBlockReason({ ...ok, blockers: 1 })).toMatch(/Resolva/)
        expect(submitBlockReason({ ...ok, repo: { ...ok.repo, check: { blocked: true, message: 'Já vinculado' } } })).toBe('Já vinculado')
        expect(submitBlockReason({ ...ok, directory: { ...ok.directory, check: { kind: 'blocked', reason: 'A pasta já tem outros arquivos.' } } })).toBe('A pasta já tem outros arquivos.')
    })
})

describe('liveness e skills', () => {
    it('executando sem batimento recente é obsoleto, contando do mais recente', () => {
        const now = Date.parse('2026-11-28T12:00:00Z')
        expect(isBootstrapStale({ status: 'running', heartbeatAt: new Date(now - 120_000), stateAt: null }, now)).toBe(true)
        expect(isBootstrapStale({ status: 'running', heartbeatAt: new Date(now - 120_000), stateAt: new Date(now - 10_000) }, now)).toBe(false)
        expect(isBootstrapStale({ status: 'failed', heartbeatAt: null, stateAt: null }, now)).toBe(false)
    })

    it('skill escolhida que não existe no host fica faltando; ativa cada uma uma vez por sessão', () => {
        const host = [{ id: 'bootstrap-docker', name: 'bootstrap-docker' }, { id: 'x', name: 'outra' }]
        expect(resolveSkills(host, ['bootstrap-docker', 'bootstrap-aicontext'])).toEqual({ found: [{ id: 'bootstrap-docker', name: 'bootstrap-docker' }], missing: ['bootstrap-aicontext'] })
        expect(skillsToActivate({ sessionId: 's1', ids: ['bootstrap-docker'] }, 's1', host)).toEqual([{ id: 'x', name: 'outra' }])
        expect(skillsToActivate({ sessionId: 's1', ids: ['bootstrap-docker'] }, 's2', host)).toHaveLength(2)
    })
})
