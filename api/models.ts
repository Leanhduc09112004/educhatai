import { AI_MODELS, DEFAULT_AI_MODEL } from "../src/server/gemini";

export default function handler(_req: any, res: any) {
  return res.status(200).json({
    defaultModel: DEFAULT_AI_MODEL,
    models: AI_MODELS,
  });
}
