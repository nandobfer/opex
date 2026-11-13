import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-165: o Agente Mentor aprende na conclusão da mesa (gatilho único, idempotente) e o Tentar novamente. */

const mocks = vi.hoisted(() => ({
  settingsFor: vi.fn(),
  adversary: vi.fn(),
  enqueue: vi.fn(),
  runs: [] as Record<string, unknown>[],
  audit: vi.fn(),
}))

vi.mock('@/features/adversarial-agent/server/mentor/settings', () => ({ mentorSettingsFor: mocks.settingsFor }))
vi.mock('@/features/adversarial-agent/server/settings', () => ({ loadAdversarialSettings: mocks.adversary }))
vi.mock('@/features/adversarial-agent/server/mentor/queue', () => ({ enqueueMentorLearning: mocks.enqueue, recoverOrphanMentorRuns: vi.fn(async () => 0) }))
vi.mock('@/lib/db', () => ({ AcaoAuditoria: { EXECUTAR: 'EXECUTAR' }, recordAudit: mocks.audit }))
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: vi.fn(async () => ({ doc: { projectName: 'Opex', projectId: 'p1' } })), repoForProject: vi.fn(async () => ({ repo: 'dono/opex' })) }))
vi.mock('@/features/adversarial-agent/server/mentor/models', () => ({
  mentorDb: vi.fn(async () => undefined),
  MentorRun: {
    findById: (id: string) => ({ lean: async () => mocks.runs.find((run) => String(run._id) === id) ?? null }),
    find: (filter: { workbenchId: string; completedAt: Date }) => {
      const rows = mocks.runs.filter((run) => run.workbenchId === filter.workbenchId && String(run.completedAt) === String(filter.completedAt))
      const chain = { select: () => chain, lean: async () => rows }
      return chain
    },
  },
}))

import { DEFAULT_MENTOR_SETTINGS, type MentorSettings } from '@/features/adversarial-agent/mentor/schemas'
import { mentorLearnsOnDone, mentorOnDone, retryMentorLearning, type MentorOnDoneInput } from '@/features/adversarial-agent/server/mentor/hooks'

const enabled = (): MentorSettings => structuredClone({ ...DEFAULT_MENTOR_SETTINGS, enabled: true })
const COMPLETED = new Date('2026-11-13T15:00:00Z')
const input = (overrides: Partial<MentorOnDoneInput> = {}): MentorOnDoneInput => ({
  workbenchId: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'OPE-1',
  taskTitle: 'Tarefa',
  projectName: 'Opex',
  repo: 'dono/opex',
  completedAt: COMPLETED,
  completionKind: 'merge',
  ...overrides,
})
const RUN_ID = '665f1c2b9a1e4c0012345678'
const run = (overrides: Record<string, unknown> = {}) => ({ _id: RUN_ID, kind: 'learning', workbenchId: 'w1', centralId: 'c1', taskId: 't1', taskCode: 'OPE-1', taskTitle: 'Tarefa', completedAt: COMPLETED, completionKind: 'manual', attempt: 1, status: 'failed', ...overrides })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runs = []
  mocks.settingsFor.mockResolvedValue(enabled())
  mocks.adversary.mockResolvedValue({ settings: { enabled: true } })
  mocks.enqueue.mockResolvedValue('run-1')
})

describe('gatilho na conclusão da mesa', () => {
  it('enfileira uma execução para a conclusão, com os destinos que valem', async () => {
    expect(await mentorOnDone(input())).toBe('run-1')
    const [sent, , targets] = mocks.enqueue.mock.calls[0]!
    expect(sent).toMatchObject({ workbenchId: 'w1', completedAt: COMPLETED, completionKind: 'merge' })
    expect(targets).toEqual(['adversarial', 'developer-global', 'developer-central'])
  })

  it('sem o Agente Adversário: segue com as listas do desenvolvedor (o gate não exige mais o Adversário)', async () => {
    mocks.adversary.mockResolvedValue({ settings: { enabled: false } })
    expect(await mentorOnDone(input())).toBe('run-1')
    expect(mocks.enqueue.mock.calls[0]![2]).toEqual(['developer-global', 'developer-central'])
  })

  it('o único destino ligado é o Adversário, desativado: nada roda', async () => {
    const settings = enabled()
    settings.targets = { adversarial: true, 'developer-global': false, 'developer-central': false }
    mocks.settingsFor.mockResolvedValue(settings)
    mocks.adversary.mockResolvedValue({ settings: { enabled: false } })
    expect(await mentorOnDone(input())).toBeNull()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('Mentor desligado, aprendizado desligado ou central fora do escopo: nada roda', async () => {
    mocks.settingsFor.mockResolvedValue(null)
    expect(await mentorOnDone(input())).toBeNull()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('a mesma conclusão duas vezes: a fila devolve null na segunda (idempotência por completedAt)', async () => {
    mocks.enqueue.mockResolvedValueOnce('run-1').mockResolvedValueOnce(null)
    expect(await mentorOnDone(input())).toBe('run-1')
    expect(await mentorOnDone(input())).toBeNull()
  })

  it('falha ao enfileirar nunca lança (a mesa segue)', async () => {
    mocks.enqueue.mockRejectedValue(new Error('banco fora'))
    await expect(mentorOnDone(input())).resolves.toBeNull()
  })

  it('o desenvolvedor fica somente leitura quando o Mentor aprende na central', async () => {
    expect(await mentorLearnsOnDone('c1')).toBe(true)
    mocks.settingsFor.mockResolvedValue(null)
    expect(await mentorLearnsOnDone('c1')).toBe(false)
  })
})

describe('Tentar novamente', () => {
  it('repete a tentativa mais recente que falhou como nova tentativa da mesma conclusão', async () => {
    mocks.runs = [run()]
    mocks.enqueue.mockResolvedValue('run-2')
    expect(await retryMentorLearning(RUN_ID, 'local')).toBe('run-2')
    const [sent, , , options] = mocks.enqueue.mock.calls[0]!
    expect(sent).toMatchObject({ completedAt: COMPLETED, completionKind: 'manual', projectName: 'Opex', repo: 'dono/opex' })
    expect(options).toEqual({ attempt: 2, retryOf: RUN_ID })
    expect(mocks.audit).toHaveBeenCalled()
  })

  it('recusa execução que não falhou, que não é a mais recente ou com outra em andamento', async () => {
    mocks.runs = [run({ status: 'learned' })]
    await expect(retryMentorLearning(RUN_ID, 'local')).rejects.toMatchObject({ code: 'MENTOR_RUN_NOT_RETRYABLE' })
    mocks.runs = [run(), run({ _id: 'outra', attempt: 2, status: 'failed' })]
    await expect(retryMentorLearning(RUN_ID, 'local')).rejects.toMatchObject({ code: 'MENTOR_RUN_NOT_RETRYABLE' })
    mocks.runs = [run(), run({ _id: 'outra', attempt: 2, status: 'running' })]
    await expect(retryMentorLearning(RUN_ID, 'local')).rejects.toMatchObject({ code: 'MENTOR_RUN_NOT_RETRYABLE' })
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('execução antiga (sem kind) não é repetida; Mentor desligado devolve 409', async () => {
    mocks.runs = [run({ kind: null })]
    await expect(retryMentorLearning(RUN_ID, 'local')).rejects.toMatchObject({ status: 409 })
    mocks.runs = [run()]
    mocks.settingsFor.mockResolvedValue(null)
    await expect(retryMentorLearning(RUN_ID, 'local')).rejects.toMatchObject({ code: 'MENTOR_DISABLED' })
  })
})
