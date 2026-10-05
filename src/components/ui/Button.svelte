<script>
  import { cn } from '../../lib/cn.js';

  let { variant = 'default', size = 'default', class: className = '', type = 'button', children, ...rest } = $props();

  const variants = {
    default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
    destructive: 'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
    outline: 'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
    secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
  };
  const sizes = {
    default: 'h-9 px-4 py-2',
    sm: 'h-8 rounded-md px-3 text-xs',
    lg: 'h-10 rounded-md px-8',
    icon: 'h-9 w-9',
  };
</script>

<button
  {type}
  class={cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors',
    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
    variants[variant], sizes[size], className
  )}
  {...rest}
>{@render children?.()}</button>
