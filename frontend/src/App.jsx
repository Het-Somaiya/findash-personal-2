import "./index.css";
import Navbar from "./components/Navbar";
import TickerTape from "./components/TickerTape";
import HeroSection from "./components/HeroSection";
import NewsFeed from "./components/NewsFeed";
import Sidebar from "./components/Sidebar";
import FeatureCards from "./components/FeatureCards";
import RegisterBanner from "./components/RegisterBanner";
import ChatBot from "./components/ChatBot";

export default function App() {
  return (
    <>
      {/* Fixed header elements */}
      <Navbar />
      <TickerTape />

      {/* Full-viewport hero with 3D surface */}
      <HeroSection />

      {/* Main content grid: news + sidebar */}
      <section
        style={{
          padding: "56px 32px",
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 24,
        }}
      >
        <NewsFeed />
        <Sidebar />
      </section>

      {/* Feature cards */}
      <FeatureCards />

      {/* Registration CTA */}
      <RegisterBanner />

      {/* Floating AI chatbot */}
      <ChatBot />
    </>
  );
}