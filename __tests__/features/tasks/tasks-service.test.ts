import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: { baseUrl: 'https://go.sipal.com.br', token: undefined as string | undefined, expiryWarningDays: 3 },
  recordAudit: vi.fn(),
  publish: vi.fn(),
  snapshot: null as null | { signatures: Record<string, string> },
  updateOne: vi.fn(),
  clearLocalColumn: vi.fn(async () => null as string | null),
  setLocalColumn: vi.fn(async () => ({ columnName: 'Aguardando', previous: null as string | null })),
  onTaskStatusChanged: vi.fn(async () => undefined),
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => mocks.config }))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({ info: vi.fn(), step: vi.fn(), request: vi.fn(), response: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { MOVER: 'MOVER', ATRIBUIR: 'ATRIBUIR', ATUALIZAR: 'ATUALIZAR' } }))
vi.mock('@/lib/pusher/channels', () => ({ appChannel: () => 'private-app', publishToChannels: mocks.publish }))
vi.mock('@/features/tasks/server/columns', () => ({
  applyLocalStates: async (tasks: unknown[]) => ({ tasks, returned: [] }),
  clearLocalColumn: mocks.clearLocalColumn,
  setLocalColumn: mocks.setLocalColumn,
  columnNameOf: async (key: string | null) => key,
}))
// Timers têm teste próprio (time-service); aqui a leitura deles falha e não afeta o quadro.
vi.mock('@/features/time/server/service', () => ({ listActiveTimers: async () => { throw new Error('fora do escopo') } }))
// Integração GitHub tem testes próprios (github-*); aqui sem vínculos nem rascunhos.
vi.mock('@/features/github/server/issue-links', () => ({
  issueRefsFor: async () => new Map(),
  onTaskStatusChanged: mocks.onTaskStatusChanged,
  closeIssuesOfValidatedTasks: async () => 0,
}))
vi.mock('@/features/github/server/drafts', () => ({ listBoardDrafts: async () => [] }))
vi.mock('@/lib/db/models/GoSipalTaskSnapshot', () => ({
  GoSipalTaskSnapshot: {
    findOne: () => ({ lean: async () => mocks.snapshot }),
    updateOne: mocks.updateOne,
  },
}))

import { DomainError } from '@/lib/api/route'
import { getTask, listTasks, moveTask, runBulkTasks, setTaskArchived, updateTask } from '@/features/tasks/server/service'
import { syncGoSipalTasks } from '@/features/tasks/server/sync'

const ID = 'a'.repeat(24)
const jwt = `h.${Buffer.from(JSON.stringify({ userId: 'u1' })).toString('base64url')}.s`
const raw = (overrides: Record<string, unknown> = {}) => ({ _id: ID, taskId: 'GO-DEV-1', title: 'T', status: 'development', order: 1, priority: 'high', updatedAt: '2026-01-01T00:00:00Z', ...overrides })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.config.token = jwt
  mocks.snapshot = null
  vi.stubGlobal('fetch', fetchMock)
})

describe('listar e detalhar', () => {
  it('lista o quadro com Bearer e informa o usuário da sessão', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: [raw(), { bad: true }] }))
    const result = await listTasks(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://go.sipal.com.br/api/dev-center/tasks?includeArchived=true')
    expect(init.headers.Authorization).toBe(`Bearer ${jwt}`)
    expect(result.tasks).toHaveLength(1)
    expect(result.currentUserId).toBe('u1')
  })

  it('sem sessão ou token recusado → 401 GO_SIPAL_SESSION', async () => {
    mocks.config.token = undefined
    await expect(listTasks(false)).rejects.toMatchObject({ status: 401, code: 'GO_SIPAL_SESSION' })
    mocks.config.token = jwt
    fetchMock.mockResolvedValue(json({ error: 'Token inválido' }, 401))
    await expect(listTasks(false)).rejects.toMatchObject({ status: 401, code: 'GO_SIPAL_SESSION' })
  })

  it('detalhe: id inválido ou inexistente → 404', async () => {
    await expect(getTask('GO-DEV-1')).rejects.toMatchObject({ status: 404, code: 'TASK_NOT_FOUND' })
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockResolvedValue(json({ error: 'Tarefa não encontrada' }, 404))
    await expect(getTask(ID)).rejects.toMatchObject({ status: 404, code: 'TASK_NOT_FOUND' })
  })
})

