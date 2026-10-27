import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

/**
 * Builder Machine (`local-docker`): preparo por diferença, ações nos containers do PC, chave do
 * servidor, rotina de limpeza, ativação da integração e o teste da integração. Host sempre falso.
 */

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => {}),
  publish: vi.fn(async () => {}),
  active: vi.fn(async () => true),
  updateIntegration: vi.fn(async () => ({})),
  integrationConfig: vi.fn(async (id: string): Promise<Record<string, unknown>> => (id === 'crons' ? { jobs: [] } : {})),
}))
const store = vi.hoisted(() => ({ state: null as unknown, overrides: null as unknown, previews: null as unknown, workbenches: null as unknown }))

vi.mock('@/features/local-docker/server/models', () => {
  store.state = memoryModel()
  store.overrides = memoryModel()
  store.previews = memoryModel()
  return { LocalDockerState: store.state, LocalDockerOverride: store.overrides, LocalDockerPreview: store.previews, localDockerDb: async () => {} }
})
vi.mock('@/lib/db/models/Agentic', () => {
  store.workbenches = memoryModel()
  return { AgenticWorkbench: store.workbenches }
})
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: vi.fn() }))
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: mocks.active, assertBuilderMachineActive: vi.fn() }))
vi.mock('@/features/integrations/services/integration-service', () => ({ updateIntegration: mocks.updateIntegration }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: mocks.integrationConfig }))
vi.mock('@/features/agentic/server/ports', () => ({ isPortInUse: vi.fn(async () => false) }))

import { DEFAULT_LOCAL_DOCKER_SETTINGS } from '@/features/local-docker/schemas'
import { reconcileEnvironment, runMachineAction } from '@/features/local-docker/server/machine'
import { listPcContainers, runContainerAction } from '@/features/local-docker/server/containers'
import { ensureKeyOnHost, setServerKey } from '@/features/local-docker/server/key'
import { onBuilderMachineEnabled, runBuilderMachineCleanup } from '@/features/local-docker/server/cleanup'
import { getLocalDockerSettings } from '@/features/local-docker/server/settings'
import { createBuilderMachineTester } from '@/features/local-docker/server/tester'
import type { HostResult } from '@/features/local-docker/server/shell'

type Model = ReturnType<typeof memoryModel>
const state = () => store.state as Model
const previews = () => store.previews as Model
const workbenches = () => store.workbenches as Model

const settings = { ...DEFAULT_LOCAL_DOCKER_SETTINGS, pcUser: 'alfredopetri', serverAddress: '192.168.0.64' }
const row = (cols: string[]) => cols.join('\t')
const ALIAS_MONGO = row(['opex-alias-devteam-mongo', 'running', 'Up 1h', 'alpine/socat', '', '', 'alias', 'devteam-mongo', '192.168.0.64:27017', 'docker_default', ''])
const ALIAS_SOKETI = row(['opex-alias-devteam-soketi', 'running', 'Up 1h', 'alpine/socat', '', '', 'alias', 'devteam-soketi', '192.168.0.64:6001', 'docker_default', ''])
const BUILDER = row(['buildx_buildkit_opex-local-builder0', 'running', 'Up 1h', 'moby/buildkit:buildx-stable-1', '', '', '', '', '', '', ''])
const PREVIEW = row(['gosipal-GO-DEV-717', 'running', 'Up 5m', 'sipal/painel:GO-DEV-717', 'go-sipal-go-dev-717', 'app', '', '', '', '', '0.0.0.0:5003->5003/tcp'])
const OTHER = row(['outro-app', 'running', 'Up', 'nginx', 'outro', 'web', '', '', '', '', ''])

/** Host falso: túnel aberto/fechado, lista de containers do PC e o registro de cada comando. */
function fakeHost(options: { open?: boolean; containers?: string[]; keyPresent?: boolean; fail?: (command: string) => boolean } = {}) {
  const calls: string[] = []
  const run = vi.fn(async (command: string): Promise<HostResult> => {
    calls.push(command)
    const done = (output = ''): HostResult => ({ exitCode: 0, output })
    if (options.fail?.(command)) return { exitCode: 1, output: 'falhou de propósito' }
    if (command.includes('-O check')) return options.open === false ? { exitCode: 255, output: 'No such file' } : done('Master running')
    if (command.includes(' ps -a --format')) return done((options.containers ?? [ALIAS_MONGO, ALIAS_SOKETI, BUILDER]).join('\n'))
    if (command.includes(' info --format')) return done('29.5.1|pc|12|8000000000')
    if (command.includes(' stats --no-stream')) return done('opex-alias-devteam-mongo\t0.10%\t1MiB / 8GiB\t0.01%')
    if (command.startsWith('test -f')) return options.keyPresent === false ? { exitCode: 1, output: '' } : done()
    if (command.includes('ssh-keygen -lf')) return done('256 SHA256:abcDEF opex-local@srv (ED25519)')
    if (command.includes('ssh-keygen -q') || command.includes('ssh-keygen -y')) return done('ssh-ed25519 AAAANEW opex-local@srv')
    return done()
  })
  return { run, calls }
}

