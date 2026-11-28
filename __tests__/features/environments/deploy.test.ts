import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostResult } from '@/features/local-docker/server/shell'

/** Ambientes: deploy (combinações, bloqueio de bind mount, mover) e as ações de efeito imediato. */

const mocks = vi.hoisted(() => ({
  pcAvailable: true,
  exclusive: vi.fn(async <T,>(run: () => Promise<T>) => run()),
  publish: vi.fn(async () => {}),
  queueFollowUp: vi.fn(async () => {}),
  /** Fato das observações do Agente Opex (OPE-194). */
  watchDeploy: vi.fn(async () => {}),
  audit: vi.fn<(entry: { antes?: Record<string, unknown>; depois?: Record<string, unknown> }) => Promise<undefined>>(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.audit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/crypto/secretBox', () => ({ encryptSecret: (plain: string) => ({ v: 1, c: plain }), decryptSecret: (box: { c?: string }) => {
  if (typeof box.c !== 'string') throw new Error('falha ao decifrar')
  return box.c
} }))
vi.mock('@/features/environments/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { Environment: memoryModel(), EnvironmentDeploy: memoryModel(), EnvironmentComposeVersion: memoryModel(), EnvironmentsState: memoryModel(), environmentsDb: async () => {} }
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
vi.mock('@/features/opex-agent/server/watch-events', () => ({ watchDeployFinished: mocks.watchDeploy }))

import { Environment, EnvironmentComposeVersion, EnvironmentDeploy } from '@/features/environments/server/models'
import { deleteEnvironment, runEnvironmentAction, startDeploy } from '@/features/environments/server/deploy'
import { createEnvironment, readEnvValues, updateEnvironment } from '@/features/environments/server/service'
import { readComposeServices } from '@/features/environments/server/compose-read'
import type { EnvironmentInput } from '@/features/environments/schemas'

const envs = Environment as unknown as { docs: Record<string, unknown>[] }
const deploys = EnvironmentDeploy as unknown as { docs: Record<string, unknown>[] }
const revisions = EnvironmentComposeVersion as unknown as { docs: Record<string, unknown>[] }

const CONFIG = (bind: boolean) =>
  JSON.stringify({ services: { app: { build: { context: '.' }, environment: { CLERK_SECRET_KEY: 'sk_test_vazado' }, volumes: bind ? [{ type: 'bind', source: '/srv/app', target: '/app' }] : [] }, db: { image: 'mongo:7' } } })

/** `envFiles`: arquivos de variáveis que o compose declara; `existing`: os que já existem na pasta. */
function host(options: { bind?: boolean; fail?: string; failOutput?: string; images?: 'present' | 'missing'; tree?: 'clean' | 'dirty'; envFiles?: string[]; existing?: string[]; configOutput?: string; config?: string } = {}) {
  const calls: string[] = []
  const run = vi.fn(async (command: string, _timeout?: number, opts?: { onOutput?: (chunk: string) => void }): Promise<HostResult> => {
    calls.push(command)
    opts?.onOutput?.('ok\n')
    if (options.fail && command.includes(options.fail)) return { exitCode: 1, output: options.failOutput ?? 'erro' }
    if (command.includes('config --no-env-resolution --no-interpolate')) {
      const files = options.envFiles ?? []
      return { exitCode: 0, output: JSON.stringify({ services: { app: files.length ? { env_file: files.map((path) => ({ path, required: true })) } : {} } }) }
    }
    if (command.includes('@@opex-env-file-created')) {
      const missing = (options.envFiles ?? []).filter((file) => !(options.existing ?? []).includes(file))
      return { exitCode: 0, output: missing.map((file) => `@@opex-env-file-created ${file.replace('/home/burgos/opex-envs/loja/', '')}\n`).join('') }
    }
    if (options.configOutput && command.includes('config --format json')) return { exitCode: 1, output: options.configOutput }
    if (command.includes('rev-parse --short=12')) return { exitCode: 0, output: 'abc123def456' }
    if (command.includes('config --format json')) return { exitCode: 0, output: options.config ?? CONFIG(options.bind ?? false) }
    if (command.includes('docker image inspect')) return { exitCode: 0, output: options.images ?? 'missing' }
    if (command.includes('status --porcelain')) return { exitCode: 0, output: options.tree ?? 'clean' }
    if (command.includes('package.json')) return { exitCode: 0, output: '{"name":"loja","version":"2.3.4"}' }
    return { exitCode: 0, output: '' }
  })
  return { run, calls }
}

const downCall = (calls: string[]) => calls.find((command) => command.includes(' down --remove-orphans'))!

const input = (overrides: Partial<EnvironmentInput> = {}): EnvironmentInput => ({
  name: 'Loja',
  slug: 'loja',
  source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' },
  env: [{ key: 'TOKEN', value: 'segredo' }],
  ports: [4100],
  healthUrl: '',
  buildOn: 'server',
  runOn: 'server',
  limits: { mode: 'shared', memoryGb: null, cpus: null, swapGb: null },
  composeOverrides: null,
  ...overrides,
})

/** Conteúdo do último override gravado (o `writeFileCommand` grava em base64). */
const lastOverride = (calls: string[]) => {
  const write = calls.filter((command) => command.includes('docker-compose.opex.yml') && command.includes('base64 -d')).at(-1)!
  return Buffer.from(/printf %s '([^']+)'/.exec(write)![1]!, 'base64').toString('utf8')
}

