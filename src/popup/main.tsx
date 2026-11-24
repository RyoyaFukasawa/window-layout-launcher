import { createRoot } from "react-dom/client";
import "@/index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Popup } from "./Popup";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Popup />
  </ErrorBoundary>,
);
