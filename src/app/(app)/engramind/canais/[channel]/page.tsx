import { EngramindChannelPage } from "@/features/engramind/components/page/channels/EngramindChannelPage"

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
    return <EngramindChannelPage slug={decode(channel)} />
}
