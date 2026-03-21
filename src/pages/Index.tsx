import Navbar from "@/components/Navbar";
import AnnouncementBar from "@/components/AnnouncementBar";
import Hero from "@/components/Hero";
import ProductGrid from "@/components/ProductGrid";
import LookbookSection from "@/components/LookbookSection";
import Footer from "@/components/Footer";

const Index = () => (
  <div className="min-h-screen">
    <Navbar />
    <Hero />
    <AnnouncementBar />
    <ProductGrid />
    <LookbookSection />
    <Footer />
  </div>
);

export default Index;
