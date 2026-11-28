import { notFound } from "next/navigation"
import { DeployLogPage } from "@/features/environments/components/DeployLogPage"
import { loadDeployPage } from "@/features/environments/server/deploy-page"

export const dynamic = "force-dynamic"

/** `/ambientes/deploys/[deployId]`: log ao vivo de um deploy (OPE-208). Ver aicontext/modules/environments.md. */
export default async function DeployPage({ params }: { params: Promise<{ deployId: string }> }) {
    const { deployId } = await params
    const data = await loadDeployPage(deployId)
    if (!data) notFound()
    return <DeployLogPage deploy={data.deploy} environmentName={data.environmentName} />
}
