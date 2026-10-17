import { Schema } from "mongoose"
export const environmentImageFields = new Schema(
    { service: String, imageId: String, tag: String, version: String, builtAt: { type: String, default: null } },
    { _id: false },
)
export const environmentComposeFields = new Schema(
    { service: String, image: String, ports: [String], volumes: [String], variables: [String] },
    { _id: false },
)
