import "./styles/index.css";
import { useRef, useState } from "react";
import { Navbar }              from "./components/Navbar";
import { TickerTape }          from "./components/TickerTape";
import { HeroSection }         from "./components/HeroSection";
import { NewsAndMarket }       from "./components/NewsAndMarket";
import { FeatureCards }        from "./components/FeatureCards";
import { RegistrationSection } from "./components/RegistrationSection";
import { Footer }              from "./components/Footer";
import { Chatbot }             from "./components/Chatbot";

import { useAuth } from "./context/AuthContext";
import LoginModal from "./components/LoginModal";

export default function App() {
  const contentRef = useRef(null);
  const { isAuthenticated } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('login'); // 'login' or 'register'

  const scrollToContent = () => {
    contentRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleOpenLogin = () => {
    setModalMode('login');
    setIsLoginModalOpen(true);
  };

  const handleOpenRegister = () => {
    setModalMode('register');
    setIsLoginModalOpen(true);
  };

  return (
    <>
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
        initialMode={modalMode}
      />

      <Navbar 
        onLoginClick={handleOpenLogin} 
        onRegisterClick={handleOpenRegister} 
      />
      
      <TickerTape />
      <HeroSection onExploreClick={scrollToContent} />

      <div ref={contentRef}>
        <NewsAndMarket />
      </div>

      <FeatureCards />

      {!isAuthenticated && <RegistrationSection />}

      <Footer />
      <Chatbot />
    </>
  );
}