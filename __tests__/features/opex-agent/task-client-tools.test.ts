import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Cliente da tarefa pelo Agente Opex (OPE-177): update_task com clientId e o lote set_task_client. */

const mocks = vi.hoisted(() => ({
  listTasks: vi.fn(),
  findTaskClientRefs: vi.fn(),
  findActiveClient: vi.fn(),
  assertAssignableClient: vi.fn(),
  setTaskClient: vi.fn(),
  updateTask: vi.fn(),
}))

vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))
vi.mock('@/lib/after-response', () => ({ runAfterResponse: vi.fn() }))
vi.mock('@/features/tasks/server/service', async (original) => ({ ...(await original<object>()), ...mocks }))

import { findOpexTool } from '@/features/opex-agent/server/tools/registry'
import { SET_CLIENT_BATCH_MAX } from '@/features/opex-agent/server/tools/tasks'
import { DomainError } from '@/lib/api/route'

const context = { sessionId: 's1', actorId: 'local' }
const CLIENT_ID = '6b01fc1735054864cf2f9382'
const PROJECT_ID = '6b00d2fb35054864cf2c9730'
const OTHER_PROJECT = '6b00d2fb35054864cf2c9799'
const id = (n: number) => n.toString(16).padStart(24, 'a')
const ref = (n: number, overrides: Record<string, unknown> = {}) => ({ id: id(n), code: `ZAT-${n}`, projectId: PROJECT_ID, clientId: null, ...overrides })
const estimate = { hours: 4, clientHours: 8, billingBrl: 1200, factor: 2, hourlyRate: 150, model: null, generatedAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listTasks.mockResolvedValue({ tasks: [1, 2, 3].map((n) => ({ id: id(n), code: `ZAT-${n}` })) })
  mocks.findActiveClient.mockResolvedValue({ id: CLIENT_ID, name: 'Zaturno', profitFactor: 2, hourlyRate: 150, projectIds: [PROJECT_ID] })
  mocks.assertAssignableClient.mockResolvedValue({ id: CLIENT_ID, name: 'Zaturno', profitFactor: 2, hourlyRate: 150 })
  mocks.setTaskClient.mockImplementation(async (_id: string, clientId: string | null) => ({ clientId, estimate }))
})

describe('proteção das ferramentas de cliente (decisão da OPE-177)', () => {
  it('set_task_client é write do grupo tasks, sem confirmação por padrão, e descreve o recálculo da estimativa', () => {
    const tool = findOpexTool('set_task_client')!
    expect(tool.risk).toBe('write')
    expect(tool.group).toBe('tasks')
    expect(tool.confirmByDefault ?? false).toBe(false)
    expect(tool.description).toContain('recalcula a estimativa preservando as horas reais')
  })

  it('update_task (que também aceita clientId) segue write do grupo tasks', () => {
    const tool = findOpexTool('update_task')!
    expect(tool.risk).toBe('write')
    expect(tool.group).toBe('tasks')
    expect(tool.confirmByDefault ?? false).toBe(false)
    expect(tool.description).toContain('cliente de orçamento')
  })
})

