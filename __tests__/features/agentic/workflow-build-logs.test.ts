import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * "Subindo a prévia" (OPE-88): o app roda o comando do build no host (saída ao vivo na aba Build) —
 * o `docker compose … up -d --build` (Local) ou o script da prévia no GitHub Action — e o agente só
 * entra para preparar (dump/commit) e para corrigir uma falha — sem limite de correções. No GitHub
 * Action, cada correção abre uma tentativa nova (a anterior é invalidada). Cada build é aberto
 * com porta e máquina e fechado com o desfecho (prévia no ar, sem resposta, falha ou interrupção).
 * O registro é melhor esforço: uma falha nele não derruba o build.
 */

const mocks = vi.hoisted(() => ({
  prepareHub: vi.fn(),
  publish: vi.fn(),
  publishAgentic: vi.fn(async () => undefined),
  loadCentral: vi.fn(),
  repoForProject: vi.fn(async () => ({ repo: 'org/app', repoUrl: 'https://github.com/org/app' })),
  pumpQueue: vi.fn(async () => undefined),
  pumpBuild: vi.fn(async () => undefined),
  recordAudit: vi.fn(async () => undefined),
  runTurn: vi.fn(),
  allocatePort: vi.fn(async () => 4015),
  waitPreview: vi.fn(async () => true),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  settings: vi.fn(),
  startBuild: vi.fn(async () => 'b1'),
  resumeBuild: vi.fn(async () => undefined),
  settleBuild: vi.fn(async () => undefined),
  dropBuilds: vi.fn(async () => undefined),
  beginSection: vi.fn(),
  appendOutput: vi.fn(),
  restartSection: vi.fn(),
  runBuild: vi.fn(),
  probe: vi.fn(),
  runShell: vi.fn(async () => ({ exitCode: 0, status: 'exited', output: '' })),
  reserveRemote: vi.fn(),
  invalidateRemote: vi.fn(async () => undefined),
  assertRemote: vi.fn(async () => undefined),
}))

const memories = vi.hoisted(() => ({ sync: vi.fn<(...args: unknown[]) => Promise<{ applied: boolean; section: string }>>(async () => ({ applied: true, section: '' })) }))
vi.mock('@/features/agentic/server/developer-memories', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/agentic/server/developer-memories')>()), syncDeveloperMemories: memories.sync }))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: async () => false }))
vi.mock('@/features/local-docker/server/agentic-hooks', () => ({ resolveBuildTarget: async () => null, teardownForCleanup: async () => false }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  runOpencodeShell: mocks.runShell,
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app/worktrees/ope-88' } }),
      create: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
    },
  })),
}))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel(), AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
})
vi.mock('@/features/agentic/server/centrals', () => ({
  loadCentral: mocks.loadCentral,
  repoForProject: mocks.repoForProject,
  publishAgentic: mocks.publishAgentic,
  entryColumnForProject: vi.fn(async () => null),
}))
vi.mock('@/features/agentic/server/hub', () => ({
  prepareHub: mocks.prepareHub,
  publishWorkbenchEvent: mocks.publish,
  isWorkbenchActive: () => false,
  markWorkbenchActive: vi.fn(),
  clearWorkbenchActive: vi.fn(),
  abortWorkbenchRun: vi.fn(),
  dropWorkbenchEvents: vi.fn(),
  flushWorkbenchEvents: vi.fn(async () => undefined),
  subscribeWorkbench: vi.fn(),
  listWorkbenchEvents: vi.fn(),
}))
vi.mock('@/features/agentic/server/build-logs', () => ({
  startBuild: mocks.startBuild,
  resumeBuild: mocks.resumeBuild,
  settleBuild: mocks.settleBuild,
  dropBuilds: mocks.dropBuilds,
  beginBuildSection: mocks.beginSection,
  appendBuildOutput: mocks.appendOutput,
  restartBuildSection: mocks.restartSection,
}))
vi.mock('@/features/agentic/server/preview-build', () => ({ runPreviewBuild: mocks.runBuild }))
vi.mock('@/features/agentic/server/reconnect', () => ({ probeReconnect: mocks.probe }))
vi.mock('@/features/agentic/server/remote-preview', () => ({ reserveRemotePreview: mocks.reserveRemote, invalidateRemotePreview: mocks.invalidateRemote, assertRemotePreview: mocks.assertRemote }))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: vi.fn(async () => undefined), allocatePreviewPort: mocks.allocatePort, waitForPreview: mocks.waitPreview }))
vi.mock('@/features/agentic/server/build-queue', () => ({ pumpBuildQueue: mocks.pumpBuild, buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()) }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ syncWorkbenchTimer: vi.fn(async () => undefined), accumulateWorkPeriodUsage: vi.fn(), closeOrphanWorkPeriods: vi.fn(async () => 0) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: vi.fn(async () => true), flushPendingSessionDeletions: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: mocks.pumpQueue }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: vi.fn(), moveTask: vi.fn() }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { defaultCentralConfig, DEFAULT_AGENTIC_SETTINGS } from '@/features/agentic/schemas'
import { reconnect, retry, startBuildTurn } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const doc = () => model.docs[0] as { stage: string; runState: string; error: string | null; previewBuild: Record<string, unknown> | null; previewBackup: unknown }

