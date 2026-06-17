import express from "express";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { AI_MODELS, DEFAULT_AI_MODEL, generateChatResponse } from "./src/server/gemini";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: "50mb" }));

  app.get("/api/models", (_req, res) => {
    res.json({
      defaultModel: DEFAULT_AI_MODEL,
      models: AI_MODELS,
    });
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const result = await generateChatResponse(req.body || {});
      res.json(result);
    } catch (err: any) {
      console.error("Error generating content:", err);
      res.status(err?.status || 500).json({
        error: err?.message || "Failed to generate content",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