describe('update_task com cliente', () => {
  it('só clientId: valida contra o projeto da tarefa, chama setTaskClient e não chama updateTask', async () => {
    mocks.findTaskClientRefs.mockResolvedValue([ref(1)])
    const tool = findOpexTool('update_task')!
    const result = await tool.execute(tool.input.parse({ task: 'ZAT-1', clientId: CLIENT_ID }), context)
    expect(mocks.assertAssignableClient).toHaveBeenCalledWith(CLIENT_ID, PROJECT_ID)
    expect(mocks.updateTask).not.toHaveBeenCalled()
    expect(mocks.setTaskClient).toHaveBeenCalledWith(id(1), CLIENT_ID, 'local')
    expect(result).toEqual({ ok: true, id: id(1), clientId: CLIENT_ID, estimate })
  })

  it('clientId null remove o cliente sem validar cliente', async () => {
    const tool = findOpexTool('update_task')!
    const input = tool.input.parse({ task: 'ZAT-1', clientId: null })
    expect(tool.summarize?.(input)).toContain('remover o cliente')
    const result = await tool.execute(input, context)
    expect(mocks.assertAssignableClient).not.toHaveBeenCalled()
    expect(mocks.setTaskClient).toHaveBeenCalledWith(id(1), null, 'local')
    expect(result).toMatchObject({ clientId: null })
  })

  it('cliente recusado falha ANTES de gravar os outros campos', async () => {
    mocks.findTaskClientRefs.mockResolvedValue([ref(1)])
    mocks.assertAssignableClient.mockRejectedValue(new DomainError(400, 'O cliente não inclui o repositório da tarefa', 'CLIENT_NOT_FOR_PROJECT'))
    const tool = findOpexTool('update_task')!
    await expect(tool.execute(tool.input.parse({ task: 'ZAT-1', title: 'Novo', clientId: CLIENT_ID }), context)).rejects.toMatchObject({ code: 'CLIENT_NOT_FOR_PROJECT' })
    expect(mocks.updateTask).not.toHaveBeenCalled()
    expect(mocks.setTaskClient).not.toHaveBeenCalled()
  })

  it('troca de projeto e cliente juntos: valida contra o projeto NOVO e grava os dois', async () => {
    const tool = findOpexTool('update_task')!
    await tool.execute(tool.input.parse({ task: 'ZAT-1', projectId: OTHER_PROJECT, clientId: CLIENT_ID }), context)
    expect(mocks.findTaskClientRefs).not.toHaveBeenCalled()
    expect(mocks.assertAssignableClient).toHaveBeenCalledWith(CLIENT_ID, OTHER_PROJECT)
    expect(mocks.updateTask).toHaveBeenCalledWith(id(1), { projectId: OTHER_PROJECT }, 'local')
    expect(mocks.setTaskClient).toHaveBeenCalledWith(id(1), CLIENT_ID, 'local')
  })

  it('sem clientId mantém o comportamento de antes (não mexe no cliente)', async () => {
    const tool = findOpexTool('update_task')!
    expect(await tool.execute(tool.input.parse({ task: 'ZAT-1', priority: 'high' }), context)).toEqual({ ok: true, id: id(1) })
    expect(mocks.updateTask).toHaveBeenCalledWith(id(1), { priority: 'high' }, 'local')
    expect(mocks.setTaskClient).not.toHaveBeenCalled()
  })
})

