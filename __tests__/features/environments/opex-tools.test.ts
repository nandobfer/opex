import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  envs: [] as Record<string, unknown>[],
  createEnvironment: vi.fn(async (input: Record<string, unknown>) => ({ _id: 'e9', ...input })),
  updateEnvironment: vi.fn(async (id: string, input: { env: { key: string }[] }) => ({ _id: id, slug: 'loja', env: input.env })),
  runEnvironmentAction: vi.fn(async (_id: string, input: { action: string }) => ({ deployId: input.action === 'deploy' || input.action === 'move' ? 'd1' : null, output: input.action === 'logs' ? '\u001b[32mapp | ok\u001b[0m\napp | linha 2\n' : null })),
  deleteEnvironment: vi.fn(async () => undefined),
  getDeploy: vi.fn(),
  runRegistryCleanup: vi.fn(async () => '2 tag(s) apagada(s)'),
  notifyRegistry: vi.fn(async () => undefined),
}))

vi.mock('@/features/environments/server/settings', () => ({
  runEnvHost: 'host-runner',
  envLog: { warn: vi.fn(), info: vi.fn() },
  getEnvironmentsSettings: async () => ({ settings: { baseDir: 'opex-envs', registryPort: 5050, keepTags: 5 }, isDefault: true }),
  saveEnvironmentsSettings: async (input: unknown) => ({ settings: input, isDefault: false }),
}))
vi.mock('@/features/environments/server/service', () => ({
  resolveEnvironmentRef: async (ref: string) => {
    const found = mocks.envs.find((env) => env._id === ref || env.slug === ref)
    if (!found) {
      const { DomainError } = await import('@/lib/api/route')
      throw new DomainError(404, `Ambiente "${ref}" não encontrado`, 'ENVIRONMENT_NOT_FOUND')
    }
    return found
  },
  createEnvironment: mocks.createEnvironment,
  updateEnvironment: mocks.updateEnvironment,
  getDeploy: mocks.getDeploy,
  listEnvironments: async () => ({
    items: [
      { id: 'e1', name: 'Loja', slug: 'loja', source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' }, envKeys: ['TOKEN'], ports: [8080], healthUrl: null, buildOn: 'server', runOn: 'pc', deployedOn: { buildOn: 'server', runOn: 'pc' }, deployedVersion: '1.2.0', lastDeploy: null, services: [{ service: 'app', container: 'loja-app-1', state: 'running', status: 'Up', ports: '8080', cpu: null, memory: null, version: '1.3.0' }], createdAt: '', updatedAt: '' },
    ],
    unmanaged: [{ machine: 'server', projectName: 'crm', workingDir: '/srv/crm', configFiles: ['/srv/crm/docker-compose.yml'], git: true, containers: 2, running: 2 }],
    pcAvailable: true,
    pcReason: null,
    checkedAt: '2026-10-28T12:00:00.000Z',
  }),
}))
vi.mock('@/features/environments/server/deploy', () => ({ runEnvironmentAction: mocks.runEnvironmentAction, deleteEnvironment: mocks.deleteEnvironment }))
vi.mock('@/features/environments/server/registry', () => ({ runRegistryCleanup: mocks.runRegistryCleanup, getRegistryStatus: async () => ({ running: true, port: 5050, detail: 'No ar' }) }))
vi.mock('@/features/environments/server/opex-notice', () => ({ notifyOpexRegistryCleanup: mocks.notifyRegistry }))

import { environmentTools } from '@/features/opex-agent/server/tools/environments'
import { toolErrorMessage } from '@/features/opex-agent/server/tools/define'
import { toolConfirms as needsConfirmation } from '@/features/opex-agent/tool-tree'

const context = { sessionId: 's1', actorId: 'local' }
type AnyTool = { name: string; risk: string; input: { parse: (value: unknown) => unknown }; summarize?: (input: never) => string; redact?: (input: never) => unknown; execute: (input: unknown, ctx: typeof context & Record<string, unknown>) => Promise<unknown> }
const find = (name: string) => environmentTools.find((tool) => tool.name === name) as unknown as AnyTool
const run = (name: string, input: unknown) => find(name).execute(find(name).input.parse(input), context)

const loja = { _id: 'e1', name: 'Loja', slug: 'loja', source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' }, env: [{ key: 'TOKEN', value: { c: 'segredo' } }], ports: [8080], healthUrl: null, buildOn: 'server', runOn: 'server', deployedOn: { buildOn: 'server', runOn: 'server' } }
const adotado = { ...loja, _id: 'e2', slug: 'crm', source: { kind: 'adopted', machine: 'server', workingDir: '/srv/crm', configFiles: ['/srv/crm/docker-compose.yml'], projectName: 'crm', git: true, pullOnRedeploy: false } }

beforeEach(() => {
  mocks.envs = [loja, adotado]
  vi.clearAllMocks()
})

describe('ferramentas do Agente Opex para os ambientes', () => {
  it('todas são do grupo Ambientes (só no agente do dono); as que mudam produção pedem confirmação por padrão', () => {
    for (const tool of environmentTools) expect(tool).toMatchObject({ group: 'environments' })
    for (const name of ['deploy_environment', 'move_environment', 'stop_environment', 'delete_environment']) expect(find(name).risk).toBe('destructive')
    for (const name of ['restart_environment', 'clean_environments_registry', 'update_environment', 'adopt_project', 'update_environments_settings', 'deploy_environment']) expect(needsConfirmation(find(name) as never)).toBe(true)
    for (const name of ['create_environment', 'start_environment', 'list_environments', 'get_environment_logs']) expect(needsConfirmation(find(name) as never)).toBe(false)
  })

  it('lista agrupada por máquina com estado, versão e serviços no ar', async () => {
    const out = (await run('list_environments', {})) as { servidor: unknown[]; pc: Record<string, unknown>[]; naoGerenciados: number }
    expect(out.servidor).toHaveLength(0)
    expect(out.pc[0]).toMatchObject({ slug: 'loja', estado: 'No ar', servicosNoAr: '1/1', versao: 'v1.3.0' })
    expect(out.naoGerenciados).toBe(1)
  })

  it('cria pela central com slug sugerido e esconde os valores das variáveis no card', async () => {
    const input = { name: 'Loja Homologação', centralId: 'c1', env: [{ key: 'TOKEN', value: 'abc123' }] }
    await run('create_environment', input)
    expect(mocks.createEnvironment).toHaveBeenCalledWith(expect.objectContaining({ slug: 'loja-homologacao', source: expect.objectContaining({ kind: 'central', ref: 'main', projectName: 'loja-homologacao' }) }), 'local')
    const tool = find('create_environment')
    expect(JSON.stringify(tool.redact!(input as never))).not.toContain('abc123')
    expect(tool.summarize!(input as never)).not.toContain('abc123')
  })

  it('edita só os campos enviados; variável sem valor mantém o salvo', async () => {
    await run('update_environment', { environment: 'loja', ref: 'release', env: [{ key: 'TOKEN' }, { key: 'NOVA', value: 'x' }] })
    expect(mocks.updateEnvironment).toHaveBeenCalledWith('e1', expect.objectContaining({ name: 'Loja', ports: [8080], source: expect.objectContaining({ ref: 'release' }), env: [{ key: 'TOKEN', value: '' }, { key: 'NOVA', value: 'x' }] }), 'local')
  })

  it('deploy volta na hora com o id e pede o aviso na sessão; adotado não aceita outra ref', async () => {
    const out = await run('deploy_environment', { environment: 'loja' })
    expect(out).toMatchObject({ deployId: 'd1', status: 'running', ref: 'main' })
    expect(mocks.runEnvironmentAction).toHaveBeenCalledWith('e1', { action: 'deploy', ref: '' }, 'local', 'host-runner', { notifyOpexSessionId: 's1' })
    await expect(run('deploy_environment', { environment: 'crm', ref: 'dev' })).rejects.toThrow(/adotado/)
  })

  it('erro legível: ambiente desconhecido', async () => {
    const missing = await run('stop_environment', { environment: 'nada' }).catch((error: unknown) => toolErrorMessage(error))
    expect(missing).toContain('Ambiente "nada" não encontrado')
    expect(mocks.runEnvironmentAction).not.toHaveBeenCalled()
  })

  it('logs sem códigos ANSI e fim do log do deploy', async () => {
    const logs = (await run('get_environment_logs', { environment: 'loja', lines: 1 })) as { linhas: string }
    expect(logs.linhas).toBe('app | linha 2')
    mocks.getDeploy.mockResolvedValueOnce({ id: 'd1', environmentId: 'e1', kind: 'deploy', status: 'failed', ref: 'main', commit: 'abcdef1234567890', buildOn: 'server', runOn: 'server', error: 'build falhou', startedAt: '', finishedAt: '', durationMs: 65_000, version: null, skipBuild: false, resumed: false, log: 'a\nb\n\u001b[31m✖ build falhou\u001b[0m\n' })
    const deploy = (await run('get_environment_deploy', { deployId: 'd1', tailLines: 2 })) as Record<string, unknown>
    expect(deploy).toMatchObject({ resultado: 'Falhou', duracao: '1 min 05 s', refCommit: 'main @ abcdef123456', log: 'b\n✖ build falhou', erro: 'build falhou' })
  })

  it('limpeza do registry roda em segundo plano e avisa a sessão', async () => {
    const out = await run('clean_environments_registry', {})
    expect(out).toMatchObject({ status: 'running' })
    await vi.waitFor(() => expect(mocks.notifyRegistry).toHaveBeenCalledWith('s1', { ok: true, message: '2 tag(s) apagada(s)' }))
  })

  it('sem conversa (token de sistema): deploy e limpeza do registry não avisam sessão alguma', async () => {
    const tokenContext = { sessionId: '', actorId: 'local', origin: { kind: 'api-token', tokenId: 't1', nome: 'Automação', prefixo: 'mt_sys_AbCdEfGh' } }
    await find('deploy_environment').execute(find('deploy_environment').input.parse({ environment: 'loja' }), tokenContext)
    expect(mocks.runEnvironmentAction).toHaveBeenCalledWith('e1', { action: 'deploy', ref: '' }, 'local', 'host-runner', { notifyOpexSessionId: null })
    const out = await find('clean_environments_registry').execute({}, tokenContext)
    expect(out).toMatchObject({ status: 'running', nota: 'Limpeza em andamento em segundo plano.' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.notifyRegistry).not.toHaveBeenCalled()
  })
})
