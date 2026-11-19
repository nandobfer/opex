import type { PluginChannel, PluginComponentSlot, PluginScope, PluginVersionState } from "./constants"
import type { PluginManifest } from "./manifest"
import type { PluginFileDiff } from "./logic"

/** DTOs dos plugins (OPE-172). */

export interface PluginVersionSummaryDto {
    id: string
    number: number
    state: PluginVersionState
    author: string
    source: { taskId: string | null; taskCode: string | null; workbenchId: string | null }
    baseVersionId: string | null
    tests: string[]
    hasServer: boolean
    hasClient: boolean
    createdAt: string
    promotedAt: string | null
}

export interface PluginDto {
    id: string
    name: string
    description: string
    scope: PluginScope
    clientId: string | null
    clientName: string | null
    apiVersion: string
    active: boolean
    stable: PluginVersionSummaryDto | null
    preview: PluginVersionSummaryDto | null
    previewWorkbenchId: string | null
    runtimeError: { channel: PluginChannel; versionId: string; message: string; at: string } | null
    createdAt: string
    updatedAt: string
}

export interface PluginDetailDto extends PluginDto {
    versions: PluginVersionSummaryDto[]
}

export interface PluginVersionDetailDto extends PluginVersionSummaryDto {
    pluginId: string
    manifest: PluginManifest
    files: Array<{ path: string; content: string }>
    compileLog: string
}

export interface PluginDiffDto {
    from: { id: string; number: number } | null
    to: { id: string; number: number }
    files: PluginFileDiff[]
}

/** Uma contribuição de plugin para o navegador (manifesto de runtime do ator). */
export interface PluginRuntimeEntry {
    id: string
    name: string
    versionId: string
    versionNumber: number
    channel: PluginChannel
    /** Revisão do bundle (muda a cada versão: a tela remonta). */
    revision: string
    bundleUrl: string | null
    cssUrl: string | null
    slots: Array<{ slot: PluginComponentSlot; export: string; title: string | null; order: number }>
    pages: Array<{ path: string; title: string; export: string }>
    nav: Array<{ label: string; page: string; icon: string }>
}

export interface PluginRuntimeManifestDto {
    plugins: PluginRuntimeEntry[]
    /** Plugins com a prévia ligada neste navegador. */
    previewOn: string[]
}

/** Evento `plugin-updated`. */
export interface PluginUpdatedPayload {
    id: string
    version: number | null
    channel: PluginChannel | null
}

/** Props de cada slot de componente (contrato do SDK, `plugin-sdk/types/client.d.ts`). */
export interface PluginSlotPropsMap {
    "dashboard.widgets": Record<string, never>
    "task.panel": { task: { id: string; code: string; title: string; taskType: string | null; projectId: string | null } }
    "portal.dashboard.widgets": { clientId: string }
}
