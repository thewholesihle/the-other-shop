// Shared Tailwind class strings for native form controls in the admin panel.
// Native <input>/<select>/<textarea> are used (rather than wrapper components) so
// `bind:value` keeps its type coercion — e.g. type="number" binding to a Number.
export const inputCls =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ' +
  'focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50';

export const textareaCls =
  'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ' +
  'focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50';

export const selectCls = inputCls + ' cursor-pointer pr-8';

export const labelCls = 'text-sm font-medium leading-none mb-2 block';
export const hintCls = 'text-[0.8rem] text-muted-foreground mt-1.5';

// Table pieces
export const thCls = 'h-10 px-4 text-left align-middle text-xs font-medium text-muted-foreground';
export const tdCls = 'px-4 py-3 align-middle text-sm';
