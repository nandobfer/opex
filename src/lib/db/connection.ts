import mongoose from "mongoose"

/**
 * Conexão Mongoose cacheada em `global`, compatível com serverless e hot reload.
 * (Copiado de `src/core/database/db.ts` do Smart Desk.)
 */

interface MongooseCache {
    conn: typeof mongoose | null
    promise: Promise<typeof mongoose> | null
}

declare global {
    var mongooseCache: MongooseCache | undefined
}

const cached: MongooseCache = global.mongooseCache ?? (global.mongooseCache = { conn: null, promise: null })

export async function connectMongo(): Promise<typeof mongoose> {
    const uri = process.env.MONGODB_URI
    if (!uri) {
        throw new Error("Defina a variável de ambiente MONGODB_URI.")
    }

    if (cached.conn) return cached.conn

    if (!cached.promise) {
        cached.promise = mongoose.connect(uri, { bufferCommands: false })
    }

    try {
        cached.conn = await cached.promise
    } catch (error) {
        cached.promise = null
        throw error
    }

    return cached.conn
}
