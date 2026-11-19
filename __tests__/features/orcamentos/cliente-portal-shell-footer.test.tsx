/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Rodapé da barra lateral do portal: o item dos agentes fica sempre montado (acompanha o liga/desliga
 * em tempo real) e o rodapé com divisor só aparece quando o item renderiza algo (`empty:hidden`).
 */

const state = vi.hoisted(() => ({ on: false, props: null as unknown, headerProps: null as unknown }))
vi.mock('framer-motion', () => framerMotionMock())
// Menu do portal com os plugins (slot `portal.nav`, OPE-172): sem plugins ativos.
vi.mock('@/features/plugins/client/usePluginNav', () => ({ useNavWithPlugins: (base: unknown) => base }))
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
vi.mock('@/features/opex-agent/components/agents/AgentChatNavItem', () => ({
  AgentChatNavItem: (props: { variant?: string }) => {
    if (props.variant === 'header') {
      state.headerProps = props
      return state.on ? <div data-testid="agent-header-item">agentes</div> : null
    }
    state.props = props
    return state.on ? <li data-testid="agent-nav-item">agentes</li> : null
  },
}))

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

afterEach(() => {
  cleanup()
  state.on = false
  state.props = null
  state.headerProps = null
  window.innerWidth = 1024
})

describe('rodapé da barra lateral do portal', () => {
  it('com tudo desligado na carga, o item fica montado (para ligar em tempo real) e o rodapé vazio fica oculto', () => {
    renderShell(base)
    expect(state.props).toMatchObject({ initial: { opex: false, maddox: false }, client: { clientId: 'c1', userId: 'u1' } })
    expect(screen.queryByTestId('agent-nav-item')).toBeNull()
    for (const footer of screen.getAllByTestId('sidebar-footer-items')) {
      expect(footer.matches(':empty')).toBe(true)
      expect(footer.classList.contains('empty:hidden')).toBe(true)
    }
  })

  it('com algum agente ligado, o item aparece dentro do rodapé com divisor', () => {
    state.on = true
    renderShell({ ...base, maddoxEnabled: true })
    const item = screen.getAllByTestId('agent-nav-item')[0]!
    const footer = item.closest('[data-testid="sidebar-footer-items"]')!
    expect(footer.classList.contains('border-t')).toBe(true)
    expect(footer.matches(':empty')).toBe(false)
  })
})

describe('cabeçalho do portal no celular (OPE-168)', () => {
  it('logo leva ao dashboard do portal e o agente fica no cabeçalho, não na gaveta', () => {
    window.innerWidth = 500
    state.on = true
    renderShell({ ...base, opexEnabled: true })
    const header = screen.getByTestId('mobile-app-header')
    expect(header.querySelector('a')?.getAttribute('href')).toBe('/cliente/dashboard')
    expect(state.headerProps).toMatchObject({ variant: 'header', initial: { opex: true, maddox: false }, client: { clientId: 'c1', userId: 'u1' } })
    expect(header.contains(screen.getByTestId('agent-header-item'))).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    expect(screen.getByRole('dialog', { name: 'Menu do portal' })).toBeTruthy()
    expect(screen.queryByTestId('sidebar-footer-items')).toBeNull()
    expect(screen.queryByTestId('agent-nav-item')).toBeNull()
  })

  it('sem agentes ligados, a área de atalhos fica vazia e oculta', () => {
    window.innerWidth = 500
    renderShell(base)
    const actions = screen.getByTestId('mobile-app-header-actions')
    expect(actions.matches(':empty')).toBe(true)
    expect(actions.classList.contains('empty:hidden')).toBe(true)
  })
})