beforeEach(() => {
  vi.clearAllMocks()
  envs.docs.length = 0
  deploys.docs.length = 0
  revisions.docs.length = 0
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

describe('limites de recursos no deploy (OPE-193)', () => {
  it('modo único: cada serviço recebe os limites no override e o log diz quais', async () => {
    const env = await createEnvironment(input({ limits: { mode: 'shared', memoryGb: 4, swapGb: 2, cpus: 1.5 } }), 'local')
    const { run, calls } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.status).toBe('success')
    const yaml = lastOverride(calls)
    expect(yaml).toContain('"app":\n    env_file:\n      - ".env.opex"\n    memswap_limit: "6144m"\n    deploy:\n      resources:\n        limits:\n          memory: "4096m"\n          cpus: "1.5"')
    expect(yaml).toContain('"db":\n    env_file:\n      - ".env.opex"\n    memswap_limit: "6144m"')
    expect(String(deploys.docs[0]!.log)).toContain('Limites: app RAM 4 GiB · swap +2 GiB · 1,5 CPUs; db RAM 4 GiB · swap +2 GiB · 1,5 CPUs')
    // O override é gravado antes de subir.
    const write = calls.findLastIndex((command) => command.includes('docker-compose.opex.yml') && command.includes('base64 -d'))
    expect(write).toBeLessThan(calls.findIndex((command) => command.includes('up -d')))
  })

  it('por serviço: só o serviço com limite ganha chaves; linha de serviço fora do compose avisa no log e não bloqueia', async () => {
    const env = await createEnvironment(input({ env: [], limits: { mode: 'service', services: [{ service: 'app', memoryGb: 2, swapGb: 0, cpus: null }, { service: 'antigo', memoryGb: 1, swapGb: null, cpus: null }] } }), 'local')
    const { run, calls } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.status).toBe('success')
    const yaml = lastOverride(calls)
    expect(yaml).toContain('"app":\n    memswap_limit: "2048m"\n    deploy:\n      resources:\n        limits:\n          memory: "2048m"')
    expect(yaml).not.toContain('"db"')
    const log = String(deploys.docs[0]!.log)
    expect(log).toContain('Limite do serviço antigo ignorado: o serviço não está no compose.')
    expect(log).toContain('Limites: app RAM 2 GiB · sem swap · CPU sem limite; db sem limite')
  })

  it('sem limites: nenhuma chave no override nem linha no log (ambiente antigo sem o campo também)', async () => {
    const env = await createEnvironment(input({ env: [] }), 'local')
    delete envs.docs[0]!.limits
    const { run, calls } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(lastOverride(calls)).toContain('services: {}')
    expect(String(deploys.docs[0]!.log)).not.toContain('Limites:')
  })

  it('o deploy com sucesso grava os limites que aplicou (o selo compara com eles); a falha não', async () => {
    const env = await createEnvironment(input({ limits: { mode: 'shared', memoryGb: 4, swapGb: null, cpus: null } }), 'local')
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run: host().run, wait: true })
    expect(envs.docs[0]!.deployedLimits).toEqual({ mode: 'shared', memoryGb: 4, swapGb: null, cpus: null })
    await updateEnvironment(String(env._id), input({ limits: { mode: 'shared', memoryGb: null, swapGb: null, cpus: null } }), 'local')
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run: host({ fail: 'up -d' }).run, wait: true })
    expect(envs.docs[0]!.deployedLimits).toEqual({ mode: 'shared', memoryGb: 4, swapGb: null, cpus: null })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run: host().run, wait: true })
    expect(envs.docs[0]!.deployedLimits).toEqual({ mode: 'shared', memoryGb: null, swapGb: null, cpus: null })
  })

  it('salvar grava os limites e audita o texto (antes e depois)', async () => {
    const env = await createEnvironment(input(), 'local')
    await updateEnvironment(String(env._id), input({ limits: { mode: 'shared', memoryGb: 4, swapGb: null, cpus: 2 } }), 'local')
    expect(envs.docs[0]!.limits).toEqual({ mode: 'shared', memoryGb: 4, swapGb: null, cpus: 2 })
    const audit = mocks.audit.mock.calls.at(-1)![0]
    expect(audit.antes.limites).toBe('sem limite')
    expect(audit.depois.limites).toBe('RAM 4 GiB · swap padrão · 2 CPUs')
  })
})

