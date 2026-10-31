import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'crypto'

const mocks = vi.hoisted(() => ({
  loadStoredIntegration: vi.fn(),
  invalidateStoredIntegrations: vi.fn(),
  updateOne: vi.fn(),
  save: vi.fn(),
  recordAudit: vi.fn(),
  statusFindOne: vi.fn(),
  rescheduleJobs: vi.fn(),
  enableHook: vi.fn(async () => undefined),
}))

vi.mock('@/lib/integrations/store', () => ({
  loadStoredIntegration: mocks.loadStoredIntegration,
  loadStoredIntegrations: vi.fn(),
  invalidateStoredIntegrations: mocks.invalidateStoredIntegrations,
  INTEGRATION_CACHE_TTL_MS: 30_000,
}))
vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn(),
  recordAudit: mocks.recordAudit,
  AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR' },
  createAuditContext: (userId: string) => ({ userId }),
}))
vi.mock('@/lib/db/models/Integration', () => {
  function Integration(this: Record<string, unknown>, data: Record<string, unknown>) {
    Object.assign(this, data)
    this.set = vi.fn()
    this.save = mocks.save
  }
  ;(Integration as unknown as { updateOne: typeof mocks.updateOne }).updateOne = mocks.updateOne
  return { Integration }
})
vi.mock('@/lib/db/models/IntegrationStatus', () => ({
  IntegrationStatus: { findOne: () => ({ lean: mocks.statusFindOne }), find: () => ({ lean: async () => [] }) },
}))
vi.mock('@/lib/db/models/CronJobState', () => ({ CronJobState: { find: () => ({ lean: async () => [] }) } }))
vi.mock('@/lib/db/models/IntegrationLog', () => ({ IntegrationLog: {} }))
vi.mock('@/features/integrations/scheduler/cron-scheduler', () => ({ rescheduleJobs: mocks.rescheduleJobs }))
vi.mock('@/features/local-docker/server/cleanup', () => ({ onBuilderMachineEnabled: mocks.enableHook }))

import { encryptSecret, isEncryptedSecret } from '@/lib/crypto/secretBox'
import type { CronJobConfig } from '@/lib/integrations/catalog'
import {
  getIntegrationDetail,
  IntegrationUpdateError,
  jobsToReschedule,
  listIntegrations,
  updateIntegration,
} from '@/features/integrations/services/integration-service'

const saved = { ...process.env }
const actor = 'local'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  delete process.env.PUSHER_SECRET
  mocks.statusFindOne.mockResolvedValue(null)
})

afterEach(() => {
  process.env = { ...saved }
})

const storedDoc = () => ({
  integrationId: 'pusher',
  environment: 'interno',
  debugMode: false,
  publicValues: { mode: 'cluster', appId: 'app-antigo', key: 'key', cluster: 'sa1' },
  secretValues: { secret: encryptSecret('secret-antigo') },
})

describe('listIntegrations', () => {
  it('lista todas as integrações do catálogo, sem flags de permissão', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(null)
    const items = await listIntegrations()
    expect(items.map((item) => item.id)).toEqual(['pusher', 'internal_api', 'crons', 'github', 'ai', 'ai_opencode', 'ai_gemini', 'ai_anthropic', 'ai_openai', 'ai_deepseek', 'ai_jev', 'orcamentos', 'smtp', 'storage_s3', 'builder_machine', 'engramind'])
    // Builder Machine aparece sempre (mesmo desativada), para poder ser ativada.
    // Inteligência Artificial são filhos do hub "Inteligência Artificial" (fora da lista principal na tela).
    expect(items.filter((item) => item.parent === 'ai').map((item) => item.id)).toEqual(['ai_opencode', 'ai_gemini', 'ai_anthropic', 'ai_openai', 'ai_deepseek', 'ai_jev'])
    expect(items.find((item) => item.id === 'ai_gemini')?.configured).toBe(false)
    for (const item of items) {
      expect(item).not.toHaveProperty('canEdit')
      expect(item.health.status).toBe('unknown')
    }
  })
})

