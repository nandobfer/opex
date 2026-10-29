import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostResult } from '@/features/local-docker/server/shell'

/** Ambientes: deploy (combinações, bloqueio de bind mount, mover) e as ações de efeito imediato. */

const mocks = vi.hoisted(() => ({
  pcAvailable: true,
  exclusive: vi.fn(async <T,>(run: () => Promise<T>) => run()),
  publish: vi.fn(async () => {}),
  queueFollowUp: vi.fn(async () => {}),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/crypto/secretBox', () => ({ encryptSecret: (plain: string) => ({ v: 1, c: plain }), decryptSecret: (box: { c: string }) => box.c }))
vi.mock('@/features/environments/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { Environment: memoryModel(), EnvironmentDeploy: memoryModel(), EnvironmentsState: memoryModel(), environmentsDb: async () => {} }
})
vi.mock('@/features/environments/server/settings', async () => {
  const { DEFAULT_ENVIRONMENTS_SETTINGS } = await import('@/features/environments/schemas')
  const targets = { server: { machine: 'server', context: 'ctx', builder: 'bld' }, pc: { machine: 'pc', context: 'ctx', builder: 'bld' } }
  return {
    envLog: { info: vi.fn(), warn: vi.fn() },
    runEnvHost: vi.fn(),
    publishEnvironment: mocks.publish,
    loadEnvironmentsSettings: async () => DEFAULT_ENVIRONMENTS_SETTINGS,
    machineAccess: async () => ({ targets, pcAvailable: mocks.pcAvailable, pcReason: mocks.pcAvailable ? null : 'Túnel fechado' }),
  }
})
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: async () => ({ config: { sessionDirectory: '/home/u/loja' } }) }))
vi.mock('@/features/agentic/server/build-queue', () => ({ runExclusiveBuild: mocks.exclusive }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: {} }))
vi.mock('@/features/local-docker/server/models', () => ({ LocalDockerPreview: {} }))
vi.mock('@/features/opex-agent/server/runner', () => ({ queueFollowUp: mocks.queueFollowUp }))

import { Environment, EnvironmentDeploy } from '@/features/environments/server/models'
import { runEnvironmentAction, startDeploy } from '@/features/environments/server/deploy'
import { createEnvironment, updateEnvironment } from '@/features/environments/server/service'
import type { EnvironmentInput } from '@/features/environments/schemas'

const envs = Environment as unknown as { docs: Record<string, unknown>[] }
const deploys = EnvironmentDeploy as unknown as { docs: Record<string, unknown>[] }

const CONFIG = (bind: boolean) =>
  JSON.stringify({ services: { app: { build: { context: '.' }, environment: { CLERK_SECRET_KEY: 'sk_test_vazado' }, volumes: bind ? [{ type: 'bind', source: '/srv/app', target: '/app' }] : [] }, db: { image: 'mongo:7' } } })

function host(options: { bind?: boolean; fail?: string; images?: 'present' | 'missing'; tree?: 'clean' | 'dirty' } = {}) {
  const calls: string[] = []
  const run = vi.fn(async (command: string, _timeout?: number, opts?: { onOutput?: (chunk: string) => void }): Promise<HostResult> => {
    calls.push(command)
    opts?.onOutput?.('ok\n')
    if (options.fail && command.includes(options.fail)) return { exitCode: 1, output: 'erro' }
    if (command.includes('rev-parse --short=12')) return { exitCode: 0, output: 'abc123def456' }
    if (command.includes('config --format json')) return { exitCode: 0, output: CONFIG(options.bind ?? false) }
    if (command.includes('docker image inspect')) return { exitCode: 0, output: options.images ?? 'missing' }
    if (command.includes('status --porcelain')) return { exitCode: 0, output: options.tree ?? 'clean' }
    if (command.includes('package.json')) return { exitCode: 0, output: '{"name":"loja","version":"2.3.4"}' }
    return { exitCode: 0, output: '' }
  })
  return { run, calls }
}

const input = (overrides: Partial<EnvironmentInput> = {}): EnvironmentInput => ({
  name: 'Loja',
  slug: 'loja',
  source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' },
  env: [{ key: 'TOKEN', value: 'segredo' }],
  ports: [4100],
  healthUrl: '',
  buildOn: 'server',
  runOn: 'server',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  envs.docs.length = 0
  deploys.docs.length = 0
  mocks.pcAvailable = true
})

