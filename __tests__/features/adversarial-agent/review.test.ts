import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rodada do Agente Adversário: sessão nova só de leitura no worktree, veredito decidido pelo app e o
 * que a mesa faz em seguida (seguir, corrigir, aguardar, falhar) conforme a configuração.
 */

const mocks = vi.hoisted(() => ({
  settings: null as unknown,
  runTurn: vi.fn(),
  publish: vi.fn(),
  sessionCreate: vi.fn(async () => ({ id: 'adv-1' })),
  sessionRemove: vi.fn(async () => undefined),
  instructionsPut: vi.fn(async () => undefined),
  permissionReply: vi.fn(async () => undefined),
  formCancel: vi.fn(async () => undefined),
  getTask: vi.fn(),
  loadFiles: vi.fn(async () => []),
  listAttachments: vi.fn(async () => [] as { name: string }[]),
  memories: vi.fn(async () => ['Validação X é intencional']),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local', name: 'Eu' }), LOCAL_USER_ID: 'local' }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/adversarial-agent/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AdversarialReview: memoryModel(), adversarialDb: vi.fn(async () => undefined) }
})
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => ({
    session: { create: mocks.sessionCreate, remove: mocks.sessionRemove, instructions: { entry: { put: mocks.instructionsPut } }, form: { cancel: mocks.formCancel } },
    permission: { reply: mocks.permissionReply },
  }),
}))
vi.mock('@/lib/ai/opencode-run', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/agentic/server/hub', () => ({ publishWorkbenchEvent: mocks.publish, flushWorkbenchEvents: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/model-fallback', () => ({ runWithFallback: (agent: unknown, text: string, run: (agent: unknown, text: string) => unknown) => run(agent, text), fallbackNotice: () => '' }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask }))
vi.mock('@/features/adversarial-agent/server/settings', () => ({ loadAdversarialSettings: async () => ({ settings: mocks.settings }) }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ agentMemoryTexts: mocks.memories }))
vi.mock('@/features/ai/server/settings', () => ({ loadTaskTagsSettings: async () => ({ settings: { taxonomy: [{ id: 'relatorios', label: 'Relatórios' }] } }) }))
vi.mock('@/features/adversarial-agent/server/attachments', () => ({ loadPromptFiles: mocks.loadFiles, listTaskAttachments: mocks.listAttachments }))

import { AdversarialReview } from '@/features/adversarial-agent/server/models'
import { runAdversaryRound, type AdversaryRoundInput } from '@/features/adversarial-agent/server/review'
import { DEFAULT_ADVERSARIAL_SETTINGS, type AdversarialSettings } from '@/features/adversarial-agent/schemas'

const reviews = AdversarialReview as unknown as { docs: Record<string, unknown>[] }

const input = (overrides: Partial<AdversaryRoundInput> = {}): AdversaryRoundInput => ({
  workbenchId: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'OPX-1',
  taskTitle: 'Exportar CSV',
  worktreePath: '/repo/worktrees/opx-1',
  branch: 'feat/opx-1',
  baseBranch: 'main',
  plans: [{ version: 1, text: '# Plano', feedback: null }],
  centralInstructions: '',
  implementationText: 'Implementado.',
  signal: new AbortController().signal,
  ...overrides,
})

const finding = (overrides: Record<string, unknown> = {}) => ({ id: 'F1', severity: 'high', category: 'bug', title: 'Erro não tratado', file: 'src/a.ts', line: 3, evidence: 'await x()', scenario: 'Sem rede', suggestion: 'try/catch', inDiff: true, ...overrides })
const output = (findings: unknown[], previous: unknown[] = []) => `Revisão.\n\`\`\`json\n${JSON.stringify({ summary: 'Resumo', findings, previous })}\n\`\`\``
const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0.01, durationMs: 10 })

const use = (patch: Partial<AdversarialSettings> = {}) => {
  mocks.settings = { ...DEFAULT_ADVERSARIAL_SETTINGS, enabled: true, agent: { agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: [] }, ...patch }
}

