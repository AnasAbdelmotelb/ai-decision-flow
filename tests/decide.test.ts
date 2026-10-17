import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  InvalidAnswerError,
  PermanentLlmError,
  buildMessages,
  decideWithLlm,
  decideWithStub,
  parseAnswer,
} from "@/lib/decide";

describe("parseAnswer", () => {
  it.each([
    ["YES", "YES"],
    ["no", "NO"],
    ["  Yes.\n", "YES"],
    ['"NO"', "NO"],
    ["**YES**", "YES"],
    ["```\nNO\n```", "NO"],
  ])("accepts %j", (text, expected) => {
    expect(parseAnswer(text)).toBe(expected);
  });

  it.each(["", "Maybe", "Yes, because it mentions an error", "YES NO", "Y", "nope"])("rejects %j", (text) => {
    expect(parseAnswer(text)).toBeNull();
  });
});

describe("buildMessages", () => {
  it("sends the node prompt and the input, with a YES/NO-only instruction", () => {
    const [system, user] = buildMessages("Is this a support request?", "My login fails");
    expect(system.content).toContain("exactly one word: YES or NO");
    expect(user.content).toBe('Question: Is this a support request?\n\nInput:\n"""\nMy login fails\n"""');
  });
});

function fakeClient(...replies: Array<string | Error>) {
  const create = vi.fn(async () => {
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return { choices: [{ message: { content: reply ?? "" } }] };
  });
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

describe("decideWithLlm", () => {
  it("returns the answer from a valid first reply", async () => {
    const { client, create } = fakeClient("YES");
    await expect(decideWithLlm(client, "m", "q?", "in")).resolves.toEqual({
      answer: "YES",
      raw: "YES",
      calls: 1,
      model: "m",
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]).toMatchObject([{ model: "m", temperature: 0, max_tokens: 5 }]);
  });

  it("asks once more when the first reply is not YES or NO", async () => {
    const { client, create } = fakeClient("I think so", "NO");
    await expect(decideWithLlm(client, "m", "q?", "in")).resolves.toMatchObject({ answer: "NO", calls: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("gives up after the repair request with InvalidAnswerError", async () => {
    const { client } = fakeClient("hmm", "still unsure");
    await expect(decideWithLlm(client, "m", "q?", "in")).rejects.toBeInstanceOf(InvalidAnswerError);
  });

  it("marks client errors as permanent and server errors as retryable", async () => {
    const auth = fakeClient(OpenAI.APIError.generate(401, {}, "bad key", new Headers()));
    await expect(decideWithLlm(auth.client, "m", "q?", "in")).rejects.toBeInstanceOf(PermanentLlmError);

    const server = fakeClient(OpenAI.APIError.generate(503, {}, "busy", new Headers()));
    const error = await decideWithLlm(server.client, "m", "q?", "in").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentLlmError);
    expect((error as Error).message).toBe("LLM request failed (HTTP 503).");

    const timeout = fakeClient(new OpenAI.APIConnectionTimeoutError());
    await expect(decideWithLlm(timeout.client, "m", "q?", "in")).rejects.toThrow("LLM request timed out.");
  });
});

describe("decideWithStub", () => {
  it("answers YES only when the question and input share a keyword", () => {
    expect(decideWithStub("Is this a support request?", "I need support with my login").answer).toBe("YES");
    expect(decideWithStub("Is this a support request?", "What does the pro plan cost?").answer).toBe("NO");
    expect(decideWithStub("q", "x").model).toBe("stub");
  });
});
