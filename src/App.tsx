/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Image as ImageIcon, X, Camera, FileText, RefreshCw, Download, RotateCcw, StopCircle, MessageSquare, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2pdf from 'html2pdf.js';
import { jsPDF } from 'jspdf';
import { ModelPicker, getModelLabel } from './components/ModelPicker';
import { MessageSuggestions } from './components/MessageSuggestions';

const CHAT_API = '/api/chat';

const DOC_EXTENSIONS: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function getFileMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return DOC_EXTENSIONS[ext] || 'application/octet-stream';
}

function isDocumentAttachment(mimeType: string): boolean {
  return (
    mimeType === 'application/pdf' ||
    mimeType === 'application/msword' ||
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/vnd.ms-word'
  );
}

async function parseJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type");
  if (!response.ok) {
    if (contentType && contentType.includes("text/html")) {
      throw new Error(`Lỗi kết nối (404): Không tìm thấy dịch vụ xử lý. Hãy đảm bảo file 'chat.ts' đã được đặt đúng vào thư mục 'netlify/edge-functions/'.`);
    }
    const errorText = await response.text();
    let errorJson;
    try { errorJson = JSON.parse(errorText); } catch { errorJson = { error: errorText }; }
    throw new Error(errorJson.error || `Lỗi server (${response.status})`);
  }
  return response.json();
}

interface FileAttachment {
  name: string;
  base64: string;
  mimeType: string;
  previewUrl: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachment?: FileAttachment;
  model?: string;
  isError?: boolean;
}

interface GeminiModelOption {
  id: string;
  label: string;
  provider: 'gemini' | 'groq' | 'cerebras' | 'openrouter';
  description: string;
}

const AI_MODELS: GeminiModelOption[] = [
  {
    id: 'openrouter/free',
    label: 'OpenRouter Free Router',
    provider: 'openrouter',
    description: 'Tự động chọn model miễn phí đang khả dụng trên OpenRouter.',
  },
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Groq Llama 3.3 70B',
    provider: 'groq',
    description: 'Trả lời rất nhanh, hợp cho gia sư chat text.',
  },
  {
    id: 'openai/gpt-oss-120b',
    label: 'Groq GPT-OSS 120B',
    provider: 'groq',
    description: 'Model open-weight lớn trên Groq, hợp reasoning text.',
  },
  {
    id: 'gpt-oss-120b',
    label: 'Cerebras GPT-OSS 120B',
    provider: 'cerebras',
    description: 'Suy luận nhanh trên Cerebras, hợp bài khó dạng text.',
  },
  {
    id: 'zai-glm-4.7',
    label: 'Cerebras GLM 4.7',
    provider: 'cerebras',
    description: 'Lựa chọn Cerebras mới hơn cho text reasoning.',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'gemini',
    description: 'Mạnh nhất cho bài khó, lập luận sâu và code.',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'gemini',
    description: 'Cân bằng tốt giữa chất lượng, tốc độ và quota miễn phí.',
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    provider: 'gemini',
    description: 'Nhanh, tiết kiệm quota, hợp với hỏi đáp thường ngày.',
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    provider: 'gemini',
    description: 'Model Flash mới hơn nếu API key đã được cấp quyền.',
  },
];

const DEFAULT_MODEL = 'openrouter/free';
const COMPOSER_IDLE_MS = 30_000;
const SCROLL_BOTTOM_THRESHOLD = 72;

