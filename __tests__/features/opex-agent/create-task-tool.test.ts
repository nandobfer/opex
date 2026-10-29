import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Ferramenta create_task do Agente Opex: coluna padrão, especificação técnica e anexos do chat (OPE-90). */

const mocks = vi.hoisted(() => ({ createTaskWithIssue: vi.fn(), firstBoardColumnKey: vi.fn(), chatFilesToAttachments: vi.fn() }))

vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))
vi.mock('@/features/github/server/task-issue', async (original) => ({ ...(await original<object>()), createTaskWithIssue: mocks.createTaskWithIssue }))
vi.mock('@/features/tasks/server/columns', async (original) => ({ ...(await original<object>()), firstBoardColumnKey: mocks.firstBoardColumnKey }))
vi.mock('@/features/opex-agent/server/tools/files', async (original) => ({ ...(await original<object>()), chatFilesToAttachments: mocks.chatFilesToAttachments }))

import { findOpexTool } from '@/features/opex-agent/server/tools/registry'
import { DEFAULT_OPEX_INSTRUCTIONS, OPEX_CREATE_TASK_INSTRUCTION, OPEX_DOCS_INSTRUCTION, OPEX_FILES_INSTRUCTION, LEGACY_OPEX_INSTRUCTION_LINES } from '@/features/opex-agent/constants'

const context = { sessionId: 's1', actorId: 'local' }
const PROJECT_ID = '64b7f0c2a1b2c3d4e5f60718'
const task = { id: 't1', code: 'OPX-1', title: 'Corrigir login', columnId: 'todo', taskType: null, priority: 'medium', project: { id: PROJECT_ID, name: 'Opex', repo: 'dono/opex' }, summary: null, tags: [], estimate: null, archived: false, issue: null, agenticFlow: null, updatedAt: '2026-10-29T00:00:00.000Z' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createTaskWithIssue.mockResolvedValue(task)
  mocks.firstBoardColumnKey.mockResolvedValue('todo')
})

describe('create_task', () => {
  it('sem coluna usa a primeira coluna do quadro e repassa a especificação técnica', async () => {
    const tool = findOpexTool('create_task')!
    const result = (await tool.execute(tool.input.parse({ projectId: PROJECT_ID, title: 'Corrigir login', description: 'Login falha', technicalSpec: '## Critérios de aceite\n- entra' }), context)) as { id: string; attachments?: unknown }
    expect(mocks.firstBoardColumnKey).toHaveBeenCalledTimes(1)
    expect(mocks.createTaskWithIssue).toHaveBeenCalledWith(expect.objectContaining({ columnId: 'todo', title: 'Corrigir login', technicalSpec: '## Critérios de aceite\n- entra' }), 'local')
    expect(result.id).toBe('t1')
    expect(result.attachments).toBeUndefined()
    expect(mocks.chatFilesToAttachments).not.toHaveBeenCalled()
  })

  it('coluna informada é respeitada', async () => {
    const tool = findOpexTool('create_task')!
    await tool.execute(tool.input.parse({ projectId: PROJECT_ID, columnId: 'doing', title: 'Corrigir login' }), context)
    expect(mocks.firstBoardColumnKey).not.toHaveBeenCalled()
    expect(mocks.createTaskWithIssue).toHaveBeenCalledWith(expect.objectContaining({ columnId: 'doing' }), 'local')
  })

  it('arquivos do chat viram anexos da tarefa criada e a falha parcial é informada', async () => {
    mocks.chatFilesToAttachments.mockResolvedValue({ attached: [{ id: 'a1', name: 'print.png', size: 10 }], failed: [{ fileId: 'f2', error: 'Arquivo não encontrado' }] })
    const tool = findOpexTool('create_task')!
    const input = tool.input.parse({ projectId: PROJECT_ID, title: 'Corrigir login', chatFileIds: ['f1', 'f2'] })
    expect(tool.summarize?.(input)).toContain('com 2 anexo(s)')
    const result = (await tool.execute(input, context)) as { attachments: { attached: { id: string; name: string }[]; failed: unknown[] } }
    expect(mocks.chatFilesToAttachments).toHaveBeenCalledWith('s1', ['f1', 'f2'], { taskId: 't1' })
    expect(result.attachments.attached).toEqual([{ id: 'a1', name: 'print.png' }])
    expect(result.attachments.failed).toEqual([{ fileId: 'f2', error: 'Arquivo não encontrado' }])
  })

  it('é o caminho principal: não manda preferir a prévia', () => {
    const tool = findOpexTool('create_task')!
    expect(tool.description).not.toContain('Prefira')
    expect(tool.description).toContain('minimamente aceitável')
  })
})

describe('instruções do dono', () => {
  it('a regra padrão cria pelo create_task e os arquivos citam chatFileIds no create_task', () => {
    expect(DEFAULT_OPEX_INSTRUCTIONS).toContain(OPEX_CREATE_TASK_INSTRUCTION)
    expect(DEFAULT_OPEX_INSTRUCTIONS).toContain(OPEX_FILES_INSTRUCTION)
    expect(OPEX_CREATE_TASK_INSTRUCTION).toContain('create_task')
    expect(OPEX_FILES_INSTRUCTION).toContain('chatFileIds no create_task')
  })

  it('instruções salvas com as frases antigas são migradas para as novas, uma vez só', async () => {
    const { migrateOpexInstructions } = await import('@/features/opex-agent/server/settings')
    const [create, files] = LEGACY_OPEX_INSTRUCTION_LINES
    const saved = `Linha A\n${create!.legacy}\n${OPEX_DOCS_INSTRUCTION}\n${files!.legacy}\nLinha B`
    const migrated = migrateOpexInstructions(saved)
    expect(migrated).toBe(`Linha A\n${OPEX_CREATE_TASK_INSTRUCTION}\n${OPEX_DOCS_INSTRUCTION}\n${OPEX_FILES_INSTRUCTION}\nLinha B`)
    expect(migrateOpexInstructions(migrated)).toBe(migrated)
  })
})