const configured = async (extra: Record<string, unknown> = {}) => {
  await state().create({ key: 'default', settings, publicKey: 'ssh-ed25519 AAAA', keySource: 'generated', builderApplied: { memoryGb: null, cpus: null }, lastPrepare: null, wantOpen: true, lastSeenOpen: true, ...extra })
}

beforeEach(() => {
  vi.clearAllMocks()
  state().docs.splice(0)
  previews().docs.splice(0)
  workbenches().docs.splice(0)
  mocks.active.mockResolvedValue(true)
  mocks.integrationConfig.mockImplementation(async (id: string) => (id === 'crons' ? { jobs: [] } : {}))
})

describe('preparo do Docker do PC por diferença', () => {
  it('mantém o que está igual, cria só o apelido novo e não toca nas prévias', async () => {
    await configured()
    const host = fakeHost({ containers: [ALIAS_MONGO, ALIAS_SOKETI, BUILDER, PREVIEW] })
    const steps = await reconcileEnvironment({ ...settings, aliases: [...settings.aliases, { name: 'devteam-minio', port: 9000 }] }, host.run)
    expect(steps.map((step) => [step.label, step.detail])).toEqual([
      ['Rede docker_default', 'Pronto'],
      ['Apelido devteam-mongo → 192.168.0.64:27017', 'Sem mudança'],
      ['Apelido devteam-soketi → 192.168.0.64:6001', 'Sem mudança'],
      ['Apelido devteam-minio → 192.168.0.64:9000', 'Criado'],
      ['Builder opex-local-builder', 'Pronto'],
    ])
    expect(host.calls.filter((command) => command.includes(' run -d '))).toHaveLength(1)
    expect(host.calls.some((command) => command.includes('gosipal-GO-DEV-717') || command.includes('go-sipal-go-dev-717'))).toBe(false)
  })

  it('limites do builder mudaram: recria mantendo o cache e grava os limites aplicados', async () => {
    await configured()
    const host = fakeHost()
    const steps = await reconcileEnvironment({ ...settings, builderMemoryGb: 4, builderCpus: 2 }, host.run)
    expect(steps.at(-1)).toMatchObject({ label: 'Builder opex-local-builder (recriado, cache mantido)', ok: true })
    expect(host.calls.some((command) => command.includes('docker buildx rm --keep-state opex-local-builder') && command.includes('memory=4096m'))).toBe(true)
    expect(state().docs[0]!.builderApplied).toEqual({ memoryGb: 4, cpus: 2 })
  })

  it('o preparo exige o túnel aberto e grava o resultado como último preparo', async () => {
    await configured()
    await expect(runMachineAction('prepare', 'local', fakeHost({ open: false }).run)).rejects.toMatchObject({ status: 409 })
    const result = await runMachineAction('prepare', 'local', fakeHost().run)
    expect(result.ok).toBe(true)
    expect((await getLocalDockerSettings()).lastPrepare).toMatchObject({ ok: true, trigger: 'manual' })
  })
})

