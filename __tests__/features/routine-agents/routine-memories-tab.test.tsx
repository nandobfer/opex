/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

/** Aba Memórias do rotineiro (critério aprovado OPE-130, D10/D11): um card com o universo do agente da lib. */

const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }))

vi.mock('@engramind/client/react', () => ({
  NETWORK_FILL_BLOCK_PROPS: { 'data-network-fill-root': 'block' },
  AgentUniverse: (props: Record<string, unknown>) => {
    seen.props.push(props)
    return <div data-testid="agent-universe" />
  },
}))
vi.mock('@/features/engramind/components/OpexEngramindProvider', () => ({ OpexEngramindProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

import { RoutineMemoriesTab } from '@/features/routine-agents/components/page/RoutineMemoriesTab'

afterEach(() => cleanup())

describe('aba Memórias do agente rotineiro', () => {
  it('um card só, com o universo do agente opex/rotineiro-<slug> e o canal próprio como inicial da Nova memória', () => {
    render(<RoutineMemoriesTab slug="vagas" />)
    expect(screen.getAllByTestId('agent-universe')).toHaveLength(1)
    expect(screen.getByText('Rede de memórias')).toBeTruthy()
    // OPE-148: card compartilhado, sem filtro de canais nem avisos. OPE-151: o card inteiro na altura visível
    // (âncora "bloco" + fill="viewport"), sem a altura compacta de antes.
    expect(seen.props.at(-1)).toMatchObject({ agent: 'opex/rotineiro-vagas', defaultCreateChannel: 'agentes/rotineiros/vagas', fill: 'viewport', includeChannel: null })
    expect(seen.props.at(-1)).not.toHaveProperty('className')
    expect(screen.getByTestId('agent-universe-card').getAttribute('data-network-fill-root')).toBe('block')
    expect(screen.queryByTestId('memories-notices')).toBeNull()
  })
})
