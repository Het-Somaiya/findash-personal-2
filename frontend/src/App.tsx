import "./styles/index.css";
import { useRef } from "react";
import { Routes, Route } from "react-router-dom";

// Components
import { Navbar } from "./components/Navbar";
import { HeroSection } from "./components/HeroSection";
import { NewsAndMarket } from "./components/NewsAndMarket";
import { FeatureCards } from "./components/FeatureCards";
import { RegistrationSection } from "./components/RegistrationSection";
import { Footer } from "./components/Footer";
import { Chatbot } from "./components/Chatbot";
import { ProtectedRoute } from "./components/ProtectedRoute";

// Pages
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";

// ─── Landing Page View ───────────────────────────────────────────────────────
/**
 * This component contains the "stacked" sections of the home page.
 * The Login and Register pages now act as overlays/separate routes 
 * but allow clicking back to this view.
 */
function LandingPage() {
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToContent = () => {
    contentRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <HeroSection onExploreClick={scrollToContent} />
      <div ref={contentRef}>
        <NewsAndMarket />
      </div>
      <FeatureCards />
      {/* We keep this section for users who scroll down rather than clicking the Nav */}
      <RegistrationSection />
    </>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      {/* Global components that appear on every page */}
      <Navbar />

      <main style={{ minHeight: "80vh" }}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          
          {/* These pages now handle their own "Exit" logic by 
              navigating back to "/" if the user clicks the background.
          */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Routes (Locked behind login) */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          
          {/* Fallback - Redirect any unknown route to home */}
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </main>

      <Footer />
      <Chatbot />
    </>
  );
}