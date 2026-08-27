import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { MainDashboard } from "./components/MainDashboard";
import { MobileLiveMonitor } from "./components/MobileLiveMonitor";
import { useLocation } from "wouter";

function App() {
  const [location] = useLocation();

  // /live 경로는 모바일 실시간 모니터 전용 페이지
  if (location === "/live") {
    return (
      <ErrorBoundary>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            <Toaster richColors position="top-right" />
            <MobileLiveMonitor />
          </TooltipProvider>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <MainDashboard />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
