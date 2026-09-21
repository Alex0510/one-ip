import React from "react";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/App";
import "@/app.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { RouteProgress } from "@/components/providers/route-progress";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { initializeLocale } from "@/i18n";
import { Provider } from "jotai";
import ReactDOM from "react-dom/client";

initializeLocale();

// The legacy stylesheet is inserted by index.html before the React tree is
// mounted. Keep the class explicit for CSS selectors and future diagnostics.
if (document.getElementById("legacy-webkit-styles"))
  document.documentElement.classList.add("legacy-webkit");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider>
      <ThemeProvider>
        <BrowserRouter>
          <RouteProgress />
          <QueryProvider>
            <App />
          </QueryProvider>
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>,
);
