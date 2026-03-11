import { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLocale } from "../i18n";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: Props) {
  const { login, register } = useAuth();
  const { t } = useLocale();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setError("");
      setUsername("");
      setPassword("");
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      if (mode === "register") {
        await register(username.trim(), password);
      } else {
        await login(username.trim(), password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="legal-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="legal-modal auth-modal">
        <div className="legal-modal-header">
          <h2>{mode === "login" ? t("auth.login") : t("auth.register")}</h2>
          <button className="legal-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="legal-modal-body">
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label>{t("auth.username")}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                minLength={3}
                maxLength={64}
                autoComplete="username"
              />
            </div>
            <div className="auth-field">
              <label>{t("auth.password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={4}
                maxLength={128}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" disabled={submitting || !username.trim() || !password.trim()}>
              {submitting
                ? "..."
                : mode === "login"
                  ? t("auth.loginBtn")
                  : t("auth.registerBtn")}
            </button>
          </form>
          <div className="auth-switch">
            {mode === "login" ? (
              <span>
                {t("auth.noAccount")}{" "}
                <button type="button" className="auth-switch-btn" onClick={() => setMode("register")}>
                  {t("auth.registerLink")}
                </button>
              </span>
            ) : (
              <span>
                {t("auth.hasAccount")}{" "}
                <button type="button" className="auth-switch-btn" onClick={() => setMode("login")}>
                  {t("auth.loginLink")}
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
