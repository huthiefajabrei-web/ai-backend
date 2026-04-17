"use client";

import React from "react";
import Image from "next/image";

export type Perspective = string;

export const EXTERIOR_PERSPECTIVES: string[] = [
  "Photorealistic Exterior",
  "Floor Plan to 3D",
  "Architectural Plan, Elevation & Section",
  "Physical Model",
  "BIM Model",
  "Night Shot",
  "Sunset/Golden Hour",
  "Helicopter Shot",
  "Architectural analysis sketch",
  "Concept Studio conceptual design",
  "Axonometric diagram",
  "Architectural concept sketch",
  "Aerial Bird's-Eye",
  "Vertical Top-Down",
  "Facade Detail",
  "Entrance Close-Up",
  "Custom Scene",
];

export const INTERIOR_PERSPECTIVES: string[] = [
  "Photorealistic Interior",
  "Interior Concept Sketch",
  "Interior Working",
  "Living Room Design",
  "Bedroom Design",
  "Kitchen & Dining",
  "Bathroom Design",
  "Office/Workspace",
  "Interior Lobby",
  "Night/Ambient Lighting Interior",
  "Daylight Interior",
  "Custom Scene",
];

export interface SelectedPerspective {
  perspective: Perspective;
  imageCount: number;
  aspectRatio: string;
}

interface ControlPanelProps {
  file: File | null;
  previewUrl: string;
  selectedPerspectives: SelectedPerspective[];
  customPrompt: string;
  denoise: number;
  loading: boolean;
  jobIds: string[];
  refs: File[];
  refPreviewUrls: string[];
  setFile: (file: File | null) => void;
  setPreviewUrl: (url: string) => void;
  setSelectedPerspectives: React.Dispatch<
    React.SetStateAction<SelectedPerspective[]>
  >;
  setCustomPrompt: (prompt: string) => void;
  setDenoise: (denoise: number) => void;
  setRefs: React.Dispatch<React.SetStateAction<File[]>>;
  setRefPreviewUrls: React.Dispatch<React.SetStateAction<string[]>>;
  mode: "image" | "video";
  setMode: (mode: "image" | "video") => void;
  videoGenerationMode: "image_to_video" | "frame_start_to_end";
  setVideoGenerationMode: (mode: "image_to_video" | "frame_start_to_end") => void;
  onSend: () => void;
  onGenerateVideo: () => void;
  onClear: () => void;
  userCredits?: number;
  creditCosts?: { image_generation: number; video_generation: number };
}

