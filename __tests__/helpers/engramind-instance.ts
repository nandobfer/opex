import { vi } from 'vitest'
import { instanceAppOf, LEGACY_NAMESPACE, type ChannelNamespace } from '@/features/engramind/channel-namespace'

/**
 * Mock de `@/features/engramind/server/instance` (OPE-206) para os testes que não exercitam o app nem o modo dos
 * nomes: a instância do dono nos nomes antigos (`{ app: 'opex', prefixed: false }`), sem manutenção.
 *
 * Uso: `vi.mock('@/features/engramind/server/instance', async () => (await import('../../helpers/engramind-instance')).instanceMock())`
 * e, para trocar o espaço de nomes ou ligar a manutenção num caso, `instanceState` deste módulo.
 */
export const instanceState: { ns: ChannelNamespace; maintenance: { migrationId: string; startedAt: Date } | null } = {
  ns: LEGACY_NAMESPACE,
  maintenance: null,
}

export function resetInstanceState(): void {
  instanceState.ns = LEGACY_NAMESPACE
  instanceState.maintenance = null
}

export function instanceMock() {
  const MEMORY_MAINTENANCE_NOTICE = 'Migrando canais de memória'
  const MEMORY_MAINTENANCE_CODE = 'ENGRAMIND_MIGRATING'
  return {
    MEMORY_MAINTENANCE_NOTICE,
    MEMORY_MAINTENANCE_CODE,
    resetInstanceCache: vi.fn(),
    appOfWhoami: (whoami: { app: { slug: string } }) => instanceAppOf(whoami.app.slug),
    instanceApp: vi.fn(async () => instanceState.ns.app),
    channelNamespace: vi.fn(async () => instanceState.ns),
    channelNamespaceOrLegacy: vi.fn(async () => instanceState.ns),
    setChannelNaming: vi.fn(async (naming: 'legacy' | 'prefixed') => {
      instanceState.ns = { ...instanceState.ns, prefixed: naming === 'prefixed' }
    }),
    memoryMaintenance: vi.fn(async () => instanceState.maintenance),
    isMemoryMaintenance: vi.fn(async () => Boolean(instanceState.maintenance)),
    waitForMemoryMaintenance: vi.fn(async () => false),
    assertNoMemoryMaintenance: vi.fn(async () => {
      if (!instanceState.maintenance) return
      const { DomainError } = await import('@/lib/api/route')
      throw new DomainError(503, `${MEMORY_MAINTENANCE_NOTICE}: tente de novo em alguns minutos.`, MEMORY_MAINTENANCE_CODE)
    }),
    setMemoryMaintenance: vi.fn(async (value: { migrationId: string; startedAt: Date } | null) => {
      instanceState.maintenance = value
    }),
  }
}
