import { describe, expect, it } from 'vitest'
import { memoryChannelInfo, memoryDetailPath, memoryListBasePath, noticeMemoryRef } from '@/features/ai/memory-notice'

/** OPE-139: referência de memória nos avisos da mesa (só lista, id e escopo) e a rota de leitura de cada lista. */

const C = 'a'.repeat(24)
const K = 'b'.repeat(24)

describe('referência de memória do aviso', () => {
  it('lista global: sem escopo; rota da lista do agente', () => {
    const ref = noticeMemoryRef('developer-global', { id: 'm_1', centralId: C }, 'created')
    expect(ref).toEqual({ kind: 'memory', agentId: 'developer-global', memoryId: 'm_1', action: 'created' })
    expect(memoryDetailPath(ref)).toBe('/ai/agents/developer-global/memories/m_1')
  })

  it('lista da central: a central vem da memória ou do escopo; rota da central', () => {
    expect(noticeMemoryRef('developer-central', { id: 'm_2', centralId: C }, 'updated')).toMatchObject({ centralId: C })
    const ref = noticeMemoryRef('developer-central', { id: 'm_2' }, 'updated', { centralId: C })
    expect(ref).toEqual({ kind: 'memory', agentId: 'developer-central', memoryId: 'm_2', centralId: C, action: 'updated' })
    expect(memoryDetailPath(ref)).toBe(`/agentic/centrals/${C}/memories/m_2`)
  })

  it('lista de um cliente: rota do cliente', () => {
    const ref = noticeMemoryRef('maddox-client-specific', { id: 'm_3', clientId: K }, 'pinned')
    expect(memoryDetailPath(ref)).toBe(`/ai/agents/maddox-client-specific/clients/${K}/memories/m_3`)
    expect(memoryListBasePath('maddox-client-specific', { clientId: K })).toBe(`/ai/agents/maddox-client-specific/clients/${K}/memories`)
  })

  it('canal: título da lista e slug do Engramind (central entra no slug)', () => {
    expect(memoryChannelInfo('developer-global')).toEqual({ title: 'Memórias globais do agente desenvolvedor', slug: 'agentes/desenvolvedor/global' })
    expect(memoryChannelInfo('developer-central', { centralId: C })).toEqual({ title: 'Memórias da central', slug: `agentes/desenvolvedor/central/${C}` })
    expect(memoryChannelInfo('developer-central')).toMatchObject({ slug: null })
  })
})
