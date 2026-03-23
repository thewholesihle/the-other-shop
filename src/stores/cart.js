import { writable, derived } from 'svelte/store';

const CART_KEY = 'others-cart';

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

function createCart() {
  const { subscribe, set, update } = writable(loadCart());

  subscribe(items => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch {}
  });

  return {
    subscribe,

    addItem(product, size = '', color = '', quantity = 1) {
      update(items => {
        const key = `${product.id}-${size}-${color}`;
        const existing = items.find(i => i.key === key);
        if (existing) {
          return items.map(i => i.key === key ? { ...i, quantity: i.quantity + quantity } : i);
        }
        return [...items, {
          key,
          productId: product.id,
          name: product.name,
          image: product.image,
          price: product.price,
          size,
          color,
          quantity,
        }];
      });
    },

    removeItem(key) {
      update(items => items.filter(i => i.key !== key));
    },

    updateQuantity(key, quantity) {
      if (quantity < 1) return this.removeItem(key);
      update(items => items.map(i => i.key === key ? { ...i, quantity } : i));
    },

    clear() { set([]); },
  };
}

export const cart = createCart();

export const cartCount = derived(cart, $cart =>
  $cart.reduce((sum, i) => sum + i.quantity, 0)
);

export const cartTotal = derived(cart, $cart =>
  $cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
);
