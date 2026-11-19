import { describe, expect, it } from "vitest"
import { createPluginTestContext } from "@opex/plugin-sdk/testing"
import manifest from "../plugin.json"
import plugin from "./index"

describe("servidor do plugin", () => {
    it("registra a rota e a ferramenta declaradas", async () => {
        const test = createPluginTestContext(manifest)
        await test.activate(plugin)
        expect(await test.callRoute("GET", "/status")).toEqual({ ok: true })
        expect(await test.callTool("status")).toEqual({ ok: true })
    })
})