describe('getIntegrationDetail', () => {
  it('nunca devolve o valor de um segredo — só se está configurado e a origem', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(storedDoc())
    const detail = await getIntegrationDetail('pusher')

    expect(JSON.stringify(detail)).not.toContain('secret-antigo')
    expect(detail.secrets.secret).toEqual({ configured: true, source: 'db', unreadable: false })
    expect(detail.publicValues.appId).toBe('app-antigo')
    expect(detail.health.status).toBe('unknown')
    expect(detail).not.toHaveProperty('canEdit')
    expect(detail).not.toHaveProperty('canExplore')
  })
})

describe('updateIntegration', () => {
  it('criptografa segredo novo e audita sem expor valores', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(storedDoc())

    await updateIntegration(
      'pusher',
      {
        publicValues: { appId: 'app-novo' },
        secrets: { secret: { action: 'set', value: 'secret-novo' } },
        environment: 'externo',
      },
      actor,
    )

    const [filter, update] = mocks.updateOne.mock.calls[0]
    expect(filter).toEqual({ integrationId: 'pusher' })
    expect(update._auditContext).toEqual({ userId: 'local' })
    expect(update.$set['publicValues.appId']).toBe('app-novo')
    expect(update.$set.environment).toBe('externo')
    expect(isEncryptedSecret(update.$set['secretValues.secret'])).toBe(true)
    expect(JSON.stringify(update)).not.toContain('secret-novo')
    expect(mocks.invalidateStoredIntegrations).toHaveBeenCalled()

    const audit = mocks.recordAudit.mock.calls[0][0]
    expect(audit).toMatchObject({ userId: 'local', entidade: 'Integracao', entidadeId: 'pusher', acao: 'ATUALIZAR' })
    expect(audit.depois).toMatchObject({ appId: 'app-novo', secret: '(alterado)' })
    expect(audit.antes).toMatchObject({ appId: 'app-antigo', secret: '(configurado)' })
    expect(JSON.stringify(audit)).not.toContain('secret-novo')
  })

  it('limpar um segredo grava null e audita como removido', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(storedDoc())
    await updateIntegration('pusher', { secrets: { secret: { action: 'clear' } } }, actor)
    expect(mocks.updateOne.mock.calls[0][1].$set['secretValues.secret']).toBeNull()
    expect(mocks.recordAudit.mock.calls[0][0].depois).toEqual({ secret: '(removido)' })
  })

  it('não grava nem audita quando nada mudou', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(storedDoc())
    await updateIntegration('pusher', { publicValues: { appId: 'app-antigo' } }, actor)
    expect(mocks.updateOne).not.toHaveBeenCalled()
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('recusa salvar segredo sem a chave de criptografia (409 acionável)', async () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
    mocks.loadStoredIntegration.mockResolvedValue(null)

    const error = await updateIntegration('pusher', { secrets: { secret: { action: 'set', value: 'x' } } }, actor).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(IntegrationUpdateError)
    expect((error as IntegrationUpdateError).status).toBe(409)
    expect((error as Error).message).toMatch(/INTEGRATIONS_ENCRYPTION_KEY/)
    expect(mocks.updateOne).not.toHaveBeenCalled()
  })

  it('cria o documento no primeiro salvamento quando não houve seed', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(null)
    await updateIntegration('pusher', { debugMode: true }, actor)
    expect(mocks.save).toHaveBeenCalled()
    expect(mocks.recordAudit.mock.calls[0][0].acao).toBe('CRIAR')
  })
})

const job = (over: Partial<CronJobConfig> = {}): CronJobConfig => ({
  id: 'cancel',
  label: 'Cancelar',
  kind: 'http',
  path: '/api/routines/cancel-pending-or-rejected-negotiations',
  schedule: { type: 'daily', time: '17:30' },
  enabled: true,
  ...over,
})