describe('containers do PC', () => {
  beforeEach(async () => {
    await configured()
    const wb = await workbenches().create({ taskCode: 'GO-DEV-717', worktreePath: '/w/go-dev-717', port: 5003 })
    await previews().create({ workbenchId: String(wb._id), centralId: 'c1', composeProject: 'go-sipal-go-dev-717', port: 5003, pendingTeardown: false })
  })

  it('separa prévias e ambiente, com CPU/memória, e ignora containers de outra origem', async () => {
    const list = await listPcContainers(fakeHost({ containers: [ALIAS_MONGO, BUILDER, PREVIEW, OTHER] }).run)
    expect(list.available).toBe(true)
    expect(list.previews.map((item) => [item.name, item.taskCode, item.service, item.port])).toEqual([['gosipal-GO-DEV-717', 'GO-DEV-717', 'app', 5003]])
    expect(list.environment.map((item) => [item.name, item.kind])).toEqual([
      ['opex-alias-devteam-mongo', 'alias'],
      ['buildx_buildkit_opex-local-builder0', 'builder'],
    ])
    expect(list.environment[0]!.stats).toEqual({ cpuPercent: 0.1, memoryUsage: '1MiB / 8GiB', memoryPercent: 0.01 })
  })

  it('túnel fechado: indisponível, sem consultar o Docker', async () => {
    const host = fakeHost({ open: false })
    expect(await listPcContainers(host.run)).toMatchObject({ available: false, previews: [], environment: [] })
    expect(host.calls.some((command) => command.includes(' ps -a'))).toBe(false)
  })

  it('apagar exige confirmação; container de outra origem não é tocado', async () => {
    const host = fakeHost({ containers: [PREVIEW, OTHER] })
    await expect(runContainerAction('gosipal-GO-DEV-717', 'delete', false, 'local', host.run)).rejects.toMatchObject({ status: 409 })
    await expect(runContainerAction('outro-app', 'stop', false, 'local', host.run)).rejects.toMatchObject({ status: 404 })
  })

  it('apagar a prévia leva o ambiente, cancela o repasse e tira o registro (a mesa fica fora do ar)', async () => {
    const host = fakeHost({ containers: [PREVIEW] })
    await runContainerAction('gosipal-GO-DEV-717', 'delete', true, 'local', host.run)
    expect(host.calls.some((command) => command.includes('volume rm $vols') && command.includes('go-sipal-go-dev-717'))).toBe(true)
    expect(host.calls.some((command) => command.includes('-O cancel -L 0.0.0.0:5003:localhost:5003'))).toBe(true)
    expect(previews().docs).toHaveLength(0)
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidadeId: 'container:gosipal-GO-DEV-717', acao: 'EXCLUIR' }))
  })

  it('recriar a prévia usa o compose do worktree no Docker do PC, sem build', async () => {
    const host = fakeHost({ containers: [PREVIEW] })
    await runContainerAction('gosipal-GO-DEV-717', 'recreate', false, 'local', host.run)
    expect(host.calls).toContain("cd '/w/go-dev-717' && PORT=5003 DOCKER_CONTEXT=opex-local docker compose -p 'go-sipal-go-dev-717' up -d --force-recreate --no-build 'app'")
  })

  it('derrubar o builder usa o buildx; apagar o builder esquece os limites aplicados', async () => {
    const host = fakeHost()
    await runContainerAction('buildx_buildkit_opex-local-builder0', 'stop', false, 'local', host.run)
    expect(host.calls).toContain('docker buildx stop opex-local-builder')
    await runContainerAction('buildx_buildkit_opex-local-builder0', 'delete', true, 'local', host.run)
    expect(host.calls).toContain('docker buildx rm opex-local-builder')
    expect(state().docs[0]!.builderApplied).toBeNull()
  })

  it('falha do Docker vira erro acionável', async () => {
    const host = fakeHost({ fail: (command) => command.includes(' start ') })
    await expect(runContainerAction('opex-alias-devteam-mongo', 'start', false, 'local', host.run)).rejects.toMatchObject({ status: 502, message: expect.stringContaining('Não foi possível levantar opex-alias-devteam-mongo') })
  })
})

describe('chave do servidor', () => {
  const KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----'

  it('inserir: cifra a privada na integração, sem a chave no debug, e a tela só recebe a impressão digital', async () => {
    await configured()
    const host = fakeHost()
    const dto = await setServerKey({ action: 'import', privateKey: KEY }, 'local', host.run)
    expect(mocks.updateIntegration).toHaveBeenCalledWith('builder_machine', { secrets: { sshPrivateKey: { action: 'set', value: KEY } } }, 'local')
    expect(host.run.mock.calls.find(([command]) => command.includes('base64 -d'))?.[2]).toEqual({ redactedAs: expect.any(String) })
    expect(dto.key).toEqual({ configured: true, source: 'imported', fingerprint: 'SHA256:abcDEF (ED25519)' })
    expect(JSON.stringify(dto)).not.toContain('AAAANEW')
    expect(state().docs[0]!.publicKey).toBe('ssh-ed25519 AAAANEW opex-local@srv')
  })

  it('gerar nova: substitui no host e apaga a privada guardada', async () => {
    await configured({ keySource: 'imported' })
    const dto = await setServerKey({ action: 'generate' }, 'local', fakeHost().run)
    expect(mocks.updateIntegration).toHaveBeenCalledWith('builder_machine', { secrets: { sshPrivateKey: { action: 'clear' } } }, 'local')
    expect(dto.key.source).toBe('generated')
  })

  it('chave inválida: nada muda', async () => {
    await configured()
    const host = fakeHost({ fail: (command) => command.includes('base64 -d') })
    await expect(setServerKey({ action: 'import', privateKey: KEY }, 'local', host.run)).rejects.toMatchObject({ status: 400 })
    expect(mocks.updateIntegration).not.toHaveBeenCalled()
  })

  it('chave inserida que sumiu do host é regravada a partir do segredo', async () => {
    await configured({ keySource: 'imported' })
    mocks.integrationConfig.mockResolvedValue({ sshPrivateKey: KEY })
    const host = fakeHost({ keyPresent: false })
    await ensureKeyOnHost(host.run)
    expect(host.calls.some((command) => command.includes('base64 -d'))).toBe(true)
  })
})

