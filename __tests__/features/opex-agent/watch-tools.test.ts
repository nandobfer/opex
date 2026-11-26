import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Ferramentas de observação de eventos (OPE-194): grupo, riscos, escopo (dono x portal) e que o grupo fica
 * fora dos agentes rotineiros. O serviço é falso.
 */

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(async () => []),
  cancel: vi.fn(),
}))
vi.mock('@/features/opex-agent/server/watches', () => ({ createOpexWatch: mocks.create, listOpexWatches: mocks.list, cancelOpexWatch: mocks.cancel }))

import { watchTools } from '@/features/opex-agent/server/tools/watches'
import { clientWatchTools } from '@/features/opex-agent/server/client-tools/watches'
import { isRoutineForbiddenToolGroup } from '@/features/routine-agents/constants'
import type { OpexToolContext } from '@/features/opex-agent/server/tools/define'

const SESSION = 'a'.repeat(24)
const ownerCtx: OpexToolContext = { sessionId: SESSION, actorId: 'local', scope: { kind: 'owner' } }
const clientActor = { userId: 'u1', displayName: 'ana', client: { _id: 'c1', name: 'ACME' }, isAdmin: false }
const clientCtx: OpexToolContext = { sessionId: SESSION, actorId: 'u1', scope: { kind: 'client', actor: clientActor as never } }
const tool = (list: typeof watchTools, name: string) => list.find((item) => item.name === name)!
const run = (list: typeof watchTools, name: string, input: unknown, ctx: OpexToolContext) => tool(list, name).execute(tool(list, name).input.parse(input) as never, ctx)

const dto = { id: 'w1', sessionId: SESSION, target: { kind: 'task', id: 't1', label: 'OPE-12' }, conditionText: 'chegar na coluna de conclusão', status: 'watching', outcome: null, note: 'n', event: null, expiresAt: 'x', error: null, createdAt: 'y' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ alreadySatisfied: false, reused: false, watch: dto, current: 'Coluna atual: "Em andamento".' })
})

describe('ferramentas do dono', () => {
  it('grupo "watches": assinar e cancelar alteram (sem confirmação por padrão), listar só lê', () => {
    expect(watchTools.map((item) => [item.name, item.group, item.risk, Boolean(item.confirmByDefault)])).toEqual([
      ['watch_event', 'watches', 'write', false],
      ['list_watches', 'watches', 'read', false],
      ['cancel_watch', 'watches', 'write', false],
    ])
  })

  it('watch_event assina na conversa atual, no escopo do dono, e devolve a dica de encerrar o turno', async () => {
    const result = await run(watchTools, 'watch_event', { target: { kind: 'task', ref: 'OPE-12' }, event: 'done', note: 'Avise o dono' }, ownerCtx)
    expect(mocks.create).toHaveBeenCalledWith({ target: { kind: 'task', ref: 'OPE-12' }, event: 'done', note: 'Avise o dono' }, { actorId: 'local', sessionId: SESSION }, { kind: 'owner' })
    expect(result).toMatchObject({ ok: true, alreadySatisfied: false, id: 'w1', condition: 'chegar na coluna de conclusão' })
    expect((result as { hint: string }).hint).toContain('Pode encerrar o turno')
  })

  it('entrada inválida (evento de outro alvo) é recusada antes do serviço', async () => {
    await expect(run(watchTools, 'watch_event', { target: { kind: 'task', ref: 'OPE-12' }, event: 'deploy_finished', note: 'x' }, ownerCtx)).rejects.toThrow()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('condição já satisfeita: avisa sem assinar', async () => {
    mocks.create.mockResolvedValue({ alreadySatisfied: true, target: dto.target, conditionText: 'chegar na coluna de conclusão', current: 'Coluna atual: "Concluído".' })
    const result = await run(watchTools, 'watch_event', { target: { kind: 'task', ref: 'OPE-12' }, event: 'done', note: 'x' }, ownerCtx)
    expect(result).toMatchObject({ alreadySatisfied: true, current: 'Coluna atual: "Concluído".' })
  })

  it('list_watches lista as desta conversa por padrão e todas com scope=all', async () => {
    await run(watchTools, 'list_watches', {}, ownerCtx)
    expect(mocks.list).toHaveBeenLastCalledWith({ filter: 'active', sessionId: SESSION }, { kind: 'owner' })
    await run(watchTools, 'list_watches', { scope: 'all', filter: 'all' }, ownerCtx)
    expect(mocks.list).toHaveBeenLastCalledWith({ filter: 'all' }, { kind: 'owner' })
  })
})

describe('ferramentas do portal', () => {
  it('só alcançam tarefa, job e ambiente, no escopo do usuário do cliente', async () => {
    expect(() => tool(clientWatchTools, 'watch_event').input.parse({ target: { kind: 'workbench', ref: 'x' }, event: 'waiting_user', note: 'n' })).toThrow()
    await run(clientWatchTools, 'watch_event', { target: { kind: 'task', ref: 'OPE-12' }, event: 'done', note: 'n' }, clientCtx)
    expect(mocks.create).toHaveBeenCalledWith(expect.anything(), { actorId: 'u1', sessionId: SESSION }, { kind: 'client', actor: clientActor })
    mocks.cancel.mockResolvedValue(dto)
    await run(clientWatchTools, 'cancel_watch', { watchId: 'b'.repeat(24) }, clientCtx)
    expect(mocks.cancel).toHaveBeenCalledWith('b'.repeat(24), 'u1', { kind: 'client', actor: clientActor })
  })
})

it('os agentes rotineiros nunca recebem o grupo de observação (eles hibernam por tempo)', () => {
  expect(isRoutineForbiddenToolGroup('watches')).toBe(true)
})