describe('deploy — saída do compose, executor desacoplado e build reaproveitado', () => {
  it('regressão: o log do deploy não tem a saída do compose config (variáveis resolvidas)', async () => {
    const env = await createEnvironment(input(), 'local')
    const { run } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const log = String(deploys.docs[0]!.log)
    expect(log).toContain('▸ Lendo o compose')
    expect(log).toContain('Compose lido: 2 serviço(s): app, db')
    expect(log).not.toContain('sk_test_vazado')
    const config = run.mock.calls.find(([command]) => String(command).includes('config --format json'))!
    expect(config[2]).toMatchObject({ redactedAs: expect.stringContaining('saída omitida') })
    expect(config[2]).not.toHaveProperty('onOutput')
  })

  it('passos longos rodam desacoplados do shell do OpenCode', async () => {
    const env = await createEnvironment(input(), 'local')
    const { run } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const build = run.mock.calls.find(([command]) => String(command).includes(' build'))!
    expect(build[2]).toMatchObject({ detached: true })
  })

  it('PC → Servidor com as imagens do commit já no PC: pula o build e vai direto ao registry', async () => {
    const env = await createEnvironment(input({ buildOn: 'pc', ports: [] }), 'local')
    const { run, calls } = host({ images: 'present' })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const log = String(deploys.docs[0]!.log)
    expect(log).toContain('Build reaproveitado: as imagens do commit abc123def456 já existem no PC')
    expect(log).not.toContain('▸ Build no PC')
    expect(calls.find((command) => command.includes('docker image inspect'))).toContain('opex-env/loja-app:abc123def456')
    expect(log).toContain('▸ Push das imagens no PC')
    // A limpeza do registry usa os repositórios exatos de cada deploy (sem confundir slugs com prefixo comum).
    expect(deploys.docs[0]!.repositories).toEqual(['opex-env/loja-app'])
  })

  const adopted = (overrides: Partial<EnvironmentInput> = {}) =>
    input({ source: { kind: 'adopted', machine: 'server', workingDir: '/home/u/loja', configFiles: ['/home/u/loja/compose.yml'], projectName: 'loja', git: true, pullOnRedeploy: false }, ports: [], runOn: 'pc', ...overrides })

  it('regressão: projeto adotado com alterações não commitadas refaz o build mesmo com a imagem do commit', async () => {
    const env = await createEnvironment(adopted(), 'local')
    const { run, calls } = host({ images: 'present', tree: 'dirty' })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const log = String(deploys.docs[0]!.log)
    expect(log).toContain('Há alterações não commitadas na pasta: o build é refeito.')
    expect(log).not.toContain('Build reaproveitado')
    expect(log).toContain('▸ Build no servidor')
    const check = calls.find((command) => command.includes('status --porcelain'))!
    expect(check).toContain("':!.env.opex'")
    expect(check).toContain("':!docker-compose.opex.yml'")
  })

  it('projeto adotado com a árvore limpa reaproveita o build', async () => {
    const env = await createEnvironment(adopted(), 'local')
    const { run } = host({ images: 'present', tree: 'clean' })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(String(deploys.docs[0]!.log)).toContain('Build reaproveitado')
  })

  it('regressão: sem variáveis extras o .env.opex do deploy anterior é apagado', async () => {
    const env = await createEnvironment(input({ env: [] }), 'local')
    const { run, calls } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const removal = calls.findIndex((command) => /rm -f \S*\/\.env\.opex$/.test(command))
    expect(removal).toBeGreaterThanOrEqual(0)
    expect(removal).toBeLessThan(calls.findIndex((command) => command.includes('config --format json')))
    expect(calls.some((command) => command.includes('.env.opex') && command.includes('base64 -d'))).toBe(false)
  })

  it('sem as imagens do commit: faz o build', async () => {
    const env = await createEnvironment(input({ buildOn: 'pc', ports: [] }), 'local')
    const { run } = host({ images: 'missing' })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(String(deploys.docs[0]!.log)).toContain('▸ Build no PC')
  })
})

