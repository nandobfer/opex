/** @vitest-environment jsdom */

import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { ReplyTextarea } from "@/components/agent-reply/ReplyTextarea"
import { pickReplyTarget, REPLY_PRIORITY, ReplyTargetProvider, useReplyFallback } from "@/components/agent-reply/ReplyTargetProvider"
import { Markdown } from "@/components/ui/markdown"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))
vi.mock("framer-motion", async () => (await import("../helpers/framer-motion")).framerMotionMock())

function Field({ label, priority }: { label: string; priority?: number }) {
    const [value, setValue] = useState("")
    return <ReplyTextarea aria-label={label} vim={false} value={value} onValueChange={setValue} replyPriority={priority} />
}

function Fallback({ onQuote }: { onQuote: (text: string) => boolean }) {
    useReplyFallback(onQuote)
    return null
}

const quoteLine = (index: number) => fireEvent.click(screen.getAllByRole("button", { name: "Citar no campo de resposta" })[index]!)
const field = (label: string) => screen.getByRole("textbox", { name: label }) as HTMLTextAreaElement
const flush = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))

beforeEach(() => vi.clearAllMocks())

describe("Citar linha no campo de resposta", () => {
    it("vai para o campo de maior prioridade e, depois de focar outro, para o focado", async () => {
        render(
            <ReplyTargetProvider>
                <Markdown>{"primeira\n\n`segunda`"}</Markdown>
                <Field label="Extra" priority={REPLY_PRIORITY.extra} />
                <Field label="Mensagem" />
            </ReplyTargetProvider>,
        )
        quoteLine(0)
        await flush()
        expect(field("Mensagem").value).toBe("> primeira\n\n")
        act(() => field("Extra").focus())
        quoteLine(1)
        await flush()
        expect(field("Extra").value).toBe("> `segunda`\n\n")
    })

    it("sem campo, usa o fallback do host; sem fallback, copia para a área de transferência", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.assign(navigator, { clipboard: { writeText } })
        const onQuote = vi.fn(() => true)
        const { rerender } = render(
            <ReplyTargetProvider>
                <Markdown>{"linha"}</Markdown>
                <Fallback onQuote={onQuote} />
            </ReplyTargetProvider>,
        )
        quoteLine(0)
        expect(onQuote).toHaveBeenCalledWith("linha")
        rerender(
            <ReplyTargetProvider>
                <Markdown>{"linha"}</Markdown>
            </ReplyTargetProvider>,
        )
        quoteLine(0)
        await flush()
        expect(writeText).toHaveBeenCalledWith("linha")
        expect(toast.success).toHaveBeenCalled()
    })

    it("pickReplyTarget: foco mais recente vence a prioridade", () => {
        const a = { priority: 40, focusedAt: 0, insert: vi.fn() }
        const b = { priority: 10, focusedAt: 5, insert: vi.fn() }
        expect(pickReplyTarget([a, b])).toBe(b)
        expect(pickReplyTarget([a, { ...b, focusedAt: 0 }])).toBe(a)
        expect(pickReplyTarget([])).toBeNull()
    })
})
