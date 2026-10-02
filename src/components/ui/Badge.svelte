<script>
  import { cn } from '../../lib/cn.js';

  let { variant = 'secondary', class: className = '', children, ...rest } = $props();

  const variants = {
    default: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    outline: 'border border-border text-foreground',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
    violet: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
    destructive: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  };
</script>

<span class={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', variants[variant], className)} {...rest}>{@render children?.()}</span>