describe('"Ler compose" do formulário (OPE-193)', () => {
  const LIMITED = JSON.stringify({ services: { app: { build: { context: '.' }, mem_limit: '1g', cpus: 2 }, db: { image: 'mongo:7' }, worker: { image: 'w' } } })

  it('central: compose da ref numa pasta temporária, os serviços escolhidos e os limites declarados (saída fora do log)', async () => {
    const run = vi.fn(async (): Promise<HostResult> => ({ exitCode: 0, output: `aviso\n${LIMITED}` }))
    const result = await readComposeServices({ kind: 'central', centralId: 'c1', ref: 'dev', composeFile: 'docker-compose.yml', services: ['app', 'db'], projectName: 'loja' }, {}, run)
    expect(result.services.map(({ name, hasBuild, declared }) => ({ name, hasBuild, declared }))).toEqual([{ name: 'app', hasBuild: true, declared: { memoryGb: 1, swapGb: null, cpus: 2 } }, { name: 'db', hasBuild: false, declared: { memoryGb: null, swapGb: null, cpus: null } }])
    // OPE-211: os dados de cada serviço vêm junto (o que o compose não declara fica null).
    expect(result.services[1]!.values).toMatchObject({ image: 'mongo:7', command: null, ports: null })
    const [command, , options] = run.mock.calls[0] as unknown as [string, number, { redactedAs?: string }]
    expect(command).toContain("git -C '/home/u/loja' archive \"$sha\" -- 'docker-compose.yml'")
    expect(command).toContain("'dev^{commit}'")
    expect(options.redactedAs).toContain('saída omitida')
  })

  it('adotado: a pasta do projeto (no PC pela conexão mestra); PC fechado recusa', async () => {
    const run = vi.fn(async (): Promise<HostResult> => ({ exitCode: 0, output: LIMITED }))
    const source = { kind: 'adopted', machine: 'pc', workingDir: '/home/u/app', configFiles: ['/home/u/app/compose.yml'], projectName: 'app', git: true, pullOnRedeploy: false } as const
    const result = await readComposeServices(source, {}, run)
    expect(result.services.map((service) => service.name)).toEqual(['app', 'db', 'worker'])
    expect(String(run.mock.calls[0]![0])).toContain('ssh -S')
    expect(String(run.mock.calls[0]![0])).toContain('config --no-env-resolution --no-interpolate --format json')
    mocks.pcAvailable = false
    await expect(readComposeServices(source, {}, run)).rejects.toMatchObject({ status: 409, code: 'ENVIRONMENT_PC_UNAVAILABLE' })
  })

  it('falha: 502 com a última linha do erro, nunca o JSON', async () => {
    const run = vi.fn(async (): Promise<HostResult> => ({ exitCode: 1, output: 'Ref não encontrada: xpto' }))
    const source = { kind: 'central', centralId: 'c1', ref: 'xpto', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' } as const
    await expect(readComposeServices(source, {}, run)).rejects.toMatchObject({ status: 502, code: 'ENVIRONMENT_COMPOSE_READ_FAILED', message: 'Não foi possível ler o compose: Ref não encontrada: xpto' })
    const json = vi.fn(async (): Promise<HostResult> => ({ exitCode: 0, output: '{"segredo": true' }))
    const error = await readComposeServices(source, {}, json).catch((caught: Error) => caught)
    expect(error.message).toBe('Não foi possível ler o compose: a saída não trouxe os serviços')
  })
})

describe('arquivos de variáveis do compose (OPE-175)', () => {
  const ENV = '/home/burgos/opex-envs/loja/.env'

  it('1º deploy sem o .env declarado pelo compose: cria vazio, registra no log e segue', async () => {
    const env = await createEnvironment(input(), 'local')
    const { run, calls } = host({ envFiles: [ENV] })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.status).toBe('success')
    expect(String(deploys.docs[0]!.log)).toContain('Arquivo de variáveis do compose ausente: .env (criado vazio)')
    const ensure = calls.findIndex((command) => command.includes('@@opex-env-file-created'))
    expect(ensure).toBeGreaterThanOrEqual(0)
    expect(ensure).toBeLessThan(calls.findIndex((command) => command.includes('config --format json')))
    expect(calls[ensure]).toContain(`'${ENV}'`)
    expect(calls[ensure]).toContain('[ ! -e "$f" ]')
    // A leitura dos arquivos declarados não vai para o log (o compose pode ter valores escritos nele).
    const read = run.mock.calls.find(([command]) => String(command).includes('--no-env-resolution'))!
    expect(read[2]).toMatchObject({ redactedAs: expect.stringContaining('saída omitida') })
  })

  it('arquivo que já existe não é tocado nem citado no log', async () => {
    const env = await createEnvironment(input(), 'local')
    const { run } = host({ envFiles: [ENV], existing: [ENV] })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(String(deploys.docs[0]!.log)).not.toContain('Arquivo de variáveis do compose ausente')
  })

  it('compose sem env_file: nada é criado', async () => {
    const env = await createEnvironment(input(), 'local')
    const { run, calls } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(calls.some((command) => command.includes('@@opex-env-file-created'))).toBe(false)
    expect(deploys.docs[0]!.status).toBe('success')
  })

  it('levantar, reiniciar e derrubar garantem os arquivos antes do compose; falha na leitura não bloqueia', async () => {
    const env = await createEnvironment(input(), 'local')
    envs.docs[0]!.deployedOn = { buildOn: 'server', runOn: 'server' }
    for (const action of ['up', 'restart', 'down'] as const) {
      const { run, calls } = host({ envFiles: [ENV] })
      await runEnvironmentAction(String(env._id), { action }, 'local', run)
      const ensure = calls.findIndex((command) => command.includes('@@opex-env-file-created'))
      expect(ensure).toBeGreaterThanOrEqual(0)
      expect(ensure).toBeLessThan(calls.length - 1)
    }
    const { run } = host({ fail: '--no-env-resolution' })
    await expect(runEnvironmentAction(String(env._id), { action: 'up' }, 'local', run)).resolves.toMatchObject({ deployId: null })
  })

  it('logs e o derrubar do Apagar também garantem os arquivos antes do compose', async () => {
    const env = await createEnvironment(input(), 'local')
    envs.docs[0]!.deployedOn = { buildOn: 'server', runOn: 'server' }
    const logs = host({ envFiles: [ENV] })
    await runEnvironmentAction(String(env._id), { action: 'logs' }, 'local', logs.run)
    const ensureLogs = logs.calls.findIndex((command) => command.includes('@@opex-env-file-created'))
    expect(ensureLogs).toBeGreaterThanOrEqual(0)
    expect(ensureLogs).toBeLessThan(logs.calls.findIndex((command) => command.includes('logs --tail 200')))
    const removal = host({ envFiles: [ENV] })
    await deleteEnvironment(String(env._id), { volumes: false }, 'local', removal.run)
    const ensureDown = removal.calls.findIndex((command) => command.includes('@@opex-env-file-created'))
    expect(ensureDown).toBeGreaterThanOrEqual(0)
    expect(ensureDown).toBeLessThan(removal.calls.findIndex((command) => command.includes(' down --remove-orphans')))
    expect(envs.docs).toHaveLength(0)
  })

  it('falha ao verificar ou criar os arquivos aparece no log do deploy (sem a saída do config)', async () => {
    const env = await createEnvironment(input(), 'local')
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run: host({ envFiles: [ENV], fail: '--no-env-resolution' }).run, wait: true })
    expect(String(deploys.docs[0]!.log)).toContain('Não foi possível verificar os arquivos de variáveis do compose: um arquivo ausente não foi criado.')
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run: host({ envFiles: [ENV], fail: '@@opex-env-file-created' }).run, wait: true })
    expect(String(deploys.docs[1]!.log)).toContain('Não foi possível criar os arquivos de variáveis do compose ausentes.')
    expect(String(deploys.docs[1]!.log)).not.toContain('Arquivo de variáveis do compose ausente')
  })

  it('pasta limpa considera os arquivos declarados (o criado vazio não suja a pasta do adotado)', async () => {
    const adoptedEnv = '/home/u/loja/.env'
    const env = await createEnvironment(input({ source: { kind: 'adopted', machine: 'server', workingDir: '/home/u/loja', configFiles: ['/home/u/loja/compose.yml'], projectName: 'loja', git: true, pullOnRedeploy: false }, ports: [], runOn: 'pc' }), 'local')
    const { run, calls } = host({ images: 'present', tree: 'clean', envFiles: [adoptedEnv] })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const check = calls.find((command) => command.includes('status --porcelain'))!
    expect(check).toContain(`'${adoptedEnv}'`)
    expect(check).toContain('[ ! -s "$f" ]')
    expect(String(deploys.docs[0]!.log)).toContain('Build reaproveitado')
  })

  it('variável obrigatória que faltou: a falha diz qual é e lembra das Variáveis extras', async () => {
    const env = await createEnvironment(input(), 'local')
    const { run } = host({ configOutput: 'error while interpolating services.app.ports.[]: required variable PORT is missing a value: defina PORT no .env' })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.status).toBe('failed')
    expect(String(deploys.docs[0]!.error)).toContain('A variável PORT não veio das Variáveis extras nem do arquivo de variáveis: cadastre-a em Variáveis extras.')
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

  it('o fim do deploy grava o fato das observações do ambiente antes de terminar; falha nele não muda o deploy', async () => {
    const env = await createEnvironment(input(), 'local')
    mocks.watchDeploy.mockRejectedValueOnce(new Error('banco fora'))
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run: host().run, wait: true })
    expect(mocks.watchDeploy).toHaveBeenCalledWith(String(env._id), { status: 'success', error: null })
    expect(deploys.docs.map((deploy) => deploy.status)).toEqual(['success'])
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
    const down = downCall(calls)
    expect(down).toContain("cd '/home/u/scratch' && docker compose -p scratch")
    expect(down).toContain('$( [ -f docker-compose.opex.yml ] && echo -f docker-compose.opex.yml )')
    expect(down).not.toContain("-f 'docker-compose.opex.yml'")
  })

  it('pela tela (emptyKeepsSaved: false): valor apagado grava vazio; keep mantém o salvo; linha removida sai', async () => {
    const env = await createEnvironment(input({ env: [{ key: 'TOKEN', value: 'segredo' }, { key: 'URL', value: 'http://a' }, { key: 'VELHA', value: 'v' }] }), 'local')
    await updateEnvironment(String(env._id), input({ env: [{ key: 'TOKEN', value: '' }, { key: 'URL', value: '', keep: true }] }), 'local', { emptyKeepsSaved: false })
    expect(envs.docs[0]!.env).toEqual([
      { key: 'TOKEN', value: { v: 1, c: '' } },
      { key: 'URL', value: { v: 1, c: 'http://a' } },
    ])
  })

  it('valores para o formulário: decifra um a um; o que falha volta null sem derrubar os outros', async () => {
    const env = await createEnvironment(input({ env: [{ key: 'TOKEN', value: 'segredo' }, { key: 'URL', value: 'http://a' }] }), 'local')
    envs.docs[0]!.env = [{ key: 'TOKEN', value: { v: 1, c: 'segredo' } }, { key: 'URL', value: { broken: true } }]
    expect(await readEnvValues(String(env._id))).toEqual({ items: [{ key: 'TOKEN', value: 'segredo' }, { key: 'URL', value: null }] })
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
    const down = downCall(calls)
    expect(down).toContain('DOCKER_CONTEXT=ctx docker compose')
    expect(down).toContain('-O cancel -L')
    expect(mocks.publish).toHaveBeenCalledWith(String(env._id), 'status')
    expect((await runEnvironmentAction(String(env._id), { action: 'logs' }, 'local', run)).output).toBe('')
  })
})

