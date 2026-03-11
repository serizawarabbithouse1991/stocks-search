import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./ErrorBoundary";
import { ThemeProvider } from "./ThemeContext";
import { LocaleProvider } from "./i18n";
import { AuthProvider } from "./auth/AuthContext";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LocaleProvider>
      <ThemeProvider>
        <AuthProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </ThemeProvider>
    </LocaleProvider>
  </React.StrictMode>
);
