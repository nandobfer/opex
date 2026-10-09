"use client"

import { useEffect, type RefObject } from "react"

/**
 * Calls the handler when a click occurs outside the given ref element.
 */
export function useClickOutside<T extends HTMLElement>(ref: RefObject<T | null>, handler: () => void) {
    useEffect(() => {
        const listener = (event: MouseEvent) => {
            if (!ref.current || ref.current.contains(event.target as Node)) return
            handler()
        }
        document.addEventListener("mousedown", listener)
        return () => document.removeEventListener("mousedown", listener)
    }, [ref, handler])
}
