<script>
  function goHome(e) {
    e.preventDefault();
    if (window.__navigate) window.__navigate('/');
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-background">
  <div class="text-center px-6">
    <p class="text-label mb-4">404</p>
    <h1 class="text-4xl font-display font-bold mb-6">Page Not Found</h1>
    <a href="/" onclick={goHome} class="inline-block border border-foreground px-8 py-3 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300">
      GO HOME
    </a>
  </div>
</div>