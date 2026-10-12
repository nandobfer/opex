/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { EnvironmentSection } from '@/features/agentic/components/central/EnvironmentSection'
import { centralConfigSchema, defaultCentralConfig, type CentralConfigInput, type CentralConfig } from '@/features/agentic/schemas'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
function Harness() {
  const form = useForm<CentralConfigInput, unknown, CentralConfig>({ resolver: zodResolver(centralConfigSchema), mode: 'onChange', defaultValues: defaultCentralConfig('/home/u/app') })
  return <EnvironmentSection form={form} />
}
afterEach(cleanup)
describe('método da prévia por central', () => {
  it('inicia Local e exibe configuração remota somente ao selecionar GitHub Action', () => {
    render(<Harness />)
    expect(screen.getByRole('radio', { name: 'Local' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByLabelText('Workflow do GitHub')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'GitHub Action' }))
    expect((screen.getByLabelText('Workflow do GitHub') as HTMLInputElement).value).toBe('preview.yml')
    expect((screen.getByLabelText('Serviço do Compose') as HTMLInputElement).value).toBe('app')
    fireEvent.click(screen.getByRole('radio', { name: 'Local' }))
    expect(screen.queryByLabelText('Workflow do GitHub')).toBeNull()
  })
  it('configuração antiga continua Local', () => {
    const old = defaultCentralConfig('/home/u/app')
    const environment: Partial<typeof old.environment> = { ...old.environment }
    delete environment.previewMethod
    delete environment.githubWorkflow
    delete environment.previewService
    expect(centralConfigSchema.parse({ ...old, environment }).environment.previewMethod).toBe('local')
  })
})
