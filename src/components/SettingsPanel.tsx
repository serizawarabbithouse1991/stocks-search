import { useEffect, useRef, useCallback } from "react";
import { useTheme } from "../ThemeContext";
import { useLocale } from "../i18n";
import { useAuth } from "../auth/AuthContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenLegal: (type: "privacy" | "terms") => void;
  onOpenAuth: () => void;
}

export default function SettingsPanel({ isOpen, onClose, onOpenLegal, onOpenAuth }: Props) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const { user, logout } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  return (
    <>
      <div
        className={`settings-backdrop ${isOpen ? "open" : ""}`}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className={`settings-panel ${isOpen ? "open" : ""}`}
      >
        <div className="settings-header">
          <h2>{t("settings.title")}</h2>
          <button className="settings-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="settings-body">
          {/* アカウント */}
          <section className="settings-section">
            <h3>{t("auth.account")}</h3>
            {user ? (
              <div className="settings-info">
                <div className="settings-info-row">
                  <span className="settings-label">{t("auth.loggedInAs")}</span>
                  <span className="settings-value">{user.username}</span>
                </div>
                <div className="settings-info-row">
                  <span className="settings-label settings-synced-badge">{t("auth.synced")}</span>
                </div>
                <button
                  className="danger"
                  style={{ marginTop: 8, width: "100%" }}
                  onClick={() => { logout(); }}
                >
                  {t("auth.logout")}
                </button>
              </div>
            ) : (
              <div className="settings-info">
                <p className="settings-login-prompt">{t("auth.loginPrompt")}</p>
                <button
                  style={{ width: "100%" }}
                  onClick={() => { onOpenAuth(); onClose(); }}
                >
                  {t("auth.login")} / {t("auth.register")}
                </button>
              </div>
            )}
          </section>

          {/* テーマ + 言語 */}
          <section className="settings-section">
            <h3>{t("settings.appearance")}</h3>
            <div className="settings-row">
              <span className="settings-label">{t("settings.theme")}</span>
              <div className="settings-theme-switch">
                <button
                  className={`settings-theme-btn ${theme === "dark" ? "active" : ""}`}
                  onClick={() => { if (theme !== "dark") toggleTheme(); }}
                >
                  &#x263E; {t("settings.dark")}
                </button>
                <button
                  className={`settings-theme-btn ${theme === "light" ? "active" : ""}`}
                  onClick={() => { if (theme !== "light") toggleTheme(); }}
                >
                  &#x2600; {t("settings.light")}
                </button>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-label">{t("settings.language")}</span>
              <div className="settings-theme-switch">
                <button
                  className={`settings-theme-btn ${locale === "ja" ? "active" : ""}`}
                  onClick={() => setLocale("ja")}
                >
                  日本語
                </button>
                <button
                  className={`settings-theme-btn ${locale === "en" ? "active" : ""}`}
                  onClick={() => setLocale("en")}
                >
                  English
                </button>
              </div>
            </div>
          </section>

          {/* データ */}
          <section className="settings-section">
            <h3>{t("settings.dataSource")}</h3>
            <div className="settings-info">
              <div className="settings-info-row">
                <span className="settings-label">{t("settings.stockData")}</span>
                <span className="settings-value">Yahoo Finance</span>
              </div>
              <div className="settings-info-row">
                <span className="settings-label">{t("settings.masterData")}</span>
                <span className="settings-value">{t("settings.masterValue")}</span>
              </div>
              <div className="settings-info-row">
                <span className="settings-label">{t("settings.refreshRate")}</span>
                <span className="settings-value">{t("settings.refreshValue")}</span>
              </div>
            </div>
          </section>

          {/* バージョン */}
          <section className="settings-section">
            <h3>{t("settings.appInfo")}</h3>
            <div className="settings-info">
              <div className="settings-info-row">
                <span className="settings-label">{t("settings.version")}</span>
                <span className="settings-value">1.1.0</span>
              </div>
            </div>
          </section>

          {/* 法的文書 */}
          <section className="settings-section">
            <h3>{t("settings.legal")}</h3>
            <div className="settings-links">
              <button
                className="settings-link"
                onClick={() => { onOpenLegal("terms"); onClose(); }}
              >
                {t("settings.terms")}
              </button>
              <button
                className="settings-link"
                onClick={() => { onOpenLegal("privacy"); onClose(); }}
              >
                {t("settings.privacy")}
              </button>
            </div>
          </section>
        </div>

        <div className="settings-footer">
          <span>&copy; {new Date().getFullYear()} StocksView</span>
        </div>
      </aside>
    </>
  );
}
