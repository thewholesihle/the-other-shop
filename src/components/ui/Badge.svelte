<script>
  import { cn } from '../../lib/cn.js';

  let { variant = 'secondary', class: className = '', children, ...rest } = $props();

  const variants = {
    default: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    outline: 'border border-border text-foreground',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    info: 'bg-blue-100 text-blue-800',
    violet: 'bg-violet-100 text-violet-800',
    destructive: 'bg-red-100 text-red-800',
  };
</script>

<span class={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', variants[variant], className)} {...rest}>{@render children?.()}</span>
