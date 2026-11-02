import { describe, expect, it } from 'vitest'
import { activeNetworkFilterChips, clearNetworkFilters, DEFAULT_NETWORK_FILTERS, hasActiveFilters, matchesFilters, networkFiltersSchema, type NetworkFilters } from '@/features/engramind/network/filters'
import { channelBatches } from '@/features/engramind/hooks/useNetworkSearch'
import type { NetworkMemory } from '@/features/engramind/network/types'

/** OPE-113: busca e filtros da rede no padrão de `/tarefas` (listas, período, chips e navegador). */

const memory = (extra: Partial<NetworkMemory> = {}): NetworkMemory => ({
  id: 'a', channel: 'opex', title: 'T', text: 'Texto', category: 'PROJECT_RULES', status: 'active', version: 1,
  createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z', retrievals: 0, injections: 0, lastRetrievedAt: null, verifiedAt: null, stale: false, author: 'opex/opex', authorAgent: 'opex/opex', ...extra,
})
const filters = (extra: Partial<NetworkFilters>): NetworkFilters => ({ ...DEFAULT_NETWORK_FILTERS, ...extra })

describe('filtros da rede', () => {
  it('casam por listas (canal, status, categoria, autor), período e a busca', () => {
    const item = memory()
    expect(matchesFilters(item, DEFAULT_NETWORK_FILTERS, null)).toBe(true)
    expect(matchesFilters(item, filters({ channels: ['x', 'opex'] }), null)).toBe(true)
    expect(matchesFilters(item, filters({ channels: ['x'] }), null)).toBe(false)
    expect(matchesFilters(item, filters({ statuses: ['archived', 'permanent'] }), null)).toBe(false)
    expect(matchesFilters(item, filters({ categories: ['PROJECT_RULES'] }), null)).toBe(true)
    expect(matchesFilters(item, filters({ authors: ['outro/bot'] }), null)).toBe(false)
    expect(matchesFilters(item, filters({ from: '2026-10-20', to: '2026-10-20' }), null)).toBe(true)
    expect(matchesFilters(item, filters({ from: '2026-10-21' }), null)).toBe(false)
    expect(matchesFilters(item, filters({ to: '2026-10-19' }), null)).toBe(false)
    expect(matchesFilters(item, DEFAULT_NETWORK_FILTERS, new Set(['b']))).toBe(false)
  })

  it('arquivados e apps não contam como destaque; a busca e os demais filtros sim', () => {
    expect(hasActiveFilters(filters({ includeArchived: true, apps: ['opex'] }), null)).toBe(false)
    expect(hasActiveFilters(filters({ from: '2026-10-01' }), null)).toBe(true)
    expect(hasActiveFilters(DEFAULT_NETWORK_FILTERS, new Set())).toBe(true)
  })

  it('chips removíveis, um por valor; Limpar mantém os apps escolhidos', () => {
    const current = filters({ search: 'pnpm', channels: ['opex', 'x'], statuses: ['permanent'], from: '2026-10-01', to: '2026-10-31', includeArchived: true, apps: ['opex'] })
    const chips = activeNetworkFilterChips(current)
    expect(chips.map((chip) => chip.label)).toEqual(['Busca: pnpm', 'Canal: opex', 'Canal: x', 'Status: Fixada', 'Período: 01/10/2026 a 31/10/2026', 'Mostrando arquivados'])
    expect(chips.find((chip) => chip.key === 'channels:opex')!.remove).toEqual({ channels: ['x'] })
    expect(clearNetworkFilters(current)).toEqual({ ...DEFAULT_NETWORK_FILTERS, apps: ['opex'] })
  })

  it('o schema do navegador recupera valores inválidos sem perder os válidos', () => {
    const parsed = networkFiltersSchema.parse({ search: 'ok', channels: 'opex', from: '01/10/2026', includeArchived: 'sim', apps: ['opex'] })
    expect(parsed).toEqual({ ...DEFAULT_NETWORK_FILTERS, search: 'ok', apps: ['opex'] })
  })

  it('a busca cita os canais em lotes de 50, sem repetir; sem canais, um lote sem citação', () => {
    const many = Array.from({ length: 120 }, (_, index) => `c${index}`)
    const batches = channelBatches([...many, 'c1'])
    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 20])
    expect(new Set(batches.flat()).size).toBe(120)
    expect(channelBatches([])).toEqual([[]])
  })
})
