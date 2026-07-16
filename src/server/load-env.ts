import { loadEnvConfig } from "@next/env";

// Side-effect module: imported FIRST by server.ts so .env is in process.env
// before any module (Prisma, crypto, pubsub) reads configuration.
loadEnvConfig(process.cwd());
