const fs = require('fs');
let svelte = fs.readFileSync('src/components/admin/AdminSettings.svelte', 'utf8');

// 1. Cleaner Headings
svelte = svelte.replace(/<div class="space-y-[34] bg-card border border-border p-5">/g, '<div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">');
svelte = svelte.replace(/<h3 class="text-label">([^<]+)<\/h3>/g, '<h2 class="text-2xl font-display font-bold tracking-tight">$1</h2>');

// 2. Add Editorial Promo Overrides
const promoOverrides = `
        {#if form.featuredEditorialType === 'article'}
          {#if !articles || articles.length === 0}
            <p class="text-xs text-muted-foreground italic col-span-2 md:col-span-1 flex items-center">No articles found.</p>
          {:else}
            <select bind:value={form.featuredLookbook} class="col-span-2 md:col-span-1 border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors cursor-pointer bg-background">
              <option value="">— Latest article (default) —</option>
              {#each articles.filter(a => a.published) as a}
                <option value={a.id}>{a.title}</option>
              {/each}
            </select>
          {/if}
          
          <div class="col-span-2 space-y-4 mt-2">
             <div>
               <label class="text-[10px] tracking-[0.15em] text-muted-foreground uppercase font-bold">Heading Override (Optional)</label>
               <input bind:value={form.featuredEditorialHeading} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm mt-1.5 focus:outline-none focus:border-foreground transition-colors" placeholder="e.g. LATEST EDITORIAL" />
             </div>
             <div>
               <label class="text-[10px] tracking-[0.15em] text-muted-foreground uppercase font-bold">Message Override (Optional)</label>
               <textarea bind:value={form.featuredEditorialMessage} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm mt-1.5 focus:outline-none focus:border-foreground transition-colors" rows="2" placeholder="e.g. Read the full story behind the collection..."></textarea>
             </div>
             <div>
               <label class="text-[10px] tracking-[0.15em] text-muted-foreground uppercase font-bold">CTA Button Text (Optional)</label>
               <input bind:value={form.featuredEditorialCta} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm mt-1.5 focus:outline-none focus:border-foreground transition-colors" placeholder="e.g. Read Article" />
             </div>
          </div>
`;
svelte = svelte.replace(/\{#if form\.featuredEditorialType === 'article'\}(?:.|\n)*?\{:else\}/, promoOverrides + `\n        {:else}`);
fs.writeFileSync('src/components/admin/AdminSettings.svelte', svelte);

// 3. Update Index.svelte
let indexSrc = fs.readFileSync('src/pages/Index.svelte', 'utf8');
indexSrc = indexSrc.replace(/<ArticleSection article=\{featuredArticle\} \{allArticles\} \/>/, `<ArticleSection article={featuredArticle} {allArticles} heading={data.site.featuredEditorialHeading} message={data.site.featuredEditorialMessage} cta={data.site.featuredEditorialCta} />`);
fs.writeFileSync('src/pages/Index.svelte', indexSrc);