describe('compose gerenciado (OPE-191)', () => {
  const MINIO_YAML = 'services:\n  minio:\n    image: minio/minio\n    environment:\n      MINIO_ROOT_PASSWORD: senha-no-yaml\n'
  const IMAGE_ONLY = JSON.stringify({ services: { minio: { image: 'minio/minio', environment: { MINIO_ROOT_USER: 'resolvido' } } } })
  const WITH_BUILD = JSON.stringify({ services: { app: { build: { context: '.' } }, minio: { image: 'minio/minio' } } })
  const managed = (overrides: Partial<EnvironmentInput> = {}) =>
    input({ slug: 'minio', name: 'MinIO', source: { kind: 'managed', projectName: 'minio', services: [], composeVersion: 1 }, compose: MINIO_YAML, ports: [], ...overrides })

  async function withRevisions(count: number) {
    const env = await createEnvironment(managed(), 'local')
    const { saveComposeRevision } = await import('@/features/environments/server/compose-revisions')
    for (let version = 2; version <= count; version++) await saveComposeRevision(String(env._id), { content: `${MINIO_YAML}# v${version}\n` }, 'local')
    return env
  }

  it('sobe com image: — cria a pasta, sem git, grava a revisão vigente sem expor o YAML e registra a versão implantada', async () => {
    const env = await withRevisions(3)
    const { run, calls } = host({ config: IMAGE_ONLY })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const deploy = deploys.docs[0]!
    expect(deploy.status).toBe('success')
    expect(calls[0]).toBe('mkdir -p "$HOME/opex-envs/minio"')
    expect(calls.some((command) => command.includes('rev-parse') || command.includes('git '))).toBe(false)
    const write = run.mock.calls.find(([command]) => String(command).includes('> "$HOME/opex-envs/minio"/docker-compose.yml'))!
    expect(write[2]).toMatchObject({ redactedAs: 'gravar docker-compose.yml (compose gerenciado v3, conteúdo omitido)' })
    expect(Buffer.from(String(write[0]).match(/printf %s '([^']+)'/)![1]!, 'base64').toString()).toContain('# v3')
    const log = String(deploy.log)
    expect(log).toContain('▸ Compose gerenciado v3')
    expect(log).toContain('Compose gerenciado v3 (1 serviço(s)): minio')
    expect(log).not.toContain('senha-no-yaml')
    expect(log).not.toContain('resolvido')
    expect(deploy.composeVersion).toBe(3)
    expect(deploy.ref).toBeNull()
    const saved = envs.docs[0]!
    expect(saved.deployedComposeVersion).toBe(3)
    expect(revisions.docs.find((item) => item.version === 3)!.deployedAt).toBeInstanceOf(Date)
    expect(revisions.docs.find((item) => item.version === 2)!.deployedAt).toBeNull()
    // `.env.opex` e o override continuam iguais (regras atuais).
    expect(calls.some((command) => command.includes('/.env.opex'))).toBe(true)
    expect(calls.some((command) => command.includes(' up -d --no-build'))).toBe(true)
  })

  it('compose com build falha antes de qualquer build, com a mensagem clara', async () => {
    const env = await withRevisions(1)
    const { run, calls } = host({ config: WITH_BUILD })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const deploy = deploys.docs[0]!
    expect(deploy.status).toBe('failed')
    expect(deploy.error).toBe('Compose gerenciado não tem código-fonte: use `image:` nos serviços ou a origem central')
    expect(calls.some((command) => / build( |$)/.test(command) || command.includes('up -d'))).toBe(false)
    expect(String(deploy.log)).not.toContain('Override do opex')
    // Falha não registra a revisão como implantada.
    expect(envs.docs[0]!.deployedComposeVersion ?? null).toBeNull()
    expect(revisions.docs[0]!.deployedAt).toBeNull()
  })

  it('sem revisão vigente (proteção): falha pedindo o compose', async () => {
    const env = await withRevisions(1)
    revisions.docs.length = 0
    const { run } = host({ config: IMAGE_ONLY })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.error).toBe('O ambiente não tem compose: escreva-o em Compose e implante de novo')
  })

  it('apagar remove a pasta do ambiente e todas as revisões', async () => {
    const env = await withRevisions(2)
    const { run, calls } = host()
    await deleteEnvironment(String(env._id), { volumes: false }, 'local', run)
    expect(calls).toContain('rm -rf "$HOME/opex-envs/minio"')
    expect(revisions.docs).toHaveLength(0)
    expect(envs.docs).toHaveLength(0)
  })
})