export default function ControlPanel({
  file,
  previewUrl,
  selectedPerspectives,
  customPrompt,
  denoise,
  loading,
  jobIds,
  refs,
  refPreviewUrls,
  setFile,
  setPreviewUrl,
  setSelectedPerspectives,
  setCustomPrompt,
  setDenoise,
  setRefs,
  setRefPreviewUrls,
  mode,
  setMode,
  videoGenerationMode,
  setVideoGenerationMode,
  onSend,
  onGenerateVideo,
  onClear,
  userCredits = 0,
  creditCosts = { image_generation: 1, video_generation: 5 },
}: ControlPanelProps) {
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [designType, setDesignType] = React.useState<"Exterior" | "Interior">("Exterior");
  const [customPromptsList, setCustomPromptsList] = React.useState<{title: string, type: string}[]>([]);

  React.useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/content/prompts`)
      .then(res => res.json())
      .then(data => {
        if (data.ok && Array.isArray(data.data)) {
          setCustomPromptsList(data.data);
        }
      })
      .catch(console.error);
  }, []);

  const activePromptList = React.useMemo(() => {
      let titles = customPromptsList.length > 0 
           ? customPromptsList.filter(p => p.type === designType).map(p => p.title)
           : (designType === "Exterior" ? EXTERIOR_PERSPECTIVES : INTERIOR_PERSPECTIVES);
           
      if (!titles.includes("Custom Scene")) {
          titles = [...titles, "Custom Scene"];
      }
      return titles;
  }, [designType, customPromptsList]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function handleRefChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFile = files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        setRefs((prev) => [...prev, newFile]);
        setRefPreviewUrls((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(newFile);
    }
  }

  function removeRef(index: number) {
    setRefs((prev) => prev.filter((_, i) => i !== index));
    setRefPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0] ?? null;
    setFile(selectedFile);

    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreviewUrl(ev.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreviewUrl("");
    }
  }

  return (
    <section className="h-fit flex flex-col bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)] relative">
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/15 rounded-full blur-[60px] pointer-events-none" aria-hidden />
      <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-black/20 shrink-0 z-10 backdrop-blur-sm">
        <div>
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400 font-display">
            Settings
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure your rendering
          </p>
        </div>
        <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full text-xs font-bold tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(251,191,36,0.15)]">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></div>
          PRO
        </div>
      </div>

      <div className="px-5 py-5 flex flex-col gap-5 z-10 custom-scrollbar">
        <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/5 relative">
          <div
            className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-lg transition-all duration-300 ease-in-out shadow-lg border ${mode === "image"
              ? "left-1.5 bg-purple-500/20 border-purple-500/40"
              : "left-[calc(50%+4.5px)] bg-emerald-500/20 border-emerald-500/40"
              }`}
          />
          <button
            className={`flex-1 relative z-10 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${mode === "image"
              ? "text-purple-100"
              : "text-slate-400 hover:text-slate-200"
              }`}
            onClick={(e) => {
              e.preventDefault();
              setMode("image");
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            Image
          </button>
          <button
            className={`flex-1 relative z-10 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${mode === "video"
              ? "text-emerald-100"
              : "text-slate-400 hover:text-slate-200"
              }`}
            onClick={(e) => {
              e.preventDefault();
              setMode("video");
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
            Video
          </button>
        </div>

        {mode === "video" && (
          <div className="flex flex-col gap-2 relative">
            <label className="text-sm font-medium text-slate-200">
              Video Generation Type
            </label>
            <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/5 relative">
              <button
                className={`flex-1 relative z-10 py-2.5 rounded-lg text-sm font-semibold transition-colors ${videoGenerationMode === "image_to_video"
                  ? "bg-emerald-500/20 text-emerald-100 border border-emerald-500/40"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
                onClick={(e) => {
                  e.preventDefault();
                  setVideoGenerationMode("image_to_video");
                }}
              >
                Image to Video
              </button>
              <button
                className={`flex-1 relative z-10 py-2.5 rounded-lg text-sm font-semibold transition-colors ${videoGenerationMode === "frame_start_to_end"
                  ? "bg-emerald-500/20 text-emerald-100 border border-emerald-500/40"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
                onClick={(e) => {
                  e.preventDefault();
                  setVideoGenerationMode("frame_start_to_end");
                }}
              >
                Frame: Start to End
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 relative">
          <label className="text-sm font-medium text-slate-200">
            {mode === "video"
              ? (videoGenerationMode === "frame_start_to_end"
                ? "Start Image (First Frame)"
                : "Source Image")
              : "Upload Reference Image"}
          </label>
          <div
            className={`relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center overflow-hidden transition-all duration-300 min-h-[140px] group ${file
              ? "border-purple-500/50 bg-purple-500/5"
              : "border-white/10 bg-black/20 hover:border-purple-500/30 hover:bg-purple-500/5"
              }`}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              id="file-upload"
              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-20"
            />
            {!file && (
              <div className="p-6 flex flex-col items-center gap-3 text-center pointer-events-none">
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-purple-500 group-hover:text-white group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all duration-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-200">
                    {file ? (file as File).name : "Click to upload / drag & drop"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    SVG, PNG, JPG or GIF (max. 10MB)
                  </p>
                </div>
              </div>
            )}
            {previewUrl && (
              <div className="absolute inset-0 z-10 group/preview">
                <div className="relative w-full h-full">
                  <Image
                    src={previewUrl}
                    alt="preview"
                    fill
                    unoptimized
                    className="object-cover transition-transform duration-500 group-hover/preview:scale-105"
                  />
                </div>
                <div
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover/preview:opacity-100 backdrop-blur-sm transition-opacity duration-300 flex items-center justify-center cursor-pointer"
                  onClick={() => {
                    setFile(null);
                    setPreviewUrl("");
                  }}
                >
                  <button className="bg-red-500/90 text-white px-4 py-2 rounded-full font-semibold text-sm flex items-center gap-2 transform translate-y-4 group-hover/preview:translate-y-0 transition-transform duration-300 shadow-lg">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    Remove Image
                  </button>
                </div>
              </div>
            )}
          </div>

          {file && (
            <div className="mt-3">
              {refs.length === 0 ? (
                <div className="text-center">
                  <label
                    htmlFor="ref-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="16"></line>
                      <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    {mode === "video"
                      ? (videoGenerationMode === "frame_start_to_end"
                        ? "Add End Image (Last Frame)"
                        : "Add Motion Reference (Optional)")
                      : "Add Secondary Image Reference"}
                  </label>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap items-center">
                  {refPreviewUrls.map((url, i) => (
                    <div
                      key={i}
                      className="relative w-[60px] h-[60px] rounded-lg overflow-hidden border border-white/10 group shadow-md"
                    >
                      <Image
                        src={url}
                        alt="ref"
                        width={60}
                        height={60}
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                      <div
                        onClick={() => removeRef(i)}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                      >
                        <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(mode === "image" || refs.length === 0) && (
                    <label
                      htmlFor="ref-upload"
                      className="w-[60px] h-[60px] rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center cursor-pointer bg-white/5 hover:bg-white/10 hover:border-purple-400/50 transition-colors text-slate-400 hover:text-white"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </label>
                  )}
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleRefChange}
                id="ref-upload"
                className="hidden"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 relative">
          <label className="text-sm font-medium text-slate-200">
            Design Type
          </label>
          <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/5 relative">
            <div
              className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-lg transition-all duration-300 ease-in-out shadow-lg border ${
                designType === "Exterior"
                  ? "left-1.5 bg-blue-500/20 border-blue-500/40"
                  : "left-[calc(50%+4.5px)] bg-rose-500/20 border-rose-500/40"
              }`}
            />
            <button
              className={`flex-1 relative z-10 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                designType === "Exterior"
                  ? "text-blue-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              onClick={(e) => {
                e.preventDefault();
                setDesignType("Exterior");
              }}
            >
              Exterior
            </button>
            <button
              className={`flex-1 relative z-10 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                designType === "Interior"
                  ? "text-rose-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              onClick={(e) => {
                e.preventDefault();
                setDesignType("Interior");
              }}
            >
              Interior
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 relative">
          <label className="text-sm font-medium text-slate-200">
            Perspective Styles ({designType})
          </label>
          <div className="relative" ref={dropdownRef}>
            <div
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 cursor-pointer flex justify-between items-center shadow-inner hover:border-purple-500/40 transition-colors"
            >
              <span
                className={`text-sm ${selectedPerspectives.length > 0
                  ? "text-slate-100"
                  : "text-slate-500"
                  }`}
              >
                {selectedPerspectives.length > 0
                  ? `${selectedPerspectives.length} perspective(s) selected`
                  : "Select Perspectives..."}
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-slate-400 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>

            <div className={`absolute top-[calc(100%+0.5rem)] left-0 w-full z-50 bg-[#0a0c13]/95 backdrop-blur-xl border border-white/10 rounded-xl max-h-[300px] overflow-y-auto custom-scrollbar shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-2 transition-all duration-300 origin-top ${isDropdownOpen ? 'opacity-100 scale-100 translate-y-0 visible' : 'opacity-0 scale-95 -translate-y-2 invisible pointer-events-none'}`}>
              {activePromptList.map((p) => {
                const isSelected = selectedPerspectives.some(
                  (sp) => sp.perspective === p,
                );
                return (
                  <div
                    key={p}
                    onClick={() => {
                      if (isSelected) {
                        if (selectedPerspectives.length > 1) {
                          setSelectedPerspectives(
                            selectedPerspectives.filter(
                              (x) => x.perspective !== p,
                            ),
                          );
                        }
                      } else {
                        setSelectedPerspectives([
                          ...selectedPerspectives,
                          {
                            perspective: p,
                            imageCount: 1,
                            aspectRatio: "9:16",
                          },
                        ]);
                        if (p === "Floor Plan to 3D") setDenoise(0.85);
                      }
                    }}
                    className={`px-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-3 text-sm transition-colors mb-1 ${isSelected
                      ? "bg-purple-500/20 text-purple-200"
                      : "text-slate-300 hover:bg-white/5"
                      }`}
                  >
                    <div
                      className={`w-[18px] h-[18px] rounded flex items-center justify-center border transition-colors ${isSelected
                        ? "bg-purple-500 border-purple-500"
                        : "border-white/20 bg-black/40"
                        }`}
                    >
                      {isSelected && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="3"
                        >
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                    </div>
                    {p}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {selectedPerspectives.length > 0 && (
          <div className="flex flex-col gap-3">
            {selectedPerspectives.map((sp, i) => (
              <div
                key={sp.perspective}
                className="bg-black/20 border border-white/5 rounded-xl p-4 shadow-inner relative"
              >
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/5 border-dashed">
                  <span className="font-semibold text-purple-300 text-sm">
                    {sp.perspective}
                  </span>
                  {selectedPerspectives.length > 1 && (
                    <button
                      onClick={() =>
                        setSelectedPerspectives(
                          selectedPerspectives.filter(
                            (x) => x.perspective !== sp.perspective,
                          ),
                        )
                      }
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">
                      Aspect Ratio
                    </label>
                    <div className="relative">
                      <select
                        value={sp.aspectRatio}
                        onChange={(e) => {
                          const newOpts = [...selectedPerspectives];
                          newOpts[i] = {
                            ...newOpts[i],
                            aspectRatio: e.target.value,
                          };
                          setSelectedPerspectives(newOpts);
                        }}
                        className="w-full appearance-none bg-black/40 border border-white/10 rounded-lg py-2 pl-3 pr-8 text-sm text-slate-200 outline-none focus:border-purple-500/50 transition-colors cursor-pointer"
                      >
                        <option value="9:16">9:16 (Story)</option>
                        <option value="1:1">1:1 (Square)</option>
                        <option value="16:9">16:9 (Landscape)</option>
                        <option value="4:5">4:5 (Portrait)</option>
                      </select>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                  </div>

                  <div className={`${mode === "image" ? "block" : "hidden"}`}>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs text-slate-400">Images</label>
                      <span className="text-xs font-mono text-purple-300 bg-purple-500/10 px-1.5 rounded">
                        {sp.imageCount}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="4"
                      step="1"
                      value={sp.imageCount}
                      onChange={(e) => {
                        const newOpts = [...selectedPerspectives];
                        newOpts[i] = {
                          ...newOpts[i],
                          imageCount: parseInt(e.target.value),
                        };
                        setSelectedPerspectives(newOpts);
                      }}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-purple-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          className={`flex flex-col gap-2 ${mode === "image" ? "block" : "hidden"}`}
        >
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-slate-200">
              Transformation Strength
            </label>
            <span className="text-xs font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
              {denoise.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.3"
            max="1.0"
            step="0.05"
            value={denoise}
            onChange={(e) => setDenoise(parseFloat(e.target.value))}
            className="w-full mt-2 cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-purple-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110"
          />
          <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-widest mt-1">
            <span>Subtle</span>
            <span>Creative</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">
            Custom Prompt{" "}
            {selectedPerspectives.some(
              (sp) => sp.perspective === "Custom Scene",
            ) && <span className="text-red-400">*</span>}
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={3}
            placeholder="e.g. Modern minimalist villa with large glass windows, dusk lighting, 8k render..."
            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all resize-y min-h-[80px]"
          />
        </div>
      </div>

      <div className="p-6 border-t border-white/5 bg-black/30 shrink-0 z-10 flex flex-col gap-3 backdrop-blur-md">
        {/* Credit cost preview */}
        {(() => {
          const totalImages = mode === "image"
            ? selectedPerspectives.reduce((sum, sp) => sum + (sp.imageCount || 1), 0)
            : 0;
          const totalCost = mode === "video"
            ? creditCosts.video_generation
            : creditCosts.image_generation * totalImages;
          const hasEnough = userCredits >= totalCost;
          return (
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium border ${hasEnough ? "bg-yellow-500/5 border-yellow-500/20 text-yellow-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {mode === "video"
                  ? `Video generation costs ${totalCost} credit${totalCost !== 1 ? "s" : ""}`
                  : `${totalImages} image${totalImages !== 1 ? "s" : ""} × ${creditCosts.image_generation} = ${totalCost} credit${totalCost !== 1 ? "s" : ""}`}
              </span>
              <span className={`font-bold ${hasEnough ? "text-yellow-300" : "text-red-300"}`}>
                {hasEnough ? `Balance: ${userCredits}` : `Need ${totalCost - userCredits} more`}
              </span>
            </div>
          );
        })()}
        <div className="flex gap-3">
        <button
          className={`flex-1 relative overflow-hidden rounded-xl font-semibold text-sm transition-all duration-300 shadow-lg group ${loading ? "opacity-80 cursor-not-allowed" : "hover:-translate-y-0.5"
            } ${mode === "image"
              ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:shadow-[0_10px_20px_rgba(139,92,246,0.3)] text-white"
              : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:shadow-[0_10px_20px_rgba(16,185,129,0.3)] text-white"
            }`}
          onClick={() => (mode === "image" ? onSend() : onGenerateVideo())}
          disabled={loading}
        >
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]"></div>

          <div className="relative z-10 flex items-center justify-center gap-2 py-3 px-4">
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : mode === "image" ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2v4"></path>
                  <path d="M12 18v4"></path>
                  <path d="M4.93 4.93l2.83 2.83"></path>
                  <path d="M16.24 16.24l2.83 2.83"></path>
                  <path d="M2 12h4"></path>
                  <path d="M18 12h4"></path>
                  <path d="M4.93 19.07l2.83-2.83"></path>
                  <path d="M16.24 7.76l2.83-2.83"></path>
                </svg>
                Generate Masterpiece
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
                Generate Video Journey
              </>
            )}
          </div>
        </button>
        <button
          className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors text-sm font-semibold disabled:opacity-50"
          onClick={onClear}
          disabled={loading}
        >
          Clear
        </button>
        </div>
      </div>

      {jobIds.length > 0 && (
        <div className="px-6 pb-6 pt-0 border-t-0 bg-black/30 w-full z-10">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-widest">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_#3b82f6]"></div>
              Active Jobs ({jobIds.length})
            </div>
            <div className="text-[10px] text-slate-400 font-mono break-all line-clamp-2">
              {jobIds.join(", ")}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
