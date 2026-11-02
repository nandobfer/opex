/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** OPE-113: o card "O que é o Engramind" fica no fim da página, com Configurar e Saiba mais. */

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/engramind', useSearchParams: () => new URLSearchParams() }))
vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/engramind/hooks/useEngramindConnection', () => ({ useEngramindConnection: () => ({ isLoading: false, isError: false, data: { configured: true } }) }))
// A rede de verdade é coberta em network.test.tsx: aqui só a ordem e o card.
vi.mock('@/features/engramind/components/network/EngramindNetwork', async () => {
  const { AboutCard } = await import('@/features/engramind/components/page/AboutCard')
  return {
    EngramindNetwork: ({ onConfigure }: { onConfigure: () => void }) => (
      <div>
        <div data-testid="network-area" />
        <AboutCard onConfigure={onConfigure} />
      </div>
    ),
  }
})

import { EngramindPage } from '@/features/engramind/components/page/EngramindPage'

afterEach(() => {
  cleanup()
  push.mockReset()
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
})