describe('mover', () => {
  it('envia status/ordem/URL, audita e avisa a tela', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: raw({ status: 'validation', commitUrl: 'https://github.com/o/r/commit/abc' }) }))
    const task = await moveTask(ID, { targetStatus: 'validation', order: 2.5, commitUrl: 'https://github.com/o/r/commit/abc', fromStatus: 'development', code: 'GO-DEV-1' }, 'local')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://go.sipal.com.br/api/dev-center/tasks/${ID}/move`)
    expect(JSON.parse(init.body)).toEqual({ targetStatus: 'validation', order: 2.5, commitUrl: 'https://github.com/o/r/commit/abc' })
    expect(task.status).toBe('validation')
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'MOVER', antes: { codigo: 'GO-DEV-1', status: 'Desenvolvimento' } }))
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'tasks-updated', { ids: [ID] })
  })

  it('plataforma exige URL → 400 com requiresCommitUrl, sem auditoria', async () => {
    fetchMock.mockResolvedValue(json({ error: 'URL do commit é obrigatória para mover tarefa para Validação', requiresCommitUrl: true }, 400))
    const error = await moveTask(ID, { targetStatus: 'validation' }, 'local').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ status: 400, details: { requiresCommitUrl: true, requiresPullRequestUrl: false } })
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('Em Produção é final: recusa sem chamar a plataforma', async () => {
    await expect(moveTask(ID, { targetStatus: 'backlog', fromStatus: 'in_production' }, 'local')).rejects.toMatchObject({ status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('rotina de sincronização', () => {
  it('sem sessão é pulada', async () => {
    mocks.config.token = undefined
    await expect(syncGoSipalTasks()).resolves.toMatch(/Pulada/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('primeira leitura só grava a referência; mudança publica os ids', async () => {
    fetchMock.mockResolvedValue(json({ data: [raw()] }))
    await expect(syncGoSipalTasks()).resolves.toMatch(/Referência inicial/)
    expect(mocks.publish).not.toHaveBeenCalled()
    const saved = mocks.updateOne.mock.calls[0][1].$set.signatures as Record<string, string>

    mocks.snapshot = { signatures: saved }
    fetchMock.mockResolvedValue(json({ data: [raw()] }))
    await expect(syncGoSipalTasks()).resolves.toMatch(/Sem mudanças/)
    expect(mocks.publish).not.toHaveBeenCalled()

    fetchMock.mockResolvedValue(json({ data: [raw({ status: 'validation' })] }))
    await expect(syncGoSipalTasks()).resolves.toMatch(/1 tarefa/)
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'tasks-updated', { ids: [ID] })
  })
})

describe('editar, arquivar e lote', () => {
  it('PATCH: responsável (null remove) via PUT da plataforma, com auditoria e evento', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: raw() }))
    await updateTask(ID, { assignee: null, code: 'GO-DEV-1', from: { assigneeName: 'Fer' } }, 'local')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://go.sipal.com.br/api/dev-center/tasks/${ID}`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ assignee: null })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'ATRIBUIR', antes: { codigo: 'GO-DEV-1', responsavel: 'Fer' } }))
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'tasks-updated', { ids: [ID] })
  })

  it('arquivar usa a rota archive', async () => {
    fetchMock.mockResolvedValue(json({ success: true, isArchived: true }))
    await setTaskArchived(ID, true, 'local', 'GO-DEV-1')
    expect(fetchMock.mock.calls[0][0]).toBe(`https://go.sipal.com.br/api/dev-center/tasks/${ID}/archive`)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ archive: true })
  })

  it('lote: no máximo 4 ao mesmo tempo, resultado por tarefa e UM evento com as que deram certo', async () => {
    let running = 0
    let peak = 0
    fetchMock.mockImplementation(async (url: string) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
      return url.includes('b'.repeat(24)) ? json({ error: 'Tarefa não encontrada' }, 404) : json({ success: true, data: raw() })
    })
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map((ch) => ch.repeat(24))
    const results = await runBulkTasks({ items: ids.map((id) => ({ id, action: { type: 'priority', priority: 'urgent' } })) }, 'local')
    expect(peak).toBeLessThanOrEqual(4)
    expect(results.map((r) => r.ok)).toEqual([true, false, true, true, true, true])
    expect(results[1]!.error).toMatch(/não encontrada/)
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(mocks.publish.mock.calls[0][2].ids).toHaveLength(5)
  })

  it('lote: mover a partir de Em Produção falha só aquela tarefa', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: raw({ status: 'backlog' }) }))
    const results = await runBulkTasks(
      { items: [{ id: ID, fromStatus: 'in_production', action: { type: 'move', targetStatus: 'backlog' } }, { id: 'c'.repeat(24), fromStatus: 'development', action: { type: 'move', targetStatus: 'backlog' } }] },
      'local',
    )
    expect(results.map((r) => r.ok)).toEqual([false, true])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('colunas pessoais', () => {
  it('mover para coluna customizada não chama o Go! Sipal; audita e avisa', async () => {
    const result = await moveTask(ID, { targetColumn: 'custom-aaaaaa', fromStatus: 'development', code: 'GO-DEV-1' }, 'local')
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.setLocalColumn).toHaveBeenCalledWith(ID, 'custom-aaaaaa', 'development', 'GO-DEV-1', undefined)
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'MOVER', depois: { codigo: 'GO-DEV-1', coluna: 'Aguardando', pessoal: true } }))
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'tasks-updated', { ids: [ID] })
  })

  it('tarefa em Produção pode ir para coluna pessoal', async () => {
    await moveTask(ID, { targetColumn: 'custom-aaaaaa', fromStatus: 'in_production' }, 'local')
    expect(mocks.setLocalColumn).toHaveBeenCalled()
  })

  it('voltar da coluna pessoal para o mesmo status: só sai da pessoal, sem chamar o Go! Sipal', async () => {
    mocks.clearLocalColumn.mockResolvedValueOnce('custom-aaaaaa')
    const result = await moveTask(ID, { targetStatus: 'development', fromStatus: 'development', code: 'GO-DEV-1' }, 'local')
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ antes: { codigo: 'GO-DEV-1', coluna: 'custom-aaaaaa', pessoal: true } }))
  })

  it('da coluna pessoal para outro status: chama o Go! Sipal', async () => {
    mocks.clearLocalColumn.mockResolvedValueOnce('custom-aaaaaa')
    fetchMock.mockResolvedValue(json({ success: true, data: raw({ status: 'specification' }) }))
    await moveTask(ID, { targetStatus: 'specification', fromStatus: 'development' }, 'local')
    expect(fetchMock.mock.calls[0][0]).toContain('/move')
  })

  it('lote local-move não chama o Go! Sipal', async () => {
    const results = await runBulkTasks({ items: [{ id: ID, fromStatus: 'development', action: { type: 'local-move', column: 'custom-aaaaaa' } }] }, 'local')
    expect(results).toEqual([{ id: ID, ok: true }])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
