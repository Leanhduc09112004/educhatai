import { generateChatResponse } from "../src/server/gemini";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await generateChatResponse(req.body || {});
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("Error generating content:", err);
    return res.status(err?.status || 500).json({
      error: err?.message || "Failed to generate content",
    });
  }
}