describe('gancho de ativação (Builder Machine)', () => {
  const stored = (active: boolean) => ({ integrationId: 'builder_machine', environment: 'interno', debugMode: false, publicValues: { active }, secretValues: {} })

  it('ativar (desligada → ligada) dispara o gancho depois de gravar e auditar', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(stored(false))
    await updateIntegration('builder_machine', { publicValues: { active: true } }, actor)
    expect(mocks.updateOne).toHaveBeenCalled()
    expect(mocks.recordAudit).toHaveBeenCalled()
    expect(mocks.enableHook).toHaveBeenCalledWith(actor)
  })

  it('sem mudança (já ativa) ou desativando: não dispara', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(stored(true))
    await updateIntegration('builder_machine', { publicValues: { active: true } }, actor)
    await updateIntegration('builder_machine', { debugMode: true }, actor)
    await updateIntegration('builder_machine', { publicValues: { active: false } }, actor)
    expect(mocks.enableHook).not.toHaveBeenCalled()
  })

  it('falha no gancho não desfaz a ativação', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(stored(false))
    mocks.enableHook.mockRejectedValueOnce(new Error('crons indisponível'))
    await expect(updateIntegration('builder_machine', { publicValues: { active: true } }, actor)).resolves.toBeTruthy()
    expect(mocks.updateOne).toHaveBeenCalled()
  })
})

describe('jobsToReschedule', () => {
  it('inclui agendamento alterado, rotina nova e religada; ignora inalterada e desligada', () => {
    const previous = [job(), job({ id: 'off', enabled: false }), job({ id: 'same' })]
    const next = [
      job({ schedule: { type: 'daily', time: '08:51' } }),
      job({ id: 'off', enabled: true }),
      job({ id: 'same' }),
      job({ id: 'nova' }),
      job({ id: 'desligada', enabled: false }),
    ]
    expect(jobsToReschedule(previous, next).map((j) => j.id)).toEqual(['cancel', 'off', 'nova'])
  })
})

describe('updateIntegration("crons")', () => {
  const cronsDoc = () => ({
    integrationId: 'crons',
    environment: 'interno',
    debugMode: false,
    publicValues: { schedulerEnabled: true, jobs: [job()] },
    secretValues: {},
  })

  it('recalcula já o nextRunAt da rotina cujo agendamento mudou', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(cronsDoc())
    const edited = job({ schedule: { type: 'daily', time: '08:51' } })
    await updateIntegration('crons', { publicValues: { jobs: [edited] } } as never, actor)
    expect(mocks.rescheduleJobs).toHaveBeenCalledWith([edited])
  })

  it('não recalcula quando só outros campos mudaram', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(cronsDoc())
    await updateIntegration('crons', { publicValues: { schedulerEnabled: false } } as never, actor)
    expect(mocks.rescheduleJobs).not.toHaveBeenCalled()
  })
})

describe('documentação Swagger (swaggerUrl)', () => {
  it('grava, audita e devolve a documentação no detalhe', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(storedDoc())
    await updateIntegration('pusher', { swaggerUrl: ' https://pusher.exemplo.com/docs ' }, actor)
    const [, update] = mocks.updateOne.mock.calls[0]
    expect(update.$set.swaggerUrl).toBe('https://pusher.exemplo.com/docs')
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        antes: { swaggerUrl: null },
        depois: { swaggerUrl: 'https://pusher.exemplo.com/docs' },
      }),
    )
  })

  it('vazio limpa a documentação; igual à salva não grava', async () => {
    mocks.loadStoredIntegration.mockResolvedValue({ ...storedDoc(), swaggerUrl: 'https://pusher.exemplo.com/docs' })
    await updateIntegration('pusher', { swaggerUrl: 'https://pusher.exemplo.com/docs' }, actor)
    expect(mocks.updateOne).not.toHaveBeenCalled()

    await updateIntegration('pusher', { swaggerUrl: '' }, actor)
    expect(mocks.updateOne.mock.calls[0][1].$set.swaggerUrl).toBeNull()
  })

  it('o detalhe informa o resumo da autenticação do adaptador (nunca o valor)', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(null)
    const internal = await getIntegrationDetail('internal_api')
    expect(internal.explorerAuth).toMatch(/token de sistema informado/)
    const pusher = await getIntegrationDetail('pusher')
    expect(pusher.explorerAuth).toBeNull()
    expect(pusher.swaggerUrl).toBeNull()
  })
})

