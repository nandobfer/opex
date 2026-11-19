import { OwnerPluginDetailPage } from "@/features/plugins/components/PluginPages"

/** `/plugins/[id]`: versões, diferença, prévia e runtime de um plugin (OPE-172). */
export default async function PluginDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <OwnerPluginDetailPage id={id} />
}
