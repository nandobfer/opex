/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { EnvironmentSection } from '@/features/agentic/components/central/EnvironmentSection'
import { centralConfigSchema, defaultCentralConfig, type CentralConfigInput, type CentralConfig } from '@/features/agentic/schemas'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
function Harness() {
  const form = useForm<CentralConfigInput, unknown, CentralConfig>({ resolver: zodResolver(centralConfigSchema), mode: 'onChange', defaultValues: defaultCentralConfig('/home/u/app') })
  return <EnvironmentSection form={form} />
}
function BackupHarness() {
  const form = useForm<CentralConfigInput, unknown, CentralConfig>({ resolver: zodResolver(centralConfigSchema), mode: 'onChange', defaultValues: defaultCentralConfig('/home/u/app') })
  const backup = useWatch({ control: form.control, name: 'environment.backupDatabase' })
  return (
    <>
      <EnvironmentSection form={form} />
      <output data-testid="backup-value">{String(backup)}</output>
    </>
  )
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

describe('backup do banco de dados (OPE-72)', () => {
  it('nasce ligado e o desligar chega ao valor do formulário', () => {
    render(<BackupHarness />)
    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('backup-value').textContent).toBe('true')

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('backup-value').textContent).toBe('false')
    expect(screen.getByTestId('central-env-backup-status').textContent).toBe('Desativado')
  })

  it('configuração antiga (sem o campo) continua com o backup ligado', () => {
    const old = defaultCentralConfig('/home/u/app')
    const environment: Partial<typeof old.environment> = { ...old.environment }
    delete environment.backupDatabase
    expect(centralConfigSchema.parse({ ...old, environment }).environment.backupDatabase).toBe(true)
  })
})
