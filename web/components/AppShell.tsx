"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const SIDEBAR_W = "16rem";

/** App-wide shell: a fixed left sidebar on desktop, a slide-in drawer on mobile, and a sticky top
 *  bar over the scrolling content. Replaces the old top-nav + footer chrome. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar (fixed) */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden border-r border-white/5 bg-obsidian-950/95 lg:block"
        style={{ width: SIDEBAR_W }}
      >
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside
            className="absolute inset-y-0 left-0 border-r border-white/10 bg-obsidian-950 shadow-2xl"
            style={{ width: SIDEBAR_W }}
          >
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      {/* Content column */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <TopBar onMenu={() => setDrawer(true)} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