describe('serviços do compose no deploy (OPE-211)', () => {
  const service = (name: string, values: Partial<NonNullable<EnvironmentInput['composeOverrides']>['services'][number]> = {}) => ({
    service: name,
    image: null,
    command: null,
    entrypoint: null,
    environment: null,
    labels: null,
    ports: null,
    volumes: null,
    restart: null,
    healthcheck: null,
    dependsOn: null,
    ...values,
  })

  it('PC → Servidor com imagem própria no serviço com build: sem build, sem registry; o override fixa a imagem e tira o build', async () => {
    const env = await createEnvironment(input({ buildOn: 'pc', ports: [], composeOverrides: { services: [service('app', { image: 'ghcr.io/loja/app:2' })], yaml: '' } }), 'local')
    const { run, calls } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const deploy = deploys.docs[0]!
    expect(deploy.status).toBe('success')
    const log = String(deploy.log)
    expect(log).not.toContain('▸ Build')
    expect(log).not.toContain('Push das imagens')
    expect(log).not.toContain('Registry no servidor')
    expect(log).toContain('▸ Pull no servidor')
    expect(log).toContain('Serviços: app imagem ghcr.io/loja/app:2')
    expect(deploy.repositories).toBeUndefined()
    const yaml = lastOverride(calls)
    expect(yaml).toContain('    image: ghcr.io/loja/app:2\n    build: !reset null')
    expect(yaml).not.toContain('opex-env/loja-app')
    // O override é conferido (sem saída) antes de subir.
    const check = run.mock.calls.find(([command]) => String(command).includes('config --quiet'))!
    expect(String(check[0])).toContain('-f docker-compose.opex.yml')
    expect(calls.indexOf(String(check[0]))).toBeLessThan(calls.findIndex((command) => command.includes('up -d')))
    expect(envs.docs[0]!.deployedComposeOverrides).toEqual({ services: [service('app', { image: 'ghcr.io/loja/app:2' })], yaml: '' })
  })

  it('mesma máquina: as imagens prontas são buscadas (pull) antes de subir; o build segue para os outros serviços', async () => {
    const env = await createEnvironment(input({ composeOverrides: { services: [service('db', { image: 'mongo:8' })], yaml: '' } }), 'local')
    const { run, calls } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.status).toBe('success')
    const pull = calls.findIndex((command) => command.includes(" pull 'db'"))
    expect(pull).toBeGreaterThanOrEqual(0)
    expect(pull).toBeLessThan(calls.findIndex((command) => command.includes('up -d')))
    expect(String(deploys.docs[0]!.log)).toContain('▸ Pull das imagens prontas')
    expect(String(deploys.docs[0]!.log)).toContain('▸ Build no servidor')
  })

  it('regressão (F3): serviço com imagem própria fica fora do comando de build; o outro com build continua', async () => {
    const config = JSON.stringify({ services: { app: { build: { context: '.' } }, worker: { build: { context: './worker' } }, db: { image: 'mongo:7' } } })
    const source = { kind: 'central' as const, centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: ['app', 'worker', 'db'], projectName: 'loja' }
    const env = await createEnvironment(input({ source, composeOverrides: { services: [service('app', { image: 'ghcr.io/loja/app:2' })], yaml: '' } }), 'local')
    const { run, calls } = host({ config })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.status).toBe('success')
    const build = calls.find((command) => / build( |$)/.test(command) && command.includes('docker compose'))!
    expect(build).toMatch(/ build 'worker'$/)
    expect(build).not.toContain("'app'")
    expect(build).not.toContain("'db'")
  })

  it('regressão: image: !reset null no YAML avançado mantém o build do serviço (não vira imagem própria)', async () => {
    const env = await createEnvironment(input({ composeOverrides: { services: [], yaml: 'app:\n  image: !reset null\n' } }), 'local')
    const { run, calls } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.status).toBe('success')
    expect(String(deploys.docs[0]!.log)).toContain('▸ Build no servidor')
    expect(String(deploys.docs[0]!.log)).not.toContain('Pull das imagens prontas')
    expect(lastOverride(calls)).not.toContain('build: !reset')
  })

  it('falha na conferência do override para antes de qualquer build; os ajustes não viram implantados', async () => {
    const env = await createEnvironment(input({ composeOverrides: { services: [service('db', { restart: 'always' })], yaml: '' } }), 'local')
    const { run, calls } = host({ fail: 'config --quiet' })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.status).toBe('failed')
    expect(deploys.docs[0]!.error).toContain('Conferindo o override falhou')
    expect(calls.some((command) => / build( |$)/.test(command) || command.includes('up -d'))).toBe(false)
    expect(envs.docs[0]!.deployedComposeOverrides ?? null).toBeNull()
  })

  it('regressão: a saída da conferência nunca vai para o log (nem o valor do environment citado no erro)', async () => {
    const env = await createEnvironment(input({ composeOverrides: { services: [service('app', { environment: [{ key: 'SENHA', value: 'abc$xyz-secreto' }] })], yaml: '' } }), 'local')
    const { run } = host({ fail: 'config --quiet', failOutput: 'linha 1 abc$xyz-secreto\ninvalid interpolation format for services.app.environment.SENHA: "abc$xyz-secreto"' })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const deploy = deploys.docs[0]!
    expect(String(deploy.log)).not.toContain('abc$xyz-secreto')
    expect(String(deploy.error)).not.toContain('abc$xyz-secreto')
    expect(String(deploy.error)).toContain('invalid interpolation format for services.app.environment.SENHA: "[valor oculto]"')
    const check = run.mock.calls.find(([command]) => String(command).includes('config --quiet'))!
    expect(check[2]).not.toHaveProperty('onOutput')
  })

  it('regressão: conferência que falha deixa no host o override sem os ajustes (Reiniciar, Derrubar e Levantar seguem funcionando)', async () => {
    const env = await createEnvironment(input({ composeOverrides: { services: [service('db', { restart: 'always' })], yaml: 'app:\n  ports: abc\n' } }), 'local')
    const { run, calls } = host({ fail: 'config --quiet' })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.status).toBe('failed')
    const last = lastOverride(calls)
    expect(last).not.toContain('restart')
    expect(last).not.toContain('ports: abc')
    expect(last).toContain('env_file:')
    // O override válido é regravado depois da conferência que falhou.
    const check = calls.findIndex((command) => command.includes('config --quiet'))
    expect(calls.findLastIndex((command) => command.includes('docker-compose.opex.yml') && command.includes('base64 -d'))).toBeGreaterThan(check)
  })

  /**
   * Host em que os comandos dos arquivos gerados (override, `.env.opex` e as cópias do Opex) rodam de verdade no shell,
   * numa pasta temporária no lugar da pasta do ambiente e com um `$HOME` temporário; o resto é o host simulado.
   */
  function fileHost(projectDir?: string, options: { slug?: string; config?: string } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'opex-deploy-files-'))
    const home = join(root, 'home')
    // Central e gerenciado: a pasta do ambiente é `"$HOME/opex-envs/<slug>"`; adotado: a pasta do projeto (trocada pela temporária).
    const dir = projectDir ? join(root, 'projeto') : join(home, 'opex-envs', options.slug ?? 'loja')
    mkdirSync(dir, { recursive: true })
    mkdirSync(home, { recursive: true })
    const base = host({ config: options.config })
    const fail = { on: '' }
    const touchesFiles = (command: string) => command.includes('base64 -d >') || command.includes('environments-deployed') || (command.startsWith('rm -f ') && command.includes('.env.opex'))
    // Containers simulados: o override na pasta a cada `up -d` (tentado ou não).
    const containers: string[] = []
    const run = vi.fn(async (command: string, timeout?: number, opts?: { onOutput?: (chunk: string) => void }): Promise<HostResult> => {
      if (command.includes(' up -d')) containers.push(existsSync(join(dir, 'docker-compose.opex.yml')) ? readFileSync(join(dir, 'docker-compose.opex.yml'), 'utf8') : '')
      if (fail.on && command.includes(fail.on)) {
        base.calls.push(command)
        return { exitCode: 1, output: 'erro' }
      }
      if (touchesFiles(command)) {
        base.calls.push(command)
        try {
          const output = execSync(projectDir ? command.split(projectDir).join(dir) : command, { shell: '/bin/sh', env: { ...process.env, HOME: home } }).toString()
          return { exitCode: 0, output }
        } catch {
          return { exitCode: 1, output: 'erro' }
        }
      }
      return base.run(command, timeout, opts)
    })
    const read = (path: string) => (existsSync(join(dir, path)) ? readFileSync(join(dir, path), 'utf8') : null)
    return { run, calls: base.calls, fail, dir, home, read, containers, cleanup: () => rmSync(root, { recursive: true, force: true }) }
  }

  it('regressão: deploy que falha antes de subir volta o override do último deploy concluído (Derrubar e Levantar seguem com os ajustes implantados)', async () => {
    const files = fileHost()
    try {
      const env = await createEnvironment(input({ composeOverrides: { services: [service('app', { image: 'ghcr.io/loja/app:2', restart: 'always' })], yaml: '' } }), 'local')
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      expect(deploys.docs[0]!.error ?? null).toBeNull()
      const deployed = files.read('docker-compose.opex.yml')!
      expect(deployed).toContain('image: ghcr.io/loja/app:2')
      // A cópia fica numa pasta só do Opex, fora da pasta do projeto.
      expect(readFileSync(join(files.home, '.opex/environments-deployed', String(env._id), 'current/docker-compose.opex.yml'), 'utf8')).toBe(deployed)
      expect(readdirSync(files.dir).sort()).toEqual(['.env.opex', 'docker-compose.opex.yml'])

      // Nova configuração inválida: a conferência falha e o arquivo no host volta ao do deploy anterior.
      await updateEnvironment(String(env._id), input({ composeOverrides: { services: [service('app', { restart: 'always' })], yaml: 'app:\n  ports: abc\n' } }), 'local')
      files.fail.on = 'config --quiet'
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      expect(deploys.docs[1]!.status).toBe('failed')
      expect(files.read('docker-compose.opex.yml')).toBe(deployed)
      expect(files.read('.env.opex')).toContain('TOKEN=')
      expect(String(deploys.docs[1]!.log)).toContain('voltaram aos do último deploy concluído')
      expect(envs.docs[0]!.deployedComposeOverrides).toEqual({ services: [service('app', { image: 'ghcr.io/loja/app:2', restart: 'always' })], yaml: '' })

      // Derrubar e Levantar usam o arquivo que ficou na pasta: o do deploy concluído.
      files.fail.on = ''
      await runEnvironmentAction(String(env._id), { action: 'down' }, 'local', files.run)
      await runEnvironmentAction(String(env._id), { action: 'up' }, 'local', files.run)
      expect(files.calls.at(-1)).toContain('-f docker-compose.opex.yml')
      expect(files.read('docker-compose.opex.yml')).toBe(deployed)
    } finally {
      files.cleanup()
    }
  })

  it('regressão (F1): mover que falha antes de subir volta o override do deploy concluído; Levantar segue com ele', async () => {
    const files = fileHost()
    try {
      const env = await createEnvironment(input({ composeOverrides: { services: [service('app', { restart: 'always' })], yaml: '' } }), 'local')
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      expect(deploys.docs[0]!.status).toBe('success')
      const deployed = files.read('docker-compose.opex.yml')!
      await updateEnvironment(String(env._id), input({ composeOverrides: { services: [service('app', { restart: 'no' })], yaml: '' } }), 'local')
      files.fail.on = ' pull'
      await runEnvironmentAction(String(env._id), { action: 'move', buildOn: 'server', runOn: 'pc' }, 'local', files.run)
      await vi.waitFor(() => expect(deploys.docs[1]!.status).toBe('failed'))
      expect(files.read('docker-compose.opex.yml')).toBe(deployed)
      expect(String(deploys.docs[1]!.log)).toContain('voltaram aos do último deploy concluído')
      expect(envs.docs[0]!.deployedOn).toEqual({ buildOn: 'server', runOn: 'server' })
      files.fail.on = ''
      await runEnvironmentAction(String(env._id), { action: 'up' }, 'local', files.run)
      expect(files.containers.at(-1)).toBe(deployed)
      expect(files.containers.at(-1)).not.toContain('restart: no')
    } finally {
      files.cleanup()
    }
  })

  it('regressão (F2): compose gerenciado: a revisão nova que falha volta à implantada no docker-compose.yml; Levantar usa a implantada', async () => {
    const MINIO = 'services:\n  minio:\n    image: minio/minio\n'
    const files = fileHost(undefined, { slug: 'minio', config: JSON.stringify({ services: { minio: { image: 'minio/minio' } } }) })
    try {
      const env = await createEnvironment(input({ slug: 'minio', name: 'MinIO', source: { kind: 'managed', projectName: 'minio', services: [], composeVersion: 1 }, compose: MINIO, ports: [], env: [] }), 'local')
      const { saveComposeRevision } = await import('@/features/environments/server/compose-revisions')
      await saveComposeRevision(String(env._id), { content: `${MINIO}# v2\n` }, 'local')
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      expect(deploys.docs[0]!.status).toBe('success')
      expect(files.read('docker-compose.yml')).toContain('# v2')
      expect(readFileSync(join(files.home, '.opex/environments-deployed', String(env._id), 'current/docker-compose.yml'), 'utf8')).toContain('# v2')
      await saveComposeRevision(String(env._id), { content: `${MINIO}# v3\n` }, 'local')
      files.fail.on = 'config --format json'
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      expect(deploys.docs[1]!.status).toBe('failed')
      expect(files.read('docker-compose.yml')).toContain('# v2')
      expect(files.read('docker-compose.yml')).not.toContain('# v3')
      expect(String(deploys.docs[1]!.log)).toContain('compose gerenciado')
      expect(envs.docs[0]!.deployedComposeVersion).toBe(2)
      files.fail.on = ''
      await runEnvironmentAction(String(env._id), { action: 'up' }, 'local', files.run)
      expect(files.read('docker-compose.yml')).toContain('# v2')
    } finally {
      files.cleanup()
    }
  })

  it('regressão: saúde falha depois do up concluído: arquivos, containers e o estado implantado ficam os deste deploy (deploy falho)', async () => {
    const files = fileHost()
    try {
      const env = await createEnvironment(input({ healthUrl: 'http://localhost:4100/health', composeOverrides: { services: [service('app', { restart: 'always' })], yaml: '' } }), 'local')
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      expect(deploys.docs[0]!.status).toBe('success')
      await updateEnvironment(String(env._id), input({ healthUrl: 'http://localhost:4100/health', composeOverrides: { services: [service('app', { restart: 'no' })], yaml: '' } }), 'local')
      files.fail.on = 'curl -fsS'
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      expect(deploys.docs[1]!.status).toBe('failed')
      const current = files.read('docker-compose.opex.yml')!
      expect(current).toContain('restart: no')
      // Os containers subiram com este override.
      expect(files.containers.at(-1)).toBe(current)
      expect(String(deploys.docs[1]!.log)).toContain('Os containers subiram com a configuração deste deploy e um passo seguinte falhou')
      expect(readFileSync(join(files.home, '.opex/environments-deployed', String(env._id), 'current/docker-compose.opex.yml'), 'utf8')).toBe(current)
      // O que consta como implantado é o que está no ar: sem pendência falsa.
      expect(envs.docs[0]!.deployedComposeOverrides).toEqual({ services: [service('app', { restart: 'no' })], yaml: '' })
    } finally {
      files.cleanup()
    }
  })

  it('regressão: o próprio up falha (estado indeterminado): arquivos e estado implantado ficam os do último deploy e o log registra a deriva', async () => {
    const files = fileHost()
    try {
      const env = await createEnvironment(input({ composeOverrides: { services: [service('app', { restart: 'always' })], yaml: '' } }), 'local')
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      const deployed = files.read('docker-compose.opex.yml')!
      await updateEnvironment(String(env._id), input({ composeOverrides: { services: [service('app', { restart: 'no' })], yaml: '' } }), 'local')
      files.fail.on = 'up -d'
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      expect(deploys.docs[1]!.status).toBe('failed')
      // A tentativa usou o override novo (containers talvez parcialmente recriados)...
      expect(files.containers.at(-1)).toContain('restart: no')
      // ...mas o estado gravado e os arquivos seguem coerentes entre si: os do último deploy concluído.
      expect(files.read('docker-compose.opex.yml')).toBe(deployed)
      expect(envs.docs[0]!.deployedComposeOverrides).toEqual({ services: [service('app', { restart: 'always' })], yaml: '' })
      expect(String(deploys.docs[1]!.log)).toContain('O passo que sobe os containers falhou: alguns podem ter ficado com a configuração deste deploy')
      expect(String(deploys.docs[1]!.log)).not.toContain('Os containers subiram com a configuração deste deploy')
    } finally {
      files.cleanup()
    }
  })

  it('regressão: não conseguir guardar a cópia depois de subir não vira falha: o deploy conclui, coerente, e o log avisa', async () => {
    const files = fileHost()
    try {
      const env = await createEnvironment(input({ composeOverrides: { services: [service('app', { restart: 'always' })], yaml: '' } }), 'local')
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      const first = files.read('docker-compose.opex.yml')!
      await updateEnvironment(String(env._id), input({ composeOverrides: { services: [service('app', { restart: 'no' })], yaml: '' } }), 'local')
      files.fail.on = 'mv "$s/pending" "$s/current"'
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      const deploy = deploys.docs[1]!
      expect(deploy.status).toBe('success')
      expect(String(deploy.log)).toContain('Não foi possível guardar a cópia')
      // Arquivos, containers e estado salvo ficam na configuração nova.
      expect(files.read('docker-compose.opex.yml')).not.toBe(first)
      expect(files.read('docker-compose.opex.yml')).toContain('restart: no')
      expect(envs.docs[0]!.deployedComposeOverrides).toEqual({ services: [service('app', { restart: 'no' })], yaml: '' })
      // Sem cópia confiável, ela sai: a próxima falha não volta arquivos de outro deploy.
      expect(existsSync(join(files.home, '.opex/environments-deployed', String(env._id)))).toBe(false)
    } finally {
      files.cleanup()
    }
  })

  it('regressão: projeto adotado com .opex-deployed próprio: o deploy e a exclusão não tocam nele', async () => {
    const files = fileHost('/home/u/proj')
    try {
      mkdirSync(join(files.dir, '.opex-deployed'))
      writeFileSync(join(files.dir, '.opex-deployed', 'meu.txt'), 'do projeto\n')
      const source = { kind: 'adopted', machine: 'server', workingDir: '/home/u/proj', configFiles: ['/home/u/proj/compose.yml'], projectName: 'proj', git: false, pullOnRedeploy: false } as const
      const env = await createEnvironment(input({ source, composeOverrides: { services: [service('app', { restart: 'always' })], yaml: '' } }), 'local')
      await startDeploy(String(env._id), 'local', { kind: 'deploy', run: files.run, wait: true })
      expect(deploys.docs[0]!.status).toBe('success')
      expect(readdirSync(join(files.dir, '.opex-deployed'))).toEqual(['meu.txt'])
      expect(existsSync(join(files.home, '.opex/environments-deployed', String(env._id), 'current/docker-compose.opex.yml'))).toBe(true)
      await deleteEnvironment(String(env._id), { volumes: false }, 'local', files.run)
      expect(readFileSync(join(files.dir, '.opex-deployed', 'meu.txt'), 'utf8')).toBe('do projeto\n')
      expect(existsSync(join(files.home, '.opex/environments-deployed', String(env._id)))).toBe(false)
    } finally {
      files.cleanup()
    }
  })

  it('log sem os valores do environment; serviço fora do compose avisa e não bloqueia; o override não aparece no debug', async () => {
    const env = await createEnvironment(
      input({ composeOverrides: { services: [service('app', { environment: [{ key: 'API_KEY', value: 'valor-secreto' }] }), service('antigo', { restart: 'always' })], yaml: 'worker:\n  restart: always\n' } }),
      'local',
    )
    const { run, calls } = host()
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    const log = String(deploys.docs[0]!.log)
    expect(deploys.docs[0]!.status).toBe('success')
    expect(log).toContain('Serviços: app environment (1: API_KEY)')
    expect(log).not.toContain('valor-secreto')
    expect(log).toContain('Ajustes do serviço antigo ignorados: o serviço não está no compose.')
    expect(log).toContain('Ajustes do serviço worker ignorados: o serviço não está no compose.')
    expect(lastOverride(calls)).toContain('API_KEY: valor-secreto')
    expect(run.mock.calls.filter(([command]) => String(command).includes('docker-compose.opex.yml') && String(command).includes('base64 -d')).at(-1)![2]).toMatchObject({ redactedAs: 'gravar docker-compose.opex.yml (conteúdo omitido)' })
  })

  it('compose gerenciado com build: o serviço com imagem própria implanta', async () => {
    const env = await createEnvironment(
      input({ slug: 'minio', name: 'MinIO', source: { kind: 'managed', projectName: 'minio', services: [], composeVersion: 1 }, compose: 'services:\n  app:\n    build: .\n', ports: [], composeOverrides: { services: [service('app', { image: 'ghcr.io/x/app:1' })], yaml: '' } }),
      'local',
    )
    const { run } = host({ config: JSON.stringify({ services: { app: { build: { context: '.' } } } }) })
    await startDeploy(String(env._id), 'local', { kind: 'deploy', run, wait: true })
    expect(deploys.docs[0]!.status).toBe('success')
  })

  it('salvar audita o resumo dos ajustes (do environment, só as chaves)', async () => {
    const env = await createEnvironment(input(), 'local')
    await updateEnvironment(String(env._id), input({ composeOverrides: { services: [service('app', { image: 'nginx:1.27', environment: [{ key: 'A', value: 'segredo-a' }] })], yaml: '' } }), 'local')
    const audit = mocks.audit.mock.calls.at(-1)![0]
    expect(audit.antes!.servicos).toBe('sem ajustes')
    expect(audit.depois!.servicos).toBe('app imagem nginx:1.27, environment (1: A)')
    expect(JSON.stringify(audit)).not.toContain('segredo-a')
  })
})
