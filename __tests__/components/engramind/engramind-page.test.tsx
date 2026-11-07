/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** OPE-113: o card "O que é o Engramind" fica no fim da página, com Configurar e Saiba mais. */

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/engramind', useSearchParams: () => new URLSearchParams() }))
vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
const connection = vi.hoisted(() => ({ isLoading: false }))
vi.mock('@/features/engramind/hooks/useEngramindConnection', () => ({ useEngramindConnection: () => ({ isLoading: connection.isLoading, isError: false, data: { configured: true } }) }))
// A rede de verdade é coberta em network.test.tsx: aqui só a ordem e o card.
// OPE-116: a rede vem de `@engramind/client` dentro do `OpexEngramindProvider` (coberto em network.test.tsx).
vi.mock('@/features/engramind/components/OpexEngramindProvider', () => ({ OpexEngramindProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
const holder = vi.hoisted(() => ({ About: null as null | ((props: { onConfigure: () => void }) => React.ReactNode) }))
vi.mock('@engramind/client/react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  EngramindNetwork: ({ onConfigure, fill }: { onConfigure: () => void; fill?: boolean }) => {
    const About = holder.About!
    return (
      <div data-testid="engramind-network" data-fill={String(fill)}>
        <div data-testid="network-area" />
        <About onConfigure={onConfigure} />
      </div>
    )
  },
}))

import { EngramindPage } from '@/features/engramind/components/page/EngramindPage'
import { AboutCard } from '@/features/engramind/components/page/AboutCard'

holder.About = AboutCard

afterEach(() => {
  cleanup()
  push.mockReset()
  connection.isLoading = false
})

describe('EngramindPage', () => {
  it('o card fica depois da rede; Configurar leva à aba Conexão da integração', () => {
    render(<EngramindPage />)
    const actions = screen.getByTestId('about-actions')
    expect(screen.getByTestId('network-area').compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Configurar/ }))
    expect(push).toHaveBeenCalledWith('/integracoes/engramind?aba=conexao')
  })

  it('Saiba mais abre o diálogo "Sobre o Engramind"', async () => {
    render(<EngramindPage />)
    fireEvent.click(screen.getByRole('button', { name: /Saiba mais/ }))
    expect(await screen.findByText('Sobre o Engramind')).toBeTruthy()
  })

  // Critério aprovado OPE-148: a rede de /engramind (e o skeleton dela) ocupa toda a altura disponível.
  it('a rede preenche a altura disponível (fill)', () => {
    render(<EngramindPage />)
    expect(screen.getByTestId('engramind-network').getAttribute('data-fill')).toBe('true')
  })

  it('o skeleton da página também preenche a altura disponível (fill)', () => {
    connection.isLoading = true
    render(<EngramindPage />)
    expect(screen.getByTestId('engramind-page-skeleton')).toBeTruthy()
    expect(screen.getByTestId('network-skeleton').getAttribute('data-fill')).toBe('true')
  })
})
