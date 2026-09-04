import Navbar from "@/components/home/Navbar";
import Hero from "@/components/home/Hero";
import PipelineFlow from "@/components/home/PipelineFlow";
import FeatureGrid from "@/components/home/FeatureGrid";
import CtaSection from "@/components/home/CtaSection";
import Footer from "@/components/home/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <PipelineFlow />
        <FeatureGrid />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
