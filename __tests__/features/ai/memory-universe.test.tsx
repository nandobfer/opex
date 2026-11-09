/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

/**
 * Universo único das memórias de cada agente (critério aprovado OPE-148): um card só por página de memórias,
 * com todas as memórias que o agente alcança (na central, só as que valem nela), o card inteiro na altura
 * visível (OPE-151) e os canais de cliente rotulados pelo nome do cliente.
 */

const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }))

vi.mock('@engramind/client/react', () => ({
  NETWORK_FILL_BLOCK_PROPS: { 'data-network-fill-root': 'block' },
  AgentUniverse: (props: Record<string, unknown>) => {
    seen.props.push(props)
    return <div data-testid="agent-universe" />
  },
}))
vi.mock('@/features/engramind/components/OpexEngramindProvider', () => ({ OpexEngramindProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/ai/hooks/useMemories', () => ({
  useMemoriesRealtime: () => {},
  useMemoriesMeta: () => ({ data: { migrationPending: false, availability: { unavailable: false, since: null, lastOkAt: null, reason: null }, outside: [{ consumer: 'opex', channels: ['opex', 'agentes/opex/global'], outside: 3 }] } }),
}))
vi.mock('@/features/ai/components/memories/SelfMemorySwitch', () => ({ SelfMemorySwitch: ({ consumer }: { consumer: string }) => <div data-testid={`self-memory-${consumer}`} /> }))

import { memoryUniverseOf } from '@/features/ai/memory-universe'
import { clientChannelLabels } from '@/features/engramind/network/channel-labels'
import { outsideForUniverse } from '@/features/ai/components/memories/MemoriesNotices'
import { OpexMemoriesSection } from '@/features/opex-agent/components/settings/OpexMemoriesSection'
import { DeveloperMemoriesSection } from '@/features/agentic/components/DeveloperMemoriesSection'
import { MemoriesSection as AdversarialMemoriesSection } from '@/features/adversarial-agent/components/settings/MemoriesSection'
import { MemoriesSection as ArchitectMemoriesSection } from '@/features/architect-agent/components/settings/MemoriesSection'
import type { MemoriesMetaDto } from '@/features/ai/types'

const CENTRAL = '6ac98c6c0abde1d643c85903'

afterEach(() => {
  cleanup()
  seen.props = []
})

describe('memoryUniverseOf (puro)', () => {
  it('cada agente no Engramind com o canal inicial da lista global dele, sem filtro', () => {
    expect(memoryUniverseOf('opex')).toMatchObject({ agent: 'opex/opex', defaultCreateChannel: 'agentes/opex/global', channels: null })
    expect(memoryUniverseOf('maddox')).toMatchObject({ agent: 'opex/maddox', defaultCreateChannel: 'agentes/maddox/global', channels: null })
    expect(memoryUniverseOf('adversario')).toMatchObject({ agent: 'opex/adversario', defaultCreateChannel: 'agentes/adversario', channels: null })
    expect(memoryUniverseOf('arquiteto')).toMatchObject({ agent: 'opex/arquiteto', defaultCreateChannel: 'agentes/arquiteto', channels: null })
    expect(memoryUniverseOf('desenvolvedor')).toMatchObject({ agent: 'opex/desenvolvedor', defaultCreateChannel: 'agentes/desenvolvedor/global', channels: null })
  })

  it('na central, só o que vale nela e a Nova memória começa no canal da central', () => {
    const def = memoryUniverseOf('desenvolvedor', { centralId: CENTRAL })
    expect(def.defaultCreateChannel).toBe(`agentes/desenvolvedor/central/${CENTRAL}`)
    expect(def.channels).toEqual(['opex', 'agentes/desenvolvedor/global', `agentes/desenvolvedor/central/${CENTRAL}`])
  })

  it('central inválida: volta ao universo completo do agente', () => {
    expect(memoryUniverseOf('desenvolvedor', { centralId: 'nao-e-id' }).channels).toBeNull()
  })
})

