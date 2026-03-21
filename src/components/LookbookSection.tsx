import { useEffect, useRef, useState } from "react";
import lookbook1 from "@/assets/lookbook-1.jpg";
import lookbook2 from "@/assets/lookbook-2.jpg";

const LookbookSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="px-6 md:px-10 pb-20 md:pb-32">
      <div className={`mb-12 ${visible ? "opacity-0 animate-fade-up" : "opacity-0"}`}>
        <p className="text-label mb-2">Editorial</p>
        <h2 className="text-3xl md:text-4xl font-display font-bold leading-tight">SS26 Lookbook</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className={`relative aspect-[3/4] overflow-hidden group cursor-pointer ${visible ? "opacity-0 animate-fade-up" : "opacity-0"}`} style={{ animationDelay: "0.15s" }}>
          <img src={lookbook1} alt="SS26 Lookbook" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <span className="inline-block bg-background/90 backdrop-blur-sm px-4 py-2 text-label text-foreground">
              VIEW LOOKBOOK
            </span>
          </div>
        </div>
        <div className={`relative aspect-[3/4] overflow-hidden group cursor-pointer ${visible ? "opacity-0 animate-fade-up" : "opacity-0"}`} style={{ animationDelay: "0.25s" }}>
          <img src={lookbook2} alt="SS26 Portrait" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <span className="inline-block bg-background/90 backdrop-blur-sm px-4 py-2 text-label text-foreground">
              BEHIND THE SCENES
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LookbookSection;
