"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AuthProvider } from "@/lib/auth";

const ThemeContext = createContext({ theme: "system", resolved: "light", setTheme: () => {} });
const ToastContext = createContext(() => {});

function resolve(theme) {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function Providers({ children }) {
  const [theme, setThemeState] = useState("system");
  const [resolved, setResolved] = useState("light");
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    let t = "system";
    try {
      t = localStorage.getItem("mm-theme") || "system";
    } catch {}
    setThemeState(t);
    setResolved(resolve(t));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => {
      const cur = localStorage.getItem("mm-theme") || "system";
      if (cur === "system") {
        document.documentElement.classList.toggle("dark", mq.matches);
        setResolved(mq.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const setTheme = useCallback((t) => {
    try {
      localStorage.setItem("mm-theme", t);
    } catch {}
    const r = resolve(t);
    document.documentElement.classList.toggle("dark", r === "dark");
    setThemeState(t);
    setResolved(r);
  }, []);

  const toast = useCallback((message, tone = "default") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      <ToastContext.Provider value={toast}>
        <AuthProvider>{children}</AuthProvider>
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`animate-fade-in rounded-xl px-4 py-2.5 text-sm font-medium shadow-pop ${
                t.tone === "error" ? "bg-rec text-white" : t.tone === "success" ? "bg-live text-white" : "bg-ink text-bg"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
export const useToast = () => useContext(ToastContext);
