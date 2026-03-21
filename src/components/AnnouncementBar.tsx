const AnnouncementBar = () => {
  const text = "FREE SHIPPING ON ORDERS ABOVE €150 — ";
  const repeated = Array(8).fill(text).join("");

  return (
    <div className="bg-foreground text-primary-foreground overflow-hidden whitespace-nowrap py-2">
      <div className="animate-marquee inline-block">
        <span className="text-label tracking-[0.3em] text-[10px]">{repeated}</span>
        <span className="text-label tracking-[0.3em] text-[10px]">{repeated}</span>
      </div>
    </div>
  );
};

export default AnnouncementBar;