describe('deploy', () => {
  it('Servidor → Servidor: código da ref, variáveis cifradas no banco e gravadas no .env.opex (debug sem valores), build na fila global', async () => {
    const env = await createEnvironment(input(), 'local')
    expect(envs.docs[0]!.env).toEqual([{ key: 'TOKEN', value: { v: 1, c: 'segredo' } }])
    const { run, calls } = host()
    const id = await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]).toMatchObject({ status: 'success', commit: 'abc123def456', imageTag: 'abc123def456' })
    expect(String(deploys.docs[0]!.log)).toContain('▸ Build no servidor')
    expect(envs.docs[0]).toMatchObject({ deployedOn: { buildOn: 'server', runOn: 'server' }, lastDeployId: id })
    expect(calls[0]).toContain("worktree add --detach")
    const envWrite = run.mock.calls.find(([command]) => String(command).includes('.env.opex') && String(command).includes('base64 -d'))!
    expect(envWrite[2]).toMatchObject({ redactedAs: expect.stringContaining('valores ocultos') })
    expect(mocks.exclusive).toHaveBeenCalledTimes(1)
    expect(calls.some((command) => command.includes('registry'))).toBe(false)
  })

  it('grava a versão do código, o build reaproveitado e o ponto de retomada a cada passo (limpo no fim)', async () => {
    const env = await createEnvironment(input(), 'local')
    const { run } = host()
    const seen: unknown[] = []
    const tracked = vi.fn(async (command: string, timeout?: number, opts?: { onOutput?: (chunk: string) => void; jobId?: string }) => {
      if (command.includes('up -d')) seen.push({ checkpoint: deploys.docs[0]!.checkpoint, jobId: opts?.jobId })
      return run(command, timeout, opts)
    })
    const id = await startDeploy(String(env._id), 'local', { kind: 'deploy', run: tracked, wait: true })
    expect(seen).toEqual([{ checkpoint: expect.objectContaining({ step: 1, commit: 'abc123def456', version: '2.3.4', buildServices: ['app'], from: null }), jobId: `envdeploy-${id}-1` }])
    expect(deploys.docs[0]).toMatchObject({ status: 'success', version: '2.3.4', skipBuild: false, checkpoint: null })
    expect(deploys.docs[0]!.heartbeatAt).toBeInstanceOf(Date)
    expect(envs.docs[0]).toMatchObject({ deployedVersion: '2.3.4' })
    expect(String(deploys.docs[0]!.log)).toContain('Versão do app: v2.3.4')
  })

  it('executar no PC com bind mount: falha com a explicação, sem subir nada', async () => {
    const env = await createEnvironment(input({ runOn: 'pc' }), 'local')
    const { run, calls } = host({ bind: true })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]).toMatchObject({ status: 'failed' })
    expect(String(deploys.docs[0]!.error)).toContain('bind mount em app (/srv/app:/app)')
    expect(calls.some((command) => command.includes(' up -d'))).toBe(false)
    expect(envs.docs[0]!.deployedOn).toBeUndefined()
  })

  it('PC indisponível: recusa antes de criar o deploy', async () => {
    mocks.pcAvailable = false
    const env = await createEnvironment(input({ buildOn: 'pc' }), 'local')
    await expect(startDeploy(String(env._id), 'local', { kind: 'deploy', run: host().run, wait: true })).rejects.toThrow('Túnel fechado')
    expect(deploys.docs).toHaveLength(0)
  })

  it('mover Servidor → PC com a mesma porta: derruba no servidor antes e sobe no PC pelo registry', async () => {
    const env = await createEnvironment(input(), 'local')
    envs.docs[0]!.deployedOn = { buildOn: 'server', runOn: 'server' }
    const { run, calls } = host()
    const result = await runEnvironmentAction(String(env._id), { action: 'move', buildOn: 'server', runOn: 'pc' }, 'local', run)
    await vi.waitFor(() => expect(deploys.docs[0]!.status).toBe('success'))
    expect(result.deployId).toBeTruthy()
    const down = calls.findIndex((command) => command.includes('down --remove-orphans') && !command.includes('DOCKER_CONTEXT'))
    const upPc = calls.findIndex((command) => command.includes('DOCKER_CONTEXT=ctx') && command.includes('up -d --no-build'))
    expect(down).toBeGreaterThan(-1)
    expect(upPc).toBeGreaterThan(down)
    expect(calls.some((command) => command.includes('-O forward -R 5050:localhost:5050'))).toBe(true)
    expect(envs.docs[0]).toMatchObject({ buildOn: 'server', runOn: 'pc', deployedOn: { buildOn: 'server', runOn: 'pc' } })
  })

  it('falha no push ainda fecha o repasse do registry', async () => {
    const env = await createEnvironment(input({ buildOn: 'pc' }), 'local')
    const { run, calls } = host({ fail: ' push ' })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]).toMatchObject({ status: 'failed' })
    expect(calls.some((command) => command.includes('-O cancel -R 5050'))).toBe(true)
  })
})

