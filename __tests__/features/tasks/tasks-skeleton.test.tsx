/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TasksSkeleton } from '@/features/tasks/components/TasksSkeleton'
import { KANBAN_CARD_CLASS, KANBAN_COLUMN_CLASS, KANBAN_COLUMN_HEADER_CLASS, COMPACT_CARD_CLASS } from '@/features/tasks/components/board-layout'
import { TABLE_COLUMN_ORDER, TABLE_COLUMN_WIDTHS } from '@/features/tasks/components/table-columns'
import { TASK_TABLE_RESPONSIVE, TASK_TABLE_ROW_HEIGHT } from '@/features/tasks/components/TaskTable'
import type { BoardColumnView } from '@/features/tasks/board'

/** Skeletons de Tarefas com as dimensões do resultado final (OPE-100, port do MT-32). */

afterEach(() => cleanup())

const column = (key: string, border: string): BoardColumnView => ({ key, label: key, border, dot: 'bg-sky-400', column: { key, name: key } } as unknown as BoardColumnView)
const COLUMNS = [column('todo', 'border-t-sky-400'), column('doing', 'border-t-amber-400'), column('done', 'border-t-emerald-400')]

const classesOf = (element: Element) => Array.from(element.classList)
const hasAll = (element: Element, classes: string) => classes.split(' ').every((name) => element.classList.contains(name))

describe('TasksSkeleton › kanban', () => {
  it('uma coluna por coluna visível, com a borda dela e as classes da coluna real', () => {
    render(<TasksSkeleton kanban columns={COLUMNS} mobile={false} />)
    expect(screen.getByTestId('kanban-skeleton').getAttribute('aria-busy')).toBe('true')
    for (const { key, border } of COLUMNS) {
      const element = screen.getByTestId(`column-skeleton-${key}`)
      expect(hasAll(element, KANBAN_COLUMN_CLASS)).toBe(true)
      expect(classesOf(element)).toContain(border)
      expect(hasAll(element.firstElementChild!, KANBAN_COLUMN_HEADER_CLASS)).toBe(true)
    }
  })

  it('cards no formato do TaskCard (mesma base de classes), com e sem linha do repositório', () => {
    render(<TasksSkeleton kanban columns={COLUMNS} mobile={false} />)
    const cards = screen.getAllByTestId('task-card-skeleton')
    expect(cards.length).toBe(3 + 2 + 4)
    for (const card of cards) expect(hasAll(card, KANBAN_CARD_CLASS)).toBe(true)
    expect(screen.getAllByTestId('task-card-skeleton-repo').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('task-card-skeleton-repo').length).toBeLessThan(cards.length)
  })

  it('sem o quadro carregado ainda, mostra colunas neutras em vez de nada', () => {
    render(<TasksSkeleton kanban columns={[]} mobile={false} />)
    const columns = screen.getAllByTestId(/^column-skeleton-placeholder-/)
    expect(columns.length).toBe(4)
    expect(classesOf(columns[0]!)).toContain('border-t-border')
  })
})

describe('TasksSkeleton › tabela', () => {
  it('cabeçalho com as colunas, larguras e ocultação responsiva do TaskTable e linhas na altura dele', () => {
    render(<TasksSkeleton kanban={false} columns={COLUMNS} mobile={false} />)
    for (const key of TABLE_COLUMN_ORDER) {
      const head = screen.getByTestId(`table-head-skeleton-${key}`)
      for (const name of [TABLE_COLUMN_WIDTHS[key], TASK_TABLE_RESPONSIVE[key]].filter(Boolean).join(' ').split(' ').filter(Boolean)) expect(classesOf(head)).toContain(name)
    }
    const rows = screen.getAllByTestId('table-row-skeleton')
    expect(rows.length).toBe(8)
    expect(rows[0]!.style.height).toBe(`${TASK_TABLE_ROW_HEIGHT}px`)
    expect(screen.queryByTestId('kanban-skeleton')).toBeNull()
  })

  it('no celular, a visão Tabela carrega como os cards compactos', () => {
    render(<TasksSkeleton kanban={false} columns={COLUMNS} mobile />)
    expect(screen.queryByTestId('table-skeleton')).toBeNull()
    const cards = screen.getAllByTestId('compact-card-skeleton')
    expect(cards.length).toBe(4)
    for (const card of cards) expect(hasAll(card, COMPACT_CARD_CLASS)).toBe(true)
  })
})
