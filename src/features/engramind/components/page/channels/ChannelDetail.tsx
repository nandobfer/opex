"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { useRouter } from "next/navigation"
import { CHANNEL_HELP } from "../../../help/identities"
import { ENGRAMIND_INTEGRATION_HREF, ENGRAMIND_PAGE_HREF } from "../../../constants"
import type { EngramindChannel } from "../../../types"
import { route, useEngramindQuery, useEngramindRealtime } from "../../../hooks/useEngramind"
import { HelpBadge } from "../../shared/Badges"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { ChannelSettingsCard } from "./ChannelSettingsCard"
import { SubscribersCard } from "./SubscribersCard"

/** Detalhe do canal: assinantes e configurações por canal. */
export function ChannelDetail({ slug }: { slug: string }) {
    useEngramindRealtime()
    const router = useRouter()
    const channel = useEngramindQuery<EngramindChannel>(route("channels", slug))
    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader title={channel.data?.name ?? slug} description={`Canal ${slug}`}>
                <Button asChild variant="outline" size="sm">
                    <Link href={ENGRAMIND_PAGE_HREF}>
                        <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Canais
                    </Link>
                </Button>
            </CadastroHeader>
            <QueryBoundary
                isLoading={channel.isLoading}
                error={channel.error}
                onRetry={() => void channel.refetch()}
                onConfigure={() => router.push(`${ENGRAMIND_INTEGRATION_HREF}?aba=conexao`)}
                skeleton={
                    <div className="flex flex-col gap-6" aria-busy="true">
                        <Skeleton className="h-48 w-full rounded-xl" />
                        <Skeleton className="h-64 w-full rounded-xl" />
                    </div>
                }
            >
                {channel.data && (
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {channel.data.description && <span>{channel.data.description}</span>}
                            <HelpBadge value={`prioridade ${channel.data.priority}`} help={CHANNEL_HELP.priority} />
                            <HelpBadge value={`versão ${channel.data.version}`} help={CHANNEL_HELP.version} />
                            {channel.data.archived_at && <HelpBadge value="arquivado" help={CHANNEL_HELP.archived} />}
                        </div>
                        <SubscribersCard channel={channel.data.slug} />
                        <ChannelSettingsCard channel={channel.data.slug} />
                    </div>
                )}
            </QueryBoundary>
        </div>
    )
}
