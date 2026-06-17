var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_vite = require("vite");
var import_dotenv = __toESM(require("dotenv"), 1);

// src/server/gemini.ts
var import_genai = require("@google/genai");
var AI_MODELS = [
  {
    id: "openrouter/free",
    label: "OpenRouter Free Router",
    provider: "openrouter",
    description: "Tu dong chon model mien phi dang kha dung tren OpenRouter."
  },
  {
    id: "llama-3.3-70b-versatile",
    label: "Groq Llama 3.3 70B",
    provider: "groq",
    description: "Tra loi nhanh, tot cho gia su chat text va giai thich ngan."
  },
  {
    id: "openai/gpt-oss-120b",
    label: "Groq GPT-OSS 120B",
    provider: "groq",
    description: "Model open-weight lon tren Groq, phu hop reasoning text."
  },
  {
    id: "gpt-oss-120b",
    label: "Cerebras GPT-OSS 120B",
    provider: "cerebras",
    description: "Suy luan nhanh tren Cerebras, hop voi bai kho dang text."
  },
  {
    id: "zai-glm-4.7",
    label: "Cerebras GLM 4.7",
    provider: "cerebras",
    description: "Lua chon Cerebras moi hon cho text reasoning."
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    description: "Tot nhat cho bai kho, lap luan sau va code."
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    description: "Can bang chat luong, toc do va quota mien phi."
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    provider: "gemini",
    description: "Nhanh, tiet kiem quota, phu hop hoi dap thuong ngay."
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "gemini",
    description: "Model Flash moi hon neu API key cua ban da duoc cap quyen."
  }
];
var DEFAULT_AI_MODEL = "openrouter/free";
var GEMINI_MODELS = AI_MODELS.filter((model) => model.provider === "gemini");
var SYSTEM_INSTRUCTION = "Ban la mot tro giang AI xuat sac, chuyen ho tro hoc sinh va sinh vien trong linh vuc giao duc. Hay giai thich cac khai niem mot cach ro rang, chi tiet, de hieu, tung buoc mot va luon khuyen khich tinh than hoc hoi.";
var aiClient = null;
function getAIClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const error = new Error("GEMINI_API_KEY environment variable is required for Gemini models.");
      error.status = 401;
      throw error;
    }
    aiClient = new import_genai.GoogleGenAI({ apiKey });
  }
  return aiClient;
}
function normalizeModel(model) {
  if (typeof model !== "string") return DEFAULT_AI_MODEL;
  return AI_MODELS.some((item) => item.id === model) ? model : DEFAULT_AI_MODEL;
}
function getModelProvider(model) {
  return AI_MODELS.find((item) => item.id === model)?.provider;
}
function isRetryableModelError(err) {
  const message = String(err?.message || "");
  return err?.status === 400 || err?.status === 401 || err?.status === 403 || err?.status === 404 || err?.status === 429 || err?.status === 500 || err?.status === 502 || err?.status === 503 || err?.status === 504 || message.includes("RESOURCE_EXHAUSTED") || message.includes("UNAVAILABLE") || message.includes("high demand") || message.includes("not found") || message.includes("not supported") || message.includes("not available") || message.includes("quota");
}
function isQuotaError(err) {
  const message = String(err?.message || "");
  return err?.status === 429 || message.includes("RESOURCE_EXHAUSTED") || message.includes("quota");
}
function getProviderApiKey(provider) {
  switch (provider) {
    case "gemini":
      return process.env.GEMINI_API_KEY;
    case "groq":
      return process.env.GROQ_API_KEY;
    case "cerebras":
      return process.env.CEREBRAS_API_KEY;
    case "openrouter":
      return process.env.OPENROUTER_API_KEY;
  }
}
async function generateChatResponse(params) {
  const selectedModel = normalizeModel(params.model);
  const fallbackModels = [
    selectedModel,
    ...AI_MODELS.map((model) => model.id).filter((id) => id !== selectedModel)
  ];
  const prompt = params.prompt?.trim() || "";
  const hasAttachment = Boolean(params.base64Data && params.mimeType);
  const parts = [];
  if (hasAttachment) {
    parts.push({
      inlineData: { data: params.base64Data, mimeType: params.mimeType }
    });
  }
  if (prompt) {
    parts.push({ text: prompt });
  }
  if (parts.length === 0) {
    const error2 = new Error("Prompt or attachment is required.");
    error2.status = 400;
    throw error2;
  }
  let lastError = null;
  let attemptedModels = 0;
  let skippedMissingKeys = 0;
  for (const model of fallbackModels) {
    try {
      const provider = getModelProvider(model);
      if (!provider) {
        continue;
      }
      if (!getProviderApiKey(provider)) {
        skippedMissingKeys += 1;
        continue;
      }
      if (provider && provider !== "gemini") {
        if (hasAttachment) {
          continue;
        }
        attemptedModels += 1;
        return await generateOpenAICompatibleResponse(provider, model, prompt);
      }
      if (provider !== "gemini") {
        continue;
      }
      attemptedModels += 1;
      const ai = getAIClient();
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION
        }
      });
      return {
        text: response.text || "",
        model
      };
    } catch (err) {
      lastError = err;
      if (isRetryableModelError(err)) {
        const provider = getModelProvider(model) || "unknown";
        console.warn(`${provider} model ${model} failed, trying fallback...`, err?.message || err);
        continue;
      }
      break;
    }
  }
  if (attemptedModels === 0 && skippedMissingKeys > 0) {
    const error2 = new Error(
      hasAttachment ? "Chua cau hinh GEMINI_API_KEY. Anh/PDF hien can Gemini de xu ly." : "Chua cau hinh API key cho provider da chon. Hay them OPENROUTER_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY hoac GEMINI_API_KEY vao file .env."
    );
    error2.status = 401;
    throw error2;
  }
  const message = lastError?.message || "Failed to generate content";
  const error = new Error(
    isQuotaError(lastError) ? "Da het gioi han mien phi hoac rate limit cua cac model kha dung. Vui long thu lai sau it phut, doi API key, hoac bat billing trong Google AI Studio." : message
  );
  error.status = isQuotaError(lastError) ? 429 : lastError?.status || 500;
  throw error;
}
function getOpenAICompatibleConfig(provider) {
  const configs = {
    groq: {
      apiKey: process.env.GROQ_API_KEY,
      apiKeyName: "GROQ_API_KEY",
      url: "https://api.groq.com/openai/v1/chat/completions",
      headers: {}
    },
    cerebras: {
      apiKey: process.env.CEREBRAS_API_KEY,
      apiKeyName: "CEREBRAS_API_KEY",
      url: "https://api.cerebras.ai/v1/chat/completions",
      headers: {}
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      apiKeyName: "OPENROUTER_API_KEY",
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-OpenRouter-Title": "EduChat AI"
      }
    }
  };
  return configs[provider];
}
async function generateOpenAICompatibleResponse(provider, model, prompt) {
  const config = getOpenAICompatibleConfig(provider);
  const apiKey = config.apiKey;
  if (!apiKey) {
    const error = new Error(`${config.apiKeyName} environment variable is required for this model.`);
    error.status = 401;
    throw error;
  }
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...config.headers
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: prompt }
      ],
      stream: false
    })
  });
  const responseText = await response.text();
  let data = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      const error = new Error(
        `${provider} tra ve phan hoi khong hop le (${response.status}). Vui long thu lai hoac doi model khac.`
      );
      error.status = response.status || 502;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(
      data?.error?.message || data?.message || `${provider} API request failed (${response.status}).`
    );
    error.status = response.status;
    throw error;
  }
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    const error = new Error(`${provider} tra ve noi dung rong. Vui long thu lai hoac doi model khac.`);
    error.status = 502;
    throw error;
  }
  return {
    text,
    model: data?.model || model
  };
}

// server.ts
import_dotenv.default.config();
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = parseInt(process.env.PORT || "3000", 10);
  app.use(import_express.default.json({ limit: "50mb" }));
  app.get("/api/models", (_req, res) => {
    res.json({
      defaultModel: DEFAULT_AI_MODEL,
      models: AI_MODELS
    });
  });
  app.post("/api/chat", async (req, res) => {
    try {
      const result = await generateChatResponse(req.body || {});
      res.json(result);
    } catch (err) {
      console.error("Error generating content:", err);
      res.status(err?.status || 500).json({
        error: err?.message || "Failed to generate content"
      });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_node_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_node_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
