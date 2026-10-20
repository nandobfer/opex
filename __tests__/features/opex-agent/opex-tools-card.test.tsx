/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { OpexToolsCard } from '@/features/opex-agent/components/settings/OpexToolsCard'
import { DEFAULT_OPEX_AGENT_SETTINGS, type OpexAgentSettings } from '@/features/opex-agent/schemas'
import type { OpexToolMetaDto } from '@/features/opex-agent/tool-tree'

const TOOLS: OpexToolMetaDto[] = [
  { name: 'get_app_overview', group: 'context', label: 'Visão geral', description: 'Retrato do app', risk: 'read', alwaysOn: true },
  { name: 'list_tasks', group: 'tasks', label: 'Listar tarefas', description: 'Busca tarefas', risk: 'read', alwaysOn: false },
  { name: 'create_task', group: 'tasks', label: 'Criar tarefa', description: 'Cria', risk: 'write', alwaysOn: false },
  { name: 'delete_task', group: 'tasks', label: 'Excluir tarefa', description: 'Exclui', risk: 'destructive', alwaysOn: false },
]

let form: UseFormReturn<OpexAgentSettings>
function Probe({ onForm }: { onForm: (value: UseFormReturn<OpexAgentSettings>) => void }) {
  const value = useForm<OpexAgentSettings>({ defaultValues: DEFAULT_OPEX_AGENT_SETTINGS })
  useEffect(() => onForm(value), [onForm, value])
  return <OpexToolsCard form={value} tools={TOOLS} />
}
const keep = (value: UseFormReturn<OpexAgentSettings>) => {
  form = value
}
const Harness = () => <Probe onForm={keep} />

afterEach(cleanup)

const openTasks = () => fireEvent.click(screen.getByText('Tarefas').closest('[role="button"]')!)

describe('card de ferramentas do Agente Opex (árvore do Ciliar)', () => {
  it('sem seletor de política: só as destrutivas vêm com "Pede confirmação" ligado', () => {
    render(<Harness />)
    expect(screen.queryByText('Só ações destrutivas')).toBeNull()
    openTasks()
    expect((screen.getByRole('checkbox', { name: 'Excluir tarefa: pede confirmação' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'Criar tarefa: pede confirmação' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('Destrutiva')).toBeTruthy()
  })

  it('trocar o switch grava o ajuste, marca "personalizado" e avisa a destrutiva sem confirmação', () => {
    render(<Harness />)
    openTasks()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Criar tarefa: pede confirmação' }))
    expect(form.getValues('confirmationOverrides')).toEqual({ create_task: true })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Excluir tarefa: pede confirmação' }))
    expect(form.getValues('confirmationOverrides')).toEqual({ create_task: true, delete_task: false })
    expect(screen.getAllByText('· personalizado')).toHaveLength(2)
    expect(screen.getByRole('note').textContent).toContain('Ação destrutiva sem confirmação')
    // Voltar ao padrão remove o ajuste.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Criar tarefa: pede confirmação' }))
    expect(form.getValues('confirmationOverrides')).toEqual({ delete_task: false })
  })

  it('desmarcar ferramenta ou módulo grava as desligadas; o Contexto fica travado', () => {
    render(<Harness />)
    expect(screen.getByText('3/3')).toBeTruthy()
    openTasks()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Listar tarefas' }))
    expect(form.getValues('disabledTools')).toEqual(['list_tasks'])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tarefas' }))
    expect(form.getValues('disabledTools')).toEqual([])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tarefas' }))
    expect(form.getValues('disabledTools')).toEqual(['list_tasks', 'create_task', 'delete_task'])
    fireEvent.click(screen.getByText('Contexto').closest('[role="button"]')!)
    expect(screen.getByRole('checkbox', { name: 'Visão geral' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Sempre ligada')).toBeTruthy()
  })
})
