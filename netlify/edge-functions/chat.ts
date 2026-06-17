import { Context } from "https://edge.netlify.com";

const SYSTEM_INSTRUCTION = "Ban la mot tro giang AI xuat sac, chuyen ho tro hoc sinh va sinh vien trong linh vuc giao duc. Hay giai thich cac khai niem mot cach ro rang, chi tiet, de hieu, tung buoc mot va luon khuyen khich tinh than hoc hoi.";

export default async (request: Request, context: Context) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await request.json();
    const { prompt, model, base64Data, mimeType, provider: frontendProvider } = payload;
    const selectedModel = model || "openrouter/free";

    // Xác định Provider dựa trên thông tin từ frontend hoặc ID model
    const provider = frontendProvider || (selectedModel.startsWith("gemini-") ? "gemini" : "openrouter");

    // Truy cập biến môi trường chuẩn Netlify Edge
    const apiKey = Deno.env.get(`${provider.toUpperCase()}_API_KEY`) || Deno.env.get("OPENROUTER_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: `Chưa cấu hình API Key cho ${provider}` }), { status: 401 });
    }

    let apiUrl = "";
    let body: any = {};

    if (provider === "gemini") {
      // Đảm bảo dùng đúng ID cho Gemini API
      const geminiModel = selectedModel.includes("/") ? selectedModel.split("/")[1] : selectedModel;
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const parts: any[] = [{ text: prompt }];
      if (base64Data && mimeType) {
        parts.unshift({ inlineData: { data: base64Data, mimeType: mimeType } });
      }
      body = {
        contents: [{ role: "user", parts }],
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
      };
    } else {
      apiUrl = provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" :
               provider === "cerebras" ? "https://api.cerebras.ai/v1/chat/completions" :
               "https://openrouter.ai/api/v1/chat/completions";

      body = {
        model: selectedModel,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: prompt }
        ],
        stream: true,
      };
    }
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://educhat-ai.netlify.app",
        "X-OpenRouter-Title": "EduChat AI",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify({ error: errorData.error?.message || errorData.error || "API Error" }), { status: response.status });
    }

    // Chuyển đổi stream từ các provider thành một định dạng text đơn giản cho Frontend
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";

    (async () => {
      const reader = response.body?.getReader();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE data (OpenAI format: data: {...}) hoặc Gemini format
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith("data: ")) {
            const dataStr = trimmedLine.slice(6).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const json = JSON.parse(dataStr);
              const content = json.choices?.[0]?.delta?.content || json.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (content) await writer.write(encoder.encode(content));
            } catch (e) { /* ignore parse errors */ }
          }
        }
      }
      await writer.close();
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