const UP = 'PORT=4015 docker compose -p app-ope-88 up -d --build'

const workbench = (patch: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPE-88',
    taskTitle: 'Logs de build',
    stage: 'build_queued',
    runState: 'idle',
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    worktreePath: '/home/u/app/worktrees/ope-88',
    branch: 'feat/ope-88',
    composeProject: 'app-ope-88',
    port: 4015,
    buildQueuedAt: new Date(),
    startedAt: new Date(),
    pendingSessionDeletions: [],
    plans: [],
    ...patch,
  })

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0.01, durationMs: 5 })

/** Central sem backup do banco: o Local sobe sem turno de preparo (OPE-72). */
const localConfig = () => {
  const config = defaultCentralConfig('/home/u/app')
  return { ...config, environment: { ...config.environment, backupDatabase: false } }
}
const githubConfig = () => {
  const config = localConfig()
  return { ...config, environment: { ...config.environment, previewMethod: 'github' as const } }
}

let attempts = 0
beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  attempts = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: localConfig() })
  // Reserva da tentativa remota: grava como o serviço real (`previewBuild` substituído).
  mocks.reserveRemote.mockImplementation(async (_client: unknown, wb: { _id: string }) => {
    attempts += 1
    const build = { method: 'github', attempt: `a${attempts}`, statePath: `/srv/backups/remote-preview-a${attempts}.json`, dumpRequired: false }
    await AgenticWorkbench.updateOne({ _id: wb._id }, { $set: { previewBuild: build, buildQueuedAt: null } })
    return build
  })
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.allocatePort.mockResolvedValue(4015)
  mocks.waitPreview.mockResolvedValue(true)
  mocks.runTurn.mockResolvedValue(succeeded('```json\n{"ok": true}\n```'))
  mocks.runBuild.mockResolvedValue({ exitCode: 0, tail: 'Container app Started' })
})

const appended = () => mocks.appendOutput.mock.calls.map(([, text]) => text as string).join('')

