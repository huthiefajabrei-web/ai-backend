"use client";

import type { ReactNode } from "react";
import { Home, Wand2, LayoutGrid, Video, User, Coins } from "lucide-react";

export type MobileNavHighlight = "home" | "studio" | "apps" | "video" | "account";

type MobileBottomNavProps = {
  highlight?: MobileNavHighlight;
  activeApp?: string | null;
  userCredits?: number;
  isLoggedIn: boolean;
  onHome: () => void;
  onStudio: () => void;
  onApps: () => void;
  onVideo: () => void;
  onAccount: () => void;
};

const navItemClass = (active: boolean) =>
  `flex flex-col items-center justify-center gap-1 min-w-[58px] py-2 px-2 rounded-2xl transition-all duration-200 active:scale-95 tap-target ${
    active
      ? "text-white bg-gradient-to-b from-indigo-500/25 to-purple-500/10"
      : "text-zinc-500 hover:text-zinc-300"
  }`;

function NavButton({
  active,
  label,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={navItemClass(active)}
      aria-label={ariaLabel}
      {...(active ? { "aria-current": "page" as const } : {})}
    >
      {children}
      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}

export default function MobileBottomNav({
  highlight,
  activeApp = null,
  userCredits = 0,
  isLoggedIn,
  onHome,
  onStudio,
  onApps,
  onVideo,
  onAccount,
}: MobileBottomNavProps) {
  const tab = highlight ?? (activeApp ? "studio" : "home");

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[60] border-t border-white/10 bg-[#09090b]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 pt-1.5">
        <NavButton active={tab === "home"} label="Home" onClick={onHome} ariaLabel="Home">
          <Home size={20} strokeWidth={tab === "home" ? 2.5 : 2} />
        </NavButton>

        <NavButton active={tab === "studio"} label="Studio" onClick={onStudio} ariaLabel="AI Studio">
          <Wand2 size={20} strokeWidth={tab === "studio" ? 2.5 : 2} />
        </NavButton>

        <NavButton active={tab === "apps"} label="Apps" onClick={onApps} ariaLabel="Apps">
          <LayoutGrid size={20} strokeWidth={tab === "apps" ? 2.5 : 2} />
        </NavButton>

        <NavButton active={tab === "video"} label="Video" onClick={onVideo} ariaLabel="Video">
          <Video size={20} strokeWidth={tab === "video" ? 2.5 : 2} />
        </NavButton>

        <NavButton active={tab === "account"} label="Account" onClick={onAccount} ariaLabel="Account">
          <div className="relative">
            {isLoggedIn ? (
              <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                <User size={12} className="text-white" />
              </div>
            ) : (
              <User size={20} />
            )}
            {isLoggedIn && userCredits > 0 && (
              <span className="absolute -top-1.5 -right-2 flex items-center gap-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/30 px-1 text-[8px] font-bold text-yellow-400">
                <Coins size={7} />
                {userCredits > 99 ? "99+" : userCredits}
              </span>
            )}
          </div>
        </NavButton>
      </div>
    </nav>
  );
}
