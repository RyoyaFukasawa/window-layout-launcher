import { createRoot } from "react-dom/client";
import "@/index.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <TooltipProvider>
      <App />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  </ErrorBoundary>,
);
