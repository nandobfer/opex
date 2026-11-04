import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Telas novas do refinamento na mesa (OPE-137) usam os controles do projeto (abas da mesa, Switch,
 * ToggleCard, Button): nada de `<select>` ou `<input type="checkbox">` nativos.
 */
const FILES = [
  'src/features/agentic/components/workbench/StartWorkbench.tsx',
  'src/features/agentic/components/workbench/StartTaskBlock.tsx',
  'src/features/agentic/components/workbench/StartWorkbenchSwitches.tsx',
  'src/features/agentic/components/workbench/InheritedToggleCard.tsx',
  'src/features/agentic/components/workbench/RefinementActionBar.tsx',
  'src/features/agentic/components/workbench/RefinementWorkbenchView.tsx',
  'src/features/agentic/components/workbench/PlanAfterRefinementSwitch.tsx',
  'src/features/agentic/components/workbench/WorkbenchTabs.tsx',
  'src/features/refinement/components/RefinementPanel.tsx',
  'src/features/refinement/components/RefinementDialogs.tsx',
]

describe('controles do refinamento na mesa', () => {
  it.each(FILES)('%s não usa select nem checkbox nativos', (file) => {
    const source = readFileSync(file, 'utf8')
    expect(source).not.toMatch(/<select[\s>]/)
    expect(source).not.toMatch(/type=["']checkbox["']/)
  })
})