describe('workflow — build da prévia rodado pelo app', () => {
  it('roda o docker compose no worktree, transmite a saída e fecha como concluído sem turno do agente', async () => {
    mocks.runBuild.mockImplementation(async (input: { onOutput: (chunk: string) => void }) => {
      input.onOutput('#1 [internal] load build definition\n')
      return { exitCode: 0, tail: '' }
    })
    const wb = await workbench()
    const id = String(wb._id)
    await startBuildTurn(id)
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))
    expect(mocks.startBuild).toHaveBeenCalledWith(id, { port: 4015, local: false, method: 'local' })
    expect(mocks.beginSection).toHaveBeenCalledWith(id, UP)
    const input = mocks.runBuild.mock.calls[0]![0] as { run: string; jobId: string }
    expect(input.run).toBe(`cd '/home/u/app/worktrees/ope-88' && BUILDKIT_PROGRESS=plain ${UP}`)
    expect(input.jobId).toMatch(/^build-/)
    expect(appended()).toContain('#1 [internal] load build definition')
    expect(appended()).toContain('exit 0')
    expect(mocks.runTurn).not.toHaveBeenCalled()
    expect(mocks.settleBuild).toHaveBeenCalledWith(id, 'succeeded', null)
    expect(doc().previewBuild).toMatchObject({ method: 'local', port: 4015, docker: null })
    expect(doc().previewBuild).not.toHaveProperty('job')
    expect(mocks.publishAgentic).toHaveBeenCalled()
  })

  it('central que herda as portas reserva a porta na faixa padrão global (Configurações Padrão)', async () => {
    mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_AGENTIC_SETTINGS, ports: { previewPortMin: 6000, previewPortMax: 6010 } } })
    const wb = await workbench({ port: null })
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(mocks.allocatePort).toHaveBeenCalled())
    expect(mocks.allocatePort.mock.calls[0]).toEqual([String(wb._id), 'localhost', { min: 6000, max: 6010 }, undefined])
  })

  it('central personalizada reserva a porta na própria faixa, ignorando o padrão global', async () => {
    const config = localConfig()
    mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: { ...config, environment: { ...config.environment, inheritPorts: false, previewPortMin: 7000, previewPortMax: 7005 } } })
    mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_AGENTIC_SETTINGS, ports: { previewPortMin: 6000, previewPortMax: 6010 } } })
    const wb = await workbench({ port: null })
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(mocks.allocatePort).toHaveBeenCalled())
    expect(mocks.allocatePort.mock.calls[0]?.[2]).toEqual({ min: 7000, max: 7005 })
  })

  it('prévia sem resposta fecha como "unhealthy"', async () => {
    mocks.waitPreview.mockResolvedValue(false)
    const wb = await workbench()
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(mocks.settleBuild).toHaveBeenCalled())
    expect(mocks.settleBuild).toHaveBeenCalledWith(String(wb._id), 'unhealthy', expect.stringContaining('não respondeu'))
  })

  it('build que falha: o agente corrige com o final da saída e o app roda de novo, sem limite de correções', async () => {
    mocks.runBuild
      .mockResolvedValueOnce({ exitCode: 1, tail: 'ERROR: npm ci falhou' })
      .mockResolvedValueOnce({ exitCode: 1, tail: 'ERROR: tsc falhou' })
      .mockResolvedValueOnce({ exitCode: 1, tail: 'ERROR: lint falhou' })
      .mockResolvedValueOnce({ exitCode: 0, tail: '' })
    const wb = await workbench()
    const id = String(wb._id)
    await startBuildTurn(id)
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))
    expect(mocks.runBuild).toHaveBeenCalledTimes(4)
    expect(mocks.runTurn).toHaveBeenCalledTimes(3)
    const prompts = mocks.runTurn.mock.calls.map(([, request]) => (request as { text: string; stage: string }).text)
    expect(prompts[0]).toContain('ERROR: npm ci falhou')
    expect(prompts[2]).toContain('correção 3')
    expect(mocks.beginSection).toHaveBeenCalledTimes(4)
    expect(appended()).toContain('agente corrigindo o código (correção 3)')
    expect(mocks.settleBuild).toHaveBeenCalledWith(id, 'succeeded', null)
  })

  it('OPE-97: memórias recusadas pela sessão vão à frente do primeiro prompt do agente de build (uma vez por turno)', async () => {
    memories.sync.mockResolvedValueOnce({ applied: false, section: '## Memórias e instruções permanentes\n- Rode o lint.' })
    mocks.runBuild
      .mockResolvedValueOnce({ exitCode: 1, tail: 'ERROR: npm ci falhou' })
      .mockResolvedValueOnce({ exitCode: 1, tail: 'ERROR: tsc falhou' })
      .mockResolvedValueOnce({ exitCode: 0, tail: '' })
    const wb = await workbench()
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))
    const prompts = mocks.runTurn.mock.calls.map(([, request]) => (request as { text: string }).text)
    expect(prompts).toHaveLength(2)
    expect(prompts[0]!.startsWith('## Memórias e instruções permanentes\n- Rode o lint.\n\n---\n')).toBe(true)
    expect(prompts[0]).toContain('ERROR: npm ci falhou')
    expect(prompts[1]).not.toContain('Memórias e instruções permanentes')
  })

  it('OPE-97: memórias aplicadas como instrução da sessão não entram no prompt do build', async () => {
    mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
    memories.sync.mockResolvedValueOnce({ applied: true, section: '## Memórias e instruções permanentes\n- Rode o lint.' })
    const wb = await workbench()
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))
    expect(memories.sync).toHaveBeenCalled()
    expect((mocks.runTurn.mock.calls[0]![1] as { text: string }).text).not.toContain('Memórias e instruções permanentes')
  })

  it('agente que não consegue corrigir (ok:false) falha o build com o motivo', async () => {
    mocks.runBuild.mockResolvedValue({ exitCode: 2, tail: 'erro' })
    mocks.runTurn.mockResolvedValue(succeeded('```json\n{"ok": false, "error": "dependência fora do ar"}\n```'))
    const wb = await workbench()
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))
    expect(mocks.settleBuild).toHaveBeenCalledWith(String(wb._id), 'failed', 'O agente não conseguiu corrigir o build: dependência fora do ar')
  })

  it('correção interrompida fecha como interrompido', async () => {
    mocks.runBuild.mockResolvedValue({ exitCode: 1, tail: 'erro' })
    mocks.runTurn.mockResolvedValue({ outcome: 'interrupted', text: '', message: 'Interrompido', costUsd: 0, durationMs: 1 })
    const wb = await workbench()
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().runState).toBe('interrupted'))
    expect(mocks.settleBuild).toHaveBeenCalledWith(String(wb._id), 'interrupted', 'Interrompido')
  })

  it('comando que não terminou no host falha o build sem chamar o agente', async () => {
    mocks.runBuild.mockResolvedValue({ exitCode: null, tail: 'O comando sumiu do host' })
    const wb = await workbench()
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))
    expect(doc().error).toContain('O comando sumiu do host')
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('tempo limite estourado (exit 124) falha o build sem mandar o agente "corrigir"', async () => {
    mocks.runBuild.mockResolvedValue({ exitCode: 124, tail: '#12 [build 5/9] RUN npm ci' })
    const wb = await workbench()
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))
    expect(doc().error).toContain('excedeu o tempo limite')
    expect(mocks.runTurn).not.toHaveBeenCalled()
    expect(mocks.runBuild).toHaveBeenCalledTimes(1)
    expect(mocks.settleBuild).toHaveBeenCalledWith(String(wb._id), 'failed', expect.stringContaining('tempo limite'))
  })

  it('falha no registro do build não derruba o build', async () => {
    mocks.startBuild.mockRejectedValueOnce(new Error('mongo fora'))
    const wb = await workbench()
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))
  })

  it('reconexão com o comando ainda no host: retoma a leitura do mesmo job, sem sondar a sessão', async () => {
    const wb = await workbench({ stage: 'building', runState: 'interrupted', lastStage: 'building', lastPrompt: { stage: 'building', text: UP }, previewBuild: { method: 'local', port: 4015, docker: null, job: 'build-abc' } })
    const id = String(wb._id)
    await reconnect(id)
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))
    expect(mocks.probe).not.toHaveBeenCalled()
    expect(mocks.resumeBuild).toHaveBeenCalledWith(id)
    expect(mocks.restartSection).toHaveBeenCalledWith(id)
    expect(mocks.beginSection).not.toHaveBeenCalled()
    expect((mocks.runBuild.mock.calls[0]![0] as { jobId: string }).jobId).toBe('build-abc')
  })

  it('com o backup ligado, um turno curto do agente só faz o dump e o servidor confere antes do build', async () => {
    mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
    const wb = await workbench()
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))
    expect(mocks.runTurn).toHaveBeenCalledTimes(1)
    expect((mocks.runTurn.mock.calls[0]![1] as { text: string }).text).toContain('mongodump')
    expect(mocks.runShell).toHaveBeenCalledWith(expect.anything(), '/home/u/app', expect.stringMatching(/^test -s /), { timeoutMs: 15000 })
    expect(appended()).toContain('agente preparando a prévia (dump do MongoDB)')
    // A conferência do dump vem antes de o app rodar o build.
    expect(mocks.runShell.mock.invocationCallOrder[0]!).toBeLessThan(mocks.runBuild.mock.invocationCallOrder[0]!)
  })
})

