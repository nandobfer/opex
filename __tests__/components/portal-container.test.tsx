/** @vitest-environment happy-dom */

import React, { useState, type ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PortalContainerProvider } from '@/components/ui/portal-container'

/** Os painéis flutuantes dos wrappers abrem no contêiner do provider (tela cheia) ou no body. */

function Host({ inside, children }: { inside: boolean; children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  return (
    <div ref={setHost} data-testid="host">
      <PortalContainerProvider container={inside ? host : null}>{children}</PortalContainerProvider>
    </div>
  )
}

const popover = (
  <Popover defaultOpen>
    <PopoverTrigger>abrir popover</PopoverTrigger>
    <PopoverContent>conteúdo do popover</PopoverContent>
  </Popover>
)
const menu = (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger>abrir menu</DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem>item do menu</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)

afterEach(cleanup)

describe('PortalContainerProvider', () => {
  it.each([
    ['popover', popover, 'conteúdo do popover'],
    ['menu', menu, 'item do menu'],
  ])('com o contêiner, o %s abre dentro dele; sem, abre no body', async (_name, ui, text) => {
    render(<Host inside>{ui}</Host>)
    expect(screen.getByTestId('host').contains(await screen.findByText(text))).toBe(true)
    cleanup()
    render(<Host inside={false}>{ui}</Host>)
    expect(screen.getByTestId('host').contains(await screen.findByText(text))).toBe(false)
  })
})