describe('documentação gerenciada da API interna', () => {
  const byId = (internal: Record<string, unknown> | null) => (id: string) =>
    Promise.resolve(
      id === 'crons'
        ? { integrationId: 'crons', environment: 'interno', debugMode: false, publicValues: { internalBaseUrl: 'https://app.exemplo.com/' }, secretValues: {} }
        : internal,
    )

  it('deriva a URL da especificação da URL interna, ignorando valor salvo, e sinaliza travada', async () => {
    mocks.loadStoredIntegration.mockImplementation(
      byId({ integrationId: 'internal_api', environment: 'interno', debugMode: false, swaggerUrl: 'https://antiga/docs', publicValues: {}, secretValues: {} }),
    )
    const detail = await getIntegrationDetail('internal_api')
    expect(detail.swaggerUrl).toBe('https://app.exemplo.com/api/openapi.json')
    expect(detail.swaggerUrlManaged).toBe(true)
  })

  it('recusa alterar a documentação gerenciada sem gravar nem auditar', async () => {
    mocks.loadStoredIntegration.mockImplementation(byId(null))
    const error = await updateIntegration('internal_api', { swaggerUrl: 'https://outra/docs' }, actor).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IntegrationUpdateError)
    expect((error as Error).message).toMatch(/servida pelo próprio app/)
    expect(mocks.updateOne).not.toHaveBeenCalled()
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('demais integrações continuam editáveis', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(storedDoc())
    const detail = await getIntegrationDetail('pusher')
    expect(detail.swaggerUrlManaged).toBe(false)
  })
})

describe('updateIntegration("pusher") — cluster ou host próprio', () => {
  const pusherDoc = (publicValues: Record<string, unknown>) => ({
    integrationId: 'pusher',
    environment: 'externo',
    debugMode: false,
    publicValues: { appId: 'app', key: 'key', cluster: 'sa1', ...publicValues },
    secretValues: {},
  })

  it('recusa trocar para host próprio sem a URL do servidor, sem gravar', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(pusherDoc({ mode: 'cluster' }))
    const error = await updateIntegration('pusher', { publicValues: { mode: 'host' } }, actor).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IntegrationUpdateError)
    expect((error as Error).message).toBe('URL do servidor: preenchimento obrigatório')
    expect(mocks.updateOne).not.toHaveBeenCalled()
  })

  it('grava o modo host com a URL e preserva o cluster salvo', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(pusherDoc({ mode: 'cluster' }))
    await updateIntegration('pusher', { publicValues: { mode: 'host', url: 'http://devteam-soketi:6001' } }, actor)
    const [, update] = mocks.updateOne.mock.calls[0]
    expect(update.$set['publicValues.mode']).toBe('host')
    expect(update.$set['publicValues.url']).toBe('http://devteam-soketi:6001')
    expect(update.$set).not.toHaveProperty('publicValues.cluster')
  })

  it('não exige a URL quando só campos do modo cluster mudam', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(pusherDoc({ mode: 'cluster' }))
    await updateIntegration('pusher', { publicValues: { cluster: 'us2' } }, actor)
    expect(mocks.updateOne.mock.calls[0][1].$set['publicValues.cluster']).toBe('us2')
  })
})