describe('workflow — prévia no GitHub Action rodada pelo app', () => {
  beforeEach(() => {
    mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: githubConfig() })
  })

  /** O build remoto não passa pela fila: entra pelo "Tentar novamente" da mesa parada em "Subindo a prévia". */
  const startRemote = async () => {
    const wb = await workbench({ stage: 'building', runState: 'failed', buildQueuedAt: null, lastStage: 'building', lastPrompt: { stage: 'building', text: 'x' }, previewBuild: { method: 'github' } })
    await retry(String(wb._id))
    return wb
  }

  it('o agente commita, o app roda o script da tentativa e confere a publicação', async () => {
    mocks.runBuild.mockImplementation(async (input: { onOutput: (chunk: string) => void }) => {
      input.onOutput('Prévia GitHub: https://github.com/org/app/actions/runs/42\n')
      return { exitCode: 0, tail: '' }
    })
    const wb = await startRemote()
    const id = String(wb._id)
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))
    expect(mocks.startBuild).toHaveBeenCalledWith(id, { port: 4015, local: false, method: 'github' })
    expect((mocks.runTurn.mock.calls[0]![1] as { text: string }).text).toContain('Commit para a prévia no GitHub Action')
    const input = mocks.runBuild.mock.calls[0]![0] as { run: string; timeoutMs: number }
    expect(input.run).toBe("cd '/home/u/app/worktrees/ope-88' && npx tsx scripts/preview-github.ts '/srv/backups/remote-preview-a1.json' 'a1'")
    // O script espera testes + workflow: nunca menos de 25 min.
    expect(input.timeoutMs).toBeGreaterThanOrEqual(25 * 60_000)
    expect(appended()).toContain('actions/runs/42')
    expect(mocks.assertRemote).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateRemote).not.toHaveBeenCalled()
    // A tentativa remota leva a faixa efetiva (central nova herda a padrão global, 5002–5998).
    expect(mocks.reserveRemote.mock.calls[0]?.[5]).toEqual({ min: 5002, max: 5998 })
    expect(mocks.settleBuild).toHaveBeenCalledWith(id, 'succeeded', null)
  })

  it('falha do script: o agente corrige e commita, a tentativa é invalidada e o app roda uma nova', async () => {
    mocks.runBuild.mockResolvedValueOnce({ exitCode: 1, tail: 'Testes falharam no workflow' }).mockResolvedValueOnce({ exitCode: 0, tail: '' })
    await startRemote()
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))
    const fix = (mocks.runTurn.mock.calls[1]![1] as { text: string }).text
    expect(fix).toContain('Testes falharam no workflow')
    expect(fix).toContain('COMMITE na branch da mesa')
    expect(mocks.invalidateRemote).toHaveBeenCalledTimes(1)
    expect(mocks.reserveRemote).toHaveBeenCalledTimes(2)
    const runs = mocks.runBuild.mock.calls.map(([input]) => (input as { run: string }).run)
    expect(runs[0]).toContain("'a1'")
    expect(runs[1]).toContain("'a2'")
    // As duas execuções ficam no mesmo build da aba.
    expect(mocks.startBuild).toHaveBeenCalledTimes(1)
    expect(mocks.beginSection).toHaveBeenCalledTimes(2)
    expect(doc().previewBuild).toMatchObject({ method: 'github', attempt: 'a2', port: 4015, prepared: true })
  })

  it('tempo esgotado no GitHub Action falha sem correção e invalida a tentativa', async () => {
    mocks.runBuild.mockResolvedValue({ exitCode: 124, tail: 'aguardando o workflow' })
    await startRemote()
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))
    expect(doc().error).toContain('excedeu o tempo limite')
    expect(mocks.runTurn).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateRemote).toHaveBeenCalled()
  })

  it('falha de uma tentativa antiga não invalida a reserva de uma tentativa mais nova', async () => {
    // A preparação da tentativa "a1" falha DEPOIS de a mesa já ter reservado outra tentativa (a2).
    mocks.runTurn.mockImplementationOnce(async () => {
      await AgenticWorkbench.updateOne({ _id: doc()._id as never }, { $set: { previewBuild: { method: 'github', attempt: 'a2', statePath: '/srv/backups/remote-preview-a2.json', dumpRequired: false } } })
      return { outcome: 'failed', text: '', message: 'O agente não concluiu a etapa', costUsd: 0, durationMs: 5 }
    })
    const wb = await workbench({ stage: 'building', runState: 'failed', buildQueuedAt: null, lastStage: 'building', lastPrompt: { stage: 'building', text: 'x' }, previewBuild: { method: 'github', attempt: 'a1', statePath: '/srv/backups/remote-preview-a1.json', dumpRequired: false } })
    await retry(String(wb._id))
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))
    expect(mocks.invalidateRemote).toHaveBeenCalledTimes(1)
    // Só a tentativa que falhou (a1) é invalidada; o estado da a2 fica.
    expect(mocks.invalidateRemote.mock.calls[0]).toEqual([expect.anything(), expect.objectContaining({ previewBuild: expect.objectContaining({ attempt: 'a2' }) }), expect.any(String), { attempt: 'a1' }])
    expect(doc().previewBuild).toMatchObject({ attempt: 'a2' })
  })
})
