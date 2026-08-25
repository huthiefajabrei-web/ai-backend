"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Type,
  Image as ImageIcon,
  Video,
  Sparkles,
  Zap,
  List,
  Upload,
  Layers,
  Box,
  LayoutGrid,
} from "lucide-react";
import type { SpotlightNodeOption } from "@/lib/workspace/graphUtils";

type CategoryFilter = "all" | "text" | "image" | "video" | "media";

const FILTERS: { id: CategoryFilter; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "all", icon: LayoutGrid },
  { id: "text", icon: Type },
  { id: "image", icon: ImageIcon },
  { id: "video", icon: Video },
  { id: "media", icon: Type },
];

const ICON_MAP: Record<
  SpotlightNodeOption["icon"],
  { Icon: React.ComponentType<{ size?: number; className?: string }>; box: string }
> = {
  text: { Icon: Type, box: "bg-[#2563eb] text-white" },
  image: { Icon: ImageIcon, box: "bg-[#ea580c] text-white" },
  video: { Icon: Video, box: "bg-[#0d9488] text-white" },
  assistant: { Icon: Sparkles, box: "bg-[#ca8a04] text-white" },
  upscaler: { Icon: Zap, box: "bg-[#2563eb] text-white" },
  list: { Icon: List, box: "bg-[#3f3f46] text-white" },
  upload: { Icon: Upload, box: "bg-[#2563eb] text-white" },
  assets: { Icon: Layers, box: "bg-[#2563eb] text-white" },
  stock: { Icon: Box, box: "bg-[#3f3f46] text-white" },
};

function matchesFilter(opt: SpotlightNodeOption, filter: CategoryFilter) {
  if (filter === "all") return true;
  if (filter === "media") return opt.group === "media";
  if (filter === "text") return opt.category === "Text";
  if (filter === "image") return opt.category === "Image" || opt.icon === "upload" || opt.icon === "assets";
  if (filter === "video") return opt.category === "Video";
  return true;
}

type SpotlightProps = {
  open: boolean;
  options: SpotlightNodeOption[];
  title?: string;
  onClose: () => void;
  onSelect: (option: SpotlightNodeOption) => void;
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
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => {
      if (!matchesFilter(o, filter)) return false;
      if (!q) return true;
      return (
        o.label.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        o.category.toLowerCase().includes(q) ||
        o.group.toLowerCase().includes(q)
      );
    });
  }, [options, query, filter]);

  const groups = useMemo(() => {
    const basics = filtered.filter((o) => o.group === "basics");
    const media = filtered.filter((o) => o.group === "media");
    return [
      { id: "basics", label: "BASICS", items: basics },
      { id: "media", label: "MEDIA", items: media },
    ].filter((g) => g.items.length > 0);
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFilter("all");
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, filter]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-spot-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

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
        if (opt && !opt.comingSoon) onSelect(opt);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIndex, onClose, onSelect]);

  if (!open) return null;

  const menuW = 300;
  const menuH = 560;
  const style: React.CSSProperties = position
    ? {
        left: Math.max(12, Math.min(position.x, window.innerWidth - menuW - 12)),
        top: Math.max(12, Math.min(position.y, window.innerHeight - Math.min(menuH, window.innerHeight - 24))),
      }
    : {
        left: "50%",
        top: "18%",
        transform: "translateX(-50%)",
      };

  let runningIndex = -1;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] bg-transparent"
        aria-label="Close menu"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-[90] w-[min(300px,92vw)] h-[min(560px,80vh)] bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={style}
        role="dialog"
        aria-label={title}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="p-4 border-b border-gray-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-[#27272a] text-white text-sm rounded-lg pl-10 pr-4 py-2 outline-none focus:ring-1 focus:ring-amber-600/40 placeholder:text-gray-500"
            />
          </div>
          <div className="flex items-center justify-between mt-4 px-1 text-gray-400">
            {FILTERS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`p-1 rounded-md transition-colors ${
                  filter === id ? "text-white bg-white/10" : "hover:text-white"
                }`}
                aria-label={id}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">No matching nodes</p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="mb-5 last:mb-0">
                <h3 className="text-xs font-bold text-gray-500 mb-3 tracking-wider">{group.label}</h3>
                {group.items.map((opt) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  const visual = ICON_MAP[opt.icon] || ICON_MAP.text;
                  const Icon = visual.Icon;
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={`${opt.type}-${opt.label}`}
                      type="button"
                      data-spot-index={idx}
                      disabled={opt.comingSoon}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        if (!opt.comingSoon) onSelect(opt);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors mb-1 ${
                        opt.comingSoon
                          ? "opacity-50 cursor-not-allowed"
                          : active
                            ? "bg-[#27272a]"
                            : "hover:bg-[#27272a]"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${visual.box}`}
                      >
                        <Icon size={15} />
                      </div>
                      <span className="text-sm font-medium text-gray-200 flex-1">{opt.label}</span>
                      {opt.comingSoon ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Soon
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-gray-800 bg-[#1c1c1f] flex items-center justify-between text-[10px] text-gray-500 font-medium shrink-0">
          <div className="flex items-center gap-1">
            <span className="bg-[#27272a] px-1.5 py-0.5 rounded text-gray-400">N</span>
            Open
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="bg-[#27272a] px-1.5 py-0.5 rounded text-gray-400">↑↓</span>
              Navigate
            </div>
            <div className="flex items-center gap-1">
              <span className="bg-[#27272a] px-1.5 py-0.5 rounded text-gray-400">↵</span>
              Insert
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
