import { fireEvent, screen } from '@testing-library/react'

/**
 * OPE-142 (lib 0.6.0): o card de estatísticas da rede começa recolhido em qualquer largura. Os testes que leem os
 * números, a legenda "Por canal" ou as listas do card o abrem antes, pelo botão do canto.
 */
export async function openStats(): Promise<HTMLElement> {
  if (!screen.queryByTestId('network-stats')) fireEvent.click(await screen.findByTestId('network-stats-toggle'))
  return screen.findByTestId('network-stats')
}
