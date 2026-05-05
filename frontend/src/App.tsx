import "./styles/index.css";
import { useRef, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { Navbar } from "./components/Navbar";
import { HeroSection } from "./components/HeroSection";
import { NewsAndMarket } from "./components/NewsAndMarket";
import { FeatureCards } from "./components/FeatureCards";
import { RegistrationSection } from "./components/RegistrationSection";
import { Footer } from "./components/Footer";
import { Chatbot } from "./components/Chatbot";
import { LoginPage } from "./components/LoginPage";
import { RegisterPage } from "./components/RegisterPage";
import { BacktestSection } from "./components/BacktestSection";
import { useAuth } from "./lib/AuthContext";
import { Dashboard } from "./pages/Dashboard";
import type { AssetData } from "./components/SearchPanel";

function LandingPage() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetData | null>(null);
  const { user } = useAuth();

  const scrollToContent = () => {
    contentRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Navbar selectedAsset={selectedAsset} onAssetSelect={setSelectedAsset} />
      <HeroSection
        onExploreClick={scrollToContent}
        selectedAsset={selectedAsset}
        onAssetSelect={setSelectedAsset}
      />
      <div ref={contentRef}>
        <NewsAndMarket />
      </div>
      {user && <BacktestSection />}
      <FeatureCards />
      <RegistrationSection onExploreClick={scrollToContent} />
      <Footer />
      <Chatbot />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard" element={<LandingPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}