import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"

export function LabelAvatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
    const base = "h-5 w-5 shrink-0 rounded-full bg-muted"
    return image && /^https?:\/\//i.test(image) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className={cn(base, className)} loading="lazy" referrerPolicy="no-referrer" />
    ) : <span className={cn(base, "flex items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground", className)} aria-hidden>{name.slice(0, 1)}</span>
}

export function AvatarLabel({ title, image, subtitle, badge, nameClassName, nameStyle, testId }: { title: string; image?: string | null; subtitle?: string | null; badge?: ReactNode; nameClassName?: string; nameStyle?: CSSProperties; testId?: string }) {
    return <span className="flex min-w-0 flex-1 items-center gap-2">
        <LabelAvatar name={title} image={image} />
        <span className="min-w-0 flex-1">
            <span className={cn("block truncate font-medium", nameClassName)} style={nameStyle} data-testid={testId}>{title}</span>
            {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        {badge}
    </span>
}