describe('clientChannelLabels (puro)', () => {
  it('rotula os canais de cliente do Opex e do Maddox pelo nome do cliente', () => {
    const labels = clientChannelLabels([{ id: 'c1', name: 'Sipal' }, { id: 'c2', name: '  ' }])
    expect(labels.get('agentes/opex/clientes/c1')).toMatchObject({ title: 'Sipal' })
    expect(labels.get('agentes/maddox/clientes/c1')?.hint).toContain('Agente Maddox')
    expect(labels.has('agentes/opex/clientes/c2')).toBe(false)
  })
})

describe('outsideForUniverse (puro)', () => {
  const meta = {
    outside: [
      { consumer: 'desenvolvedor', channels: ['opex', 'agentes/desenvolvedor/global', 'agentes/desenvolvedor/central/a'], outside: 2 },
      { consumer: 'desenvolvedor', channels: ['opex', 'agentes/desenvolvedor/global', 'agentes/desenvolvedor/central/b'], outside: 5 },
      { consumer: 'opex', channels: ['opex'], outside: 9 },
    ],
  } as unknown as MemoriesMetaDto
  it('soma só os turnos do próprio agente; com canais, só os que cabem neles', () => {
    expect(outsideForUniverse(meta, { consumer: 'desenvolvedor', channels: null })).toBe(5)
    expect(outsideForUniverse(meta, { consumer: 'desenvolvedor', channels: ['opex', 'agentes/desenvolvedor/global', 'agentes/desenvolvedor/central/a'] })).toBe(2)
    expect(outsideForUniverse(meta, { consumer: 'arquiteto', channels: null })).toBe(0)
  })
})

describe('seções de memórias: um card só, o universo do agente', () => {
  it('Agente Opex: um universo na altura visível (card-bloco, OPE-151), com avisos e sem seletor de cliente', () => {
    render(<OpexMemoriesSection tab="agente-opex" />)
    expect(screen.getAllByTestId('agent-universe-card')).toHaveLength(1)
    expect(screen.getAllByTestId('agent-universe')).toHaveLength(1)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(seen.props.at(-1)).toMatchObject({ agent: 'opex/opex', defaultCreateChannel: 'agentes/opex/global', fill: 'viewport', includeChannel: null })
    expect(screen.getByTestId('agent-universe-card').getAttribute('data-network-fill-root')).toBe('block')
    expect(screen.getByTestId('memories-outside').textContent).toContain('3 memórias')
  })

  it('Agente Maddox, Adversário e Arquiteto: o universo do próprio agente', () => {
    render(<OpexMemoriesSection tab="agente-maddox" />)
    expect(seen.props.at(-1)).toMatchObject({ agent: 'opex/maddox' })
    cleanup()
    render(<AdversarialMemoriesSection />)
    expect(seen.props.at(-1)).toMatchObject({ agent: 'opex/adversario' })
    cleanup()
    render(<ArchitectMemoriesSection />)
    expect(screen.getAllByTestId('agent-universe-card')).toHaveLength(1)
    expect(seen.props.at(-1)).toMatchObject({ agent: 'opex/arquiteto' })
  })

  it('central: filtra para opex, global e o canal da central, sem o aprendizado autônomo', () => {
    render(<DeveloperMemoriesSection centralId={CENTRAL} />)
    expect(screen.getAllByTestId('agent-universe-card')).toHaveLength(1)
    expect(screen.queryByTestId('self-memory-desenvolvedor')).toBeNull()
    const include = seen.props.at(-1)!.includeChannel as (slug: string) => boolean
    expect(include('opex')).toBe(true)
    expect(include(`agentes/desenvolvedor/central/${CENTRAL}`)).toBe(true)
    expect(include('agentes/desenvolvedor/central/aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false)
  })

  it('desenvolvedor fora da central: todas as memórias do agente', () => {
    render(<DeveloperMemoriesSection />)
    expect(screen.getByTestId('self-memory-desenvolvedor')).toBeTruthy()
    expect(seen.props.at(-1)).toMatchObject({ agent: 'opex/desenvolvedor', includeChannel: null })
  })
})
