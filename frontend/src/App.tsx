import "./styles/index.css";
import { useRef } from "react";
import { Navbar }              from "./components/Navbar";
import { TickerTape }          from "./components/TickerTape";
import { HeroSection }         from "./components/HeroSection";
import { NewsAndMarket }       from "./components/NewsAndMarket";
import { FeatureCards }        from "./components/FeatureCards";
import { RegistrationSection } from "./components/RegistrationSection";
import { Footer }              from "./components/Footer";
import { Chatbot }             from "./components/Chatbot";

// 🟢 YOUR ADDITIONS
import { useAuth } from "./context/AuthContext";
import LoginModal from "./components/LoginModal";

export default function App() {
  const contentRef = useRef<HTMLDivElement>(null);
  
  // 🟢 YOUR LOGIC: Check if user is logged in
  const { isAuthenticated } = useAuth();

  const scrollToContent = () => {
    contentRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      {/* 🟢 YOUR MODAL: Shows if not authenticated */}
      {!isAuthenticated && <LoginModal isOpen={true} />}

      {/* Fixed chrome */}
      <Navbar />
      <TickerTape />

      {/* Full-viewport hero with live 3D surface */}
      <HeroSection onExploreClick={scrollToContent} />

      {/* Content grid anchor */}
      <div ref={contentRef}>
        <NewsAndMarket />
      </div>

      {/* Feature marketing */}
      <FeatureCards />

      {/* Registration CTA */}
      <RegistrationSection />

      {/* Footer */}
      <Footer />

      {/* Floating AI chatbot */}
      <Chatbot />
    </>
  );
}