type ComposerMode = 'expanded' | 'minimized';

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachment, setAttachment] = useState<FileAttachment | null>(null);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [retryModel, setRetryModel] = useState(DEFAULT_MODEL);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [showScanner, setShowScanner] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingUserMessageRef = useRef<Message | null>(null);
  const requestIdRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const [composerMode, setComposerMode] = useState<ComposerMode>('expanded');

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const updateComposerMode = useCallback(() => {
    if (messages.length === 0 || loading) {
      setComposerMode('expanded');
      return;
    }

    const main = mainRef.current;
    if (!main) return;

    const lastMessage = messages[messages.length - 1];
    const atBottom =
      main.scrollHeight - main.scrollTop - main.clientHeight <= SCROLL_BOTTOM_THRESHOLD;
    const readingAssistantReply =
      lastMessage?.role === 'assistant' && !lastMessage.isError;

    if (!atBottom || (atBottom && readingAssistantReply)) {
      setComposerMode('minimized');
      return;
    }

    setComposerMode('expanded');
  }, [loading, messages]);

  const expandComposer = useCallback(() => {
    markActivity();
    setComposerMode('expanded');
    setTimeout(() => textareaRef.current?.focus(), 120);
  }, [markActivity]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    try {
      localStorage.setItem('chat_history', JSON.stringify(messages));
    } catch (e) {
      console.warn("Could not save chat to localStorage, might be too large");
    }

    requestAnimationFrame(() => updateComposerMode());
  }, [messages, updateComposerMode]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const onScroll = () => {
      markActivity();
      updateComposerMode();
    };

    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, [markActivity, updateComposerMode]);

  useEffect(() => {
    const onActivity = () => markActivity();
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [markActivity]);

  useEffect(() => {
    if (messages.length === 0 || loading) return;

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= COMPOSER_IDLE_MS) {
        setComposerMode('minimized');
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loading, messages.length]);

  const showSuggestions = messages.length === 0 && !loading;

  const resetFileInputs = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (docInputRef.current) docInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      alert(`File quá lớn! Kích thước tối đa là 5MB. File của bạn là ${(file.size / (1024 * 1024)).toFixed(2)}MB.`);
      resetFileInputs();
      return;
    }

    const mimeType = getFileMimeType(file);
    const isImage = mimeType.startsWith('image/');
    const isDocument = isDocumentAttachment(mimeType);

    if (!isImage && !isDocument) {
      alert('Chỉ hỗ trợ ảnh, PDF hoặc file Word (.doc, .docx).');
      resetFileInputs();
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const base64Data = result.split(',')[1];

      setAttachment({
        name: file.name,
        base64: base64Data,
        mimeType,
        previewUrl: result
      });
    };
    reader.readAsDataURL(file);
    resetFileInputs();
  };

  const startScanner = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
      setShowScanner(true);
      // Wait for the modal to mount
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (err) {
      alert('Không thể truy cập máy ảnh. Vui lòng cấp quyền để sử dụng tính năng scan.');
    }
  };

  const closeScanner = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setStream(null);
    setShowScanner(false);
  };

  const captureAndScan = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        
        try {
          const pdf = new jsPDF({
            orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [canvas.width, canvas.height]
          });
          pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
          const pdfDataUri = pdf.output('datauristring');
          
          const base64Data = pdfDataUri.split(',')[1];
          setAttachment({
            name: `scanned_document_${Date.now()}.pdf`,
            base64: base64Data,
            mimeType: 'application/pdf',
            previewUrl: imgData // Use image as preview
          });
          closeScanner();
        } catch (err) {
          console.error("Lỗi khi tạo PDF:", err);
          alert("Có lỗi xảy ra khi tạo file PDF.");
        }
      }
    }
  };

  const removeAttachment = () => setAttachment(null);

  const handleReset = () => {
    cancelCurrentRequest();
    setMessages([]);
    setInput('');
    setAttachment(null);
    setComposerMode('expanded');
    markActivity();
  };

  const downloadPDF = () => {
    const element = document.getElementById('chat-history');
    if (!element) return;
    
    const opt = {
      margin:       10,
      filename:     'lich-su-educhat.pdf',
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };
    
    html2pdf().set(opt).from(element).save();
  };

  const downloadDOC = () => {
    const element = document.getElementById('chat-history');
    if (!element) return;

    const clone = element.cloneNode(true) as HTMLElement;
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Lich su EduChat</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937; }
            img { max-width: 100%; height: auto; }
            pre, code { white-space: pre-wrap; word-break: break-word; }
            table { border-collapse: collapse; width: 100%; table-layout: fixed; }
            th, td { border: 1px solid #d1d5db; padding: 6px; vertical-align: top; word-break: break-word; }
          </style>
        </head>
        <body>
          <h1>EduChat AI - Lich su giai bai</h1>
          ${clone.innerHTML}
        </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lich-su-educhat.doc';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const requestAssistantReply = async (userMessage: Message, model: string, signal?: AbortSignal) => {
    const response = await fetch(CHAT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        prompt: userMessage.text,
        base64Data: userMessage.attachment?.base64,
        mimeType: userMessage.attachment?.mimeType,
        model,
      }),
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.error || `Không gửi được tin nhắn (HTTP ${response.status})`);
    }
    return data as { text: string; model: string };
  };

  const appendAssistantMessage = (text: string, model?: string, isError = false) => {
    const assistantMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      text,
      model,
      isError,
    };
    setMessages((prev) => [...prev, assistantMessage]);
  };

  const runChatRequest = async (userMessage: Message, model: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    pendingUserMessageRef.current = userMessage;
    setLoading(true);

    try {
      const data = await requestAssistantReply(userMessage, model, controller.signal);
      if (requestId !== requestIdRef.current) return;
      appendAssistantMessage(data.text, data.model);
    } catch (error: any) {
      if (error?.name === 'AbortError' || requestId !== requestIdRef.current) {
        return;
      }
      console.error(error);
      appendAssistantMessage(`Lỗi: ${error.message}`, model, true);
    } finally {
      if (requestId === requestIdRef.current) {
        abortControllerRef.current = null;
        pendingUserMessageRef.current = null;
        setLoading(false);
      }
    }
  };

  const sendMessage = async () => {
    if (!input.trim() && !attachment) return;
    if (loading) return;

    markActivity();
    setComposerMode('expanded');

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      attachment: attachment || undefined
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachment(null);
    setRetryModel(selectedModel);
    await runChatRequest(userMessage, selectedModel);
  };

  const cancelCurrentRequest = () => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    pendingUserMessageRef.current = null;
    setLoading(false);
  };

  const handleModelChange = (newModel: string) => {
    setSelectedModel(newModel);
    if (loading && pendingUserMessageRef.current) {
      const pendingMessage = pendingUserMessageRef.current;
      abortControllerRef.current?.abort();
      void runChatRequest(pendingMessage, newModel);
    }
  };

  const retryWithModel = async (model: string, errorMessageId: string) => {
    const errorIndex = messages.findIndex((msg) => msg.id === errorMessageId);
    if (errorIndex <= 0) return;

    const userMessage = messages[errorIndex - 1];
    if (!userMessage || userMessage.role !== 'user') return;

    setSelectedModel(model);
    setRetryModel(model);
    setMessages((prev) => prev.slice(0, errorIndex));
    await runChatRequest(userMessage, model);
  };

  const revertLastQuestion = (errorMessageId: string) => {
    const errorIndex = messages.findIndex((msg) => msg.id === errorMessageId);
    if (errorIndex <= 0) return;

    const userMessage = messages[errorIndex - 1];
    if (!userMessage || userMessage.role !== 'user') return;

    setMessages((prev) => prev.slice(0, errorIndex - 1));
    setInput(userMessage.text);
    if (userMessage.attachment) {
      setAttachment(userMessage.attachment);
    }
  };

  const applySuggestion = (text: string) => {
    setInput(text);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const renderDocumentPreview = (attachment: FileAttachment, compact = false) => {
    if (compact) {
      return <FileText className="w-4 h-4 text-indigo-600" />;
    }

    const isWord =
      attachment.mimeType.includes('wordprocessingml') ||
      attachment.mimeType === 'application/msword';

    return (
      <div className="flex items-center gap-2 bg-indigo-700/50 p-3 rounded-xl text-white">
        <FileText className="w-8 h-8 shrink-0 text-white/80" />
        <span className="text-sm font-medium truncate max-w-[min(42vw,12rem)] sm:max-w-[200px]">
          {attachment.name}
        </span>
        <span className="text-xs opacity-80">
          {isWord ? 'Word' : attachment.mimeType === 'application/pdf' ? 'PDF' : 'Tài liệu'}
        </span>
      </div>
    );
  };

  return (
    <div className="app-shell flex flex-col h-screen text-slate-900 font-sans overflow-hidden">
      {/* Header */}
      <header className="glass-header relative z-40 shrink-0">
        <div className="header-nav">
          <div className="header-brand flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="brand-mark w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white font-semibold text-sm">AI</span>
            </div>
            <h1 className="hidden min-[420px]:block truncate text-slate-800 font-semibold text-sm sm:text-base tracking-tight max-w-[6rem] sm:max-w-none">
              EduChat AI
            </h1>
            <div className="badge-online hidden lg:flex items-center px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded-full cursor-default shrink-0">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse mr-1.5"></div>
              <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-tight">Online</span>
            </div>
          </div>

          <div className="header-model-slot min-w-0 flex-1">
            <ModelPicker
              models={AI_MODELS}
              value={selectedModel}
              onChange={handleModelChange}
              variant="navbar"
              align="left"
              hint={loading ? 'Đang trả lời — đổi model sẽ gửi lại câu hỏi' : undefined}
            />
          </div>

          <div className="header-actions shrink-0">
            {messages.length > 0 && (
              <div className="header-action-group">
                <button
                  onClick={downloadPDF}
                  className="btn-secondary flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200"
                  title="Tải xuống PDF"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden md:inline">Tải PDF</span>
                </button>
                <button
                  onClick={downloadDOC}
                  className="btn-secondary flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200"
                  title="Tải xuống Word"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden md:inline">Tải DOC</span>
                </button>
                <button
                  onClick={handleReset}
                  className="btn-secondary flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-lg border border-slate-200"
                  title="Làm mới cuộc hội thoại"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden md:inline">Làm mới</span>
                </button>
              </div>
            )}

            <div className="avatar-badge w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center shrink-0 cursor-default">
              <span className="text-indigo-700 font-bold text-xs">PA</span>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-8 flex flex-col"
      >
        {messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-1"
          >
            <div className="flex gap-4 mb-4 opacity-90">
              {[
                { Icon: ImageIcon, key: 'image' },
                { Icon: FileText, key: 'file' },
                { Icon: Camera, key: 'camera' },
              ].map(({ Icon, key }, index) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * index, duration: 0.4 }}
                  className="hero-icon bg-slate-200/80 p-4 rounded-full border border-white/70 shadow-sm cursor-default"
                >
                  <Icon className="w-8 h-8 text-slate-500" />
                </motion.div>
              ))}
            </div>
            <h2 className="text-xl font-semibold mb-2 text-slate-700 tracking-tight">Trợ giảng AI của bạn</h2>
            <p className="text-slate-500 max-w-md leading-relaxed text-sm sm:text-base px-2">
              Hãy gửi câu hỏi, tải ảnh,{' '}
              <button onClick={() => docInputRef.current?.click()} className="text-link-premium text-indigo-600 font-semibold">
                PDF/Word
              </button>{' '}
              hoặc{' '}
              <button onClick={startScanner} className="text-link-premium text-indigo-600 font-semibold">
                scan bằng camera
              </button>
              . Chọn gợi ý tin nhắn bên dưới để bắt đầu nhanh.
            </p>
          </motion.div>
        ) : (
          <div id="chat-history" className="max-w-4xl mx-auto w-full space-y-4 sm:space-y-6">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className={`group chat-message-row flex ${
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="assistant-avatar w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">AI</span>
                  </div>
                )}
                
                <div
                  className={`message-width flex flex-col min-w-0 ${
                    msg.role === 'user'
                      ? 'items-end'
                      : 'items-start'
                  }`}
                >
                  <div
                    className={`message-bubble px-5 py-4 rounded-2xl shadow-sm min-w-0 max-w-full overflow-hidden break-words ${
                      msg.role === 'user'
                        ? 'message-bubble-user bg-indigo-600 text-white rounded-tr-none'
                        : msg.isError
                          ? 'bg-rose-50 border border-rose-200 text-rose-800 rounded-tl-none'
                          : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                    }`}
                  >
                    {msg.attachment && (
                      <div className={`mb-3 ${isDocumentAttachment(msg.attachment.mimeType) ? 'w-auto' : 'w-48 h-48 sm:w-64 sm:h-64'} rounded-xl overflow-hidden bg-black/10 border border-white/20`}>
                        {isDocumentAttachment(msg.attachment.mimeType) ? (
                          renderDocumentPreview(msg.attachment)
                        ) : (
                          <img 
                            src={msg.attachment.previewUrl} 
                            alt="Attached content" 
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    )}
                    {msg.text && (
                      msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
                          {msg.text}
                        </p>
                      ) : (
                        <div className="prose prose-sm sm:prose-base prose-slate max-w-none min-w-0 overflow-hidden break-words">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                      )
                    )}
                  </div>
                  {msg.role === 'assistant' && msg.isError && (
                    <div className="model-retry-bar mt-2">
                      <ModelPicker
                        models={AI_MODELS}
                        value={retryModel}
                        onChange={setRetryModel}
                        variant="compact"
                        label="Model thay thế"
                        align="left"
                      />
                      <button
                        onClick={() => retryWithModel(retryModel, msg.id)}
                        disabled={loading}
                        className="btn-retry inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Thử model khác
                      </button>
                      <button
                        onClick={() => revertLastQuestion(msg.id)}
                        disabled={loading}
                        className="btn-secondary inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Hoàn tác câu hỏi
                      </button>
                    </div>
                  )}
                  {msg.role === 'assistant' && msg.model && !msg.isError && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-400">
                        {getModelLabel(AI_MODELS, msg.model)}
                      </span>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="avatar-badge w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                    <span className="text-slate-500 text-xs font-bold">PA</span>
                  </div>
                )}
              </motion.div>
            ))}
            <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex chat-message-row flex-row"
              >
                <div className="assistant-avatar w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">AI</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="typing-indicator bg-white border border-slate-200 px-5 py-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div>
                    </div>
                    <span className="text-xs text-slate-500">{getModelLabel(AI_MODELS, selectedModel)}</span>
                  </div>
                  <button
                    onClick={cancelCurrentRequest}
                    className="btn-secondary inline-flex items-center gap-1 self-start rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <StopCircle className="w-3 h-3" />
                    Hủy / đổi model
                  </button>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      <motion.footer
        layout
        className={`glass-footer footer-shell shrink-0 composer-footer ${
          messages.length > 0 && composerMode === 'minimized'
            ? 'composer-footer-minimized'
            : 'composer-footer-expanded'
        }`}
      >
        <div className="max-w-4xl mx-auto w-full">
          {messages.length > 0 && composerMode === 'minimized' ? (
            <button
              type="button"
              onClick={expandComposer}
              className="composer-mini-bar"
              title="Mở rộng ô nhập tin nhắn"
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-indigo-500" />
              <span className="truncate text-sm font-medium text-slate-600">
                {input.trim() || attachment ? 'Tiếp tục soạn tin nhắn...' : 'Chạm để nhập tin nhắn — đang xem đáp án'}
              </span>
              <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ) : (
            <>
              {messages.length > 0 && (
                <div className="panel-soft mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-700">Tải đáp án đã giải</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={downloadPDF}
                      className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-white hover:bg-indigo-50 rounded-lg border border-indigo-100"
                      title="Tải đáp án PDF"
                    >
                      <Download className="w-4 h-4" />
                      Tải PDF
                    </button>
                    <button
                      onClick={downloadDOC}
                      className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-white hover:bg-indigo-50 rounded-lg border border-indigo-100"
                      title="Tải đáp án Word"
                    >
                      <FileText className="w-4 h-4" />
                      Tải DOC
                    </button>
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {showSuggestions && (
                  <motion.div
                    key="message-suggestions"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <MessageSuggestions onSelect={applySuggestion} />
                  </motion.div>
                )}
              </AnimatePresence>

              {attachment && (
                <div className="attachment-pill mb-3 flex items-center gap-2 bg-indigo-50 text-indigo-800 px-3 py-2 rounded-lg border border-indigo-100 max-w-full">
                  <div className="w-6 h-6 rounded overflow-hidden flex items-center justify-center bg-indigo-200/50 shrink-0">
                    {isDocumentAttachment(attachment.mimeType) ? (
                      renderDocumentPreview(attachment, true)
                    ) : (
                      <img src={attachment.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <span className="attachment-name text-sm font-medium truncate">
                    {attachment.name}
                  </span>
                  <button
                    onClick={removeAttachment}
                    className="icon-tool p-1 hover:bg-indigo-200 rounded-full ml-1"
                    title="Remove attachment"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="composer-shell">
                <div className="tool-rail flex shrink-0 flex-wrap gap-1 bg-slate-100/90 py-1 px-1.5 rounded-xl border border-slate-200/80 self-start">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="icon-tool p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white/80"
                    disabled={loading}
                    title="Tải ảnh lên"
                  >
                    <ImageIcon className="w-5 h-5 sm:w-5 sm:h-5" />
                  </button>

                  <input
                    type="file"
                    ref={docInputRef}
                    className="hidden"
                    accept="application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => docInputRef.current?.click()}
                    className="icon-tool p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white/80"
                    disabled={loading}
                    title="Tải PDF hoặc Word (.doc, .docx)"
                  >
                    <FileText className="w-5 h-5 sm:w-5 sm:h-5" />
                  </button>

                  <input
                    type="file"
                    ref={cameraInputRef}
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={startScanner}
                    className="icon-tool p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white/80"
                    disabled={loading}
                    title="Chụp ảnh và Scan PDF"
                  >
                    <Camera className="w-5 h-5 sm:w-5 sm:h-5" />
                  </button>
                </div>

                <div className="composer-input-wrap">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      markActivity();
                      setInput(e.target.value);
                    }}
                    onFocus={markActivity}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Nhập câu hỏi hoặc bài tập bạn cần giải đáp..."
                    className="input-premium composer-textarea bg-slate-100 border border-transparent focus:border-indigo-400 focus:bg-white rounded-2xl outline-none text-slate-700 placeholder-slate-400 shadow-inner"
                    rows={1}
                  />

                  <div className="composer-send">
                    <button
                      onClick={sendMessage}
                      disabled={(!input.trim() && !attachment) || loading}
                      className="btn-primary px-3 sm:px-5 py-2.5 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:hover:shadow-lg flex items-center justify-center gap-2 min-w-[44px] min-h-[44px]"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <span className="hidden sm:inline">Gửi câu hỏi</span>
                          <Send className="w-4 h-4 sm:hidden" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 sm:mt-4 flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                <div className="flex items-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em]">
                  <div className="w-2 h-2 mr-1.5 bg-emerald-500 rounded-full"></div>
                  Kết nối an toàn
                </div>
                <div className="flex items-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em]">
                  Tốc độ cực nhanh
                </div>
              </div>
            </>
          )}
        </div>
      </motion.footer>

      {/* Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex justify-between items-center p-4 bg-black text-white shrink-0">
            <h3 className="font-medium text-lg">Scan tài liệu</h3>
            <button onClick={closeScanner} className="scanner-close p-2 bg-white/20 rounded-full">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-contain"
            />
            {/* Guide frame overlay */}
            <div className="absolute inset-4 sm:inset-12 border-2 border-white/50 rounded-2xl pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white -mt-1 -ml-1 rounded-tl"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white -mt-1 -mr-1 rounded-tr"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white -mb-1 -ml-1 rounded-bl"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white -mb-1 -mr-1 rounded-br"></div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="p-6 bg-black flex justify-center items-center shrink-0 pb-10">
            <button 
              onClick={captureAndScan}
              className="scanner-shutter w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95"
            >
              <div className="w-16 h-16 bg-white rounded-full"></div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
