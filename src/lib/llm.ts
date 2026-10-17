import OpenAI from "openai";
import { readServerEnv } from "@/lib/env";

// One OpenAI-compatible client for the whole server. With the defaults it talks to Ollama.
export function createLlmClient(env = readServerEnv()) {
  return new OpenAI({
    baseURL: env.OPENAI_BASE_URL,
    apiKey: env.OPENAI_API_KEY,
    timeout: env.LLM_TIMEOUT_MS,
    // Inngest owns retries, so the SDK does not retry on its own.
    maxRetries: 0,
  });
}
