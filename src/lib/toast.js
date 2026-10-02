import { writable } from 'svelte/store';

export const toasts = writable([]);
let nextId = 1;

function push(kind, message, ms = 4500) {
  const id = nextId++;
  toasts.update(t => [...t, { id, kind, message }]);
  setTimeout(() => dismiss(id), ms);
  return id;
}

export function dismiss(id) {
  toasts.update(t => t.filter(x => x.id !== id));
}

export const toast = {
  success: (m, ms) => push('success', m, ms),
  error:   (m, ms) => push('error', m, ms ?? 7000),
  info:    (m, ms) => push('info', m, ms),
};
