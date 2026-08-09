"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Type, Image as ImageIcon } from "lucide-react";
import type { SpotlightNodeOption } from "@/lib/workspace/graphUtils";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  promptNode: Type,
  imageNode: ImageIcon,
};

type SpotlightProps = {
  open: boolean;
  options: SpotlightNodeOption[];
  title?: string;
  onClose: () => void;
  onSelect: (option: SpotlightNodeOption) => void;
  /** Screen position for floating placement (optional) */
  position?: { x: number; y: number } | null;
};

export default function Spotlight({
  open,
  options,
  title = "Add a node",
  onClose,
  onSelect,
  position,
}: SpotlightProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        o.category.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const opt = filtered[activeIndex];
        if (opt) onSelect(opt);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIndex, onClose, onSelect]);

  if (!open) return null;

  const style: React.CSSProperties = position
    ? {
        left: Math.min(position.x, window.innerWidth - 340),
        top: Math.min(position.y, window.innerHeight - 420),
      }
    : {
        left: "50%",
        top: "22%",
        transform: "translateX(-50%)",
      };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        aria-label="Close spotlight"
        onClick={onClose}
      />
      <div
        className="fixed z-[90] w-[min(320px,92vw)] bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        style={style}
        role="dialog"
        aria-label={title}
      >
        <div className="px-3 pt-3 pb-2 border-b border-white/5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 px-1">
            {title}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search nodes…"
              className="w-full bg-[#27272a] text-white text-sm rounded-xl pl-9 pr-3 py-2.5 outline-none focus:ring-1 focus:ring-blue-500/40 placeholder:text-zinc-500"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">No compatible nodes</p>
          ) : (
            filtered.map((opt, i) => {
              const Icon = ICONS[opt.type] || Type;
              const active = i === activeIndex;
              return (
                <button
                  key={`${opt.type}-${opt.connectTargetHandle || opt.connectSourceHandle || "x"}`}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => onSelect(opt)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    active ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      opt.type === "imageNode"
                        ? "bg-purple-500/15 text-purple-400"
                        : "bg-blue-500/15 text-blue-400"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{opt.label}</div>
                    <div className="text-[11px] text-zinc-500 leading-snug mt-0.5">{opt.description}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-3 py-2 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500">
          <span>
            <kbd className="bg-[#27272a] px-1.5 py-0.5 rounded text-zinc-400">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="bg-[#27272a] px-1.5 py-0.5 rounded text-zinc-400">↵</kbd> insert
          </span>
          <span>
            <kbd className="bg-[#27272a] px-1.5 py-0.5 rounded text-zinc-400">esc</kbd> close
          </span>
        </div>
      </div>
    </>
  );
}
