"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type NotificationType = "success" | "error" | "info";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
}

interface NotificationContextType {
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback((notification: Omit<Notification, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev, { ...notification, id }]);
    setTimeout(() => removeNotification(id), 5000);
  }, [removeNotification]);

  return (
    <NotificationContext.Provider value={{ addNotification, removeNotification }}>
      {children}
      <div style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none"
      }}>
        <AnimatePresence>
          {notifications.map((notification) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
                width: "320px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                display: "flex",
                gap: "12px",
                pointerEvents: "auto",
                position: "relative",
                overflow: "hidden"
              }}
            >
              <div style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "4px",
                background: notification.type === "success" ? "var(--success-500)" :
                            notification.type === "error" ? "var(--danger-500)" :
                            "var(--primary-500)"
              }} />
              
              <div style={{ flexShrink: 0, marginTop: "2px" }}>
                {notification.type === "success" && <CheckCircle2 size={18} style={{ color: "var(--success-400)" }} />}
                {notification.type === "error" && <AlertCircle size={18} style={{ color: "var(--danger-400)" }} />}
                {notification.type === "info" && <Info size={18} style={{ color: "var(--primary-400)" }} />}
              </div>
              
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  {notification.title}
                </h4>
                {notification.message && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {notification.message}
                  </p>
                )}
              </div>
              
              <button 
                onClick={() => removeNotification(notification.id)}
                style={{ 
                  background: "transparent", 
                  border: "none", 
                  color: "var(--text-tertiary)", 
                  cursor: "pointer",
                  padding: "4px",
                  height: "fit-content",
                  borderRadius: "4px"
                }}
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
}
