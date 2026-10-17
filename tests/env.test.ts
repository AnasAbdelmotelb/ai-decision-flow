import { describe, expect, it } from "vitest";
import { readServerEnv } from "@/lib/env";

describe("readServerEnv", () => {
  it("defaults to a local Ollama server", () => {
    const env = readServerEnv({});
    expect(env.OPENAI_BASE_URL).toBe("http://localhost:11434/v1/");
    expect(env.OPENAI_API_KEY).toBe("ollama");
    expect(env.LLM_MODEL).toBe("llama3.2:3b");
    expect(env.LLM_TIMEOUT_MS).toBe(20_000);
    expect(env.LLM_STUB).toBe("0");
  });

  it("reads overrides", () => {
    const env = readServerEnv({ LLM_MODEL: "qwen2.5:7b", LLM_TIMEOUT_MS: "5000", LLM_STUB: "1" });
    expect(env.LLM_MODEL).toBe("qwen2.5:7b");
    expect(env.LLM_TIMEOUT_MS).toBe(5000);
    expect(env.LLM_STUB).toBe("1");
  });

  it("names bad variables without printing their values", () => {
    expect(() => readServerEnv({ OPENAI_BASE_URL: "not-a-url-secret123" })).toThrow(
      /Invalid environment variables: OPENAI_BASE_URL$/,
    );
    try {
      readServerEnv({ OPENAI_BASE_URL: "not-a-url-secret123" });
    } catch (error) {
      expect(String(error)).not.toContain("secret123");
    }
  });
});
