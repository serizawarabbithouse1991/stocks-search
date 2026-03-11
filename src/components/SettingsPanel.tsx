import { useEffect, useRef, useCallback } from "react";
import { useTheme } from "../ThemeContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenLegal: (type: "privacy" | "terms") => void;
}

export default function SettingsPanel({ isOpen, onClose, onOpenLegal }: Props) {
  const { theme, toggle: toggleTheme } = useTheme();
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
          <h2>設定</h2>
          <button className="settings-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="settings-body">
          {/* テーマ */}
          <section className="settings-section">
            <h3>外観</h3>
            <div className="settings-row">
              <span className="settings-label">テーマ</span>
              <div className="settings-theme-switch">
                <button
                  className={`settings-theme-btn ${theme === "dark" ? "active" : ""}`}
                  onClick={() => { if (theme !== "dark") toggleTheme(); }}
                >
                  &#x263E; ダーク
                </button>
                <button
                  className={`settings-theme-btn ${theme === "light" ? "active" : ""}`}
                  onClick={() => { if (theme !== "light") toggleTheme(); }}
                >
                  &#x2600; ライト
                </button>
              </div>
            </div>
          </section>

          {/* データ */}
          <section className="settings-section">
            <h3>データソース</h3>
            <div className="settings-info">
              <div className="settings-info-row">
                <span className="settings-label">株価データ</span>
                <span className="settings-value">Yahoo Finance</span>
              </div>
              <div className="settings-info-row">
                <span className="settings-label">銘柄マスタ</span>
                <span className="settings-value">JPX 上場銘柄一覧</span>
              </div>
              <div className="settings-info-row">
                <span className="settings-label">更新頻度</span>
                <span className="settings-value">60秒（直近価格）</span>
              </div>
            </div>
          </section>

          {/* バージョン */}
          <section className="settings-section">
            <h3>アプリ情報</h3>
            <div className="settings-info">
              <div className="settings-info-row">
                <span className="settings-label">バージョン</span>
                <span className="settings-value">1.0.0</span>
              </div>
            </div>
          </section>

          {/* 法的文書 */}
          <section className="settings-section">
            <h3>法的情報</h3>
            <div className="settings-links">
              <button
                className="settings-link"
                onClick={() => { onOpenLegal("terms"); onClose(); }}
              >
                利用規約
              </button>
              <button
                className="settings-link"
                onClick={() => { onOpenLegal("privacy"); onClose(); }}
              >
                プライバシーポリシー
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
