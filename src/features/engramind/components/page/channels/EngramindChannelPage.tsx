"use client"

import { ChannelDetail } from "@engramind/client/react"
import { OpexEngramindProvider } from "../../OpexEngramindProvider"

/** `/engramind/canais/[channel]`: o detalhe do canal da lib (assinantes) com as configurações do canal do Opex. */
export function EngramindChannelPage({ slug }: { slug: string }) {
    return (
        <OpexEngramindProvider>
            <ChannelDetail slug={slug} />
        </OpexEngramindProvider>
    )
}
