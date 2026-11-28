/** Componente marcador para testes de composição: `data-testid` com o nome e os ids das abas/props recebidas. */
export const marker = (name: string) =>
  function Marker(props: Record<string, unknown>) {
    const extra = (props.extraTabs ?? props.tabs) as Array<{ id: string }> | undefined
    const providerTabs = props.providerTabs as Record<string, Array<{ id: string }>> | undefined
    return (
      <div data-testid={name} data-client-id={String(props.clientId ?? props.id ?? '')} data-tabs={extra?.map((tab) => tab.id).join(',') ?? ''} data-provider-tabs={providerTabs ? Object.entries(providerTabs).map(([p, t]) => `${p}:${t.map((x) => x.id).join('|')}`).join(',') : ''} />
    )
  }
