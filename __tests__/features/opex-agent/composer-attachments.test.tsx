/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/** Campo do chat sem anexos (conversa com um agente rotineiro, OPE-160): sem botão de anexar nem dica de arquivos. */

vi.mock('framer-motion', () => framerMotionMock())

import { OpexComposer } from '@/features/opex-agent/components/chat/OpexComposer'

afterEach(() => cleanup())

const attachments = (enabled?: boolean) => ({ items: [], onFiles: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn(), ...(enabled === undefined ? {} : { enabled }) })

describe('OpexComposer e os anexos', () => {
  it('padrão: mostra anexar e a dica de arquivos', () => {
    render(<OpexComposer onSend={vi.fn()} attachments={attachments()} onStop={vi.fn()} running={false} sending={false} stopping={false} />)
    expect(screen.getByRole('button', { name: /Anexar/ })).toBeTruthy()
    expect(screen.getByText(/cole ou arraste arquivos/)).toBeTruthy()
  })

  it('anexos desligados: sem botão de anexar nem dica', () => {
    render(<OpexComposer onSend={vi.fn()} attachments={attachments(false)} onStop={vi.fn()} running={false} sending={false} stopping={false} />)
    expect(screen.queryByRole('button', { name: /Anexar/ })).toBeNull()
    expect(screen.queryByText(/cole ou arraste arquivos/)).toBeNull()
  })
})
