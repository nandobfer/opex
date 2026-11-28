import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostResult } from '@/features/local-docker/server/shell'

/**
 * Ambientes: deploy retomado depois de o app reiniciar no meio — o caso do redeploy do próprio
 * opex, em que o `up -d` recria o container do app e o processo do deploy some.
 */

const mocks = vi.hoisted(() => ({
  pcAvailable: true,
  publish: vi.fn(async () => {}),
  run: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/crypto/secretBox', () => ({ encryptSecret: (plain: string) => ({ v: 1, c: plain }), decryptSecret: (box: { c: string }) => box.c }))
vi.mock('@/features/environments/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { Environment: memoryModel(), EnvironmentDeploy: memoryModel(), EnvironmentComposeVersion: memoryModel(), EnvironmentsState: memoryModel(), environmentsDb: async () => {} }
})
vi.mock('@/features/environments/server/settings', async () => {
  const { DEFAULT_ENVIRONMENTS_SETTINGS } = await import('@/features/environments/schemas')
  const targets = { server: { machine: 'server', context: 'ctx', builder: 'bld' }, pc: { machine: 'pc', context: 'ctx', builder: 'bld' } }
  return {
    envLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    runEnvHost: (...args: unknown[]) => mocks.run(...args),
    publishEnvironment: mocks.publish,
    loadEnvironmentsSettings: async () => DEFAULT_ENVIRONMENTS_SETTINGS,
    machineAccess: async () => ({ targets, pcAvailable: mocks.pcAvailable, pcReason: mocks.pcAvailable ? null : 'Túnel fechado' }),
  }
})
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: async () => ({ config: { sessionDirectory: '/home/u/loja' } }) }))
vi.mock('@/features/agentic/server/build-queue', () => ({ runExclusiveBuild: async <T,>(run: () => Promise<T>) => run() }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: {} }))
vi.mock('@/features/local-docker/server/models', () => ({ LocalDockerPreview: {} }))
vi.mock('@/features/opex-agent/server/watch-events', () => ({ watchDeployFinished: async () => {} }))

import { Environment, EnvironmentComposeVersion, EnvironmentDeploy } from '@/features/environments/server/models'
import { INTERRUPTED_BEFORE_EXECUTION } from '@/features/environments/server/deploy'
import { resumeInterruptedDeploys, settleResumes } from '@/features/environments/server/resume'
import { openDeployStream } from '@/features/environments/server/stream'
import { createEnvironment } from '@/features/environments/server/service'

const envs = Environment as unknown as { docs: Record<string, unknown>[] }
const deploys = EnvironmentDeploy as unknown as { docs: Record<string, unknown>[] }
const revisions = EnvironmentComposeVersion as unknown as { docs: Record<string, unknown>[] }

type RunOptions = { onOutput?: (chunk: string) => void; jobId?: string }

/** Host: o `up -d` (o passo em que o app reiniciou) termina com `upExit`. */
function host(upExit = 0) {
  const calls: { command: string; jobId?: string }[] = []
  mocks.run.mockImplementation(async (command: string, _timeout?: number, opts?: RunOptions): Promise<HostResult> => {
    calls.push({ command, jobId: opts?.jobId })
    if (command.includes('up -d')) {
      opts?.onOutput?.('Container opex-app-1  Started\n')
      return { exitCode: upExit, output: upExit ? 'erro' : 'Started' }
    }
    return { exitCode: 0, output: '' }
  })
  return calls
}

async function adopted() {
  const env = await createEnvironment(
    {
      name: 'opex-4500',
      slug: 'opex-4500',
      source: { kind: 'adopted', machine: 'server', workingDir: '/home/u/opex', configFiles: ['/home/u/opex/docker-compose.yml'], projectName: 'opex-4500', git: true, pullOnRedeploy: true },
      env: [],
      ports: [],
      healthUrl: '',
      buildOn: 'server',
      runOn: 'server',
    },
    'local',
  )
  envs.docs[0]!.deployedOn = { buildOn: 'server', runOn: 'server' }
  return String(env._id)
}

const OLD = () => new Date(Date.now() - 5 * 60_000)

