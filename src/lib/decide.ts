import OpenAI from "openai";
import type { ServerEnv } from "@/lib/env";

export type Answer = "YES" | "NO";

export type Decision = {
  answer: Answer;
  // The model's text, exactly as returned, for the execution log.
  raw: string;
  // 1 = first reply was valid; 2 = valid after the repair request.
  calls: number;
  model: string;
};

export const SYSTEM_PROMPT =
  "You are one decision step in an automated workflow. Read the input and answer the question about it. " +
  "Reply with exactly one word: YES or NO. No punctuation, no explanation.";

const REPAIR_PROMPT = "Your reply was not valid. Reply with exactly one word: YES or NO.";

export function buildMessages(question: string, input: string): OpenAI.ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Question: ${question.trim()}\n\nInput:\n"""\n${input.trim()}\n"""` },
  ];
}

// Accepts YES or NO with harmless wrapping (case, whitespace, quotes, a trailing full stop,
// markdown bold or a code fence). Anything else, including "Yes, because…", is rejected.
export function parseAnswer(text: string): Answer | null {
  const cleaned = text
    .trim()
    .replace(/^```[a-z]*\s*|\s*```$/gi, "")
    .replace(/^[*_"'`\s]+|[*_"'`.!\s]+$/g, "")
    .toUpperCase();
  return cleaned === "YES" || cleaned === "NO" ? cleaned : null;
}

// Errors that retrying will not fix (bad request, auth, unknown model). Inngest should not retry these.
export class PermanentLlmError extends Error {}

// The model kept replying with something other than YES or NO.
export class InvalidAnswerError extends Error {
  constructor(readonly raw: string) {
    super(`Model did not answer YES or NO (got ${JSON.stringify(raw.slice(0, 80))}).`);
  }
}

function classify(error: unknown): Error {
  if (error instanceof OpenAI.APIError && error.status !== undefined) {
    if ([400, 401, 403, 404, 422].includes(error.status)) {
      return new PermanentLlmError(`LLM request rejected (HTTP ${error.status}).`);
    }
    return new Error(`LLM request failed (HTTP ${error.status}).`);
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new Error("LLM request timed out.");
  if (error instanceof OpenAI.APIConnectionError) return new Error("Could not reach the LLM server.");
  return error instanceof Error ? error : new Error(String(error));
}

async function complete(client: OpenAI, model: string, messages: OpenAI.ChatCompletionMessageParam[]) {
  try {
    const response = await client.chat.completions.create({ model, messages, temperature: 0, max_tokens: 5 });
    return response.choices[0]?.message?.content ?? "";
  } catch (error) {
    throw classify(error);
  }
}

// Asks the model one YES/NO question about the input. One repair request if the first reply is invalid;
// if that fails too, throws InvalidAnswerError (retryable: a fresh attempt may answer properly).
export async function decideWithLlm(client: OpenAI, model: string, question: string, input: string): Promise<Decision> {
  const messages = buildMessages(question, input);
  const first = await complete(client, model, messages);
  const answer = parseAnswer(first);
  if (answer) return { answer, raw: first, calls: 1, model };

  const second = await complete(client, model, [
    ...messages,
    { role: "assistant", content: first },
    { role: "user", content: REPAIR_PROMPT },
  ]);
  const repaired = parseAnswer(second);
  if (repaired) return { answer: repaired, raw: second, calls: 2, model };
  throw new InvalidAnswerError(second);
}

const STOP_WORDS = new Set(["this", "that", "with", "from", "they", "their", "about", "there", "have", "does", "what"]);

function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word)),
  );
}

// LLM_STUB=1: a deterministic stand-in for tests and demos without a model. Not AI: it answers YES
// when the question and the input share a keyword (4+ letters), otherwise NO.
export function decideWithStub(question: string, input: string): Decision {
  const inputWords = keywords(input);
  const shared = [...keywords(question)].some((word) => inputWords.has(word));
  const answer: Answer = shared ? "YES" : "NO";
  return { answer, raw: answer, calls: 1, model: "stub" };
}

export type Decide = (question: string, input: string) => Promise<Decision>;

export function createDecide(env: ServerEnv, client: OpenAI): Decide {
  if (env.LLM_STUB === "1") return async (question, input) => decideWithStub(question, input);
  return (question, input) => decideWithLlm(client, env.LLM_MODEL, question, input);
}
