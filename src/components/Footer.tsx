const footerLinks = {
  Shop: ["New Arrivals", "Hoodies", "T-Shirts", "Pants", "Jackets", "Accessories"],
  Brand: ["About Us", "Community", "Lookbook", "Stores"],
  Help: ["Shipping & Returns", "FAQ", "Size Guide", "Contact"],
};

const Footer = () => (
  <footer className="bg-foreground text-primary-foreground px-6 md:px-10 pt-16 pb-8">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
      <div className="col-span-2 md:col-span-1">
        <h3 className="font-display text-2xl font-bold mb-4">Others.</h3>
        <p className="text-sm text-primary-foreground/60 max-w-xs leading-relaxed">
          For those who move different. Streetwear rooted in culture, built for everyone else.
        </p>
      </div>
      {Object.entries(footerLinks).map(([title, links]) => (
        <div key={title}>
          <p className="text-label text-primary-foreground/40 mb-4">{title.toUpperCase()}</p>
          <ul className="space-y-2.5">
            {links.map((link) => (
              <li key={link}>
                <a href="#" className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors duration-200">
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>

    {/* Newsletter */}
    <div className="border-t border-primary-foreground/10 pt-10 pb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
      <div>
        <p className="text-label text-primary-foreground/40 mb-2">NEWSLETTER</p>
        <p className="text-sm text-primary-foreground/60">Sign up for drops, exclusives & community news.</p>
      </div>
      <div className="flex w-full md:w-auto">
        <input
          type="email"
          placeholder="Email address"
          className="bg-transparent border border-primary-foreground/20 px-4 py-3 text-sm text-primary-foreground placeholder:text-primary-foreground/30 flex-1 md:w-64 focus:outline-none focus:border-primary-foreground/50 transition-colors"
        />
        <button className="bg-primary-foreground text-foreground px-6 py-3 text-label tracking-[0.2em] hover:bg-primary-foreground/90 transition-colors active:scale-[0.97]">
          JOIN
        </button>
      </div>
    </div>

    {/* Bottom */}
    <div className="border-t border-primary-foreground/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <p className="text-xs text-primary-foreground/30">© 2026 Others. All rights reserved.</p>
      <div className="flex gap-6">
        {["Instagram", "Twitter", "TikTok"].map((s) => (
          <a key={s} href="#" className="text-xs text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors">
            {s}
          </a>
        ))}
      </div>
    </div>
  </footer>
);

export default Footer;
