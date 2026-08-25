import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResearchTopNav } from "./components/ResearchTopNav";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import PublicDashboard from "./pages/PublicDashboard";
import PublicMinuteResearchDashboard from "./pages/PublicMinuteResearchDashboard";
import PublicIntradayMonitor from "./pages/PublicIntradayMonitor";
import PublicStrategyCardCollection from "./pages/PublicStrategyCardCollection";
import GameEntry from "./pages/GameEntry";
import PersonalArena from "./pages/PersonalArena";
import Profile from "./pages/Profile";
import SharedDatasets from "./pages/SharedDatasets";
import Home from "./pages/Home";
import SurvivalResearch from "./pages/SurvivalResearch";

function App() {
  const isOperatorRoute = window.location.pathname === "/operator";
  const isIntradayRoute = window.location.pathname === "/intraday";
  const isConnectionAuditRoute = window.location.pathname === "/connection-audit" || window.location.pathname === "/connection";
  const isCollectionRoute = window.location.pathname === "/collection";
  const isResearchRoute = window.location.pathname === "/research";
  const isPersonalArenaRoute = window.location.pathname === "/arena";
  const isProfileRoute = window.location.pathname === "/profile";
  const isSharedDatasetsRoute = window.location.pathname === "/datasets";
  const isSurvivalResearchRoute = window.location.pathname === "/survivors";
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster richColors position="top-right"/><ResearchTopNav/>{isOperatorRoute ? <Home/> : isProfileRoute ? <Profile/> : isPersonalArenaRoute ? <PersonalArena/> : isSharedDatasetsRoute ? <SharedDatasets/> : isSurvivalResearchRoute ? <SurvivalResearch/> : isIntradayRoute ? <PublicIntradayMonitor/> : isConnectionAuditRoute ? <PublicDashboard/> : isCollectionRoute ? <PublicStrategyCardCollection/> : isResearchRoute ? <PublicMinuteResearchDashboard/> : <GameEntry/>}</TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
