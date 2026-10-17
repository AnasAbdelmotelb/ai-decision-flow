import { z } from "zod";

// Server-side settings, read from .env.local (never committed).
// Defaults point the OpenAI SDK at a local Ollama server, so no paid API key is needed.
const EnvSchema = z.object({
  OPENAI_BASE_URL: z.url().default("http://localhost:11434/v1/"),
  OPENAI_API_KEY: z.string().min(1).default("ollama"),
  LLM_MODEL: z.string().min(1).default("llama3.2:3b"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  // "1" returns canned answers instead of calling a model (tests and demos without Ollama).
  LLM_STUB: z.enum(["0", "1"]).default("0"),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

export function readServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Report which variables are wrong without echoing their values.
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment variables: ${keys}`);
  }
  return parsed.data;
}
