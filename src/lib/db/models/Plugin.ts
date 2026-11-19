import mongoose, { Schema, type Model, type Types } from "mongoose"
import { PLUGIN_SCOPES, PLUGIN_VERSION_STATES, type PluginScope, type PluginVersionState } from "@/features/plugins/constants"
import type { PluginManifest, PluginSourceFile } from "@/features/plugins/manifest"

/**
 * Plugins do Opex (OPE-172): `plugins` (ponteiros das versões e estado), `plugin_versions` (fontes,
 * manifesto e artefatos de cada versão) e `plugin_kv` (chave-valor de cada plugin). As versões são
 * imutáveis depois de publicadas; o rollback só move o ponteiro `stableVersionId`.
 */

export interface IPluginRuntimeError {
    channel: "stable" | "preview"
    versionId: string
    message: string
    at: Date
}

export interface IPlugin {
    _id: Types.ObjectId
    pluginId: string
    name: string
    description: string
    scope: PluginScope
    clientId: string | null
    apiVersion: string
    active: boolean
    /** Arquivado (OPE-172): fora da interface e do kernel, desligado; versões, logs e kv intactos. */
    archivedAt: Date | null
    archivedBy: string | null
    stableVersionId: string | null
    previewVersionId: string | null
    /** Mesa que publicou a prévia atual (a prévia é dela). */
    previewWorkbenchId: string | null
    /** Último erro de importação/ativação do código de servidor (a versão anterior continua). */
    runtimeError: IPluginRuntimeError | null
    createdBy: string
    createdAt: Date
    updatedAt: Date
}

const pluginSchema = new Schema<IPlugin>(
    {
        pluginId: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        scope: { type: String, enum: PLUGIN_SCOPES, required: true },
        clientId: { type: String, default: null },
        apiVersion: { type: String, required: true },
        active: { type: Boolean, default: true },
        archivedAt: { type: Date, default: null },
        archivedBy: { type: String, default: null },
        stableVersionId: { type: String, default: null },
        previewVersionId: { type: String, default: null },
        previewWorkbenchId: { type: String, default: null },
        runtimeError: { type: Schema.Types.Mixed, default: null },
        createdBy: { type: String, default: "system" },
    },
    { collection: "plugins", timestamps: true, versionKey: false },
)
pluginSchema.index({ pluginId: 1 }, { unique: true })
pluginSchema.index({ scope: 1, clientId: 1 })

export interface IPluginArtifact {
    code: string
    hash: string
    css: string | null
    cssHash: string | null
}

export interface IPluginVersionSource {
    taskId: string | null
    taskCode: string | null
    workbenchId: string | null
}

export interface IPluginVersion {
    _id: Types.ObjectId
    pluginId: string
    number: number
    state: PluginVersionState
    files: PluginSourceFile[]
    manifest: PluginManifest
    artifacts: { server: IPluginArtifact | null; client: IPluginArtifact | null }
    /** Caminhos dos testes do plugin (`*.test.ts(x)`). */
    tests: string[]
    compileLog: string
    /** Descritivo em linguagem natural da diferença para a versão anterior (pt-BR, sem código). */
    changeSummary: string | null
    /** Quem escreveu: o agente da mesa ou a IA ("Gerar descritivo"). */
    changeSummarySource: "agent" | "ai" | null
    /** Versão de origem (base da mesa), para o diff entre versões. */
    baseVersionId: string | null
    author: string
    source: IPluginVersionSource
    createdAt: Date
    promotedAt: Date | null
}

const pluginVersionSchema = new Schema<IPluginVersion>(
    {
        pluginId: { type: String, required: true },
        number: { type: Number, required: true },
        state: { type: String, enum: PLUGIN_VERSION_STATES, required: true, default: "draft" },
        files: { type: [{ _id: false, path: String, content: String }], default: [] },
        manifest: { type: Schema.Types.Mixed, required: true },
        artifacts: {
            server: { type: Schema.Types.Mixed, default: null },
            client: { type: Schema.Types.Mixed, default: null },
        },
        tests: { type: [String], default: [] },
        compileLog: { type: String, default: "" },
        changeSummary: { type: String, default: null },
        changeSummarySource: { type: String, enum: ["agent", "ai", null], default: null },
        baseVersionId: { type: String, default: null },
        author: { type: String, default: "system" },
        source: {
            taskId: { type: String, default: null },
            taskCode: { type: String, default: null },
            workbenchId: { type: String, default: null },
        },
        promotedAt: { type: Date, default: null },
    },
    { collection: "plugin_versions", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)
pluginVersionSchema.index({ pluginId: 1, number: -1 }, { unique: true })
pluginVersionSchema.index({ pluginId: 1, state: 1 })

export interface IPluginKv {
    _id: Types.ObjectId
    pluginId: string
    key: string
    value: unknown
    updatedAt: Date
}

const pluginKvSchema = new Schema<IPluginKv>(
    {
        pluginId: { type: String, required: true },
        key: { type: String, required: true },
        value: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "plugin_kv", timestamps: { createdAt: false, updatedAt: true }, versionKey: false },
)
pluginKvSchema.index({ pluginId: 1, key: 1 }, { unique: true })

export const Plugin: Model<IPlugin> = (mongoose.models.Plugin as Model<IPlugin>) || mongoose.model<IPlugin>("Plugin", pluginSchema)
export const PluginVersion: Model<IPluginVersion> = (mongoose.models.PluginVersion as Model<IPluginVersion>) || mongoose.model<IPluginVersion>("PluginVersion", pluginVersionSchema)
export const PluginKv: Model<IPluginKv> = (mongoose.models.PluginKv as Model<IPluginKv>) || mongoose.model<IPluginKv>("PluginKv", pluginKvSchema)
