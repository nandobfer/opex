import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Ambientes no portal do cliente: vínculo pelo repositório, visão reduzida, ações do admin e tempo real. */

const mocks = vi.hoisted(() => ({
  runAction: vi.fn(async () => ({ deployId: 'd1', output: null })),
  publish: vi.fn(async () => {}),
  items: vi.fn(),
}))

vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticCentral: memoryModel() }
})
vi.mock('@/lib/db/models/Orcamento', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { OrcamentoClient: memoryModel() }
})
vi.mock('@/features/environments/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { Environment: memoryModel(), environmentsDb: async () => {} }
})
vi.mock('@/features/environments/server/deploy', () => ({ runEnvironmentAction: mocks.runAction }))
vi.mock('@/features/environments/server/service', () => ({ environmentItems: mocks.items }))
vi.mock('@/features/environments/server/settings', () => ({ envLog: { info: vi.fn(), warn: vi.fn() }, runEnvHost: 'host' }))
vi.mock('@/lib/pusher/channels', () => ({ publishToChannels: mocks.publish }))

import { AgenticCentral } from '@/lib/db/models/Agentic'
import { OrcamentoClient } from '@/lib/db/models/Orcamento'
import { Environment } from '@/features/environments/server/models'
import { listPortalEnvironments, publishPortalEnvironment, resolvePortalEnvironment, runPortalEnvironmentAction, toPortalEnvironment } from '@/features/environments/server/portal'
import type { EnvironmentDto } from '@/features/environments/types'
import type { ClientActor } from '@/features/auth/server/context'