beforeEach(() => {
  vi.clearAllMocks()
  reviews.docs.length = 0
  use()
  mocks.getTask.mockResolvedValue({ code: 'OPX-1', title: 'Exportar CSV', priority: 'medium', taskType: null, project: null, description: 'Exportar', technicalSpec: '', summary: 'Exporta CSV', tags: ['relatorios'], comments: [], history: [], timeLogs: [], attachmentsCount: 0 })
})

describe('runAdversaryRound', () => {
  it('sem bloqueio: segue; sessão nova só leitura no worktree, excluída no fim', async () => {
    mocks.runTurn.mockResolvedValue(succeeded(output([finding({ severity: 'low' })])))
    const outcome = await runAdversaryRound(input())
    expect(outcome).toMatchObject({ kind: 'proceed', level: 'success' })
    expect(mocks.sessionCreate).toHaveBeenCalledWith(expect.objectContaining({ location: { directory: '/repo/worktrees/opx-1' }, permissions: expect.arrayContaining([{ action: 'edit', resource: '*', effect: 'deny' }]) }))
    expect(mocks.instructionsPut).toHaveBeenCalledWith(expect.objectContaining({ sessionID: 'adv-1', value: expect.stringContaining('Validação X é intencional') }))
    expect(mocks.memories).toHaveBeenCalledWith(['adversarial'])
    expect(mocks.sessionCreate).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ app: 'opex', kind: 'adversarial-review' }) }))
    const [, request] = mocks.runTurn.mock.calls[0]!
    expect(request).toMatchObject({ id: 'w1', sessionId: 'adv-1', agent: { model: 'anthropic/opus' }, consumption: { origin: 'adversarial-agent' } })
    expect(request.text).toContain('git -C /repo/worktrees/opx-1 diff origin/main...HEAD')
    expect(mocks.sessionRemove).toHaveBeenCalledWith({ sessionID: 'adv-1' }, expect.anything())
    expect(reviews.docs[0]).toMatchObject({ cycle: 1, round: 1, state: 'done', decision: 'approved', sessionId: null })
    expect(mocks.publish).toHaveBeenCalledWith('w1', expect.objectContaining({ type: 'adversarial-verdict', round: 1, outcome: 'Aprovado' }))
  })

  it('bloqueio com correção automática devolve o pedido de correção ao implementador', async () => {
    mocks.runTurn.mockResolvedValue(succeeded(output([finding()])))
    const outcome = await runAdversaryRound(input())
    expect(outcome.kind).toBe('fix')
    expect(outcome.kind === 'fix' && outcome.text).toContain('### F1 · Alto · Erro não tratado')
    expect(reviews.docs[0]).toMatchObject({ decision: 'fix-auto' })
  })

  it('rodada seguinte: mesmo ciclo, recebe os achados anteriores e as contestações do implementador', async () => {
    mocks.runTurn.mockResolvedValueOnce(succeeded(output([finding()])))
    await runAdversaryRound(input())
    mocks.runTurn.mockResolvedValueOnce(succeeded(output([], [{ id: 'F1', status: 'dispute-accepted' }])))
    const outcome = await runAdversaryRound(input({ implementationText: 'Não alterei.\n```json\n{"disputes":[{"id":"F1","reason":"Já tratado no caller"}]}\n```' }))
    expect(outcome.kind).toBe('proceed')
    const second = reviews.docs.find((doc) => doc.round === 2)!
    expect(second).toMatchObject({ cycle: 1, disputes: [{ id: 'F1', reason: 'Já tratado no caller' }], decision: 'approved' })
    const [, request] = mocks.runTurn.mock.calls[1]!
    expect(request.text).toContain('Rodada 2 (depois de uma correção)')
    expect(request.text).toContain('Já tratado no caller')
  })

  it('com confirmação, aguarda o usuário', async () => {
    use({ correction: 'confirm' })
    mocks.runTurn.mockResolvedValue(succeeded(output([finding()])))
    expect((await runAdversaryRound(input())).kind).toBe('blocked')
    expect(reviews.docs[0]).toMatchObject({ decision: 'awaiting', limitReached: false })
  })

  it('falha: pausa por padrão; com "seguir com aviso", segue', async () => {
    mocks.runTurn.mockResolvedValue({ outcome: 'failed', text: '', message: 'tempo esgotado', costUsd: 0, durationMs: 1 })
    expect(await runAdversaryRound(input())).toMatchObject({ kind: 'failed' })
    expect(reviews.docs[0]).toMatchObject({ state: 'failed', decision: 'failed', error: 'tempo esgotado' })

    use({ onFailure: 'continue' })
    mocks.runTurn.mockResolvedValue(succeeded('Sem bloco JSON'))
    expect(await runAdversaryRound(input())).toMatchObject({ kind: 'proceed', level: 'warn' })
    expect(reviews.docs.at(-1)).toMatchObject({ decision: 'proceeded-failure' })
  })

  it('pedidos de permissão: escrita é negada na hora, leitura aprovada; perguntas são canceladas', async () => {
    mocks.runTurn.mockImplementation(async (_client: unknown, _request: unknown, hooks: { onPermission: (p: unknown) => Promise<void>; onForm: (f: unknown) => Promise<void> }) => {
      await hooks.onPermission({ id: 'p1', action: 'bash', resources: ['pnpm test'], message: null })
      await hooks.onPermission({ id: 'p2', action: 'bash', resources: ['git diff HEAD'], message: null })
      await hooks.onForm({ id: 'f1', title: 'Rodo os testes?', fields: [] })
      return succeeded(output([]))
    })
    await runAdversaryRound(input())
    expect(mocks.permissionReply).toHaveBeenCalledWith(expect.objectContaining({ requestID: 'p1', decision: 'reject' }))
    expect(mocks.permissionReply).toHaveBeenCalledWith(expect.objectContaining({ requestID: 'p2', decision: 'once' }))
    expect(mocks.formCancel).toHaveBeenCalledWith({ sessionID: 'adv-1', formID: 'f1' })
  })

  it('anexos como arquivo vão junto da mensagem (a lista vem dos anexos da tarefa)', async () => {
    use({ context: { ...DEFAULT_ADVERSARIAL_SETTINGS.context, task: { ...DEFAULT_ADVERSARIAL_SETTINGS.context.task, attachments: 'files' } } })
    mocks.listAttachments.mockResolvedValue([{ name: 'modelo.csv' }, { name: 'grande.zip' }])
    mocks.loadFiles.mockResolvedValue([{ name: 'modelo.csv', uri: 'data:text/csv;base64,YQ==' }] as never)
    mocks.runTurn.mockResolvedValue(succeeded(output([])))
    await runAdversaryRound(input())
    expect(mocks.loadFiles).toHaveBeenCalledWith([{ name: 'modelo.csv' }, { name: 'grande.zip' }], expect.anything())
    const [, request] = mocks.runTurn.mock.calls[0]!
    expect(request.files).toEqual([{ name: 'modelo.csv', uri: 'data:text/csv;base64,YQ==' }])
    expect(request.text).toContain('📎 modelo.csv')
    expect(request.text).toContain('- grande.zip')
  })

  it('resumo e tags: as tags vão com o rótulo da taxonomia', async () => {
    use({ context: { ...DEFAULT_ADVERSARIAL_SETTINGS.context, task: { ...DEFAULT_ADVERSARIAL_SETTINGS.context.task, insights: true } } })
    mocks.runTurn.mockResolvedValue(succeeded(output([])))
    await runAdversaryRound(input())
    expect(mocks.runTurn.mock.calls[0]![1].text).toContain('- Tags: Relatórios')
  })
})