describe('set_task_client (lote)', () => {
  it('projeto inteiro: aplica às tarefas sem o cliente e pula as que já estão com ele (idempotente)', async () => {
    mocks.findTaskClientRefs.mockResolvedValue([ref(1), ref(2, { clientId: CLIENT_ID }), ref(3)])
    const tool = findOpexTool('set_task_client')!
    const result = await tool.execute(tool.input.parse({ clientId: CLIENT_ID, projectId: PROJECT_ID }), context)
    expect(mocks.findTaskClientRefs).toHaveBeenCalledWith({ ids: [], projectId: PROJECT_ID })
    expect(mocks.setTaskClient).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ clientId: CLIENT_ID, total: 3, updated: ['ZAT-1', 'ZAT-3'], skipped: ['ZAT-2'], failed: [] })
  })

  it('lista: tarefa de outro projeto e código inexistente voltam em failed e o resto é aplicado', async () => {
    mocks.findTaskClientRefs.mockResolvedValue([ref(1), ref(3, { projectId: OTHER_PROJECT })])
    mocks.setTaskClient.mockImplementation(async (taskId: string, clientId: string | null) => {
      if (taskId === id(3)) throw new DomainError(400, 'O cliente não inclui o repositório da tarefa', 'CLIENT_NOT_FOR_PROJECT')
      return { clientId, estimate }
    })
    const tool = findOpexTool('set_task_client')!
    const result = await tool.execute(tool.input.parse({ clientId: CLIENT_ID, tasks: ['zat-1', 'ZAT-3', 'ZAT-99', 'ZAT-1'] }), context)
    expect(mocks.listTasks).toHaveBeenCalledTimes(1)
    expect(mocks.findTaskClientRefs).toHaveBeenCalledWith({ ids: [id(1), id(3)], projectId: undefined })
    expect(result).toEqual({
      clientId: CLIENT_ID,
      total: 2,
      updated: ['ZAT-1'],
      skipped: [],
      failed: [
        { task: 'ZAT-99', code: 'TASK_NOT_FOUND', error: 'Tarefa "ZAT-99" não encontrada' },
        { task: 'ZAT-3', code: 'CLIENT_NOT_FOR_PROJECT', error: 'O cliente não inclui o repositório da tarefa' },
      ],
    })
  })

  it('id que não existe no banco volta em failed', async () => {
    mocks.findTaskClientRefs.mockResolvedValue([])
    const tool = findOpexTool('set_task_client')!
    const result = (await tool.execute(tool.input.parse({ clientId: null, tasks: [id(9)] }), context)) as { failed: unknown[]; total: number }
    expect(result.total).toBe(0)
    expect(result.failed).toEqual([{ task: id(9), code: 'TASK_NOT_FOUND', error: `Tarefa "${id(9)}" não encontrada` }])
  })

  it('clientId null remove o cliente e pula as que já estão sem cliente', async () => {
    mocks.findTaskClientRefs.mockResolvedValue([ref(1, { clientId: CLIENT_ID }), ref(2)])
    const tool = findOpexTool('set_task_client')!
    const input = tool.input.parse({ clientId: null, projectId: PROJECT_ID })
    expect(tool.summarize?.(input)).toContain('Remover o cliente')
    const result = await tool.execute(input, context)
    expect(mocks.findActiveClient).not.toHaveBeenCalled()
    expect(mocks.setTaskClient).toHaveBeenCalledWith(id(1), null, 'local')
    expect(result).toMatchObject({ updated: ['ZAT-1'], skipped: ['ZAT-2'] })
  })

  it('cliente inativo é erro do lote, sem nenhuma gravação', async () => {
    mocks.findActiveClient.mockRejectedValue(new DomainError(400, 'O cliente está inativo', 'CLIENT_INACTIVE'))
    const tool = findOpexTool('set_task_client')!
    await expect(tool.execute(tool.input.parse({ clientId: CLIENT_ID, projectId: PROJECT_ID }), context)).rejects.toMatchObject({ code: 'CLIENT_INACTIVE' })
    expect(mocks.findTaskClientRefs).not.toHaveBeenCalled()
    expect(mocks.setTaskClient).not.toHaveBeenCalled()
  })

  it('sem seletor ou acima do teto: erro claro, sem gravar', async () => {
    const tool = findOpexTool('set_task_client')!
    await expect(tool.execute(tool.input.parse({ clientId: CLIENT_ID }), context)).rejects.toThrow('Informe projectId e/ou tasks')
    expect(() => tool.input.parse({ clientId: CLIENT_ID, tasks: Array.from({ length: SET_CLIENT_BATCH_MAX + 1 }, (_, n) => `ZAT-${n}`) })).toThrow()
    mocks.findTaskClientRefs.mockResolvedValue(Array.from({ length: SET_CLIENT_BATCH_MAX + 1 }, (_, n) => ref(n + 1)))
    await expect(tool.execute(tool.input.parse({ clientId: CLIENT_ID, projectId: PROJECT_ID }), context)).rejects.toThrow(`máximo é ${SET_CLIENT_BATCH_MAX}`)
    expect(mocks.setTaskClient).not.toHaveBeenCalled()
  })
})
