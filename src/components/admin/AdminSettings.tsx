import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { SiteConfig } from "@/types/store";

interface Props {
  site: SiteConfig;
  onUpdate: (site: SiteConfig) => void;
  onReset: () => void;
}

const AdminSettings = ({ site, onUpdate, onReset }: Props) => {
  const [form, setForm] = useState<SiteConfig>({ ...site });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onUpdate(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-display font-bold mb-1">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your store settings and content.</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-4 bg-card border border-border p-5">
          <h3 className="text-label">GENERAL</h3>
          <div>
            <label className="text-label block mb-1.5">STORE NAME</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
          <div>
            <label className="text-label block mb-1.5">TAGLINE</label>
            <input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
          <div>
            <label className="text-label block mb-1.5">DESCRIPTION</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none" />
          </div>
          <div>
            <label className="text-label block mb-1.5">ANNOUNCEMENT BAR TEXT</label>
            <input value={form.announcement} onChange={(e) => setForm({ ...form, announcement: e.target.value })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
          <div>
            <label className="text-label block mb-1.5">CURRENCY SYMBOL</label>
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full max-w-[80px] bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
        </div>

        <div className="space-y-4 bg-card border border-border p-5">
          <h3 className="text-label">HERO SECTION</h3>
          <div>
            <label className="text-label block mb-1.5">HERO LABEL</label>
            <input value={form.hero.label} onChange={(e) => setForm({ ...form, hero: { ...form.hero, label: e.target.value } })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
          <div>
            <label className="text-label block mb-1.5">HERO HEADING</label>
            <input value={form.hero.heading} onChange={(e) => setForm({ ...form, hero: { ...form.hero, heading: e.target.value } })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
          <div>
            <label className="text-label block mb-1.5">CTA TEXT</label>
            <input value={form.hero.cta} onChange={(e) => setForm({ ...form, hero: { ...form.hero, cta: e.target.value } })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
          <div>
            <label className="text-label block mb-1.5">HERO IMAGE PATH</label>
            <input value={form.hero.image} onChange={(e) => setForm({ ...form, hero: { ...form.hero, image: e.target.value } })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSave} className="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">
            <Check size={16} /> {saved ? "SAVED!" : "SAVE CHANGES"}
          </button>
          <button onClick={onReset} className="flex items-center gap-2 px-5 py-2.5 text-label tracking-[0.15em] border border-border hover:bg-muted transition-colors active:scale-[0.97] text-destructive">
            <RotateCcw size={16} /> RESET ALL DATA
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
