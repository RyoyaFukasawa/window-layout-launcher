import { createRoot } from "react-dom/client";
import "@/app/styles/index.css";
import { ErrorBoundary } from "@/app/providers/ErrorBoundary";
import { PopupPage } from "@/pages/popup";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <PopupPage />
  </ErrorBoundary>,
);
