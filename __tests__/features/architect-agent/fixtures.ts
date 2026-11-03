import type { ArchitectGraph } from '@/features/architect-agent/graph'

/** Grafo pequeno e válido (diagrama de ideias) usado nos testes do Agente Arquiteto. */
export function sampleGraph(): ArchitectGraph {
  return {
    title: 'Agente Arquiteto',
    summary: 'Diagrama do plano aprovado.',
    groups: [
      { id: 'g-ui', label: 'Quem participa', layer: 'people', detail: '' },
      { id: 'g-api', label: 'Processos', layer: 'processes', detail: '' },
      { id: 'g-db', label: 'Informação', layer: 'information', detail: '' },
    ],
    nodes: [
      { id: 'objective', label: 'Diagrama do plano', groupId: null, kind: 'objective', detail: 'Entregar a aba', files: [], status: 'new' },
      { id: 'tab', label: 'Aba "Arquitetura"', groupId: 'g-ui', kind: 'structure', detail: 'Mostra o diagrama ao vivo', files: [], status: 'new' },
      { id: 'view', label: 'Mesa de trabalho', groupId: 'g-ui', kind: 'structure', detail: '', files: [], status: 'changed' },
      { id: 'route', label: 'Geração do diagrama', groupId: 'g-api', kind: 'process', detail: '', files: [], status: 'new' },
      { id: 'model', label: 'Versões do diagrama', groupId: 'g-db', kind: 'information', detail: '', files: [], status: 'new' },
      { id: 'pusher', label: 'Pusher', groupId: null, kind: 'external', detail: '', files: [], status: 'existing' },
    ],
    edges: [
      { id: 'e1', source: 'objective', target: 'tab', label: null, kind: 'flow' },
      { id: 'e2', source: 'view', target: 'tab', label: 'contém', kind: 'contains' },
      { id: 'e3', source: 'tab', target: 'route', label: 'pede', kind: 'triggers' },
      { id: 'e4', source: 'route', target: 'model', label: null, kind: 'produces' },
      { id: 'e5', source: 'route', target: 'pusher', label: 'avisa', kind: 'notifies' },
    ],
    notes: [{ kind: 'risk', text: 'Layout de grupos no dagre' }],
  }
}

/** O mesmo grafo gravado no vocabulário antigo (diagrama de código), como versões anteriores. */
export function legacyGraph(): Record<string, unknown> {
  return {
    title: 'Antigo',
    summary: '',
    groups: [{ id: 'g-ui', label: 'UI', layer: 'ui', detail: '' }, { id: 'g-api', label: 'Rotas/API', layer: 'routes', detail: '' }, { id: 'g-db', label: 'Banco', layer: 'data', detail: '' }],
    nodes: [
      { id: 'objective', label: 'Objetivo', groupId: null, kind: 'objective', detail: '', files: [], status: 'new' },
      { id: 'tab', label: 'ArchitectTab', groupId: 'g-ui', kind: 'module', detail: '', files: ['src/features/architect-agent/components/workbench/ArchitectTab.tsx'], status: 'new' },
      { id: 'route', label: 'POST /api/architect', groupId: 'g-api', kind: 'route', detail: '', files: [], status: 'new' },
      { id: 'model', label: 'architect_diagrams', groupId: 'g-db', kind: 'data', detail: '', files: [], status: 'new' },
      { id: 'lib', label: 'Layout', groupId: null, kind: 'lib', detail: '', files: ['src/a.ts'], status: 'existing' },
    ],
    edges: [
      { id: 'e1', source: 'tab', target: 'route', label: null, kind: 'event' },
      { id: 'e2', source: 'route', target: 'model', label: null, kind: 'data' },
    ],
    notes: [],
  }
}
