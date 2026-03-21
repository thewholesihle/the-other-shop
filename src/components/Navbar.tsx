import { useState } from "react";
import { Menu, Search, Heart, ShoppingBag, X, Lock } from "lucide-react";
import { Link } from "react-router-dom";

const navLinks = [
  { label: "SHOP", href: "#products" },
  { label: "EXCLUSIVE", href: "#" },
  { label: "COMMUNITY", href: "#" },
  { label: "SS26", href: "#" },
];

const Navbar = ({ siteName = "Others." }: { siteName?: string }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 mix-blend-difference">
      <div className="flex items-center justify-between px-6 md:px-10 py-5">
        <Link to="/" className="text-primary-foreground font-display text-2xl font-bold tracking-tight">
          {siteName}
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a key={link.label} href={link.href} className="text-primary-foreground text-label hover:opacity-60 transition-opacity duration-200">
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-5">
          <button className="text-primary-foreground hover:opacity-60 transition-opacity active:scale-95">
            <Search size={18} strokeWidth={1.5} />
          </button>
          <button className="hidden md:block text-primary-foreground hover:opacity-60 transition-opacity active:scale-95">
            <Heart size={18} strokeWidth={1.5} />
          </button>
          <button className="text-primary-foreground hover:opacity-60 transition-opacity active:scale-95">
            <ShoppingBag size={18} strokeWidth={1.5} />
          </button>
          <Link to="/admin" className="text-primary-foreground hover:opacity-60 transition-opacity active:scale-95">
            <Lock size={16} strokeWidth={1.5} />
          </Link>
          <button className="md:hidden text-primary-foreground hover:opacity-60 transition-opacity active:scale-95" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-foreground/95 backdrop-blur-sm px-6 pb-8 pt-4 animate-fade-in">
          {navLinks.map((link) => (
            <a key={link.label} href={link.href} className="block text-primary-foreground text-label py-3 border-b border-primary-foreground/10" onClick={() => setMobileOpen(false)}>
              {link.label}
            </a>
          ))}
          <Link to="/admin" className="block text-primary-foreground text-label py-3" onClick={() => setMobileOpen(false)}>
            ADMIN
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
