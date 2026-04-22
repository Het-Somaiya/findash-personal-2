import "./styles/index.css";
import { useRef } from "react";
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

function LandingPage() {
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToContent = () => {
    contentRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Navbar />
      <HeroSection onExploreClick={scrollToContent} />
      <div ref={contentRef}>
        <NewsAndMarket />
      </div>
      <FeatureCards />
      <RegistrationSection />
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
