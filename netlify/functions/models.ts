import { AI_MODELS, DEFAULT_AI_MODEL } from "../../src/server/gemini";

export async function handler() {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      defaultModel: DEFAULT_AI_MODEL,
      models: AI_MODELS,
    }),
  };
}
