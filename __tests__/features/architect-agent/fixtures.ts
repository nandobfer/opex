import type { ArchitectGraph } from '@/features/architect-agent/graph'

/** Grafo pequeno e válido usado nos testes do Agente Arquiteto. */
export function sampleGraph(): ArchitectGraph {
  return {
    title: 'Agente Arquiteto',
    summary: 'Diagrama do plano aprovado.',
    groups: [
      { id: 'g-ui', label: 'UI', layer: 'ui', detail: '' },
      { id: 'g-api', label: 'Rotas/API', layer: 'routes', detail: '' },
      { id: 'g-db', label: 'Banco', layer: 'data', detail: '' },
    ],
    nodes: [
      { id: 'objective', label: 'Diagrama do plano', groupId: null, kind: 'objective', detail: 'Entregar a aba', files: [], status: 'new' },
      { id: 'tab', label: 'Aba "Arquitetura"', groupId: 'g-ui', kind: 'module', detail: 'React Flow', files: ['src/features/architect-agent/components/workbench/ArchitectTab.tsx'], status: 'new' },
      { id: 'view', label: 'WorkbenchView', groupId: 'g-ui', kind: 'module', detail: '', files: ['src/features/agentic/components/workbench/WorkbenchView.tsx'], status: 'changed' },
      { id: 'route', label: 'POST /api/architect/…', groupId: 'g-api', kind: 'route', detail: '', files: [], status: 'new' },
      { id: 'model', label: 'architect_diagrams', groupId: 'g-db', kind: 'data', detail: '', files: [], status: 'new' },
      { id: 'pusher', label: 'Pusher', groupId: null, kind: 'external', detail: '', files: [], status: 'existing' },
    ],
    edges: [
      { id: 'e1', source: 'objective', target: 'tab', label: null, kind: 'flow' },
      { id: 'e2', source: 'view', target: 'tab', label: 'contém', kind: 'contains' },
      { id: 'e3', source: 'tab', target: 'route', label: 'POST', kind: 'uses' },
      { id: 'e4', source: 'route', target: 'model', label: null, kind: 'data' },
      { id: 'e5', source: 'route', target: 'pusher', label: 'evento', kind: 'event' },
    ],
    notes: [{ kind: 'risk', text: 'Layout de grupos no dagre' }],
  }
}
