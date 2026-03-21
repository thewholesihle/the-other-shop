import heroImage from "@/assets/hero-main.jpg";

const Hero = () => {
  return (
    <section className="relative h-screen w-full overflow-hidden">
      <img
        src={heroImage}
        alt="Others. Spring Summer 2026 collection editorial"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
      {/* Content at bottom-left */}
      <div className="absolute inset-0 flex items-end">
        <div className="px-6 md:px-10 pb-16 md:pb-20 max-w-lg">
          <p
            className="text-label mb-3 opacity-0 animate-fade-up"
            style={{ animationDelay: "0.3s", color: "hsl(40, 20%, 97%)" }}
          >
            Spring Summer 2026 Drop 1
          </p>
          <h1
            className="text-5xl md:text-7xl font-display font-bold leading-[0.9] mb-6 opacity-0 animate-fade-up"
            style={{ animationDelay: "0.5s", color: "hsl(40, 20%, 97%)" }}
          >
            New
            <br />
            Arrivals
          </h1>
          <a
            href="#products"
            className="inline-block border border-[hsl(40,20%,97%)] px-8 py-3 text-label tracking-[0.25em] hover:bg-[hsl(40,20%,97%)] hover:text-foreground transition-all duration-300 opacity-0 animate-fade-up active:scale-[0.97]"
            style={{ animationDelay: "0.7s", color: "hsl(40, 20%, 97%)" }}
          >
            SHOP NOW
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
