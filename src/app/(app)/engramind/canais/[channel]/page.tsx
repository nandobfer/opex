import { ChannelDetail } from "@/features/engramind/components/page/channels/ChannelDetail"

const decode = (value: string) => {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

/** `/engramind/canais/[channel]`: assinantes e configurações por canal (slug com `/` codificada). */
export default async function EngramindChannelRoute({ params }: { params: Promise<{ channel: string }> }) {
    const { channel } = await params
    return <ChannelDetail slug={decode(channel)} />
}
