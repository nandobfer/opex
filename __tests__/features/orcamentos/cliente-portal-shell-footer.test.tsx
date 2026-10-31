/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Rodapé da barra lateral do portal: com algum agente de chat ligado para o cliente, o item dos
 * agentes aparece; sem nenhum, nem o rodapé (a lista com o divisor) fica no DOM.
 */

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/navigation', () => ({ usePathname: () => '/cliente/dashboard', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/pusher/RealtimeStatusBanner', () => ({ RealtimeStatusBanner: () => null }))
vi.mock('@/features/orcamentos/portal/components/ClienteContextBar', () => ({ ClienteContextBar: () => null }))
vi.mock('@/features/opex-agent/components/agents/AgentChatNavItem', () => ({ AgentChatNavItem: () => <li data-testid="agent-nav-item">agentes</li> }))

import { ClientePortalShell } from '@/features/orcamentos/portal/ClientePortalShell'
import { ClientePortalProvider, type ClientePortalSession } from '@/features/orcamentos/portal/ClientePortalContext'

const base: ClientePortalSession = { clientId: 'c1', clientName: 'ACME', isAdmin: false, preview: false, user: { id: 'u1', username: 'ana', email: null }, clients: [], opexEnabled: false, maddoxEnabled: false }

function renderShell(session: ClientePortalSession) {
  return render(
    <ClientePortalProvider session={session}>
      <ClientePortalShell session={session}>
        <p>conteúdo</p>
      </ClientePortalShell>
    </ClientePortalProvider>,
  )
}

afterEach(cleanup)

describe('rodapé da barra lateral do portal', () => {
  it('sem nenhum agente ligado: sem item e sem o rodapé com divisor', () => {
    const { container } = renderShell(base)
    expect(screen.queryByTestId('agent-nav-item')).toBeNull()
    expect(container.querySelector('ul.border-t.border-sidebar-border')).toBeNull()
  })

  it.each([
    ['só o Agente Opex', { opexEnabled: true }],
    ['só o Agente Maddox', { maddoxEnabled: true }],
  ])('%s ligado: o item dos agentes aparece no rodapé', (_label, patch) => {
    const { container } = renderShell({ ...base, ...patch })
    const item = screen.getAllByTestId('agent-nav-item')[0]!
    expect(item.closest('ul.border-t.border-sidebar-border')).not.toBeNull()
    expect(container.querySelector('ul.border-t.border-sidebar-border')).not.toBeNull()
  })
})
