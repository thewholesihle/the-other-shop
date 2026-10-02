/** Joins class names, skipping falsy values — a minimal stand-in for clsx. */
export const cn = (...parts) => parts.flat(Infinity).filter(Boolean).join(' ');
