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
  return { Environment: memoryModel(), EnvironmentDeploy: memoryModel(), EnvironmentsState: memoryModel(), environmentsDb: async () => {} }
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

import { Environment, EnvironmentDeploy } from '@/features/environments/server/models'
import { INTERRUPTED_BEFORE_EXECUTION } from '@/features/environments/server/deploy'
import { resumeInterruptedDeploys, settleResumes } from '@/features/environments/server/resume'
import { openDeployStream } from '@/features/environments/server/stream'
import { createEnvironment } from '@/features/environments/server/service'

const envs = Environment as unknown as { docs: Record<string, unknown>[] }
const deploys = EnvironmentDeploy as unknown as { docs: Record<string, unknown>[] }

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
  mocks.pcAvailable = true
})

describe('retomada do deploy depois de o app reiniciar', () => {
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
    expect(events[0]).toMatchObject({ type: 'log', text: expect.stringContaining('Deploy de opex-4500') })
    expect(events.at(-1)).toEqual({ type: 'status', status: 'success', error: null })
    expect(JSON.stringify(events)).not.toContain('interrompido')
    await settleResumes()
  })
})
