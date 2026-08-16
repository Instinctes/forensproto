"use client";

import Sidebar from "@/components/Sidebar";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { I18nProvider } from "@/context/I18nContext";
import AutoTranslate from "@/components/AutoTranslate";
import { useEffect } from "react";

function AppLayout({ children }: { children: React.ReactNode }) {
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar();
  
  return (
    <div className="app-layout">
      <div 
        className={`sidebar-backdrop ${isSidebarOpen ? "active" : ""}`} 
        onClick={() => setIsSidebarOpen(false)}
      />
      <Sidebar />
      <div className="main-content">
        {children}
      </div>
      <AutoTranslate />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const applyTheme = () => {
      const saved = localStorage.getItem("af_user_settings");
      let theme = "light";
      if (saved) {
        try { theme = JSON.parse(saved).theme || "light"; } catch {}
      }
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };
    
    applyTheme();
    window.addEventListener("af_settings_changed", applyTheme);
    return () => window.removeEventListener("af_settings_changed", applyTheme);
  }, []);

  return (
    <I18nProvider>
      <SidebarProvider>
        <NotificationProvider>
          <AppLayout>
            {children}
          </AppLayout>
        </NotificationProvider>
      </SidebarProvider>
    </I18nProvider>
  );
}