describe('aviso ao Agente Opex no fim do deploy', () => {
  it('deploy pedido pelo agente: sucesso e falha entram como aviso na sessão, sem valores de variáveis', async () => {
    const env = await createEnvironment(input(), 'local')
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run: host().run, wait: true, notifyOpexSessionId: 's1' })
    expect(mocks.queueFollowUp).toHaveBeenCalledWith('s1', expect.objectContaining({ kind: 'notice', display: 'Deploy de loja concluído (0 s)' }))
    const [, ok] = mocks.queueFollowUp.mock.calls[0] as unknown as [string, { text: string }]
    expect(ok.text).toContain('resultado: sucesso')
    expect(ok.text).toContain('main @ abc123def456')
    expect(ok.text).not.toContain('segredo')
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run: host({ fail: 'worktree' }).run, wait: true, notifyOpexSessionId: 's1' })
    const [, failed] = mocks.queueFollowUp.mock.calls[1] as unknown as [string, { text: string; display: string }]
    expect(failed.display).toContain('falhou')
    expect(failed.text).toContain('get_environment_deploy')
  })

  it('deploy pela tela não avisa; falha no aviso não muda o resultado do deploy', async () => {
    const env = await createEnvironment(input(), 'local')
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run: host().run, wait: true })
    expect(mocks.queueFollowUp).not.toHaveBeenCalled()
    mocks.queueFollowUp.mockRejectedValueOnce(new Error('sessão apagada'))
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run: host().run, wait: true, notifyOpexSessionId: 's1' })
    expect(deploys.docs.map((deploy) => deploy.status)).toEqual(['success', 'success'])
  })
})

describe('mover sem o deploy aceito', () => {
  it('PC indisponível: recusa sem gravar o novo destino', async () => {
    mocks.pcAvailable = false
    const env = await createEnvironment(input(), 'local')
    await expect(runEnvironmentAction(String(env._id), { action: 'move', buildOn: 'server', runOn: 'pc' }, 'local', host().run)).rejects.toThrow('Túnel fechado')
    expect(envs.docs[0]).toMatchObject({ buildOn: 'server', runOn: 'server' })
    expect(deploys.docs).toHaveLength(0)
  })
})

describe('edição e ações', () => {
  it('adotado sem deploy pelo app: derrubar não exige o override (só entra quando existe)', async () => {
    const env = await createEnvironment(
      input({ source: { kind: 'adopted', machine: 'server', workingDir: '/home/u/scratch', configFiles: ['/home/u/scratch/compose.yml'], projectName: 'scratch', git: false, pullOnRedeploy: false }, env: [], ports: [] }),
      'local',
    )
    envs.docs[0]!.deployedOn = { buildOn: 'server', runOn: 'server' }
    const { run, calls } = host()
    await runEnvironmentAction(String(env._id), { action: 'down' }, 'local', run)
    expect(calls[0]).toContain("cd '/home/u/scratch' && docker compose -p scratch")
    expect(calls[0]).toContain('$( [ -f docker-compose.opex.yml ] && echo -f docker-compose.opex.yml )')
    expect(calls[0]).not.toContain("-f 'docker-compose.opex.yml'")
  })

  it('variável com valor vazio mantém o valor salvo; nova é cifrada', async () => {
    const env = await createEnvironment(input(), 'local')
    await updateEnvironment(String(env._id), input({ env: [{ key: 'TOKEN', value: '' }, { key: 'NOVA', value: 'x' }] }), 'local')
    expect(envs.docs[0]!.env).toEqual([
      { key: 'TOKEN', value: { v: 1, c: 'segredo' } },
      { key: 'NOVA', value: { v: 1, c: 'x' } },
    ])
  })

  it('derrubar no PC também tira os repasses das portas; logs devolvem a saída', async () => {
    const env = await createEnvironment(input({ buildOn: 'pc', runOn: 'pc' }), 'local')
    envs.docs[0]!.deployedOn = { buildOn: 'pc', runOn: 'pc' }
    const { run, calls } = host()
    await runEnvironmentAction(String(env._id), { action: 'down' }, 'local', run)
    expect(calls[0]).toContain('DOCKER_CONTEXT=ctx docker compose')
    expect(calls[0]).toContain('-O cancel -L')
    expect(mocks.publish).toHaveBeenCalledWith(String(env._id), 'status')
    expect((await runEnvironmentAction(String(env._id), { action: 'logs' }, 'local', run)).output).toBe('')
  })
})
