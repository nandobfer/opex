/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { AgentQuestionsCard } from '@/components/agent-questions/AgentQuestionsCard'
import type { OpencodeFormDto, OpencodeFormFieldDto } from '@/lib/ai/opencode-events'

const field = (patch: Partial<OpencodeFormFieldDto> & Pick<OpencodeFormFieldDto, 'key' | 'type'>): OpencodeFormFieldDto => ({
  title: null,
  description: null,
  required: false,
  options: [],
  custom: false,
  placeholder: null,
  defaultValue: null,
  url: null,
  ...patch,
})

const form = (fields: OpencodeFormFieldDto[]): OpencodeFormDto => ({ id: 'f1', title: 'Como seguir?', fields })

describe('AgentQuestionsCard', () => {
  it('desenha cada opção numa linha com a descrição e envia o value escolhido', () => {
    const onReply = vi.fn()
    render(
      <AgentQuestionsCard
        pending={false}
        onReply={onReply}
        onCancel={() => undefined}
        form={form([
          field({
            key: 'caminho',
            type: 'string',
            title: 'Caminho',
            required: true,
            options: [
              { value: 'a', label: 'Alternativa A', description: 'Mais simples e cobre o caso comum' },
              { value: 'b', label: 'Alternativa B' },
            ],
          }),
        ])}
      />,
    )

    // A descrição de cada opção aparece, e a linha inteira é o botão (a descrição também seleciona).
    expect(screen.getByText('Mais simples e cobre o caso comum')).toBeTruthy()
    fireEvent.click(screen.getByText('Mais simples e cobre o caso comum'))
    const optionA = screen.getByRole('radio', { name: /Alternativa A/ })
    expect(optionA.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /Responder/ }))
    expect(onReply).toHaveBeenCalledWith({ caminho: 'a' })
  })

  it('múltipla escolha marca e desmarca as opções pelo value', () => {
    const onReply = vi.fn()
    render(
      <AgentQuestionsCard
        pending={false}
        onReply={onReply}
        onCancel={() => undefined}
        form={form([
          field({
            key: 'itens',
            type: 'multiselect',
            title: 'Itens',
            options: [
              { value: 'x', label: 'Item X' },
              { value: 'y', label: 'Item Y', description: 'tem detalhe' },
            ],
          }),
        ])}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Item X/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /tem detalhe/ }))
    fireEvent.click(screen.getByRole('button', { name: /Responder/ }))
    expect(onReply).toHaveBeenCalledWith({ itens: ['x', 'y'] })
  })

  it('campo com opções e resposta livre mostra a lista e o texto livre', () => {
    const onReply = vi.fn()
    render(
      <AgentQuestionsCard
        pending={false}
        onReply={onReply}
        onCancel={() => undefined}
        form={form([field({ key: 'q', type: 'string', title: 'Qual?', custom: true, options: [{ value: 'a', label: 'A' }] })])}
      />,
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'nenhuma das duas' } })
    fireEvent.click(screen.getByRole('button', { name: /Responder/ }))
    expect(onReply).toHaveBeenCalledWith({ q: 'nenhuma das duas' })
  })
})
