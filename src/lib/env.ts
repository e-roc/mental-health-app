import { z } from "zod";

/**
 * Validated at process start (imported by server.ts) so a misconfigured
 * deployment fails fast and loudly instead of 500ing on first decrypt.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be a 32-byte hex string"),
  APP_INDEX_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be a 32-byte hex string"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export function validateEnv(): void {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  if (
    result.data.NODE_ENV === "production" &&
    result.data.APP_ENCRYPTION_KEY === result.data.APP_INDEX_KEY
  ) {
    throw new Error("APP_ENCRYPTION_KEY and APP_INDEX_KEY must be different keys");
  }
}
