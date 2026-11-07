/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../helpers/framer-motion'

/** Aviso do agendador desligado (OPE-147): aparece só na prévia do Opex, com o texto exato. */

const holder = vi.hoisted(() => ({ data: undefined as { preview: boolean; schedulerMessage: string | null } | undefined }))
vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/hooks/useInstanceInfo', () => ({ useInstanceInfo: () => ({ data: holder.data }) }))

import { PreviewSchedulerNotice } from '@/components/feedback/PreviewSchedulerNotice'

const MESSAGE = 'Agendador desligado nesta prévia: as rotinas rodam só no Opex original.'

afterEach(() => {
  cleanup()
  holder.data = undefined
})

describe('PreviewSchedulerNotice', () => {
  it('na prévia mostra o aviso', () => {
    holder.data = { preview: true, schedulerMessage: MESSAGE }
    render(<PreviewSchedulerNotice />)
    expect(screen.getByText(MESSAGE)).toBeTruthy()
  })

  it('fora da prévia (ou carregando) não mostra nada', () => {
    holder.data = { preview: false, schedulerMessage: null }
    const { rerender } = render(<PreviewSchedulerNotice />)
    expect(screen.queryByText(MESSAGE)).toBeNull()
    holder.data = undefined
    rerender(<PreviewSchedulerNotice />)
    expect(screen.getByTestId('preview-scheduler-notice').textContent).toBe('')
  })
})
