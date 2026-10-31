"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

/** "Carregar mais" das listas paginadas por cursor. */
export function LoadMore({ hasNextPage, isFetchingNextPage, fetchNextPage }: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown }) {
    if (!hasNextPage) return null
    return (
        <div className="flex justify-center">
            <Button type="button" variant="outline" size="sm" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Carregar mais
            </Button>
        </div>
    )
}