type Store = { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const centrals = AgenticCentral as unknown as Store
const clients = OrcamentoClient as unknown as Store
const envs = Environment as unknown as Store

const dto = (env: Record<string, unknown>, overrides: Partial<EnvironmentDto> = {}): EnvironmentDto => ({
  id: String(env._id),
  name: String(env.name),
  slug: String(env.slug),
  source: env.source as EnvironmentDto['source'],
  envKeys: ['TOKEN'],
  ports: [8080],
  healthUrl: 'http://localhost:8080/health',
  buildOn: 'pc',
  runOn: 'server',
  deployedOn: { buildOn: 'pc', runOn: 'server' },
  deployedVersion: '1.2.0',
  lastDeploy: { id: 'd0', kind: 'deploy', status: 'success', ref: 'main', commit: 'abc', buildOn: 'pc', runOn: 'server', error: '/home/u/segredo falhou', startedAt: '2026-10-01T10:00:00.000Z', finishedAt: '2026-10-01T10:02:00.000Z', durationMs: 120000, version: '1.2.0', skipBuild: false, resumed: false },
  services: [{ service: 'app', container: 'loja-app-1', state: 'running', status: 'Up 2 hours', ports: '0.0.0.0:8080->3000/tcp', cpu: '1%', memory: '100MiB / 1GiB', version: '1.2.0' }],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
})

let loja: Record<string, unknown>
let client: { _id: string; projectIds: string[] }
const actor = (isAdmin: boolean) => ({ userId: 'u1', client, isAdmin }) as unknown as ClientActor

beforeEach(async () => {
  for (const store of [centrals, clients, envs]) store.docs.length = 0
  vi.clearAllMocks()
  const central = await centrals.create({ projectId: 'p1' })
  const other = await centrals.create({ projectId: 'p2' })
  client = (await clients.create({ active: true, projectIds: ['p1'] })) as unknown as typeof client
  await clients.create({ active: true, projectIds: ['p2'] })
  loja = await envs.create({ name: 'Loja', slug: 'loja', source: { kind: 'central', centralId: String(central._id), ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' } })
  await envs.create({ name: 'Outro', slug: 'outro', source: { kind: 'central', centralId: String(other._id), ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'outro' } })
  await envs.create({ name: 'CRM', slug: 'crm', source: { kind: 'adopted', machine: 'server', workingDir: '/srv/crm', configFiles: [], projectName: 'crm', git: true, pullOnRedeploy: false } })
  mocks.items.mockImplementation(async (list: Record<string, unknown>[]) => ({ items: list.map((env) => dto(env)) }))
})

describe('ambientes no portal do cliente', () => {
  it('lista só os de central do repositório vinculado (nem de outro cliente nem adotados), sem dados internos', async () => {
    const list = await listPortalEnvironments(client)
    expect(list.map((env) => env.slug)).toEqual(['loja'])
    expect(list[0]).toEqual({
      id: String(loja._id),
      name: 'Loja',
      slug: 'loja',
      ref: 'main',
      health: 'running',
      deployedVersion: '1.2.0',
      services: [{ service: 'app', state: 'running', status: 'Up 2 hours', version: '1.2.0' }],
      lastDeploy: { status: 'success', startedAt: '2026-10-01T10:00:00.000Z', finishedAt: '2026-10-01T10:02:00.000Z', durationMs: 120000, version: '1.2.0' },
      deploying: false,
    })
    // Variáveis, portas, máquinas, caminhos, containers e erro com caminho nunca saem para o portal.
    expect(JSON.stringify(list)).not.toMatch(/TOKEN|8080|server|pc|loja-app-1|segredo|docker-compose/)
  })

  it('cliente sem repositórios vinculados não vê nada (nem consulta o Docker)', async () => {
    expect(await listPortalEnvironments({ _id: 'c9', projectIds: [] } as never)).toEqual([])
    expect(mocks.items).not.toHaveBeenCalled()
  })

  it('deploy em andamento marca "deploying"', () => {
    const env = dto(loja, { lastDeploy: { ...dto(loja).lastDeploy!, status: 'running', finishedAt: null, durationMs: null } })
    expect(toPortalEnvironment(env).deploying).toBe(true)
  })

  it('o admin implanta (ref salva), levanta e reinicia pelos serviços do dono, com a auditoria do usuário', async () => {
    expect(await runPortalEnvironmentAction(actor(true), String(loja._id), 'deploy', 'host' as never)).toEqual({ started: true })
    expect(mocks.runAction).toHaveBeenCalledWith(String(loja._id), { action: 'deploy' }, 'u1', 'host')
    await runPortalEnvironmentAction(actor(true), String(loja._id), 'restart', 'host' as never)
    expect(mocks.runAction).toHaveBeenLastCalledWith(String(loja._id), { action: 'restart' }, 'u1', 'host')
  })

  it('usuário comum não age; ambiente de outro cliente ou adotado responde 404', async () => {
    await expect(runPortalEnvironmentAction(actor(false), String(loja._id), 'up')).rejects.toMatchObject({ status: 403 })
    const outro = envs.docs.find((env) => env.slug === 'outro')!
    const crm = envs.docs.find((env) => env.slug === 'crm')!
    await expect(runPortalEnvironmentAction(actor(true), String(outro._id), 'deploy')).rejects.toMatchObject({ status: 404 })
    await expect(runPortalEnvironmentAction(actor(true), String(crm._id), 'up')).rejects.toMatchObject({ status: 404 })
    await expect(resolvePortalEnvironment(client, 'outro')).rejects.toMatchObject({ status: 404 })
    expect((await resolvePortalEnvironment(client, 'loja')).slug).toBe('loja')
    expect(mocks.runAction).not.toHaveBeenCalled()
  })

  it('tempo real: avisa só os clientes do repositório (payload mínimo); adotado não avisa ninguém', async () => {
    await publishPortalEnvironment(String(loja._id), 'deploy')
    expect(mocks.publish).toHaveBeenCalledWith([`private-client-${client._id}`], 'cliente-environments-updated', { id: String(loja._id), change: 'deploy' })
    mocks.publish.mockClear()
    const crm = envs.docs.find((env) => env.slug === 'crm')!
    await publishPortalEnvironment(String(crm._id), 'status')
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('ambiente já apagado avisa pela central informada', async () => {
    const centralId = (loja.source as { centralId: string }).centralId
    await publishPortalEnvironment('apagado', 'deleted', centralId)
    expect(mocks.publish).toHaveBeenCalledWith([`private-client-${client._id}`], 'cliente-environments-updated', { id: 'apagado', change: 'deleted' })
  })
})

describe('menu do portal', () => {
  it('Ambientes aparece para todos; Financeiro e Usuários só para o admin', async () => {
    const { clienteNav } = await import('@/features/orcamentos/portal/navigation')
    const labels = (isAdmin: boolean) => clienteNav(isAdmin)[0]!.items.map((item) => item.label)
    expect(labels(false)).toEqual(['Dashboard', 'Tarefas', 'Ambientes'])
    expect(labels(true)).toEqual(['Dashboard', 'Tarefas', 'Ambientes', 'Financeiro', 'Usuários'])
  })
})
