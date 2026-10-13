/** @vitest-environment jsdom */

import { fireEvent, render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'

import { useFillViewportHeight } from '@/features/integrations/hooks/useScrollViewportHeight'
import { APP_SCROLL_CONTAINER_ID } from '@/hooks/usePageVirtualizer'

const rect = (top: number): DOMRect =>
  ({ top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

function Probe({ enabled = true, minHeight }: { enabled?: boolean; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const height = useFillViewportHeight(ref, enabled, minHeight)
  return <div ref={ref} data-testid="probe">{height === undefined ? 'sem-medida' : height}</div>
}

/** Monta o bloco dentro do `<main id="main-content">` (o contêiner rolável do app). */
function mount({ containerHeight, offset, enabled = true, minHeight }: { containerHeight: number; offset: number; enabled?: boolean; minHeight?: number }) {
  const { container } = render(
    <main id={APP_SCROLL_CONTAINER_ID} style={{ overflowY: 'auto' }}>
      <Probe enabled={enabled} minHeight={minHeight} />
    </main>,
  )
  const main = container.querySelector('main')!
  Object.defineProperty(main, 'clientHeight', { configurable: true, value: containerHeight })
  Object.defineProperty(main, 'scrollTop', { configurable: true, value: 0 })
  main.getBoundingClientRect = () => rect(0)
  const probe = container.querySelector('[data-testid="probe"]')!
  probe.getBoundingClientRect = () => rect(offset)
  // A medição roda no efeito e a cada resize; dispara um para medir com os rects já ajustados.
  fireEvent(window, new Event('resize'))
  return probe
}

describe('useFillViewportHeight', () => {
  it('preenche a área visível a partir do topo do próprio bloco', async () => {
    mount({ containerHeight: 600, offset: 200 })
    await waitFor(() => expect(document.querySelector('[data-testid="probe"]')!.textContent).toBe('400'))
  })

  it('nunca fica abaixo do mínimo (a página rola quando o cabeçalho ocupa quase tudo)', async () => {
    mount({ containerHeight: 600, offset: 550, minHeight: 320 })
    await waitFor(() => expect(document.querySelector('[data-testid="probe"]')!.textContent).toBe('320'))
  })

  it('desligado não mede', () => {
    mount({ containerHeight: 600, offset: 200, enabled: false })
    expect(document.querySelector('[data-testid="probe"]')!.textContent).toBe('sem-medida')
  })
})