describe('teste da integração (lista de Integrações)', () => {
  const ctx = () => ({ emit: vi.fn(), signal: new AbortController().signal })

  it('sem usuário do WSL ou sem chave falha dizendo onde resolver', async () => {
    await state().create({ key: 'default', settings: { ...settings, pcUser: '' }, publicKey: 'x' })
    await expect(createBuilderMachineTester(fakeHost().run)(ctx())).rejects.toThrow('Informe o usuário do PC (WSL) (aba Conexão com o PC)')
    state().docs.splice(0)
    await state().create({ key: 'default', settings, publicKey: null })
    await expect(createBuilderMachineTester(fakeHost().run)(ctx())).rejects.toThrow(/aba Preparo do PC/)
  })

  it('integração desativada: aviso sem tocar no host', async () => {
    await configured()
    mocks.active.mockResolvedValueOnce(false)
    const host = fakeHost()
    expect(await createBuilderMachineTester(host.run)(ctx())).toEqual({ status: 'warn', message: expect.stringContaining('Integração desativada') })
    expect(host.calls).toEqual([])
  })

  it('PC acessível com o túnel aberto passa; SSH falhando reprova com o passo', async () => {
    await configured()
    const context = ctx()
    expect(await createBuilderMachineTester(fakeHost().run)(context)).toBe('PC acessível e túnel do Docker aberto')
    expect(context.emit).toHaveBeenCalledWith('success', expect.stringContaining('pc: Docker 29.5.1, 12 CPUs'))
    expect(await createBuilderMachineTester(fakeHost({ open: false }).run)(ctx())).toBe('PC acessível (túnel do Docker fechado: as prévias vão para o servidor)')
    await expect(createBuilderMachineTester(fakeHost({ fail: (command) => command.startsWith('ssh -i') }).run)(ctx())).rejects.toThrow(/SSH do PC pelo túnel de controle/)
  })
})

describe('rotina de limpeza e ativação da integração', () => {
  it('integração desativada ou túnel fechado: não faz nada', async () => {
    await configured()
    mocks.active.mockResolvedValueOnce(false)
    expect(await runBuilderMachineCleanup(fakeHost().run)).toContain('desativada')
    const closed = fakeHost({ open: false })
    expect(await runBuilderMachineCleanup(closed.run)).toContain('adiada')
    expect(closed.calls.some((command) => command.includes('prune'))).toBe(false)
  })

  it('túnel aberto: limpa as imagens órfãs e o cache acima do teto', async () => {
    await configured()
    const host = fakeHost()
    await runBuilderMachineCleanup(host.run)
    expect(host.calls).toEqual(expect.arrayContaining(['docker --context opex-local image prune -f', 'docker buildx prune --builder opex-local-builder -f --max-used-space 20gb']))
  })

  it('ativar a integração liga a rotina de limpeza em Crons (e não regrava se já estiver ligada)', async () => {
    const jobs = [{ id: 'builder-machine-cleanup', label: 'Limpeza', kind: 'internal', schedule: { type: 'daily', time: '03:00' }, enabled: false }]
    mocks.integrationConfig.mockResolvedValueOnce({ jobs })
    await onBuilderMachineEnabled('local')
    expect(mocks.updateIntegration).toHaveBeenCalledWith('crons', { publicValues: { jobs: [{ ...jobs[0], enabled: true }] } }, 'local')
    mocks.updateIntegration.mockClear()
    mocks.integrationConfig.mockResolvedValueOnce({ jobs: [{ ...jobs[0], enabled: true }] })
    await onBuilderMachineEnabled('local')
    expect(mocks.updateIntegration).not.toHaveBeenCalled()
  })
})
