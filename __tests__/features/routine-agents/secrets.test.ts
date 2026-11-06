import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection, type FakeCollection } from '../../helpers/fake-collection'

/**
 * Segredos do agente rotineiro (critério aprovado OPE-130, D5): só daquele agente, o valor só entra
 * (cifrado) e nunca sai — nem no DTO, nem na auditoria, nem no evento, nem no log.
 */

const VALUE = 'ghp_ValorMuitoSecreto_42'
const holder = vi.hoisted(() => ({
  agents: null as unknown as FakeCollection,
  secrets: null as unknown as FakeCollection,
  audit: [] as unknown[],
  events: [] as unknown[],
  logs: [] as unknown[],
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: async (input: unknown) => void holder.audit.push(input), AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async (event: string, payload: unknown) => void holder.events.push({ event, payload }) }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: (...args: unknown[]) => void holder.logs.push(args), warn: (...args: unknown[]) => void holder.logs.push(args), error: (...args: unknown[]) => void holder.logs.push(args) }) }))
vi.mock('@/lib/db/models/RoutineAgent', () => ({
  get RoutineAgent() {
    return holder.agents
  },
  get RoutineAgentSecret() {
    return holder.secrets
  },
}))

import { createRoutineSecret, deleteRoutineSecret, listRoutineSecrets, loadRoutineSecretVault, updateRoutineSecret } from '@/features/routine-agents/server/secrets'
import { routineSecretCreateSchema } from '@/features/routine-agents/schemas'

let agentId = ''
beforeEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64')
  holder.agents = createFakeCollection()
  holder.secrets = createFakeCollection()
  holder.audit = []
  holder.events = []
  holder.logs = []
  agentId = String(holder.agents.insert({ name: 'Vagas', slug: 'vagas' })._id)
})

const input = { name: 'GITHUB_TOKEN', description: 'Token do GitHub', allowedHosts: ['api.github.com'], value: VALUE }

describe('segredos do agente rotineiro', () => {
  it('cria com o valor cifrado; nada do que sai (DTO, lista, auditoria, evento, log) traz o valor', async () => {
    const dto = await createRoutineSecret(agentId, input, 'local')
    expect(dto).toMatchObject({ name: 'GITHUB_TOKEN', description: 'Token do GitHub', allowedHosts: ['api.github.com'], lastUsedAt: null })
    const stored = holder.secrets.docs[0] as { value: unknown }
    expect(JSON.stringify(stored.value)).not.toContain(VALUE)
    const everything = JSON.stringify([dto, await listRoutineSecrets(agentId), holder.audit, holder.events, holder.logs])
    expect(everything).not.toContain(VALUE)
    expect(everything).not.toContain(VALUE.slice(0, 8))
    const vault = await loadRoutineSecretVault(agentId)
    expect(vault.value('GITHUB_TOKEN')).toBe(VALUE)
    expect(vault.list()).toEqual([{ name: 'GITHUB_TOKEN', description: 'Token do GitHub', allowedHosts: ['api.github.com'] }])
  })

  it('editar com o valor vazio mantém o atual; com valor novo, troca', async () => {
    const dto = await createRoutineSecret(agentId, input, 'local')
    await updateRoutineSecret(agentId, dto.id, { ...input, description: 'Novo', value: '' }, 'local')
    expect((await loadRoutineSecretVault(agentId)).value('GITHUB_TOKEN')).toBe(VALUE)
    await updateRoutineSecret(agentId, dto.id, { ...input, value: 'outro-valor' }, 'local')
    expect((await loadRoutineSecretVault(agentId)).value('GITHUB_TOKEN')).toBe('outro-valor')
    expect(JSON.stringify(holder.audit)).not.toContain('outro-valor')
  })

  it('nome repetido → 409; nome inválido é recusado pelo schema; excluir remove', async () => {
    const dto = await createRoutineSecret(agentId, input, 'local')
    await expect(createRoutineSecret(agentId, input, 'local')).rejects.toMatchObject({ status: 409, code: 'ROUTINE_SECRET_NAME_TAKEN' })
    expect(routineSecretCreateSchema.safeParse({ ...input, name: 'github-token' }).success).toBe(false)
    expect(routineSecretCreateSchema.safeParse({ ...input, allowedHosts: ['http://x'] }).success).toBe(false)
    await deleteRoutineSecret(agentId, dto.id, 'local')
    expect(await listRoutineSecrets(agentId)).toEqual([])
  })

  it('segredos de outro agente não entram no cofre', async () => {
    const other = String(holder.agents.insert({ name: 'Outro', slug: 'outro' })._id)
    await createRoutineSecret(other, input, 'local')
    expect((await loadRoutineSecretVault(agentId)).list()).toEqual([])
  })

  it('o registro de uso que falha ao gravar não derruba a chamada (só aviso no log)', async () => {
    await createRoutineSecret(agentId, input, 'local')
    const vault = await loadRoutineSecretVault(agentId)
    ;(holder.secrets as unknown as { updateMany: () => Promise<never> }).updateMany = async () => {
      throw new Error('banco fora')
    }
    expect(() => vault.markUsed(['GITHUB_TOKEN'])).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(JSON.stringify(holder.logs)).toContain('último uso do segredo não gravado')
  })
})
