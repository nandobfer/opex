"use client"

import { CLIENTE_PLUGINS_PATH, PLUGINS_PATH, pluginPath } from "../constants"
import { PluginDetailView } from "./PluginDetailView"
import { PluginsListView } from "./PluginsListView"

/** Telas de Plugins (OPE-172): a do dono e a do portal usam os mesmos componentes (a fonte vem do contexto). */

export function OwnerPluginsPage() {
    return (
        <PluginsListView
            title="Plugins"
            description="Extensões do app em tempo de execução (dono e portais dos clientes): versões, prévia ao vivo, diferença entre versões, ativar/desativar e rollback."
            detailHref={pluginPath}
            emptyDescription="Crie uma tarefa do tipo Plugin: a mesa de /desenvolvimento gera, testa e publica a primeira versão."
        />
    )
}

export function OwnerPluginDetailPage({ id }: { id: string }) {
    return <PluginDetailView id={id} backHref={PLUGINS_PATH} />
}

export function ClientePluginsPage() {
    return <PluginsListView title="Plugins" description="Personalizações do seu portal (dashboards, visões e fluxos): prévia, aprovação e rollback." detailHref={(id) => `${CLIENTE_PLUGINS_PATH}/${id}`} emptyDescription="Peça uma personalização do portal: ela vira um plugin depois de aprovada." />
}

export function ClientePluginDetailPage({ id }: { id: string }) {
    return <PluginDetailView id={id} backHref={CLIENTE_PLUGINS_PATH} />
}
