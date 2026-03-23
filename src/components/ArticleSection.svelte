<script>
  import { getSrcset, getOptimizedUrl } from '../lib/cloudinary.js';
  export let article = null;
  export let allArticles = [];

  $: displayArticle = article || allArticles.find(a => a.published) || null;

  function goToArticle() {
    if (displayArticle && window.__navigate) {
      window.__navigate(`/community/${displayArticle.slug}`);
    }
  }
</script>

{#if displayArticle}
<section class="border-t border-border">
  <div class="grid md:grid-cols-2">
    <!-- Image Side -->
    <div
      class="aspect-square md:aspect-auto md:h-[600px] bg-secondary relative cursor-pointer overflow-hidden group"
      role="button"
      tabindex="0"
      aria-label="Read {displayArticle.title}"
      onclick={goToArticle}
      onkeydown={(e) => e.key === 'Enter' && goToArticle()}
    >
      {#if displayArticle.image}
        <img
          src={getOptimizedUrl(displayArticle.image, 1200)}
          srcset={getSrcset(displayArticle.image)}
          sizes="(max-width: 768px) 100vw, 50vw"
          alt={displayArticle.title}
          class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
      {:else}
        <div class="w-full h-full flex items-center justify-center text-muted-foreground/30">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8l-4 4v14a2 2 0 0 0 2 2z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10.5 14.5 14 11l3.5 3.5"></path><path d="M8 18h8"></path></svg>
        </div>
      {/if}
      <div class="absolute inset-0 bg-black/10 transition-opacity group-hover:opacity-0"></div>
    </div>

    <!-- Content Side -->
    <div class="flex flex-col justify-center px-6 py-16 md:px-12 lg:px-20 bg-background">
      <div class="space-y-6 max-w-md">
        <div>
          <span class="inline-block text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-3 font-medium">
            EDITORIAL — {new Date(displayArticle.date || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric'})}
          </span>
          <h2 class="text-3xl md:text-5xl font-display font-bold leading-tight">{displayArticle.title}</h2>
        </div>
        
        <p class="text-muted-foreground leading-relaxed text-sm md:text-base">
          {displayArticle.excerpt || 'Read the full editorial piece and discover the story behind the collection.'}
        </p>
        
        <div class="pt-4">
          <button
            onclick={goToArticle}
            class="text-xs font-medium tracking-[0.2em] uppercase border-b-2 border-foreground pb-1 hover:text-muted-foreground transition-colors"
          >
            Read Article
          </button>
        </div>
      </div>
    </div>
  </div>
</section>
{/if}
