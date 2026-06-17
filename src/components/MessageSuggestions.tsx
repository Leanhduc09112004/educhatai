import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  FileSearch,
  GitCompare,
  Lightbulb,
  ListOrdered,
  MessageSquareText,
  PenLine,
  Sparkles,
} from 'lucide-react';

export const MESSAGE_SUGGESTIONS = [
  {
    id: 'solve',
    label: 'Giải bài tập này',
    text: 'Hãy giải chi tiết bài tập này từng bước một.',
    Icon: PenLine,
  },
  {
    id: 'theory',
    label: 'Giải thích lý thuyết',
    text: 'Giải thích lý thuyết liên quan một cách dễ hiểu, có ví dụ minh họa.',
    Icon: Lightbulb,
  },
  {
    id: 'summary',
    label: 'Tóm tắt nội dung',
    text: 'Viết tóm tắt ngắn gọn các ý chính của nội dung này.',
    Icon: BookOpen,
  },
  {
    id: 'outline',
    label: 'Lên dàn ý',
    text: 'Giúp mình lên dàn ý trình bày bài này một cách logic.',
    Icon: ListOrdered,
  },
  {
    id: 'analyze-file',
    label: 'Phân tích file đính kèm',
    text: 'Phân tích đề bài trong file đính kèm và nêu hướng giải.',
    Icon: FileSearch,
  },
  {
    id: 'steps',
    label: 'Liệt kê các bước giải',
    text: 'Liệt kê các bước giải chi tiết và giải thích vì sao làm như vậy.',
    Icon: ListOrdered,
  },
  {
    id: 'review',
    label: 'Kiểm tra bài làm',
    text: 'Kiểm tra lại bài làm của mình, chỉ ra lỗi và cách sửa.',
    Icon: CheckCircle2,
  },
  {
    id: 'compare',
    label: 'So sánh phương pháp',
    text: 'So sánh các phương pháp giải và nêu ưu, nhược điểm từng cách.',
    Icon: GitCompare,
  },
  {
    id: 'quiz',
    label: 'Tạo câu hỏi ôn tập',
    text: 'Tạo 5 câu hỏi ôn tập kèm đáp án ngắn từ nội dung bài học.',
    Icon: Sparkles,
  },
  {
    id: 'explain-simple',
    label: 'Giải thích như cho người mới',
    text: 'Giải thích như cho người mới học, tránh thuật ngữ khó.',
    Icon: MessageSquareText,
  },
] as const;

interface MessageSuggestionsProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export function MessageSuggestions({
  onSelect,
  disabled = false,
}: MessageSuggestionsProps) {
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          Gợi ý tin nhắn
        </p>
        <span className="hidden text-[11px] text-slate-400 sm:inline">Chạm để điền nhanh</span>
      </div>

      <div className="suggestions-rail">
        {MESSAGE_SUGGESTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(item.text)}
            className="chip-suggestion suggestion-chip suggestion-chip-footer"
          >
            <item.Icon className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
