import Navbar from "@/components/Navbar";
import AnnouncementBar from "@/components/AnnouncementBar";
import Hero from "@/components/Hero";
import ProductGrid from "@/components/ProductGrid";
import LookbookSection from "@/components/LookbookSection";
import Footer from "@/components/Footer";
import { useStoreData } from "@/hooks/useStoreData";

const Index = () => {
  const { data, loading } = useStoreData();

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar siteName={data.site.name} />
      <Hero hero={data.site.hero} />
      <AnnouncementBar text={data.site.announcement} />
      <ProductGrid products={data.products} currency={data.site.currency} />
      <LookbookSection />
      <Footer site={data.site} />
    </div>
  );
};

export default Index;
