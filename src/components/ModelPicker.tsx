import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Cpu, Sparkles, Zap, Gem } from 'lucide-react';

export type ModelProvider = 'gemini' | 'groq' | 'cerebras' | 'openrouter';

export interface ModelOption {
  id: string;
  label: string;
  provider: ModelProvider;
  description: string;
}

const PROVIDER_ORDER: ModelProvider[] = ['openrouter', 'groq', 'cerebras', 'gemini'];

const PROVIDER_META: Record<
  ModelProvider,
  {
    name: string;
    tagline: string;
    badgeClass: string;
    iconClass: string;
    dotClass: string;
    Icon: typeof Sparkles;
  }
> = {
  openrouter: {
    name: 'OpenRouter',
    tagline: 'Router miễn phí thông minh',
    badgeClass: 'model-badge-openrouter',
    iconClass: 'model-icon-openrouter',
    dotClass: 'bg-violet-500',
    Icon: Sparkles,
  },
  groq: {
    name: 'Groq',
    tagline: 'Siêu tốc, tối ưu chat',
    badgeClass: 'model-badge-groq',
    iconClass: 'model-icon-groq',
    dotClass: 'bg-amber-500',
    Icon: Zap,
  },
  cerebras: {
    name: 'Cerebras',
    tagline: 'Suy luận nhanh cho text',
    badgeClass: 'model-badge-cerebras',
    iconClass: 'model-icon-cerebras',
    dotClass: 'bg-rose-500',
    Icon: Cpu,
  },
  gemini: {
    name: 'Gemini',
    tagline: 'Đa phương tiện & bài khó',
    badgeClass: 'model-badge-gemini',
    iconClass: 'model-icon-gemini',
    dotClass: 'bg-sky-500',
    Icon: Gem,
  },
};

interface ModelPickerProps {
  models: ModelOption[];
  value: string;
  onChange: (modelId: string) => void;
  variant?: 'header' | 'compact' | 'navbar';
  label?: string;
  hint?: string;
  align?: 'left' | 'right';
  fullWidth?: boolean;
  className?: string;
}

export function getModelLabel(models: ModelOption[], modelId?: string) {
  return models.find((model) => model.id === modelId)?.label || modelId || '';
}

export function ModelPicker({
  models,
  value,
  onChange,
  variant = 'header',
  label = 'Mô hình AI',
  hint,
  align = 'right',
  fullWidth = false,
  className = '',
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = models.find((model) => model.id === value) || models[0];
  const selectedMeta = selected ? PROVIDER_META[selected.provider] : PROVIDER_META.openrouter;

  const groupedModels = useMemo(() => {
    return PROVIDER_ORDER.map((provider) => ({
      provider,
      meta: PROVIDER_META[provider],
      items: models.filter((model) => model.provider === provider),
    })).filter((group) => group.items.length > 0);
  }, [models]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');

    const updateMobile = () => setIsMobile(media.matches);
    updateMobile();
    media.addEventListener('change', updateMobile);
    return () => media.removeEventListener('change', updateMobile);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleSelect = (modelId: string) => {
    onChange(modelId);
    setOpen(false);
  };

  const isCompact = variant === 'compact';
  const isNavbar = variant === 'navbar';
  const isMinimal = isCompact || isNavbar;

  const triggerTitle = [selected?.description, hint].filter(Boolean).join(' · ');

  return (
    <div
      ref={rootRef}
      className={`model-picker relative ${fullWidth || isNavbar ? 'model-picker-full w-full' : ''} ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      {!isMinimal && (
        <div className={`mb-1.5 flex items-center gap-2 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
          {selected && (
            <span className={`model-provider-pill ${selectedMeta.badgeClass}`}>
              <selectedMeta.Icon className="w-3 h-3" />
              {selectedMeta.name}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={triggerTitle || undefined}
        onClick={() => setOpen((current) => !current)}
        className={`model-picker-trigger ${
          isNavbar
            ? 'model-picker-trigger-navbar'
            : isCompact
              ? 'model-picker-trigger-compact'
              : 'model-picker-trigger-header'
        } ${open ? 'model-picker-trigger-open' : ''}`}
      >
        <span className={`model-provider-icon ${isNavbar ? 'model-provider-icon-navbar' : ''} ${selectedMeta.iconClass}`}>
          <selectedMeta.Icon className={isNavbar ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className={`block truncate font-semibold text-slate-900 ${isNavbar ? 'text-xs sm:text-sm' : isCompact ? 'text-xs' : 'text-sm'}`}>
            {selected?.label || 'Chọn model'}
          </span>
          {!isMinimal && selected && (
            <span className="block truncate text-[11px] font-medium text-slate-400">{selectedMeta.name}</span>
          )}
        </span>
        {isNavbar && (
          <span className={`hidden sm:inline-flex model-provider-pill model-provider-pill-navbar ${selectedMeta.badgeClass}`}>
            {selectedMeta.name}
          </span>
        )}
        <ChevronDown className={`shrink-0 text-slate-400 transition-transform duration-300 ${isNavbar ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${open ? 'rotate-180' : ''}`} />
      </button>

      {hint && !isMinimal && (
        <p className="mt-1 text-[10px] font-medium text-indigo-500">{hint}</p>
      )}

      <AnimatePresence>
        {open && (
          <>
            {isMobile && (
              <motion.button
                type="button"
                aria-label="Đóng danh sách model"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="model-picker-backdrop"
                onClick={() => setOpen(false)}
              />
            )}
            <motion.div
              initial={{ opacity: 0, y: isMobile ? 24 : isCompact ? 6 : 10, scale: isMobile ? 1 : 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isMobile ? 24 : 6, scale: isMobile ? 1 : 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={`model-picker-panel ${isCompact ? 'model-picker-panel-compact' : isNavbar ? 'model-picker-panel-navbar' : 'model-picker-panel-header'} ${
                isMobile ? 'model-picker-panel-sheet' : isNavbar ? 'left-0 right-auto' : align === 'right' ? 'right-0' : 'left-0'
              }`}
              role="listbox"
            >
            <div className="model-picker-panel-head">
              <div>
                <p className="text-sm font-semibold text-slate-900">Chọn mô hình</p>
                <p className="text-xs text-slate-500">Tối ưu theo tốc độ, suy luận hoặc file đính kèm</p>
              </div>
            </div>

            <div className="model-picker-scroll">
              {groupedModels.map(({ provider, meta, items }) => (
                <section key={provider} className="model-picker-group">
                  <div className="model-picker-group-head">
                    <span className={`model-provider-pill ${meta.badgeClass}`}>
                      <meta.Icon className="w-3 h-3" />
                      {meta.name}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">{meta.tagline}</span>
                  </div>

                  <div className="space-y-1.5">
                    {items.map((model) => {
                      const isSelected = model.id === value;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSelect(model.id)}
                          className={`model-picker-option ${isSelected ? 'model-picker-option-active' : ''}`}
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${meta.dotClass}`} />
                            <div className="min-w-0 text-left">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold text-slate-900">{model.label}</span>
                                {isSelected && (
                                  <span className="model-selected-chip">Đang dùng</span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{model.description}</p>
                            </div>
                          </div>
                          <span className={`model-picker-check ${isSelected ? 'model-picker-check-active' : ''}`}>
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
