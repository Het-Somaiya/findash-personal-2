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

export default function App() {
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToContent = () => {
    contentRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      {/* Fixed chrome */}
      <Navbar />
      {/* <TickerTape /> */}

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
