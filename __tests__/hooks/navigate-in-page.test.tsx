/** @vitest-environment happy-dom */

import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { navigateInPage, urlFilterCodecs, useUrlFilters } from '@/hooks/useUrlFilters'

const DEFAULTS = { aba: 'conversas' }
const SCHEMA = { aba: urlFilterCodecs.string(['conversas', 'memorias']) }

function Tabs() {
  const [{ aba }] = useUrlFilters(DEFAULTS, SCHEMA)
  return <div data-testid="aba">{aba}</div>
}

beforeEach(() => window.history.replaceState(null, '', '/agente-secretario'))
afterEach(() => vi.restoreAllMocks())

describe('navigateInPage (OPE-207)', () => {
  it('mesmo caminho: empilha no histórico, avisa quem lê a URL e devolve true', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    render(<Tabs />)
    expect(screen.getByTestId('aba').textContent).toBe('conversas')
    let handled = false
    act(() => {
      handled = navigateInPage('/agente-secretario?aba=memorias&conversa=5531999999999')
    })
    expect(handled).toBe(true)
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('?aba=memorias&conversa=5531999999999')
    expect(screen.getByTestId('aba').textContent).toBe('memorias')
  })

  it('outro caminho: devolve false e não toca no histórico (a navegação do Next segue)', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    expect(navigateInPage('/integracoes/ia?aba=agente-secretario&secao=memorias')).toBe(false)
    expect(pushState).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/agente-secretario')
  })
})