/** Deploy deixado em andamento pelo processo que morreu, parado no passo "Sobe no servidor" (índice 1). */
function orphan(environmentId: string, overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: 'd'.repeat(24),
    environmentId,
    kind: 'deploy',
    status: 'running',
    ref: null,
    commit: null,
    imageTag: null,
    buildOn: 'server',
    runOn: 'server',
    log: 'Deploy de opex-4500: build no servidor, execução no servidor.\n▸ Sobe no servidor\n',
    error: null,
    startedAt: OLD(),
    finishedAt: null,
    heartbeatAt: OLD(),
    runnerId: 'processo-antigo',
    checkpoint: { step: 1, failure: null, ref: null, commit: 'abc123def456', tag: 'abc123def456', version: '1.45.0', buildServices: ['app'], skipBuild: false, from: 'server' },
    ...overrides,
  }
  deploys.docs.push(doc)
  return doc._id
}

beforeEach(async () => {
  vi.clearAllMocks()
  await settleResumes()
  envs.docs.length = 0
  deploys.docs.length = 0
  revisions.docs.length = 0
  mocks.pcAvailable = true
})

describe('retomada do deploy depois de o app reiniciar', () => {
  it('compose gerenciado: a retomada termina gravando a mesma revisão do ponto de retomada (mesmo com uma mais nova salva)', async () => {
    const env = await createEnvironment(
      { name: 'MinIO', slug: 'minio', source: { kind: 'managed', projectName: 'minio', services: [], composeVersion: 1 }, compose: 'services:\n  minio:\n    image: minio/minio\n', env: [], ports: [], healthUrl: '', buildOn: 'server', runOn: 'server' },
      'local',
    )
    const envId = String(env._id)
    for (const version of [2, 3, 4]) revisions.docs.push({ _id: `r${version}`, environmentId: envId, version, content: `# v${version}`, authorId: 'local', note: null, createdAt: new Date(), deployedAt: null })
    orphan(envId, { checkpoint: { step: 0, failure: null, ref: null, commit: null, tag: 't1', version: null, buildServices: [], skipBuild: false, from: null, composeVersion: 3 } })
    host()
    await resumeInterruptedDeploys()
    await settleResumes()
    expect(deploys.docs[0]).toMatchObject({ status: 'success', resumed: true })
    expect(envs.docs[0]!.deployedComposeVersion).toBe(3)
    expect(revisions.docs.find((item) => item.version === 3)!.deployedAt).toBeInstanceOf(Date)
    expect(revisions.docs.find((item) => item.version === 4)!.deployedAt).toBeNull()
  })

  it('OPE-211: a retomada refaz o pull das imagens prontas do ponto de retomada e grava os ajustes daquele deploy', async () => {
    const envId = await adopted()
    const applied = { services: [{ service: 'app', image: 'nginx:1.27', command: null, entrypoint: null, environment: null, labels: null, ports: null, volumes: null, restart: null, healthcheck: null, dependsOn: null }], yaml: '' }
    envs.docs[0]!.composeOverrides = { services: [], yaml: 'app:\n  restart: always\n' }
    orphan(envId, { checkpoint: { step: 0, failure: null, ref: null, commit: 'abc123def456', tag: 'abc123def456', version: null, buildServices: [], skipBuild: false, from: null, overrides: applied, pullServices: ['app'] } })
    const calls = host()
    await resumeInterruptedDeploys()
    await settleResumes()
    expect(deploys.docs[0]).toMatchObject({ status: 'success', resumed: true })
    expect(calls.some((call) => call.command.includes(" pull 'app'"))).toBe(true)
    expect(envs.docs[0]!.deployedComposeOverrides).toEqual(applied)
  })

  it('regressão: redeploy do próprio app termina como sucesso (não fica em Implantando)', async () => {
    const envId = await adopted()
    const id = orphan(envId)
    const calls = host()
    expect(await resumeInterruptedDeploys()).toBe(1)
    await settleResumes()
    // Reencontra o job do passo em andamento pelo id fixo; o build (passo 0) não roda de novo.
    expect(calls.filter((call) => call.command.includes('up -d'))).toEqual([expect.objectContaining({ jobId: `envdeploy-${id}-1` })])
    expect(calls.some((call) => call.command.includes(' build'))).toBe(false)
    expect(deploys.docs[0]).toMatchObject({ status: 'success', error: null, resumed: true, commit: 'abc123def456', checkpoint: null })
    expect(deploys.docs[0]!.finishedAt).toBeInstanceOf(Date)
    const log = String(deploys.docs[0]!.log)
    expect(log.startsWith('Deploy de opex-4500')).toBe(true)
    expect(log).toContain('O app reiniciou durante o deploy: retomando no passo 2')
    expect(log).toContain('Container opex-app-1  Started')
    expect(envs.docs[0]).toMatchObject({ deployedCommit: 'abc123def456', deployedVersion: '1.45.0', deployedOn: { buildOn: 'server', runOn: 'server' } })
    expect(mocks.publish).toHaveBeenCalledWith(envId, 'deploy')
  })

  it('falha real no passo retomado continua falha, com a mensagem', async () => {
    orphan(await adopted())
    host(1)
    await resumeInterruptedDeploys()
    await settleResumes()
    expect(deploys.docs[0]).toMatchObject({ status: 'failed', error: 'Sobe no servidor falhou (código 1)', resumed: true })
    expect(envs.docs[0]!.deployedCommit).toBeFalsy()
  })

  it('OPE-211: retomada depois do up concluído com falha no passo seguinte: deploy falho, mas o estado aplicado é gravado', async () => {
    const env = await createEnvironment(
      { name: 'MinIO', slug: 'minio', source: { kind: 'managed', projectName: 'minio', services: [], composeVersion: 1 }, compose: 'services:\n  minio:\n    image: minio/minio\n', env: [], ports: [], healthUrl: 'http://localhost:9000/health', buildOn: 'server', runOn: 'server' },
      'local',
    )
    const envId = String(env._id)
    revisions.docs.push({ _id: 'r2', environmentId: envId, version: 2, content: '# v2', authorId: 'local', note: null, createdAt: new Date(), deployedAt: null })
    const applied = { services: [{ service: 'minio', image: 'minio/minio:2', command: null, entrypoint: null, environment: null, labels: null, ports: null, volumes: null, restart: 'always', healthcheck: null, dependsOn: null }], yaml: '' }
    const limits = { mode: 'shared', memoryGb: 2, swapGb: null, cpus: 1 }
    // Passo 0 = "Sobe no servidor"; o processo morreu no passo 1 (saúde), depois do up concluído.
    orphan(envId, { checkpoint: { step: 1, failure: null, ref: null, commit: null, tag: 't9', version: '2.0.0', buildServices: [], skipBuild: false, from: null, composeVersion: 2, overrides: applied, limits } })
    const calls = host()
    mocks.run.mockImplementation(async (command: string, _timeout?: number, opts?: RunOptions): Promise<HostResult> => {
      calls.push({ command, jobId: opts?.jobId })
      return command.includes('curl -fsS') ? { exitCode: 1, output: 'erro' } : { exitCode: 0, output: '' }
    })
    await resumeInterruptedDeploys()
    await settleResumes()
    expect(calls.some((call) => call.command.includes('up -d'))).toBe(false)
    expect(deploys.docs[0]).toMatchObject({ status: 'failed', resumed: true, error: expect.stringContaining('Saúde falhou') })
    expect(String(deploys.docs[0]!.log)).toContain('Os containers subiram com a configuração deste deploy e um passo seguinte falhou')
    expect(envs.docs[0]).toMatchObject({ deployedOn: { buildOn: 'server', runOn: 'server' }, deployedRef: null, deployedCommit: null, deployedVersion: '2.0.0', deployedLimits: limits, deployedComposeOverrides: applied, deployedComposeVersion: 2 })
    expect(revisions.docs.find((item) => item.version === 2)!.deployedAt).toBeInstanceOf(Date)
  })

  it('interrompido antes da fase de execução (sem ponto de retomada): encerra como falha', async () => {
    orphan(await adopted(), { checkpoint: null, heartbeatAt: undefined })
    const calls = host()
    await resumeInterruptedDeploys()
    await settleResumes()
    expect(deploys.docs[0]).toMatchObject({ status: 'failed', error: INTERRUPTED_BEFORE_EXECUTION })
    expect(deploys.docs[0]!.finishedAt).toBeInstanceOf(Date)
    expect(calls).toHaveLength(0)
  })

  it('PC indisponível na retomada: encerra como falha com o motivo', async () => {
    mocks.pcAvailable = false
    orphan(await adopted(), { runOn: 'pc' })
    host()
    await resumeInterruptedDeploys()
    await settleResumes()
    expect(deploys.docs[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('Túnel fechado') })
  })

  it('sinal de vida recente: outro processo vivo cuida do deploy, nada é reivindicado', async () => {
    orphan(await adopted(), { heartbeatAt: new Date() })
    const calls = host()
    expect(await resumeInterruptedDeploys()).toBe(0)
    await settleResumes()
    expect(deploys.docs[0]).toMatchObject({ status: 'running', runnerId: 'processo-antigo' })
    expect(calls).toHaveLength(0)
  })

  it('duas varreduras ao mesmo tempo retomam uma vez só', async () => {
    orphan(await adopted())
    const calls = host()
    const counts = await Promise.all([resumeInterruptedDeploys(), resumeInterruptedDeploys()])
    await settleResumes()
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1)
    expect(calls.filter((call) => call.command.includes('up -d'))).toHaveLength(1)
  })

  it('abrir o log de um deploy órfão retoma e entrega o log e o status final (sem "interrompido")', async () => {
    const id = orphan(await adopted())
    host()
    const response = await openDeployStream(id, new AbortController().signal)
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line) as { type: string; text?: string; status?: string })
    expect(events[0]).toMatchObject({ type: 'meta', estimateMs: null, sampleSize: 0 })
    expect(events[1]).toMatchObject({ type: 'log', text: expect.stringContaining('Deploy de opex-4500') })
    expect(events.at(-1)).toEqual({ type: 'status', status: 'success', error: null })
    expect(JSON.stringify(events)).not.toContain('interrompido')
    await settleResumes()
  })

  it('OPE-202: deploy em andamento abre com o meta (início absoluto e mediana dos anteriores com sucesso)', async () => {
    const environmentId = await adopted()
    const past = (hex: string, minutes: number, status = 'success') => {
      const startedAt = new Date(Date.now() - 24 * 3_600_000)
      deploys.docs.push({ _id: hex.repeat(24), environmentId, kind: 'deploy', status, log: '', startedAt, finishedAt: new Date(startedAt.getTime() + minutes * 60_000) })
    }
    past('a', 3)
    past('b', 5)
    past('c', 4)
    past('e', 90, 'failed')
    const id = orphan(environmentId, { heartbeatAt: new Date(), runnerId: 'outro-processo-vivo' })
    const response = await openDeployStream(id, new AbortController().signal)
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    const startedAt = deploys.docs.find((doc) => doc._id === id)!.startedAt as Date
    expect(events[0]).toEqual({ type: 'meta', startedAt: startedAt.toISOString(), serverNow: expect.any(String), estimateMs: 4 * 60_000, sampleSize: 3, initial: false })
    expect(Math.abs(Date.parse(events[0]!.serverNow as string) - Date.now())).toBeLessThan(5_000)
    expect(events[1]).toMatchObject({ type: 'log' })
  })

  it('OPE-202: deploy encerrado não manda meta (a gaveta não mostra barra)', async () => {
    const environmentId = await adopted()
    const id = orphan(environmentId, { status: 'success', finishedAt: new Date(), checkpoint: null })
    const response = await openDeployStream(id, new AbortController().signal)
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line) as { type: string })
    expect(events.map((event) => event.type)).toEqual(['log', 'status'])
  })

  it('OPE-202: falha ao ler o histórico não derruba o stream (meta sem estimativa)', async () => {
    const environmentId = await adopted()
    const id = orphan(environmentId, { heartbeatAt: new Date(), runnerId: 'outro-processo-vivo' })
    const find = vi.spyOn(EnvironmentDeploy, 'find').mockImplementationOnce(() => {
      throw new Error('mongo fora')
    })
    const response = await openDeployStream(id, new AbortController().signal)
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(events[0]).toMatchObject({ type: 'meta', estimateMs: null })
    expect(events[1]).toMatchObject({ type: 'log' })
    find.mockRestore()
  })
})
