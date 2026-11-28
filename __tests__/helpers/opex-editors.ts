import type { ComponentType } from 'react'
import type { IntegrationEditorFormProps } from '@nandobfer/integracoes/react'

/**
 * Formulário de uma integração como o Opex a monta (adaptador de cliente do registro, com as abas
 * e os cards do app). Carregado na hora: os `vi.mock` do teste já valem.
 */
export async function opexEditor(id: string): Promise<ComponentType<IntegrationEditorFormProps>> {
  const { OPEX_CLIENT_ADAPTERS } = await import('@/features/integrations/registry/client')
  const editor = OPEX_CLIENT_ADAPTERS.find((adapter) => adapter.id === id)?.editor
  if (!editor) throw new Error(`sem formulário no registro do Opex: ${id}`)
  return editor
}
