import { createRoot } from "react-dom/client";
import "@/app/styles/index.css";
import { ErrorBoundary } from "@/app/providers/ErrorBoundary";
import { OptionsPage } from "@/pages/options";
import { Toaster } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <TooltipProvider>
      <OptionsPage />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  </ErrorBoundary>,
);
