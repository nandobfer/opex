import { Plugin, PluginKv, PluginVersion } from "@/lib/db/models/Plugin"

/** Índices dos plugins (OPE-172). Idempotente em cada boot. */
export async function ensurePluginIndexes(): Promise<void> {
    await Promise.all([Plugin.createIndexes(), PluginVersion.createIndexes(), PluginKv.createIndexes()])
}
