import { MapPin, UserRound } from "lucide-react"
import type { ChatMessageDto } from "@/features/evolution-api/chat-message"

/** Localização (abre no Google Maps) e contatos compartilhados, no padrão do WhatsApp. */

export function LocationCard({ location }: { location: NonNullable<ChatMessageDto["location"]> }) {
    const href = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
    return (
        <a href={href} target="_blank" rel="noreferrer" className="flex w-64 max-w-full items-center gap-3 rounded-md bg-foreground/10 p-2.5 hover:bg-foreground/15" aria-label={`Abrir ${location.name ?? "localização"} no mapa`}>
            <MapPin className="h-8 w-8 shrink-0" aria-hidden />
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{location.name ?? "Localização"}</span>
                <span className="block truncate text-[11px] opacity-75">{location.address ?? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}</span>
            </span>
        </a>
    )
}

export function ContactsCard({ contacts }: { contacts: ChatMessageDto["contacts"] }) {
    return (
        <ul className="w-64 max-w-full space-y-1">
            {contacts.map((contact, index) => (
                <li key={`${contact.name}-${index}`} className="flex items-center gap-3 rounded-md bg-foreground/10 p-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/15">
                        <UserRound className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{contact.name}</span>
                        {contact.number && <span className="block truncate text-[11px] opacity-75">+{contact.number}</span>}
                    </span>
                </li>
            ))}
        </ul>
    )
}
