(function () {
	'use strict';

	var DEV = false;

	// Store the references to globals in case someone tries to monkey patch these, causing the below
	// to de-opt (this occurs often when using popular extensions).
	var is_array = Array.isArray;
	var index_of = Array.prototype.indexOf;
	var includes = Array.prototype.includes;
	var array_from = Array.from;
	var define_property = Object.defineProperty;
	var get_descriptor = Object.getOwnPropertyDescriptor;
	var get_descriptors = Object.getOwnPropertyDescriptors;
	var object_prototype = Object.prototype;
	var array_prototype = Array.prototype;
	var get_prototype_of = Object.getPrototypeOf;
	var is_extensible = Object.isExtensible;

	const noop = () => {};

	/** @param {Function} fn */
	function run(fn) {
		return fn();
	}

	/** @param {Array<() => void>} arr */
	function run_all(arr) {
		for (var i = 0; i < arr.length; i++) {
			arr[i]();
		}
	}

	/**
	 * TODO replace with Promise.withResolvers once supported widely enough
	 * @template [T=void]
	 */
	function deferred() {
		/** @type {(value: T) => void} */
		var resolve;

		/** @type {(reason: any) => void} */
		var reject;

		/** @type {Promise<T>} */
		var promise = new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		});

		// @ts-expect-error
		return { promise, resolve, reject };
	}

	/**
	 * When encountering a situation like `let [a, b, c] = $derived(blah())`,
	 * we need to stash an intermediate value that `a`, `b`, and `c` derive
	 * from, in case it's an iterable
	 * @template T
	 * @param {ArrayLike<T> | Iterable<T>} value
	 * @param {number} [n]
	 * @returns {Array<T>}
	 */
	function to_array(value, n) {
		// return arrays unchanged
		if (Array.isArray(value)) {
			return value;
		}

		// if value is not iterable, or `n` is unspecified (indicates a rest
		// element, which means we're not concerned about unbounded iterables)
		// convert to an array with `Array.from`
		if (!(Symbol.iterator in value)) {
			return Array.from(value);
		}

		// otherwise, populate an array with `n` values

		/** @type {T[]} */
		const array = [];

		for (const element of value) {
			array.push(element);
			if (array.length === n) break;
		}

		return array;
	}

	// General flags
	const DERIVED = 1 << 1;
	const EFFECT = 1 << 2;
	const RENDER_EFFECT = 1 << 3;
	/**
	 * An effect that does not destroy its child effects when it reruns.
	 * Runs as part of render effects, i.e. not eagerly as part of tree traversal or effect flushing.
	 */
	const MANAGED_EFFECT = 1 << 24;
	/**
	 * An effect that does not destroy its child effects when it reruns (like MANAGED_EFFECT).
	 * Runs eagerly as part of tree traversal or effect flushing.
	 */
	const BLOCK_EFFECT = 1 << 4;
	const BRANCH_EFFECT = 1 << 5;
	const ROOT_EFFECT = 1 << 6;
	const BOUNDARY_EFFECT = 1 << 7;
	/**
	 * Indicates that a reaction is connected to an effect root — either it is an effect,
	 * or it is a derived that is depended on by at least one effect. If a derived has
	 * no dependents, we can disconnect it from the graph, allowing it to either be
	 * GC'd or reconnected later if an effect comes to depend on it again
	 */
	const CONNECTED = 1 << 9;
	const CLEAN = 1 << 10;
	const DIRTY = 1 << 11;
	const MAYBE_DIRTY = 1 << 12;
	const INERT = 1 << 13;
	const DESTROYED = 1 << 14;
	/** Set once a reaction has run for the first time */
	const REACTION_RAN = 1 << 15;
	/** Effect is in the process of getting destroyed. Can be observed in child teardown functions */
	const DESTROYING = 1 << 25;

	// Flags exclusive to effects
	/**
	 * 'Transparent' effects do not create a transition boundary.
	 * This is on a block effect 99% of the time but may also be on a branch effect if its parent block effect was pruned
	 */
	const EFFECT_TRANSPARENT = 1 << 16;
	const EAGER_EFFECT = 1 << 17;
	const HEAD_EFFECT = 1 << 18;
	const EFFECT_PRESERVED = 1 << 19;
	const USER_EFFECT = 1 << 20;
	const EFFECT_OFFSCREEN = 1 << 25;

	// Flags exclusive to deriveds
	/**
	 * Tells that we marked this derived and its reactions as visited during the "mark as (maybe) dirty"-phase.
	 * Will be lifted during execution of the derived and during checking its dirty state (both are necessary
	 * because a derived might be checked but not executed).
	 */
	const WAS_MARKED = 1 << 16;

	// Flags used for async
	const REACTION_IS_UPDATING = 1 << 21;
	const ASYNC = 1 << 22;

	const ERROR_VALUE = 1 << 23;

	const STATE_SYMBOL = Symbol('$state');
	const LEGACY_PROPS = Symbol('legacy props');
	const LOADING_ATTR_SYMBOL = Symbol('');

	/** allow users to ignore aborted signal errors if `reason.name === 'StaleReactionError` */
	const STALE_REACTION = new (class StaleReactionError extends Error {
		name = 'StaleReactionError';
		message = 'The reaction that called `getAbortSignal()` was re-run or destroyed';
	})();

	const IS_XHTML =
		// We gotta write it like this because after downleveling the pure comment may end up in the wrong location
		!!globalThis.document?.contentType &&
		/* @__PURE__ */ globalThis.document.contentType.includes('xml');
	const DOCUMENT_FRAGMENT_NODE = 11;

	/* This file is generated by scripts/process-messages/index.js. Do not edit! */


	/**
	 * `%name%(...)` can only be used during component initialisation
	 * @param {string} name
	 * @returns {never}
	 */
	function lifecycle_outside_component(name) {
		{
			throw new Error(`https://svelte.dev/e/lifecycle_outside_component`);
		}
	}

	/* This file is generated by scripts/process-messages/index.js. Do not edit! */


	/**
	 * Cannot create a `$derived(...)` with an `await` expression outside of an effect tree
	 * @returns {never}
	 */
	function async_derived_orphan() {
		{
			throw new Error(`https://svelte.dev/e/async_derived_orphan`);
		}
	}

	/**
	 * Keyed each block has duplicate key `%value%` at indexes %a% and %b%
	 * @param {string} a
	 * @param {string} b
	 * @param {string | undefined | null} [value]
	 * @returns {never}
	 */
	function each_key_duplicate(a, b, value) {
		{
			throw new Error(`https://svelte.dev/e/each_key_duplicate`);
		}
	}

	/**
	 * `%rune%` cannot be used inside an effect cleanup function
	 * @param {string} rune
	 * @returns {never}
	 */
	function effect_in_teardown(rune) {
		{
			throw new Error(`https://svelte.dev/e/effect_in_teardown`);
		}
	}

	/**
	 * Effect cannot be created inside a `$derived` value that was not itself created inside an effect
	 * @returns {never}
	 */
	function effect_in_unowned_derived() {
		{
			throw new Error(`https://svelte.dev/e/effect_in_unowned_derived`);
		}
	}

	/**
	 * `%rune%` can only be used inside an effect (e.g. during component initialisation)
	 * @param {string} rune
	 * @returns {never}
	 */
	function effect_orphan(rune) {
		{
			throw new Error(`https://svelte.dev/e/effect_orphan`);
		}
	}

	/**
	 * Maximum update depth exceeded. This typically indicates that an effect reads and writes the same piece of state
	 * @returns {never}
	 */
	function effect_update_depth_exceeded() {
		{
			throw new Error(`https://svelte.dev/e/effect_update_depth_exceeded`);
		}
	}

	/**
	 * Cannot do `bind:%key%={undefined}` when `%key%` has a fallback value
	 * @param {string} key
	 * @returns {never}
	 */
	function props_invalid_value(key) {
		{
			throw new Error(`https://svelte.dev/e/props_invalid_value`);
		}
	}

	/**
	 * Property descriptors defined on `$state` objects must contain `value` and always be `enumerable`, `configurable` and `writable`.
	 * @returns {never}
	 */
	function state_descriptors_fixed() {
		{
			throw new Error(`https://svelte.dev/e/state_descriptors_fixed`);
		}
	}

	/**
	 * Cannot set prototype of `$state` object
	 * @returns {never}
	 */
	function state_prototype_fixed() {
		{
			throw new Error(`https://svelte.dev/e/state_prototype_fixed`);
		}
	}

	/**
	 * Updating state inside `$derived(...)`, `$inspect(...)` or a template expression is forbidden. If the value should not be reactive, declare it without `$state`
	 * @returns {never}
	 */
	function state_unsafe_mutation() {
		{
			throw new Error(`https://svelte.dev/e/state_unsafe_mutation`);
		}
	}

	/**
	 * A `<svelte:boundary>` `reset` function cannot be called while an error is still being handled
	 * @returns {never}
	 */
	function svelte_boundary_reset_onerror() {
		{
			throw new Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`);
		}
	}

	const EACH_ITEM_REACTIVE = 1;
	const EACH_INDEX_REACTIVE = 1 << 1;
	/** See EachBlock interface metadata.is_controlled for an explanation what this is */
	const EACH_IS_CONTROLLED = 1 << 2;
	const EACH_IS_ANIMATED = 1 << 3;
	const EACH_ITEM_IMMUTABLE = 1 << 4;

	const PROPS_IS_IMMUTABLE = 1;
	const PROPS_IS_RUNES = 1 << 1;
	const PROPS_IS_UPDATED = 1 << 2;
	const PROPS_IS_BINDABLE = 1 << 3;
	const PROPS_IS_LAZY_INITIAL = 1 << 4;

	const TEMPLATE_FRAGMENT = 1;
	const TEMPLATE_USE_IMPORT_NODE = 1 << 1;

	const UNINITIALIZED = Symbol();

	const NAMESPACE_HTML = 'http://www.w3.org/1999/xhtml';
	const NAMESPACE_SVG = 'http://www.w3.org/2000/svg';
	const NAMESPACE_MATHML = 'http://www.w3.org/1998/Math/MathML';

	/* This file is generated by scripts/process-messages/index.js. Do not edit! */


	/**
	 * The `value` property of a `<select multiple>` element should be an array, but it received a non-array value. The selection will be kept as is.
	 */
	function select_multiple_invalid_value() {
		{
			console.warn(`https://svelte.dev/e/select_multiple_invalid_value`);
		}
	}

	/**
	 * A `<svelte:boundary>` `reset` function only resets the boundary the first time it is called
	 */
	function svelte_boundary_reset_noop() {
		{
			console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`);
		}
	}

	/** @import { Equals } from '#client' */

	/** @type {Equals} */
	function equals(value) {
		return value === this.v;
	}

	/**
	 * @param {unknown} a
	 * @param {unknown} b
	 * @returns {boolean}
	 */
	function safe_not_equal(a, b) {
		return a != a
			? b == b
			: a !== b || (a !== null && typeof a === 'object') || typeof a === 'function';
	}

	/** @type {Equals} */
	function safe_equals(value) {
		return !safe_not_equal(value, this.v);
	}

	/** True if experimental.async=true */
	/** True if we're not certain that we only have Svelte 5 code in the compilation */
	let legacy_mode_flag = false;
	/** True if $inspect.trace is used */
	let tracing_mode_flag = false;

	function enable_legacy_mode_flag() {
		legacy_mode_flag = true;
	}

	/** @import { ComponentContext, DevStackEntry, Effect } from '#client' */

	/** @type {ComponentContext | null} */
	let component_context = null;

	/** @param {ComponentContext | null} context */
	function set_component_context(context) {
		component_context = context;
	}

	/**
	 * @param {Record<string, unknown>} props
	 * @param {any} runes
	 * @param {Function} [fn]
	 * @returns {void}
	 */
	function push(props, runes = false, fn) {
		component_context = {
			p: component_context,
			i: false,
			c: null,
			e: null,
			s: props,
			x: null,
			r: /** @type {Effect} */ (active_effect),
			l: legacy_mode_flag && !runes ? { s: null, u: null, $: [] } : null
		};
	}

	/**
	 * @template {Record<string, any>} T
	 * @param {T} [component]
	 * @returns {T}
	 */
	function pop(component) {
		var context = /** @type {ComponentContext} */ (component_context);
		var effects = context.e;

		if (effects !== null) {
			context.e = null;

			for (var fn of effects) {
				create_user_effect(fn);
			}
		}

		context.i = true;

		component_context = context.p;

		return /** @type {T} */ ({});
	}

	/** @returns {boolean} */
	function is_runes() {
		return !legacy_mode_flag || (component_context !== null && component_context.l === null);
	}

	/** @type {Array<() => void>} */
	let micro_tasks = [];

	function run_micro_tasks() {
		var tasks = micro_tasks;
		micro_tasks = [];
		run_all(tasks);
	}

	/**
	 * @param {() => void} fn
	 */
	function queue_micro_task(fn) {
		if (micro_tasks.length === 0 && !is_flushing_sync) {
			var tasks = micro_tasks;
			queueMicrotask(() => {
				// If this is false, a flushSync happened in the meantime. Do _not_ run new scheduled microtasks in that case
				// as the ordering of microtasks would be broken at that point - consider this case:
				// - queue_micro_task schedules microtask A to flush task X
				// - synchronously after, flushSync runs, processing task X
				// - synchronously after, some other microtask B is scheduled, but not through queue_micro_task but for example a Promise.resolve() in user code
				// - synchronously after, queue_micro_task schedules microtask C to flush task Y
				// - one tick later, microtask A now resolves, flushing task Y before microtask B, which is incorrect
				// This if check prevents that race condition (that realistically will only happen in tests)
				if (tasks === micro_tasks) run_micro_tasks();
			});
		}

		micro_tasks.push(fn);
	}

	/**
	 * Synchronously run any queued tasks.
	 */
	function flush_tasks() {
		while (micro_tasks.length > 0) {
			run_micro_tasks();
		}
	}

	/** @import { Derived, Effect } from '#client' */
	/** @import { Boundary } from './dom/blocks/boundary.js' */

	/**
	 * @param {unknown} error
	 */
	function handle_error(error) {
		var effect = active_effect;

		// for unowned deriveds, don't throw until we read the value
		if (effect === null) {
			/** @type {Derived} */ (active_reaction).f |= ERROR_VALUE;
			return error;
		}

		// if the error occurred while creating this subtree, we let it
		// bubble up until it hits a boundary that can handle it, unless
		// it's an $effect in which case it doesn't run immediately
		if ((effect.f & REACTION_RAN) === 0 && (effect.f & EFFECT) === 0) {

			throw error;
		}

		// otherwise we bubble up the effect tree ourselves
		invoke_error_boundary(error, effect);
	}

	/**
	 * @param {unknown} error
	 * @param {Effect | null} effect
	 */
	function invoke_error_boundary(error, effect) {
		while (effect !== null) {
			if ((effect.f & BOUNDARY_EFFECT) !== 0) {
				if ((effect.f & REACTION_RAN) === 0) {
					// we are still creating the boundary effect
					throw error;
				}

				try {
					/** @type {Boundary} */ (effect.b).error(error);
					return;
				} catch (e) {
					error = e;
				}
			}

			effect = effect.parent;
		}

		throw error;
	}

	/** @import { Derived, Signal } from '#client' */

	const STATUS_MASK = -7169;

	/**
	 * @param {Signal} signal
	 * @param {number} status
	 */
	function set_signal_status(signal, status) {
		signal.f = (signal.f & STATUS_MASK) | status;
	}

	/**
	 * Set a derived's status to CLEAN or MAYBE_DIRTY based on its connection state.
	 * @param {Derived} derived
	 */
	function update_derived_status(derived) {
		// Only mark as MAYBE_DIRTY if disconnected and has dependencies.
		if ((derived.f & CONNECTED) !== 0 || derived.deps === null) {
			set_signal_status(derived, CLEAN);
		} else {
			set_signal_status(derived, MAYBE_DIRTY);
		}
	}

	/** @import { Derived, Effect, Value } from '#client' */

	/**
	 * @param {Value[] | null} deps
	 */
	function clear_marked(deps) {
		if (deps === null) return;

		for (const dep of deps) {
			if ((dep.f & DERIVED) === 0 || (dep.f & WAS_MARKED) === 0) {
				continue;
			}

			dep.f ^= WAS_MARKED;

			clear_marked(/** @type {Derived} */ (dep).deps);
		}
	}

	/**
	 * @param {Effect} effect
	 * @param {Set<Effect>} dirty_effects
	 * @param {Set<Effect>} maybe_dirty_effects
	 */
	function defer_effect(effect, dirty_effects, maybe_dirty_effects) {
		if ((effect.f & DIRTY) !== 0) {
			dirty_effects.add(effect);
		} else if ((effect.f & MAYBE_DIRTY) !== 0) {
			maybe_dirty_effects.add(effect);
		}

		// Since we're not executing these effects now, we need to clear any WAS_MARKED flags
		// so that other batches can correctly reach these effects during their own traversal
		clear_marked(effect.deps);

		// mark as clean so they get scheduled if they depend on pending async state
		set_signal_status(effect, CLEAN);
	}

	/** @import { Readable } from './public' */

	/**
	 * @template T
	 * @param {Readable<T> | null | undefined} store
	 * @param {(value: T) => void} run
	 * @param {(value: T) => void} [invalidate]
	 * @returns {() => void}
	 */
	function subscribe_to_store(store, run, invalidate) {
		if (store == null) {
			// @ts-expect-error
			run(undefined);

			// @ts-expect-error
			if (invalidate) invalidate(undefined);

			return noop;
		}

		// Svelte store takes a private second argument
		// StartStopNotifier could mutate state, and we want to silence the corresponding validation error
		const unsub = untrack(() =>
			store.subscribe(
				run,
				// @ts-expect-error
				invalidate
			)
		);

		// Also support RxJS
		// @ts-expect-error TODO fix this in the types?
		return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
	}

	/** @import { Readable, StartStopNotifier, Subscriber, Unsubscriber, Updater, Writable } from '../public.js' */
	/** @import { Stores, StoresValues, SubscribeInvalidateTuple } from '../private.js' */

	/**
	 * @type {Array<SubscribeInvalidateTuple<any> | any>}
	 */
	const subscriber_queue = [];

	/**
	 * Creates a `Readable` store that allows reading by subscription.
	 *
	 * @template T
	 * @param {T} [value] initial value
	 * @param {StartStopNotifier<T>} [start]
	 * @returns {Readable<T>}
	 */
	function readable(value, start) {
		return {
			subscribe: writable(value, start).subscribe
		};
	}

	/**
	 * Create a `Writable` store that allows both updating and reading by subscription.
	 *
	 * @template T
	 * @param {T} [value] initial value
	 * @param {StartStopNotifier<T>} [start]
	 * @returns {Writable<T>}
	 */
	function writable(value, start = noop) {
		/** @type {Unsubscriber | null} */
		let stop = null;

		/** @type {Set<SubscribeInvalidateTuple<T>>} */
		const subscribers = new Set();

		/**
		 * @param {T} new_value
		 * @returns {void}
		 */
		function set(new_value) {
			if (safe_not_equal(value, new_value)) {
				value = new_value;
				if (stop) {
					// store is ready
					const run_queue = !subscriber_queue.length;
					for (const subscriber of subscribers) {
						subscriber[1]();
						subscriber_queue.push(subscriber, value);
					}
					if (run_queue) {
						for (let i = 0; i < subscriber_queue.length; i += 2) {
							subscriber_queue[i][0](subscriber_queue[i + 1]);
						}
						subscriber_queue.length = 0;
					}
				}
			}
		}

		/**
		 * @param {Updater<T>} fn
		 * @returns {void}
		 */
		function update(fn) {
			set(fn(/** @type {T} */ (value)));
		}

		/**
		 * @param {Subscriber<T>} run
		 * @param {() => void} [invalidate]
		 * @returns {Unsubscriber}
		 */
		function subscribe(run, invalidate = noop) {
			/** @type {SubscribeInvalidateTuple<T>} */
			const subscriber = [run, invalidate];
			subscribers.add(subscriber);
			if (subscribers.size === 1) {
				stop = start(set, update) || noop;
			}
			run(/** @type {T} */ (value));
			return () => {
				subscribers.delete(subscriber);
				if (subscribers.size === 0 && stop) {
					stop();
					stop = null;
				}
			};
		}
		return { set, update, subscribe };
	}

	/**
	 * Derived value store by synchronizing one or more readable stores and
	 * applying an aggregation function over its input values.
	 *
	 * @template {Stores} S
	 * @template T
	 * @overload
	 * @param {S} stores
	 * @param {(values: StoresValues<S>, set: (value: T) => void, update: (fn: Updater<T>) => void) => Unsubscriber | void} fn
	 * @param {T} [initial_value]
	 * @returns {Readable<T>}
	 */
	/**
	 * Derived value store by synchronizing one or more readable stores and
	 * applying an aggregation function over its input values.
	 *
	 * @template {Stores} S
	 * @template T
	 * @overload
	 * @param {S} stores
	 * @param {(values: StoresValues<S>) => T} fn
	 * @param {T} [initial_value]
	 * @returns {Readable<T>}
	 */
	/**
	 * @template {Stores} S
	 * @template T
	 * @param {S} stores
	 * @param {Function} fn
	 * @param {T} [initial_value]
	 * @returns {Readable<T>}
	 */
	function derived$1(stores, fn, initial_value) {
		const single = !Array.isArray(stores);
		/** @type {Array<Readable<any>>} */
		const stores_array = single ? [stores] : stores;
		if (!stores_array.every(Boolean)) {
			throw new Error('derived() expects stores as input, got a falsy value');
		}
		const auto = fn.length < 2;
		return readable(initial_value, (set, update) => {
			let started = false;
			/** @type {T[]} */
			const values = [];
			let pending = 0;
			let cleanup = noop;
			const sync = () => {
				if (pending) {
					return;
				}
				cleanup();
				const result = fn(single ? values[0] : values, set, update);
				if (auto) {
					set(result);
				} else {
					cleanup = typeof result === 'function' ? result : noop;
				}
			};
			const unsubscribers = stores_array.map((store, i) =>
				subscribe_to_store(
					store,
					(value) => {
						values[i] = value;
						pending &= ~(1 << i);
						if (started) {
							sync();
						}
					},
					() => {
						pending |= 1 << i;
					}
				)
			);
			started = true;
			sync();
			return function stop() {
				run_all(unsubscribers);
				cleanup();
				// We need to set this to false because callbacks can still happen despite having unsubscribed:
				// Callbacks might already be placed in the queue which doesn't know it should no longer
				// invoke this derived store.
				started = false;
			};
		});
	}

	/**
	 * Get the current value from a store by subscribing and immediately unsubscribing.
	 *
	 * @template T
	 * @param {Readable<T>} store
	 * @returns {T}
	 */
	function get$1(store) {
		let value;
		subscribe_to_store(store, (_) => (value = _))();
		// @ts-expect-error
		return value;
	}

	/** @import { StoreReferencesContainer } from '#client' */
	/** @import { Store } from '#shared' */

	/**
	 * Whether or not the prop currently being read is a store binding, as in
	 * `<Child bind:x={$y} />`. If it is, we treat the prop as mutable even in
	 * runes mode, and skip `binding_property_non_reactive` validation
	 */
	let is_store_binding = false;

	let IS_UNMOUNTED = Symbol();

	/**
	 * Gets the current value of a store. If the store isn't subscribed to yet, it will create a proxy
	 * signal that will be updated when the store is. The store references container is needed to
	 * track reassignments to stores and to track the correct component context.
	 * @template V
	 * @param {Store<V> | null | undefined} store
	 * @param {string} store_name
	 * @param {StoreReferencesContainer} stores
	 * @returns {V}
	 */
	function store_get(store, store_name, stores) {
		const entry = (stores[store_name] ??= {
			store: null,
			source: mutable_source(undefined),
			unsubscribe: noop
		});

		// if the component that setup this is already unmounted we don't want to register a subscription
		if (entry.store !== store && !(IS_UNMOUNTED in stores)) {
			entry.unsubscribe();
			entry.store = store ?? null;

			if (store == null) {
				entry.source.v = undefined; // see synchronous callback comment below
				entry.unsubscribe = noop;
			} else {
				var is_synchronous_callback = true;

				entry.unsubscribe = subscribe_to_store(store, (v) => {
					if (is_synchronous_callback) {
						// If the first updates to the store value (possibly multiple of them) are synchronously
						// inside a derived, we will hit the `state_unsafe_mutation` error if we `set` the value
						entry.source.v = v;
					} else {
						set(entry.source, v);
					}
				});

				is_synchronous_callback = false;
			}
		}

		// if the component that setup this stores is already unmounted the source will be out of sync
		// so we just use the `get` for the stores, less performant but it avoids to create a memory leak
		// and it will keep the value consistent
		if (store && IS_UNMOUNTED in stores) {
			return get$1(store);
		}

		return get(entry.source);
	}

	/**
	 * Unsubscribes from all auto-subscribed stores on destroy
	 * @returns {[StoreReferencesContainer, ()=>void]}
	 */
	function setup_stores() {
		/** @type {StoreReferencesContainer} */
		const stores = {};

		function cleanup() {
			teardown(() => {
				for (var store_name in stores) {
					const ref = stores[store_name];
					ref.unsubscribe();
				}
				define_property(stores, IS_UNMOUNTED, {
					enumerable: false,
					value: true
				});
			});
		}

		return [stores, cleanup];
	}

	/**
	 * Returns a tuple that indicates whether `fn()` reads a prop that is a store binding.
	 * Used to prevent `binding_property_non_reactive` validation false positives and
	 * ensure that these props are treated as mutable even in runes mode
	 * @template T
	 * @param {() => T} fn
	 * @returns {[T, boolean]}
	 */
	function capture_store_binding(fn) {
		var previous_is_store_binding = is_store_binding;

		try {
			is_store_binding = false;
			return [fn(), is_store_binding];
		} finally {
			is_store_binding = previous_is_store_binding;
		}
	}

	/** @import { Fork } from 'svelte' */
	/** @import { Derived, Effect, Reaction, Source, Value } from '#client' */

	/** @type {Set<Batch>} */
	const batches = new Set();

	/** @type {Batch | null} */
	let current_batch = null;

	/**
	 * When time travelling (i.e. working in one batch, while other batches
	 * still have ongoing work), we ignore the real values of affected
	 * signals in favour of their values within the batch
	 * @type {Map<Value, any> | null}
	 */
	let batch_values = null;

	/** @type {Effect | null} */
	let last_scheduled_effect = null;

	let is_flushing_sync = false;
	let is_processing = false;

	/**
	 * During traversal, this is an array. Newly created effects are (if not immediately
	 * executed) pushed to this array, rather than going through the scheduling
	 * rigamarole that would cause another turn of the flush loop.
	 * @type {Effect[] | null}
	 */
	let collected_effects = null;

	/**
	 * An array of effects that are marked during traversal as a result of a `set`
	 * (not `internal_set`) call. These will be added to the next batch and
	 * trigger another `batch.process()`
	 * @type {Effect[] | null}
	 * @deprecated when we get rid of legacy mode and stores, we can get rid of this
	 */
	let legacy_updates = null;

	var flush_count = 0;

	let uid = 1;

	class Batch {
		id = uid++;

		/**
		 * The current values of any signals that are updated in this batch.
		 * Tuple format: [value, is_derived] (note: is_derived is false for deriveds, too, if they were overridden via assignment)
		 * They keys of this map are identical to `this.#previous`
		 * @type {Map<Value, [any, boolean]>}
		 */
		current = new Map();

		/**
		 * The values of any signals (sources and deriveds) that are updated in this batch _before_ those updates took place.
		 * They keys of this map are identical to `this.#current`
		 * @type {Map<Value, any>}
		 */
		previous = new Map();

		/**
		 * When the batch is committed (and the DOM is updated), we need to remove old branches
		 * and append new ones by calling the functions added inside (if/each/key/etc) blocks
		 * @type {Set<(batch: Batch) => void>}
		 */
		#commit_callbacks = new Set();

		/**
		 * If a fork is discarded, we need to destroy any effects that are no longer needed
		 * @type {Set<(batch: Batch) => void>}
		 */
		#discard_callbacks = new Set();

		/**
		 * Async effects that are currently in flight
		 * @type {Map<Effect, number>}
		 */
		#pending = new Map();

		/**
		 * Async effects that are currently in flight, _not_ inside a pending boundary
		 * @type {Map<Effect, number>}
		 */
		#blocking_pending = new Map();

		/**
		 * A deferred that resolves when the batch is committed, used with `settled()`
		 * TODO replace with Promise.withResolvers once supported widely enough
		 * @type {{ promise: Promise<void>, resolve: (value?: any) => void, reject: (reason: unknown) => void } | null}
		 */
		#deferred = null;

		/**
		 * The root effects that need to be flushed
		 * @type {Effect[]}
		 */
		#roots = [];

		/**
		 * Deferred effects (which run after async work has completed) that are DIRTY
		 * @type {Set<Effect>}
		 */
		#dirty_effects = new Set();

		/**
		 * Deferred effects that are MAYBE_DIRTY
		 * @type {Set<Effect>}
		 */
		#maybe_dirty_effects = new Set();

		/**
		 * A map of branches that still exist, but will be destroyed when this batch
		 * is committed — we skip over these during `process`.
		 * The value contains child effects that were dirty/maybe_dirty before being reset,
		 * so they can be rescheduled if the branch survives.
		 * @type {Map<Effect, { d: Effect[], m: Effect[] }>}
		 */
		#skipped_branches = new Map();

		is_fork = false;

		#decrement_queued = false;

		/** @type {Set<Batch>} */
		#blockers = new Set();

		#is_deferred() {
			return this.is_fork || this.#blocking_pending.size > 0;
		}

		#is_blocked() {
			for (const batch of this.#blockers) {
				for (const effect of batch.#blocking_pending.keys()) {
					var skipped = false;
					var e = effect;

					while (e.parent !== null) {
						if (this.#skipped_branches.has(e)) {
							skipped = true;
							break;
						}

						e = e.parent;
					}

					if (!skipped) {
						return true;
					}
				}
			}

			return false;
		}

		/**
		 * Add an effect to the #skipped_branches map and reset its children
		 * @param {Effect} effect
		 */
		skip_effect(effect) {
			if (!this.#skipped_branches.has(effect)) {
				this.#skipped_branches.set(effect, { d: [], m: [] });
			}
		}

		/**
		 * Remove an effect from the #skipped_branches map and reschedule
		 * any tracked dirty/maybe_dirty child effects
		 * @param {Effect} effect
		 */
		unskip_effect(effect) {
			var tracked = this.#skipped_branches.get(effect);
			if (tracked) {
				this.#skipped_branches.delete(effect);

				for (var e of tracked.d) {
					set_signal_status(e, DIRTY);
					this.schedule(e);
				}

				for (e of tracked.m) {
					set_signal_status(e, MAYBE_DIRTY);
					this.schedule(e);
				}
			}
		}

		#process() {
			if (flush_count++ > 1000) {
				batches.delete(this);
				infinite_loop_guard();
			}

			// we only reschedule previously-deferred effects if we expect
			// to be able to run them after processing the batch
			if (!this.#is_deferred()) {
				for (const e of this.#dirty_effects) {
					this.#maybe_dirty_effects.delete(e);
					set_signal_status(e, DIRTY);
					this.schedule(e);
				}

				for (const e of this.#maybe_dirty_effects) {
					set_signal_status(e, MAYBE_DIRTY);
					this.schedule(e);
				}
			}

			const roots = this.#roots;
			this.#roots = [];

			this.apply();

			/** @type {Effect[]} */
			var effects = (collected_effects = []);

			/** @type {Effect[]} */
			var render_effects = [];

			/**
			 * @type {Effect[]}
			 * @deprecated when we get rid of legacy mode and stores, we can get rid of this
			 */
			var updates = (legacy_updates = []);

			for (const root of roots) {
				try {
					this.#traverse(root, effects, render_effects);
				} catch (e) {
					reset_all(root);
					throw e;
				}
			}

			// any writes should take effect in a subsequent batch
			current_batch = null;

			if (updates.length > 0) {
				var batch = Batch.ensure();
				for (const e of updates) {
					batch.schedule(e);
				}
			}

			collected_effects = null;
			legacy_updates = null;

			if (this.#is_deferred() || this.#is_blocked()) {
				this.#defer_effects(render_effects);
				this.#defer_effects(effects);

				for (const [e, t] of this.#skipped_branches) {
					reset_branch(e, t);
				}
			} else {
				if (this.#pending.size === 0) {
					batches.delete(this);
				}

				// clear effects. Those that are still needed will be rescheduled through unskipping the skipped branches.
				this.#dirty_effects.clear();
				this.#maybe_dirty_effects.clear();

				// append/remove branches
				for (const fn of this.#commit_callbacks) fn(this);
				this.#commit_callbacks.clear();
				flush_queued_effects(render_effects);
				flush_queued_effects(effects);

				this.#deferred?.resolve();
			}

			var next_batch = /** @type {Batch | null} */ (/** @type {unknown} */ (current_batch));

			// Edge case: During traversal new branches might create effects that run immediately and set state,
			// causing an effect and therefore a root to be scheduled again. We need to traverse the current batch
			// once more in that case - most of the time this will just clean up dirty branches.
			if (this.#roots.length > 0) {
				const batch = (next_batch ??= this);
				batch.#roots.push(...this.#roots.filter((r) => !batch.#roots.includes(r)));
			}

			if (next_batch !== null) {
				batches.add(next_batch);

				next_batch.#process();
			}

			if (!batches.has(this)) {
				this.#commit();
			}
		}

		/**
		 * Traverse the effect tree, executing effects or stashing
		 * them for later execution as appropriate
		 * @param {Effect} root
		 * @param {Effect[]} effects
		 * @param {Effect[]} render_effects
		 */
		#traverse(root, effects, render_effects) {
			root.f ^= CLEAN;

			var effect = root.first;

			while (effect !== null) {
				var flags = effect.f;
				var is_branch = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) !== 0;
				var is_skippable_branch = is_branch && (flags & CLEAN) !== 0;

				var skip = is_skippable_branch || (flags & INERT) !== 0 || this.#skipped_branches.has(effect);

				if (!skip && effect.fn !== null) {
					if (is_branch) {
						effect.f ^= CLEAN;
					} else if ((flags & EFFECT) !== 0) {
						effects.push(effect);
					} else if (is_dirty(effect)) {
						if ((flags & BLOCK_EFFECT) !== 0) this.#maybe_dirty_effects.add(effect);
						update_effect(effect);
					}

					var child = effect.first;

					if (child !== null) {
						effect = child;
						continue;
					}
				}

				while (effect !== null) {
					var next = effect.next;

					if (next !== null) {
						effect = next;
						break;
					}

					effect = effect.parent;
				}
			}
		}

		/**
		 * @param {Effect[]} effects
		 */
		#defer_effects(effects) {
			for (var i = 0; i < effects.length; i += 1) {
				defer_effect(effects[i], this.#dirty_effects, this.#maybe_dirty_effects);
			}
		}

		/**
		 * Associate a change to a given source with the current
		 * batch, noting its previous and current values
		 * @param {Value} source
		 * @param {any} old_value
		 * @param {boolean} [is_derived]
		 */
		capture(source, old_value, is_derived = false) {
			if (old_value !== UNINITIALIZED && !this.previous.has(source)) {
				this.previous.set(source, old_value);
			}

			// Don't save errors in `batch_values`, or they won't be thrown in `runtime.js#get`
			if ((source.f & ERROR_VALUE) === 0) {
				this.current.set(source, [source.v, is_derived]);
				batch_values?.set(source, source.v);
			}
		}

		activate() {
			current_batch = this;
		}

		deactivate() {
			current_batch = null;
			batch_values = null;
		}

		flush() {

			try {
				is_processing = true;
				current_batch = this;

				this.#process();
			} finally {
				flush_count = 0;
				last_scheduled_effect = null;
				collected_effects = null;
				legacy_updates = null;
				is_processing = false;

				current_batch = null;
				batch_values = null;

				old_values.clear();
			}
		}

		discard() {
			for (const fn of this.#discard_callbacks) fn(this);
			this.#discard_callbacks.clear();

			batches.delete(this);
		}

		#commit() {
			// If there are other pending batches, they now need to be 'rebased' —
			// in other words, we re-run block/async effects with the newly
			// committed state, unless the batch in question has a more
			// recent value for a given source
			for (const batch of batches) {
				var is_earlier = batch.id < this.id;

				/** @type {Source[]} */
				var sources = [];

				for (const [source, [value, is_derived]] of this.current) {
					if (batch.current.has(source)) {
						var batch_value = /** @type {[any, boolean]} */ (batch.current.get(source))[0]; // faster than destructuring

						if (is_earlier && value !== batch_value) {
							// bring the value up to date
							batch.current.set(source, [value, is_derived]);
						} else {
							// same value or later batch has more recent value,
							// no need to re-run these effects
							continue;
						}
					}

					sources.push(source);
				}

				// Re-run async/block effects that depend on distinct values changed in both batches
				var others = [...batch.current.keys()].filter((s) => !this.current.has(s));

				if (others.length === 0) {
					if (is_earlier) {
						// this batch is now obsolete and can be discarded
						batch.discard();
					}
				} else if (sources.length > 0) {

					batch.activate();

					/** @type {Set<Value>} */
					var marked = new Set();

					/** @type {Map<Reaction, boolean>} */
					var checked = new Map();

					for (var source of sources) {
						mark_effects(source, others, marked, checked);
					}

					// Only apply and traverse when we know we triggered async work with marking the effects
					if (batch.#roots.length > 0) {
						batch.apply();

						for (var root of batch.#roots) {
							batch.#traverse(root, [], []);
						}

						batch.#roots = [];
					}

					batch.deactivate();
				}
			}

			for (const batch of batches) {
				if (batch.#blockers.has(this)) {
					batch.#blockers.delete(this);

					if (batch.#blockers.size === 0 && !batch.#is_deferred()) {
						batch.activate();
						batch.#process();
					}
				}
			}
		}

		/**
		 * @param {boolean} blocking
		 * @param {Effect} effect
		 */
		increment(blocking, effect) {
			let pending_count = this.#pending.get(effect) ?? 0;
			this.#pending.set(effect, pending_count + 1);

			if (blocking) {
				let blocking_pending_count = this.#blocking_pending.get(effect) ?? 0;
				this.#blocking_pending.set(effect, blocking_pending_count + 1);
			}
		}

		/**
		 * @param {boolean} blocking
		 * @param {Effect} effect
		 * @param {boolean} skip - whether to skip updates (because this is triggered by a stale reaction)
		 */
		decrement(blocking, effect, skip) {
			let pending_count = this.#pending.get(effect) ?? 0;

			if (pending_count === 1) {
				this.#pending.delete(effect);
			} else {
				this.#pending.set(effect, pending_count - 1);
			}

			if (blocking) {
				let blocking_pending_count = this.#blocking_pending.get(effect) ?? 0;

				if (blocking_pending_count === 1) {
					this.#blocking_pending.delete(effect);
				} else {
					this.#blocking_pending.set(effect, blocking_pending_count - 1);
				}
			}

			if (this.#decrement_queued || skip) return;
			this.#decrement_queued = true;

			queue_micro_task(() => {
				this.#decrement_queued = false;
				this.flush();
			});
		}

		/**
		 * @param {Set<Effect>} dirty_effects
		 * @param {Set<Effect>} maybe_dirty_effects
		 */
		transfer_effects(dirty_effects, maybe_dirty_effects) {
			for (const e of dirty_effects) {
				this.#dirty_effects.add(e);
			}

			for (const e of maybe_dirty_effects) {
				this.#maybe_dirty_effects.add(e);
			}

			dirty_effects.clear();
			maybe_dirty_effects.clear();
		}

		/** @param {(batch: Batch) => void} fn */
		oncommit(fn) {
			this.#commit_callbacks.add(fn);
		}

		/** @param {(batch: Batch) => void} fn */
		ondiscard(fn) {
			this.#discard_callbacks.add(fn);
		}

		settled() {
			return (this.#deferred ??= deferred()).promise;
		}

		static ensure() {
			if (current_batch === null) {
				const batch = (current_batch = new Batch());

				if (!is_processing) {
					batches.add(current_batch);

					if (!is_flushing_sync) {
						queue_micro_task(() => {
							if (current_batch !== batch) {
								// a flushSync happened in the meantime
								return;
							}

							batch.flush();
						});
					}
				}
			}

			return current_batch;
		}

		apply() {
			{
				batch_values = null;
				return;
			}
		}

		/**
		 *
		 * @param {Effect} effect
		 */
		schedule(effect) {
			last_scheduled_effect = effect;

			// defer render effects inside a pending boundary
			// TODO the `REACTION_RAN` check is only necessary because of legacy `$:` effects AFAICT — we can remove later
			if (
				effect.b?.is_pending &&
				(effect.f & (EFFECT | RENDER_EFFECT | MANAGED_EFFECT)) !== 0 &&
				(effect.f & REACTION_RAN) === 0
			) {
				effect.b.defer_effect(effect);
				return;
			}

			var e = effect;

			while (e.parent !== null) {
				e = e.parent;
				var flags = e.f;

				// if the effect is being scheduled because a parent (each/await/etc) block
				// updated an internal source, or because a branch is being unskipped,
				// bail out or we'll cause a second flush
				if (collected_effects !== null && e === active_effect) {

					// in sync mode, render effects run during traversal. in an extreme edge case
					// — namely that we're setting a value inside a derived read during traversal —
					// they can be made dirty after they have already been visited, in which
					// case we shouldn't bail out. we also shouldn't bail out if we're
					// updating a store inside a `$:`, since this might invalidate
					// effects that were already visited
					if (
						(active_reaction === null || (active_reaction.f & DERIVED) === 0) &&
						true
					) {
						return;
					}
				}

				if ((flags & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
					if ((flags & CLEAN) === 0) {
						// branch is already dirty, bail
						return;
					}

					e.f ^= CLEAN;
				}
			}

			this.#roots.push(e);
		}
	}

	/**
	 * Synchronously flush any pending updates.
	 * Returns void if no callback is provided, otherwise returns the result of calling the callback.
	 * @template [T=void]
	 * @param {(() => T) | undefined} [fn]
	 * @returns {T}
	 */
	function flushSync(fn) {
		var was_flushing_sync = is_flushing_sync;
		is_flushing_sync = true;

		try {
			var result;

			if (fn) ;

			while (true) {
				flush_tasks();

				if (current_batch === null) {
					return /** @type {T} */ (result);
				}

				current_batch.flush();
			}
		} finally {
			is_flushing_sync = was_flushing_sync;
		}
	}

	function infinite_loop_guard() {

		try {
			effect_update_depth_exceeded();
		} catch (error) {

			// Best effort: invoke the boundary nearest the most recent
			// effect and hope that it's relevant to the infinite loop
			invoke_error_boundary(error, last_scheduled_effect);
		}
	}

	/** @type {Set<Effect> | null} */
	let eager_block_effects = null;

	/**
	 * @param {Array<Effect>} effects
	 * @returns {void}
	 */
	function flush_queued_effects(effects) {
		var length = effects.length;
		if (length === 0) return;

		var i = 0;

		while (i < length) {
			var effect = effects[i++];

			if ((effect.f & (DESTROYED | INERT)) === 0 && is_dirty(effect)) {
				eager_block_effects = new Set();

				update_effect(effect);

				// Effects with no dependencies or teardown do not get added to the effect tree.
				// Deferred effects (e.g. `$effect(...)`) _are_ added to the tree because we
				// don't know if we need to keep them until they are executed. Doing the check
				// here (rather than in `update_effect`) allows us to skip the work for
				// immediate effects.
				if (
					effect.deps === null &&
					effect.first === null &&
					effect.nodes === null &&
					effect.teardown === null &&
					effect.ac === null
				) {
					// remove this effect from the graph
					unlink_effect(effect);
				}

				// If update_effect() has a flushSync() in it, we may have flushed another flush_queued_effects(),
				// which already handled this logic and did set eager_block_effects to null.
				if (eager_block_effects?.size > 0) {
					old_values.clear();

					for (const e of eager_block_effects) {
						// Skip eager effects that have already been unmounted
						if ((e.f & (DESTROYED | INERT)) !== 0) continue;

						// Run effects in order from ancestor to descendant, else we could run into nullpointers
						/** @type {Effect[]} */
						const ordered_effects = [e];
						let ancestor = e.parent;
						while (ancestor !== null) {
							if (eager_block_effects.has(ancestor)) {
								eager_block_effects.delete(ancestor);
								ordered_effects.push(ancestor);
							}
							ancestor = ancestor.parent;
						}

						for (let j = ordered_effects.length - 1; j >= 0; j--) {
							const e = ordered_effects[j];
							// Skip eager effects that have already been unmounted
							if ((e.f & (DESTROYED | INERT)) !== 0) continue;
							update_effect(e);
						}
					}

					eager_block_effects.clear();
				}
			}
		}

		eager_block_effects = null;
	}

	/**
	 * This is similar to `mark_reactions`, but it only marks async/block effects
	 * depending on `value` and at least one of the other `sources`, so that
	 * these effects can re-run after another batch has been committed
	 * @param {Value} value
	 * @param {Source[]} sources
	 * @param {Set<Value>} marked
	 * @param {Map<Reaction, boolean>} checked
	 */
	function mark_effects(value, sources, marked, checked) {
		if (marked.has(value)) return;
		marked.add(value);

		if (value.reactions !== null) {
			for (const reaction of value.reactions) {
				const flags = reaction.f;

				if ((flags & DERIVED) !== 0) {
					mark_effects(/** @type {Derived} */ (reaction), sources, marked, checked);
				} else if (
					(flags & (ASYNC | BLOCK_EFFECT)) !== 0 &&
					(flags & DIRTY) === 0 &&
					depends_on(reaction, sources, checked)
				) {
					set_signal_status(reaction, DIRTY);
					schedule_effect(/** @type {Effect} */ (reaction));
				}
			}
		}
	}

	/**
	 * @param {Reaction} reaction
	 * @param {Source[]} sources
	 * @param {Map<Reaction, boolean>} checked
	 */
	function depends_on(reaction, sources, checked) {
		const depends = checked.get(reaction);
		if (depends !== undefined) return depends;

		if (reaction.deps !== null) {
			for (const dep of reaction.deps) {
				if (includes.call(sources, dep)) {
					return true;
				}

				if ((dep.f & DERIVED) !== 0 && depends_on(/** @type {Derived} */ (dep), sources, checked)) {
					checked.set(/** @type {Derived} */ (dep), true);
					return true;
				}
			}
		}

		checked.set(reaction, false);

		return false;
	}

	/**
	 * @param {Effect} effect
	 * @returns {void}
	 */
	function schedule_effect(effect) {
		/** @type {Batch} */ (current_batch).schedule(effect);
	}

	/**
	 * Mark all the effects inside a skipped branch CLEAN, so that
	 * they can be correctly rescheduled later. Tracks dirty and maybe_dirty
	 * effects so they can be rescheduled if the branch survives.
	 * @param {Effect} effect
	 * @param {{ d: Effect[], m: Effect[] }} tracked
	 */
	function reset_branch(effect, tracked) {
		// clean branch = nothing dirty inside, no need to traverse further
		if ((effect.f & BRANCH_EFFECT) !== 0 && (effect.f & CLEAN) !== 0) {
			return;
		}

		if ((effect.f & DIRTY) !== 0) {
			tracked.d.push(effect);
		} else if ((effect.f & MAYBE_DIRTY) !== 0) {
			tracked.m.push(effect);
		}

		set_signal_status(effect, CLEAN);

		var e = effect.first;
		while (e !== null) {
			reset_branch(e, tracked);
			e = e.next;
		}
	}

	/**
	 * Mark an entire effect tree clean following an error
	 * @param {Effect} effect
	 */
	function reset_all(effect) {
		set_signal_status(effect, CLEAN);

		var e = effect.first;
		while (e !== null) {
			reset_all(e);
			e = e.next;
		}
	}

	/**
	 * Returns a `subscribe` function that integrates external event-based systems with Svelte's reactivity.
	 * It's particularly useful for integrating with web APIs like `MediaQuery`, `IntersectionObserver`, or `WebSocket`.
	 *
	 * If `subscribe` is called inside an effect (including indirectly, for example inside a getter),
	 * the `start` callback will be called with an `update` function. Whenever `update` is called, the effect re-runs.
	 *
	 * If `start` returns a cleanup function, it will be called when the effect is destroyed.
	 *
	 * If `subscribe` is called in multiple effects, `start` will only be called once as long as the effects
	 * are active, and the returned teardown function will only be called when all effects are destroyed.
	 *
	 * It's best understood with an example. Here's an implementation of [`MediaQuery`](https://svelte.dev/docs/svelte/svelte-reactivity#MediaQuery):
	 *
	 * ```js
	 * import { createSubscriber } from 'svelte/reactivity';
	 * import { on } from 'svelte/events';
	 *
	 * export class MediaQuery {
	 * 	#query;
	 * 	#subscribe;
	 *
	 * 	constructor(query) {
	 * 		this.#query = window.matchMedia(`(${query})`);
	 *
	 * 		this.#subscribe = createSubscriber((update) => {
	 * 			// when the `change` event occurs, re-run any effects that read `this.current`
	 * 			const off = on(this.#query, 'change', update);
	 *
	 * 			// stop listening when all the effects are destroyed
	 * 			return () => off();
	 * 		});
	 * 	}
	 *
	 * 	get current() {
	 * 		// This makes the getter reactive, if read in an effect
	 * 		this.#subscribe();
	 *
	 * 		// Return the current state of the query, whether or not we're in an effect
	 * 		return this.#query.matches;
	 * 	}
	 * }
	 * ```
	 * @param {(update: () => void) => (() => void) | void} start
	 * @since 5.7.0
	 */
	function createSubscriber(start) {
		let subscribers = 0;
		let version = source(0);
		/** @type {(() => void) | void} */
		let stop;

		return () => {
			if (effect_tracking()) {
				get(version);

				render_effect(() => {
					if (subscribers === 0) {
						stop = untrack(() => start(() => increment(version)));
					}

					subscribers += 1;

					return () => {
						queue_micro_task(() => {
							// Only count down after a microtask, else we would reach 0 before our own render effect reruns,
							// but reach 1 again when the tick callback of the prior teardown runs. That would mean we
							// re-subcribe unnecessarily and create a memory leak because the old subscription is never cleaned up.
							subscribers -= 1;

							if (subscribers === 0) {
								stop?.();
								stop = undefined;
								// Increment the version to ensure any dependent deriveds are marked dirty when the subscription is picked up again later.
								// If we didn't do this then the comparison of write versions would determine that the derived has a later version than
								// the subscriber, and it would not be re-run.
								increment(version);
							}
						});
					};
				});
			}
		};
	}

	/** @import { Effect, Source, TemplateNode, } from '#client' */

	/**
	 * @typedef {{
	 * 	 onerror?: (error: unknown, reset: () => void) => void;
	 *   failed?: (anchor: Node, error: () => unknown, reset: () => () => void) => void;
	 *   pending?: (anchor: Node) => void;
	 * }} BoundaryProps
	 */

	var flags = EFFECT_TRANSPARENT | EFFECT_PRESERVED;

	/**
	 * @param {TemplateNode} node
	 * @param {BoundaryProps} props
	 * @param {((anchor: Node) => void)} children
	 * @param {((error: unknown) => unknown) | undefined} [transform_error]
	 * @returns {void}
	 */
	function boundary(node, props, children, transform_error) {
		new Boundary(node, props, children, transform_error);
	}

	class Boundary {
		/** @type {Boundary | null} */
		parent;

		is_pending = false;

		/**
		 * API-level transformError transform function. Transforms errors before they reach the `failed` snippet.
		 * Inherited from parent boundary, or defaults to identity.
		 * @type {(error: unknown) => unknown}
		 */
		transform_error;

		/** @type {TemplateNode} */
		#anchor;

		/** @type {TemplateNode | null} */
		#hydrate_open = null;

		/** @type {BoundaryProps} */
		#props;

		/** @type {((anchor: Node) => void)} */
		#children;

		/** @type {Effect} */
		#effect;

		/** @type {Effect | null} */
		#main_effect = null;

		/** @type {Effect | null} */
		#pending_effect = null;

		/** @type {Effect | null} */
		#failed_effect = null;

		/** @type {DocumentFragment | null} */
		#offscreen_fragment = null;

		#local_pending_count = 0;
		#pending_count = 0;
		#pending_count_update_queued = false;

		/** @type {Set<Effect>} */
		#dirty_effects = new Set();

		/** @type {Set<Effect>} */
		#maybe_dirty_effects = new Set();

		/**
		 * A source containing the number of pending async deriveds/expressions.
		 * Only created if `$effect.pending()` is used inside the boundary,
		 * otherwise updating the source results in needless `Batch.ensure()`
		 * calls followed by no-op flushes
		 * @type {Source<number> | null}
		 */
		#effect_pending = null;

		#effect_pending_subscriber = createSubscriber(() => {
			this.#effect_pending = source(this.#local_pending_count);

			return () => {
				this.#effect_pending = null;
			};
		});

		/**
		 * @param {TemplateNode} node
		 * @param {BoundaryProps} props
		 * @param {((anchor: Node) => void)} children
		 * @param {((error: unknown) => unknown) | undefined} [transform_error]
		 */
		constructor(node, props, children, transform_error) {
			this.#anchor = node;
			this.#props = props;

			this.#children = (anchor) => {
				var effect = /** @type {Effect} */ (active_effect);

				effect.b = this;
				effect.f |= BOUNDARY_EFFECT;

				children(anchor);
			};

			this.parent = /** @type {Effect} */ (active_effect).b;

			// Inherit transform_error from parent boundary, or use the provided one, or default to identity
			this.transform_error = transform_error ?? this.parent?.transform_error ?? ((e) => e);

			this.#effect = block(() => {
				{
					this.#render();
				}
			}, flags);
		}

		#hydrate_resolved_content() {
			try {
				this.#main_effect = branch(() => this.#children(this.#anchor));
			} catch (error) {
				this.error(error);
			}
		}

		/**
		 * @param {unknown} error The deserialized error from the server's hydration comment
		 */
		#hydrate_failed_content(error) {
			const failed = this.#props.failed;
			if (!failed) return;

			this.#failed_effect = branch(() => {
				failed(
					this.#anchor,
					() => error,
					() => () => {}
				);
			});
		}

		#hydrate_pending_content() {
			const pending = this.#props.pending;
			if (!pending) return;

			this.is_pending = true;
			this.#pending_effect = branch(() => pending(this.#anchor));

			queue_micro_task(() => {
				var fragment = (this.#offscreen_fragment = document.createDocumentFragment());
				var anchor = create_text();

				fragment.append(anchor);

				this.#main_effect = this.#run(() => {
					return branch(() => this.#children(anchor));
				});

				if (this.#pending_count === 0) {
					this.#anchor.before(fragment);
					this.#offscreen_fragment = null;

					pause_effect(/** @type {Effect} */ (this.#pending_effect), () => {
						this.#pending_effect = null;
					});

					this.#resolve(/** @type {Batch} */ (current_batch));
				}
			});
		}

		#render() {
			try {
				this.is_pending = this.has_pending_snippet();
				this.#pending_count = 0;
				this.#local_pending_count = 0;

				this.#main_effect = branch(() => {
					this.#children(this.#anchor);
				});

				if (this.#pending_count > 0) {
					var fragment = (this.#offscreen_fragment = document.createDocumentFragment());
					move_effect(this.#main_effect, fragment);

					const pending = /** @type {(anchor: Node) => void} */ (this.#props.pending);
					this.#pending_effect = branch(() => pending(this.#anchor));
				} else {
					this.#resolve(/** @type {Batch} */ (current_batch));
				}
			} catch (error) {
				this.error(error);
			}
		}

		/**
		 * @param {Batch} batch
		 */
		#resolve(batch) {
			this.is_pending = false;

			// any effects that were previously deferred should be transferred
			// to the batch, which will flush in the next microtask
			batch.transfer_effects(this.#dirty_effects, this.#maybe_dirty_effects);
		}

		/**
		 * Defer an effect inside a pending boundary until the boundary resolves
		 * @param {Effect} effect
		 */
		defer_effect(effect) {
			defer_effect(effect, this.#dirty_effects, this.#maybe_dirty_effects);
		}

		/**
		 * Returns `false` if the effect exists inside a boundary whose pending snippet is shown
		 * @returns {boolean}
		 */
		is_rendered() {
			return !this.is_pending && (!this.parent || this.parent.is_rendered());
		}

		has_pending_snippet() {
			return !!this.#props.pending;
		}

		/**
		 * @template T
		 * @param {() => T} fn
		 */
		#run(fn) {
			var previous_effect = active_effect;
			var previous_reaction = active_reaction;
			var previous_ctx = component_context;

			set_active_effect(this.#effect);
			set_active_reaction(this.#effect);
			set_component_context(this.#effect.ctx);

			try {
				Batch.ensure();
				return fn();
			} catch (e) {
				handle_error(e);
				return null;
			} finally {
				set_active_effect(previous_effect);
				set_active_reaction(previous_reaction);
				set_component_context(previous_ctx);
			}
		}

		/**
		 * Updates the pending count associated with the currently visible pending snippet,
		 * if any, such that we can replace the snippet with content once work is done
		 * @param {1 | -1} d
		 * @param {Batch} batch
		 */
		#update_pending_count(d, batch) {
			if (!this.has_pending_snippet()) {
				if (this.parent) {
					this.parent.#update_pending_count(d, batch);
				}

				// if there's no parent, we're in a scope with no pending snippet
				return;
			}

			this.#pending_count += d;

			if (this.#pending_count === 0) {
				this.#resolve(batch);

				if (this.#pending_effect) {
					pause_effect(this.#pending_effect, () => {
						this.#pending_effect = null;
					});
				}

				if (this.#offscreen_fragment) {
					this.#anchor.before(this.#offscreen_fragment);
					this.#offscreen_fragment = null;
				}
			}
		}

		/**
		 * Update the source that powers `$effect.pending()` inside this boundary,
		 * and controls when the current `pending` snippet (if any) is removed.
		 * Do not call from inside the class
		 * @param {1 | -1} d
		 * @param {Batch} batch
		 */
		update_pending_count(d, batch) {
			this.#update_pending_count(d, batch);

			this.#local_pending_count += d;

			if (!this.#effect_pending || this.#pending_count_update_queued) return;
			this.#pending_count_update_queued = true;

			queue_micro_task(() => {
				this.#pending_count_update_queued = false;
				if (this.#effect_pending) {
					internal_set(this.#effect_pending, this.#local_pending_count);
				}
			});
		}

		get_effect_pending() {
			this.#effect_pending_subscriber();
			return get(/** @type {Source<number>} */ (this.#effect_pending));
		}

		/** @param {unknown} error */
		error(error) {
			var onerror = this.#props.onerror;
			let failed = this.#props.failed;

			// If we have nothing to capture the error, or if we hit an error while
			// rendering the fallback, re-throw for another boundary to handle
			if (!onerror && !failed) {
				throw error;
			}

			if (this.#main_effect) {
				destroy_effect(this.#main_effect);
				this.#main_effect = null;
			}

			if (this.#pending_effect) {
				destroy_effect(this.#pending_effect);
				this.#pending_effect = null;
			}

			if (this.#failed_effect) {
				destroy_effect(this.#failed_effect);
				this.#failed_effect = null;
			}

			var did_reset = false;
			var calling_on_error = false;

			const reset = () => {
				if (did_reset) {
					svelte_boundary_reset_noop();
					return;
				}

				did_reset = true;

				if (calling_on_error) {
					svelte_boundary_reset_onerror();
				}

				if (this.#failed_effect !== null) {
					pause_effect(this.#failed_effect, () => {
						this.#failed_effect = null;
					});
				}

				this.#run(() => {
					this.#render();
				});
			};

			/** @param {unknown} transformed_error */
			const handle_error_result = (transformed_error) => {
				try {
					calling_on_error = true;
					onerror?.(transformed_error, reset);
					calling_on_error = false;
				} catch (error) {
					invoke_error_boundary(error, this.#effect && this.#effect.parent);
				}

				if (failed) {
					this.#failed_effect = this.#run(() => {
						try {
							return branch(() => {
								// errors in `failed` snippets cause the boundary to error again
								// TODO Svelte 6: revisit this decision, most likely better to go to parent boundary instead
								var effect = /** @type {Effect} */ (active_effect);

								effect.b = this;
								effect.f |= BOUNDARY_EFFECT;

								failed(
									this.#anchor,
									() => transformed_error,
									() => reset
								);
							});
						} catch (error) {
							invoke_error_boundary(error, /** @type {Effect} */ (this.#effect.parent));
							return null;
						}
					});
				}
			};

			queue_micro_task(() => {
				// Run the error through the API-level transformError transform (e.g. SvelteKit's handleError)
				/** @type {unknown} */
				var result;
				try {
					result = this.transform_error(error);
				} catch (e) {
					invoke_error_boundary(e, this.#effect && this.#effect.parent);
					return;
				}

				if (
					result !== null &&
					typeof result === 'object' &&
					typeof (/** @type {any} */ (result).then) === 'function'
				) {
					// transformError returned a Promise — wait for it
					/** @type {any} */ (result).then(
						handle_error_result,
						/** @param {unknown} e */
						(e) => invoke_error_boundary(e, this.#effect && this.#effect.parent)
					);
				} else {
					// Synchronous result — handle immediately
					handle_error_result(result);
				}
			});
		}
	}

	/** @import { Blocker, Effect, Value } from '#client' */

	/**
	 * @param {Blocker[]} blockers
	 * @param {Array<() => any>} sync
	 * @param {Array<() => Promise<any>>} async
	 * @param {(values: Value[]) => any} fn
	 */
	function flatten(blockers, sync, async, fn) {
		const d = is_runes() ? derived : derived_safe_equal;

		// Filter out already-settled blockers - no need to wait for them
		var pending = blockers.filter((b) => !b.settled);

		if (async.length === 0 && pending.length === 0) {
			fn(sync.map(d));
			return;
		}

		var parent = /** @type {Effect} */ (active_effect);

		var restore = capture();
		var blocker_promise =
			pending.length === 1
				? pending[0].promise
				: pending.length > 1
					? Promise.all(pending.map((b) => b.promise))
					: null;

		/** @param {Value[]} values */
		function finish(values) {
			restore();

			try {
				fn(values);
			} catch (error) {
				if ((parent.f & DESTROYED) === 0) {
					invoke_error_boundary(error, parent);
				}
			}

			unset_context();
		}

		// Fast path: blockers but no async expressions
		if (async.length === 0) {
			/** @type {Promise<any>} */ (blocker_promise).then(() => finish(sync.map(d)));
			return;
		}

		var decrement_pending = increment_pending();

		// Full path: has async expressions
		function run() {
			Promise.all(async.map((expression) => async_derived(expression)))
				.then((result) => finish([...sync.map(d), ...result]))
				.catch((error) => invoke_error_boundary(error, parent))
				.finally(() => decrement_pending());
		}

		if (blocker_promise) {
			blocker_promise.then(() => {
				restore();
				run();
				unset_context();
			});
		} else {
			run();
		}
	}

	/**
	 * Captures the current effect context so that we can restore it after
	 * some asynchronous work has happened (so that e.g. `await a + b`
	 * causes `b` to be registered as a dependency).
	 */
	function capture() {
		var previous_effect = /** @type {Effect} */ (active_effect);
		var previous_reaction = active_reaction;
		var previous_component_context = component_context;
		var previous_batch = /** @type {Batch} */ (current_batch);

		return function restore(activate_batch = true) {
			set_active_effect(previous_effect);
			set_active_reaction(previous_reaction);
			set_component_context(previous_component_context);

			if (activate_batch && (previous_effect.f & DESTROYED) === 0) {
				// TODO we only need optional chaining here because `{#await ...}` blocks
				// are anomalous. Once we retire them we can get rid of it
				previous_batch?.activate();
				previous_batch?.apply();
			}
		};
	}

	function unset_context(deactivate_batch = true) {
		set_active_effect(null);
		set_active_reaction(null);
		set_component_context(null);
		if (deactivate_batch) current_batch?.deactivate();
	}

	/**
	 * @returns {(skip?: boolean) => void}
	 */
	function increment_pending() {
		var effect = /** @type {Effect} */ (active_effect);
		var boundary = /** @type {Boundary} */ (effect.b);
		var batch = /** @type {Batch} */ (current_batch);
		var blocking = boundary.is_rendered();

		boundary.update_pending_count(1, batch);
		batch.increment(blocking, effect);

		return (skip = false) => {
			boundary.update_pending_count(-1, batch);
			batch.decrement(blocking, effect, skip);
		};
	}

	/** @import { Derived, Effect, Source } from '#client' */
	/** @import { Batch } from './batch.js'; */
	/** @import { Boundary } from '../dom/blocks/boundary.js'; */

	/**
	 * @template V
	 * @param {() => V} fn
	 * @returns {Derived<V>}
	 */
	/*#__NO_SIDE_EFFECTS__*/
	function derived(fn) {
		var flags = DERIVED | DIRTY;
		var parent_derived =
			active_reaction !== null && (active_reaction.f & DERIVED) !== 0
				? /** @type {Derived} */ (active_reaction)
				: null;

		if (active_effect !== null) {
			// Since deriveds are evaluated lazily, any effects created inside them are
			// created too late to ensure that the parent effect is added to the tree
			active_effect.f |= EFFECT_PRESERVED;
		}

		/** @type {Derived<V>} */
		const signal = {
			ctx: component_context,
			deps: null,
			effects: null,
			equals,
			f: flags,
			fn,
			reactions: null,
			rv: 0,
			v: /** @type {V} */ (UNINITIALIZED),
			wv: 0,
			parent: parent_derived ?? active_effect,
			ac: null
		};

		return signal;
	}

	/**
	 * @template V
	 * @param {() => V | Promise<V>} fn
	 * @param {string} [label]
	 * @param {string} [location] If provided, print a warning if the value is not read immediately after update
	 * @returns {Promise<Source<V>>}
	 */
	/*#__NO_SIDE_EFFECTS__*/
	function async_derived(fn, label, location) {
		let parent = /** @type {Effect | null} */ (active_effect);

		if (parent === null) {
			async_derived_orphan();
		}

		var promise = /** @type {Promise<V>} */ (/** @type {unknown} */ (undefined));
		var signal = source(/** @type {V} */ (UNINITIALIZED));

		// only suspend in async deriveds created on initialisation
		var should_suspend = !active_reaction;

		/** @type {Map<Batch, ReturnType<typeof deferred<V>>>} */
		var deferreds = new Map();

		async_effect(() => {

			var effect = /** @type {Effect} */ (active_effect);

			/** @type {ReturnType<typeof deferred<V>>} */
			var d = deferred();
			promise = d.promise;

			try {
				// If this code is changed at some point, make sure to still access the then property
				// of fn() to read any signals it might access, so that we track them as dependencies.
				// We call `unset_context` to undo any `save` calls that happen inside `fn()`
				Promise.resolve(fn()).then(d.resolve, d.reject).finally(unset_context);
			} catch (error) {
				d.reject(error);
				unset_context();
			}

			var batch = /** @type {Batch} */ (current_batch);

			if (should_suspend) {
				// we only increment the batch's pending state for updates, not creation, otherwise
				// we will decrement to zero before the work that depends on this promise (e.g. a
				// template effect) has initialized, causing the batch to resolve prematurely
				if ((effect.f & REACTION_RAN) !== 0) {
					var decrement_pending = increment_pending();
				}

				if (/** @type {Boundary} */ (parent.b).is_rendered()) {
					deferreds.get(batch)?.reject(STALE_REACTION);
					deferreds.delete(batch); // delete to ensure correct order in Map iteration below
				} else {
					// While the boundary is still showing pending, a new run supersedes all older in-flight runs
					// for this async expression. Cancel eagerly so resolution cannot commit stale values.
					for (const d of deferreds.values()) {
						d.reject(STALE_REACTION);
					}
					deferreds.clear();
				}

				deferreds.set(batch, d);
			}

			/**
			 * @param {any} value
			 * @param {unknown} error
			 */
			const handler = (value, error = undefined) => {

				if (decrement_pending) {
					// don't trigger an update if we're only here because
					// the promise was superseded before it could resolve
					var skip = error === STALE_REACTION;
					decrement_pending(skip);
				}

				if (error === STALE_REACTION || (effect.f & DESTROYED) !== 0) {
					return;
				}

				batch.activate();

				if (error) {
					signal.f |= ERROR_VALUE;

					// @ts-expect-error the error is the wrong type, but we don't care
					internal_set(signal, error);
				} else {
					if ((signal.f & ERROR_VALUE) !== 0) {
						signal.f ^= ERROR_VALUE;
					}

					internal_set(signal, value);

					// All prior async derived runs are now stale
					for (const [b, d] of deferreds) {
						deferreds.delete(b);
						if (b === batch) break;
						d.reject(STALE_REACTION);
					}
				}

				batch.deactivate();
			};

			d.promise.then(handler, (e) => handler(null, e || 'unknown'));
		});

		teardown(() => {
			for (const d of deferreds.values()) {
				d.reject(STALE_REACTION);
			}
		});

		return new Promise((fulfil) => {
			/** @param {Promise<V>} p */
			function next(p) {
				function go() {
					if (p === promise) {
						fulfil(signal);
					} else {
						// if the effect re-runs before the initial promise
						// resolves, delay resolution until we have a value
						next(promise);
					}
				}

				p.then(go, go);
			}

			next(promise);
		});
	}

	/**
	 * @template V
	 * @param {() => V} fn
	 * @returns {Derived<V>}
	 */
	/*#__NO_SIDE_EFFECTS__*/
	function user_derived(fn) {
		const d = derived(fn);

		push_reaction_value(d);

		return d;
	}

	/**
	 * @template V
	 * @param {() => V} fn
	 * @returns {Derived<V>}
	 */
	/*#__NO_SIDE_EFFECTS__*/
	function derived_safe_equal(fn) {
		const signal = derived(fn);
		signal.equals = safe_equals;
		return signal;
	}

	/**
	 * @param {Derived} derived
	 * @returns {void}
	 */
	function destroy_derived_effects(derived) {
		var effects = derived.effects;

		if (effects !== null) {
			derived.effects = null;

			for (var i = 0; i < effects.length; i += 1) {
				destroy_effect(/** @type {Effect} */ (effects[i]));
			}
		}
	}

	/**
	 * @param {Derived} derived
	 * @returns {Effect | null}
	 */
	function get_derived_parent_effect(derived) {
		var parent = derived.parent;
		while (parent !== null) {
			if ((parent.f & DERIVED) === 0) {
				// The original parent effect might've been destroyed but the derived
				// is used elsewhere now - do not return the destroyed effect in that case
				return (parent.f & DESTROYED) === 0 ? /** @type {Effect} */ (parent) : null;
			}
			parent = parent.parent;
		}
		return null;
	}

	/**
	 * @template T
	 * @param {Derived} derived
	 * @returns {T}
	 */
	function execute_derived(derived) {
		var value;
		var prev_active_effect = active_effect;

		set_active_effect(get_derived_parent_effect(derived));

		{
			try {
				derived.f &= ~WAS_MARKED;
				destroy_derived_effects(derived);
				value = update_reaction(derived);
			} finally {
				set_active_effect(prev_active_effect);
			}
		}

		return value;
	}

	/**
	 * @param {Derived} derived
	 * @returns {void}
	 */
	function update_derived(derived) {
		var old_value = derived.v;
		var value = execute_derived(derived);

		if (!derived.equals(value)) {
			derived.wv = increment_write_version();

			// in a fork, we don't update the underlying value, just `batch_values`.
			// the underlying value will be updated when the fork is committed.
			// otherwise, the next time we get here after a 'real world' state
			// change, `derived.equals` may incorrectly return `true`
			if (!current_batch?.is_fork || derived.deps === null) {
				derived.v = value;
				current_batch?.capture(derived, old_value, true);

				// deriveds without dependencies should never be recomputed
				if (derived.deps === null) {
					set_signal_status(derived, CLEAN);
					return;
				}
			}
		}

		// don't mark derived clean if we're reading it inside a
		// cleanup function, or it will cache a stale value
		if (is_destroying_effect) {
			return;
		}

		// During time traveling we don't want to reset the status so that
		// traversal of the graph in the other batches still happens
		if (batch_values !== null) {
			// only cache the value if we're in a tracking context, otherwise we won't
			// clear the cache in `mark_reactions` when dependencies are updated
			if (effect_tracking() || current_batch?.is_fork) {
				batch_values.set(derived, value);
			}
		} else {
			update_derived_status(derived);
		}
	}

	/**
	 * @param {Derived} derived
	 */
	function freeze_derived_effects(derived) {
		if (derived.effects === null) return;

		for (const e of derived.effects) {
			// if the effect has a teardown function or abort signal, call it
			if (e.teardown || e.ac) {
				e.teardown?.();
				e.ac?.abort(STALE_REACTION);

				// make it a noop so it doesn't get called again if the derived
				// is unfrozen. we don't set it to `null`, because the existence
				// of a teardown function is what determines whether the
				// effect runs again during unfreezing
				e.teardown = noop;
				e.ac = null;

				remove_reactions(e, 0);
				destroy_effect_children(e);
			}
		}
	}

	/**
	 * @param {Derived} derived
	 */
	function unfreeze_derived_effects(derived) {
		if (derived.effects === null) return;

		for (const e of derived.effects) {
			// if the effect was previously frozen — indicated by the presence
			// of a teardown function — unfreeze it
			if (e.teardown) {
				update_effect(e);
			}
		}
	}

	/** @import { Derived, Effect, Source, Value } from '#client' */

	/** @type {Set<any>} */
	let eager_effects = new Set();

	/** @type {Map<Source, any>} */
	const old_values = new Map();

	let eager_effects_deferred = false;

	/**
	 * @template V
	 * @param {V} v
	 * @param {Error | null} [stack]
	 * @returns {Source<V>}
	 */
	// TODO rename this to `state` throughout the codebase
	function source(v, stack) {
		/** @type {Value} */
		var signal = {
			f: 0, // TODO ideally we could skip this altogether, but it causes type errors
			v,
			reactions: null,
			equals,
			rv: 0,
			wv: 0
		};

		return signal;
	}

	/**
	 * @template V
	 * @param {V} v
	 * @param {Error | null} [stack]
	 */
	/*#__NO_SIDE_EFFECTS__*/
	function state(v, stack) {
		const s = source(v);

		push_reaction_value(s);

		return s;
	}

	/**
	 * @template V
	 * @param {V} initial_value
	 * @param {boolean} [immutable]
	 * @returns {Source<V>}
	 */
	/*#__NO_SIDE_EFFECTS__*/
	function mutable_source(initial_value, immutable = false, trackable = true) {
		const s = source(initial_value);
		if (!immutable) {
			s.equals = safe_equals;
		}

		// bind the signal to the component context, in case we need to
		// track updates to trigger beforeUpdate/afterUpdate callbacks
		if (legacy_mode_flag && trackable && component_context !== null && component_context.l !== null) {
			(component_context.l.s ??= []).push(s);
		}

		return s;
	}

	/**
	 * @template V
	 * @param {Value<V>} source
	 * @param {V} value
	 */
	function mutate(source, value) {
		set(
			source,
			untrack(() => get(source))
		);
		return value;
	}

	/**
	 * @template V
	 * @param {Source<V>} source
	 * @param {V} value
	 * @param {boolean} [should_proxy]
	 * @returns {V}
	 */
	function set(source, value, should_proxy = false) {
		if (
			active_reaction !== null &&
			// since we are untracking the function inside `$inspect.with` we need to add this check
			// to ensure we error if state is set inside an inspect effect
			(!untracking || (active_reaction.f & EAGER_EFFECT) !== 0) &&
			is_runes() &&
			(active_reaction.f & (DERIVED | BLOCK_EFFECT | ASYNC | EAGER_EFFECT)) !== 0 &&
			(current_sources === null || !includes.call(current_sources, source))
		) {
			state_unsafe_mutation();
		}

		let new_value = should_proxy ? proxy(value) : value;

		return internal_set(source, new_value, legacy_updates);
	}

	/**
	 * @template V
	 * @param {Source<V>} source
	 * @param {V} value
	 * @param {Effect[] | null} [updated_during_traversal]
	 * @returns {V}
	 */
	function internal_set(source, value, updated_during_traversal = null) {
		if (!source.equals(value)) {
			var old_value = source.v;

			if (is_destroying_effect) {
				old_values.set(source, value);
			} else {
				old_values.set(source, old_value);
			}

			source.v = value;

			var batch = Batch.ensure();
			batch.capture(source, old_value);

			if ((source.f & DERIVED) !== 0) {
				const derived = /** @type {Derived} */ (source);

				// if we are assigning to a dirty derived we set it to clean/maybe dirty but we also eagerly execute it to track the dependencies
				if ((source.f & DIRTY) !== 0) {
					execute_derived(derived);
				}

				// During time traveling we don't want to reset the status so that
				// traversal of the graph in the other batches still happens
				if (batch_values === null) {
					update_derived_status(derived);
				}
			}

			source.wv = increment_write_version();

			// For debugging, in case you want to know which reactions are being scheduled:
			// log_reactions(source);
			mark_reactions(source, DIRTY, updated_during_traversal);

			// It's possible that the current reaction might not have up-to-date dependencies
			// whilst it's actively running. So in the case of ensuring it registers the reaction
			// properly for itself, we need to ensure the current effect actually gets
			// scheduled. i.e: `$effect(() => x++)`
			if (
				is_runes() &&
				active_effect !== null &&
				(active_effect.f & CLEAN) !== 0 &&
				(active_effect.f & (BRANCH_EFFECT | ROOT_EFFECT)) === 0
			) {
				if (untracked_writes === null) {
					set_untracked_writes([source]);
				} else {
					untracked_writes.push(source);
				}
			}

			if (!batch.is_fork && eager_effects.size > 0 && !eager_effects_deferred) {
				flush_eager_effects();
			}
		}

		return value;
	}

	function flush_eager_effects() {
		eager_effects_deferred = false;

		for (const effect of eager_effects) {
			// Mark clean inspect-effects as maybe dirty and then check their dirtiness
			// instead of just updating the effects - this way we avoid overfiring.
			if ((effect.f & CLEAN) !== 0) {
				set_signal_status(effect, MAYBE_DIRTY);
			}

			if (is_dirty(effect)) {
				update_effect(effect);
			}
		}

		eager_effects.clear();
	}

	/**
	 * Silently (without using `get`) increment a source
	 * @param {Source<number>} source
	 */
	function increment(source) {
		set(source, source.v + 1);
	}

	/**
	 * @param {Value} signal
	 * @param {number} status should be DIRTY or MAYBE_DIRTY
	 * @param {Effect[] | null} updated_during_traversal
	 * @returns {void}
	 */
	function mark_reactions(signal, status, updated_during_traversal) {
		var reactions = signal.reactions;
		if (reactions === null) return;

		var runes = is_runes();
		var length = reactions.length;

		for (var i = 0; i < length; i++) {
			var reaction = reactions[i];
			var flags = reaction.f;

			// In legacy mode, skip the current effect to prevent infinite loops
			if (!runes && reaction === active_effect) continue;

			var not_dirty = (flags & DIRTY) === 0;

			// don't set a DIRTY reaction to MAYBE_DIRTY
			if (not_dirty) {
				set_signal_status(reaction, status);
			}

			if ((flags & DERIVED) !== 0) {
				var derived = /** @type {Derived} */ (reaction);

				batch_values?.delete(derived);

				if ((flags & WAS_MARKED) === 0) {
					// Only connected deriveds can be reliably unmarked right away
					if (flags & CONNECTED) {
						reaction.f |= WAS_MARKED;
					}

					mark_reactions(derived, MAYBE_DIRTY, updated_during_traversal);
				}
			} else if (not_dirty) {
				var effect = /** @type {Effect} */ (reaction);

				if ((flags & BLOCK_EFFECT) !== 0 && eager_block_effects !== null) {
					eager_block_effects.add(effect);
				}

				if (updated_during_traversal !== null) {
					updated_during_traversal.push(effect);
				} else {
					schedule_effect(effect);
				}
			}
		}
	}

	/** @import { Source } from '#client' */

	/**
	 * @template T
	 * @param {T} value
	 * @returns {T}
	 */
	function proxy(value) {
		// if non-proxyable, or is already a proxy, return `value`
		if (typeof value !== 'object' || value === null || STATE_SYMBOL in value) {
			return value;
		}

		const prototype = get_prototype_of(value);

		if (prototype !== object_prototype && prototype !== array_prototype) {
			return value;
		}

		/** @type {Map<any, Source<any>>} */
		var sources = new Map();
		var is_proxied_array = is_array(value);
		var version = state(0);
		var parent_version = update_version;

		/**
		 * Executes the proxy in the context of the reaction it was originally created in, if any
		 * @template T
		 * @param {() => T} fn
		 */
		var with_parent = (fn) => {
			if (update_version === parent_version) {
				return fn();
			}

			// child source is being created after the initial proxy —
			// prevent it from being associated with the current reaction
			var reaction = active_reaction;
			var version = update_version;

			set_active_reaction(null);
			set_update_version(parent_version);

			var result = fn();

			set_active_reaction(reaction);
			set_update_version(version);

			return result;
		};

		if (is_proxied_array) {
			// We need to create the length source eagerly to ensure that
			// mutations to the array are properly synced with our proxy
			sources.set('length', state(/** @type {any[]} */ (value).length));
		}

		return new Proxy(/** @type {any} */ (value), {
			defineProperty(_, prop, descriptor) {
				if (
					!('value' in descriptor) ||
					descriptor.configurable === false ||
					descriptor.enumerable === false ||
					descriptor.writable === false
				) {
					// we disallow non-basic descriptors, because unless they are applied to the
					// target object — which we avoid, so that state can be forked — we will run
					// afoul of the various invariants
					// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/getOwnPropertyDescriptor#invariants
					state_descriptors_fixed();
				}
				var s = sources.get(prop);
				if (s === undefined) {
					with_parent(() => {
						var s = state(descriptor.value);
						sources.set(prop, s);
						return s;
					});
				} else {
					set(s, descriptor.value, true);
				}

				return true;
			},

			deleteProperty(target, prop) {
				var s = sources.get(prop);

				if (s === undefined) {
					if (prop in target) {
						const s = with_parent(() => state(UNINITIALIZED));
						sources.set(prop, s);
						increment(version);
					}
				} else {
					set(s, UNINITIALIZED);
					increment(version);
				}

				return true;
			},

			get(target, prop, receiver) {
				if (prop === STATE_SYMBOL) {
					return value;
				}

				var s = sources.get(prop);
				var exists = prop in target;

				// create a source, but only if it's an own property and not a prototype property
				if (s === undefined && (!exists || get_descriptor(target, prop)?.writable)) {
					s = with_parent(() => {
						var p = proxy(exists ? target[prop] : UNINITIALIZED);
						var s = state(p);

						return s;
					});

					sources.set(prop, s);
				}

				if (s !== undefined) {
					var v = get(s);
					return v === UNINITIALIZED ? undefined : v;
				}

				return Reflect.get(target, prop, receiver);
			},

			getOwnPropertyDescriptor(target, prop) {
				var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);

				if (descriptor && 'value' in descriptor) {
					var s = sources.get(prop);
					if (s) descriptor.value = get(s);
				} else if (descriptor === undefined) {
					var source = sources.get(prop);
					var value = source?.v;

					if (source !== undefined && value !== UNINITIALIZED) {
						return {
							enumerable: true,
							configurable: true,
							value,
							writable: true
						};
					}
				}

				return descriptor;
			},

			has(target, prop) {
				if (prop === STATE_SYMBOL) {
					return true;
				}

				var s = sources.get(prop);
				var has = (s !== undefined && s.v !== UNINITIALIZED) || Reflect.has(target, prop);

				if (
					s !== undefined ||
					(active_effect !== null && (!has || get_descriptor(target, prop)?.writable))
				) {
					if (s === undefined) {
						s = with_parent(() => {
							var p = has ? proxy(target[prop]) : UNINITIALIZED;
							var s = state(p);

							return s;
						});

						sources.set(prop, s);
					}

					var value = get(s);
					if (value === UNINITIALIZED) {
						return false;
					}
				}

				return has;
			},

			set(target, prop, value, receiver) {
				var s = sources.get(prop);
				var has = prop in target;

				// variable.length = value -> clear all signals with index >= value
				if (is_proxied_array && prop === 'length') {
					for (var i = value; i < /** @type {Source<number>} */ (s).v; i += 1) {
						var other_s = sources.get(i + '');
						if (other_s !== undefined) {
							set(other_s, UNINITIALIZED);
						} else if (i in target) {
							// If the item exists in the original, we need to create an uninitialized source,
							// else a later read of the property would result in a source being created with
							// the value of the original item at that index.
							other_s = with_parent(() => state(UNINITIALIZED));
							sources.set(i + '', other_s);
						}
					}
				}

				// If we haven't yet created a source for this property, we need to ensure
				// we do so otherwise if we read it later, then the write won't be tracked and
				// the heuristics of effects will be different vs if we had read the proxied
				// object property before writing to that property.
				if (s === undefined) {
					if (!has || get_descriptor(target, prop)?.writable) {
						s = with_parent(() => state(undefined));
						set(s, proxy(value));

						sources.set(prop, s);
					}
				} else {
					has = s.v !== UNINITIALIZED;

					var p = with_parent(() => proxy(value));
					set(s, p);
				}

				var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);

				// Set the new value before updating any signals so that any listeners get the new value
				if (descriptor?.set) {
					descriptor.set.call(receiver, value);
				}

				if (!has) {
					// If we have mutated an array directly, we might need to
					// signal that length has also changed. Do it before updating metadata
					// to ensure that iterating over the array as a result of a metadata update
					// will not cause the length to be out of sync.
					if (is_proxied_array && typeof prop === 'string') {
						var ls = /** @type {Source<number>} */ (sources.get('length'));
						var n = Number(prop);

						if (Number.isInteger(n) && n >= ls.v) {
							set(ls, n + 1);
						}
					}

					increment(version);
				}

				return true;
			},

			ownKeys(target) {
				get(version);

				var own_keys = Reflect.ownKeys(target).filter((key) => {
					var source = sources.get(key);
					return source === undefined || source.v !== UNINITIALIZED;
				});

				for (var [key, source] of sources) {
					if (source.v !== UNINITIALIZED && !(key in target)) {
						own_keys.push(key);
					}
				}

				return own_keys;
			},

			setPrototypeOf() {
				state_prototype_fixed();
			}
		});
	}

	/**
	 * @param {any} value
	 */
	function get_proxied_value(value) {
		try {
			if (value !== null && typeof value === 'object' && STATE_SYMBOL in value) {
				return value[STATE_SYMBOL];
			}
		} catch {
			// the above if check can throw an error if the value in question
			// is the contentWindow of an iframe on another domain, in which
			// case we want to just return the value (because it's definitely
			// not a proxied value) so we don't break any JavaScript interacting
			// with that iframe (such as various payment companies client side
			// JavaScript libraries interacting with their iframes on the same
			// domain)
		}

		return value;
	}

	/**
	 * @param {any} a
	 * @param {any} b
	 */
	function is(a, b) {
		return Object.is(get_proxied_value(a), get_proxied_value(b));
	}

	/** @import { Effect, TemplateNode } from '#client' */

	// export these for reference in the compiled code, making global name deduplication unnecessary
	/** @type {Window} */
	var $window;

	/** @type {Document} */
	var $document;

	/** @type {boolean} */
	var is_firefox;

	/** @type {() => Node | null} */
	var first_child_getter;
	/** @type {() => Node | null} */
	var next_sibling_getter;

	/**
	 * Initialize these lazily to avoid issues when using the runtime in a server context
	 * where these globals are not available while avoiding a separate server entry point
	 */
	function init_operations() {
		if ($window !== undefined) {
			return;
		}

		$window = window;
		$document = document;
		is_firefox = /Firefox/.test(navigator.userAgent);

		var element_prototype = Element.prototype;
		var node_prototype = Node.prototype;
		var text_prototype = Text.prototype;

		// @ts-ignore
		first_child_getter = get_descriptor(node_prototype, 'firstChild').get;
		// @ts-ignore
		next_sibling_getter = get_descriptor(node_prototype, 'nextSibling').get;

		if (is_extensible(element_prototype)) {
			// the following assignments improve perf of lookups on DOM nodes
			// @ts-expect-error
			element_prototype.__click = undefined;
			// @ts-expect-error
			element_prototype.__className = undefined;
			// @ts-expect-error
			element_prototype.__attributes = null;
			// @ts-expect-error
			element_prototype.__style = undefined;
			// @ts-expect-error
			element_prototype.__e = undefined;
		}

		if (is_extensible(text_prototype)) {
			// @ts-expect-error
			text_prototype.__t = undefined;
		}
	}

	/**
	 * @param {string} value
	 * @returns {Text}
	 */
	function create_text(value = '') {
		return document.createTextNode(value);
	}

	/**
	 * @template {Node} N
	 * @param {N} node
	 */
	/*@__NO_SIDE_EFFECTS__*/
	function get_first_child(node) {
		return /** @type {TemplateNode | null} */ (first_child_getter.call(node));
	}

	/**
	 * @template {Node} N
	 * @param {N} node
	 */
	/*@__NO_SIDE_EFFECTS__*/
	function get_next_sibling(node) {
		return /** @type {TemplateNode | null} */ (next_sibling_getter.call(node));
	}

	/**
	 * Don't mark this as side-effect-free, hydration needs to walk all nodes
	 * @template {Node} N
	 * @param {N} node
	 * @param {boolean} is_text
	 * @returns {TemplateNode | null}
	 */
	function child(node, is_text) {
		{
			return get_first_child(node);
		}
	}

	/**
	 * Don't mark this as side-effect-free, hydration needs to walk all nodes
	 * @param {TemplateNode} node
	 * @param {boolean} [is_text]
	 * @returns {TemplateNode | null}
	 */
	function first_child(node, is_text = false) {
		{
			var first = get_first_child(node);

			// TODO prevent user comments with the empty string when preserveComments is true
			if (first instanceof Comment && first.data === '') return get_next_sibling(first);

			return first;
		}
	}

	/**
	 * Don't mark this as side-effect-free, hydration needs to walk all nodes
	 * @param {TemplateNode} node
	 * @param {number} count
	 * @param {boolean} is_text
	 * @returns {TemplateNode | null}
	 */
	function sibling(node, count = 1, is_text = false) {
		let next_sibling = node;

		while (count--) {
			next_sibling = /** @type {TemplateNode} */ (get_next_sibling(next_sibling));
		}

		{
			return next_sibling;
		}
	}

	/**
	 * @template {Node} N
	 * @param {N} node
	 * @returns {void}
	 */
	function clear_text_content(node) {
		node.textContent = '';
	}

	/**
	 * Returns `true` if we're updating the current block, for example `condition` in
	 * an `{#if condition}` block just changed. In this case, the branch should be
	 * appended (or removed) at the same time as other updates within the
	 * current `<svelte:boundary>`
	 */
	function should_defer_append() {
		return false;
	}

	/**
	 * @template {keyof HTMLElementTagNameMap | string} T
	 * @param {T} tag
	 * @param {string} [namespace]
	 * @param {string} [is]
	 * @returns {T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : Element}
	 */
	function create_element(tag, namespace, is) {
		let options = undefined;
		return /** @type {T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : Element} */ (
			document.createElementNS(namespace ?? NAMESPACE_HTML, tag, options)
		);
	}

	let listening_to_form_reset = false;

	function add_form_reset_listener() {
		if (!listening_to_form_reset) {
			listening_to_form_reset = true;
			document.addEventListener(
				'reset',
				(evt) => {
					// Needs to happen one tick later or else the dom properties of the form
					// elements have not updated to their reset values yet
					Promise.resolve().then(() => {
						if (!evt.defaultPrevented) {
							for (const e of /**@type {HTMLFormElement} */ (evt.target).elements) {
								// @ts-expect-error
								e.__on_r?.();
							}
						}
					});
				},
				// In the capture phase to guarantee we get noticed of it (no possibility of stopPropagation)
				{ capture: true }
			);
		}
	}

	/**
	 * @template T
	 * @param {() => T} fn
	 */
	function without_reactive_context(fn) {
		var previous_reaction = active_reaction;
		var previous_effect = active_effect;
		set_active_reaction(null);
		set_active_effect(null);
		try {
			return fn();
		} finally {
			set_active_reaction(previous_reaction);
			set_active_effect(previous_effect);
		}
	}

	/**
	 * Listen to the given event, and then instantiate a global form reset listener if not already done,
	 * to notify all bindings when the form is reset
	 * @param {HTMLElement} element
	 * @param {string} event
	 * @param {(is_reset?: true) => void} handler
	 * @param {(is_reset?: true) => void} [on_reset]
	 */
	function listen_to_event_and_reset_event(element, event, handler, on_reset = handler) {
		element.addEventListener(event, () => without_reactive_context(handler));
		// @ts-expect-error
		const prev = element.__on_r;
		if (prev) {
			// special case for checkbox that can have multiple binds (group & checked)
			// @ts-expect-error
			element.__on_r = () => {
				prev();
				on_reset(true);
			};
		} else {
			// @ts-expect-error
			element.__on_r = () => on_reset(true);
		}

		add_form_reset_listener();
	}

	/** @import { Blocker, ComponentContext, ComponentContextLegacy, Derived, Effect, TemplateNode, TransitionManager } from '#client' */

	/**
	 * @param {'$effect' | '$effect.pre' | '$inspect'} rune
	 */
	function validate_effect(rune) {
		if (active_effect === null) {
			if (active_reaction === null) {
				effect_orphan();
			}

			effect_in_unowned_derived();
		}

		if (is_destroying_effect) {
			effect_in_teardown();
		}
	}

	/**
	 * @param {Effect} effect
	 * @param {Effect} parent_effect
	 */
	function push_effect(effect, parent_effect) {
		var parent_last = parent_effect.last;
		if (parent_last === null) {
			parent_effect.last = parent_effect.first = effect;
		} else {
			parent_last.next = effect;
			effect.prev = parent_last;
			parent_effect.last = effect;
		}
	}

	/**
	 * @param {number} type
	 * @param {null | (() => void | (() => void))} fn
	 * @returns {Effect}
	 */
	function create_effect(type, fn) {
		var parent = active_effect;

		if (parent !== null && (parent.f & INERT) !== 0) {
			type |= INERT;
		}

		/** @type {Effect} */
		var effect = {
			ctx: component_context,
			deps: null,
			nodes: null,
			f: type | DIRTY | CONNECTED,
			first: null,
			fn,
			last: null,
			next: null,
			parent,
			b: parent && parent.b,
			prev: null,
			teardown: null,
			wv: 0,
			ac: null
		};

		/** @type {Effect | null} */
		var e = effect;

		if ((type & EFFECT) !== 0) {
			if (collected_effects !== null) {
				// created during traversal — collect and run afterwards
				collected_effects.push(effect);
			} else {
				// schedule for later
				Batch.ensure().schedule(effect);
			}
		} else if (fn !== null) {
			try {
				update_effect(effect);
			} catch (e) {
				destroy_effect(effect);
				throw e;
			}

			// if an effect doesn't need to be kept in the tree (because it
			// won't re-run, has no DOM, and has no teardown etc)
			// then we skip it and go to its child (if any)
			if (
				e.deps === null &&
				e.teardown === null &&
				e.nodes === null &&
				e.first === e.last && // either `null`, or a singular child
				(e.f & EFFECT_PRESERVED) === 0
			) {
				e = e.first;
				if ((type & BLOCK_EFFECT) !== 0 && (type & EFFECT_TRANSPARENT) !== 0 && e !== null) {
					e.f |= EFFECT_TRANSPARENT;
				}
			}
		}

		if (e !== null) {
			e.parent = parent;

			if (parent !== null) {
				push_effect(e, parent);
			}

			// if we're in a derived, add the effect there too
			if (
				active_reaction !== null &&
				(active_reaction.f & DERIVED) !== 0 &&
				(type & ROOT_EFFECT) === 0
			) {
				var derived = /** @type {Derived} */ (active_reaction);
				(derived.effects ??= []).push(e);
			}
		}

		return effect;
	}

	/**
	 * Internal representation of `$effect.tracking()`
	 * @returns {boolean}
	 */
	function effect_tracking() {
		return active_reaction !== null && !untracking;
	}

	/**
	 * @param {() => void} fn
	 */
	function teardown(fn) {
		const effect = create_effect(RENDER_EFFECT, null);
		set_signal_status(effect, CLEAN);
		effect.teardown = fn;
		return effect;
	}

	/**
	 * Internal representation of `$effect(...)`
	 * @param {() => void | (() => void)} fn
	 */
	function user_effect(fn) {
		validate_effect();

		// Non-nested `$effect(...)` in a component should be deferred
		// until the component is mounted
		var flags = /** @type {Effect} */ (active_effect).f;
		var defer = !active_reaction && (flags & BRANCH_EFFECT) !== 0 && (flags & REACTION_RAN) === 0;

		if (defer) {
			// Top-level `$effect(...)` in an unmounted component — defer until mount
			var context = /** @type {ComponentContext} */ (component_context);
			(context.e ??= []).push(fn);
		} else {
			// Everything else — create immediately
			return create_user_effect(fn);
		}
	}

	/**
	 * @param {() => void | (() => void)} fn
	 */
	function create_user_effect(fn) {
		return create_effect(EFFECT | USER_EFFECT, fn);
	}

	/**
	 * Internal representation of `$effect.pre(...)`
	 * @param {() => void | (() => void)} fn
	 * @returns {Effect}
	 */
	function user_pre_effect(fn) {
		validate_effect();
		return create_effect(RENDER_EFFECT | USER_EFFECT, fn);
	}

	/**
	 * An effect root whose children can transition out
	 * @param {() => void} fn
	 * @returns {(options?: { outro?: boolean }) => Promise<void>}
	 */
	function component_root(fn) {
		Batch.ensure();
		const effect = create_effect(ROOT_EFFECT | EFFECT_PRESERVED, fn);

		return (options = {}) => {
			return new Promise((fulfil) => {
				if (options.outro) {
					pause_effect(effect, () => {
						destroy_effect(effect);
						fulfil(undefined);
					});
				} else {
					destroy_effect(effect);
					fulfil(undefined);
				}
			});
		};
	}

	/**
	 * @param {() => void | (() => void)} fn
	 * @returns {Effect}
	 */
	function effect(fn) {
		return create_effect(EFFECT, fn);
	}

	/**
	 * Internal representation of `$: ..`
	 * @param {() => any} deps
	 * @param {() => void | (() => void)} fn
	 */
	function legacy_pre_effect(deps, fn) {
		var context = /** @type {ComponentContextLegacy} */ (component_context);

		/** @type {{ effect: null | Effect, ran: boolean, deps: () => any }} */
		var token = { effect: null, ran: false, deps };

		context.l.$.push(token);

		token.effect = render_effect(() => {
			deps();

			// If this legacy pre effect has already run before the end of the reset, then
			// bail out to emulate the same behavior.
			if (token.ran) return;

			token.ran = true;

			var effect = /** @type {Effect} */ (active_effect);

			// here, we lie: by setting `active_effect` to be the parent branch, any writes
			// that happen inside `fn` will _not_ cause an unnecessary reschedule, because
			// the affected effects will be children of `active_effect`. this is safe
			// because these effects are known to run in the correct order
			try {
				set_active_effect(effect.parent);
				untrack(fn);
			} finally {
				set_active_effect(effect);
			}
		});
	}

	function legacy_pre_effect_reset() {
		var context = /** @type {ComponentContextLegacy} */ (component_context);

		render_effect(() => {
			// Run dirty `$:` statements
			for (var token of context.l.$) {
				token.deps();

				var effect = token.effect;

				// If the effect is CLEAN, then make it MAYBE_DIRTY. This ensures we traverse through
				// the effects dependencies and correctly ensure each dependency is up-to-date.
				if ((effect.f & CLEAN) !== 0 && effect.deps !== null) {
					set_signal_status(effect, MAYBE_DIRTY);
				}

				if (is_dirty(effect)) {
					update_effect(effect);
				}

				token.ran = false;
			}
		});
	}

	/**
	 * @param {() => void | (() => void)} fn
	 * @returns {Effect}
	 */
	function async_effect(fn) {
		return create_effect(ASYNC | EFFECT_PRESERVED, fn);
	}

	/**
	 * @param {() => void | (() => void)} fn
	 * @returns {Effect}
	 */
	function render_effect(fn, flags = 0) {
		return create_effect(RENDER_EFFECT | flags, fn);
	}

	/**
	 * @param {(...expressions: any) => void | (() => void)} fn
	 * @param {Array<() => any>} sync
	 * @param {Array<() => Promise<any>>} async
	 * @param {Blocker[]} blockers
	 */
	function template_effect(fn, sync = [], async = [], blockers = []) {
		flatten(blockers, sync, async, (values) => {
			create_effect(RENDER_EFFECT, () => fn(...values.map(get)));
		});
	}

	/**
	 * Like `template_effect`, but with an effect which is deferred until the batch commits
	 * @param {(...expressions: any) => void | (() => void)} fn
	 * @param {Array<() => any>} sync
	 * @param {Array<() => Promise<any>>} async
	 * @param {Blocker[]} blockers
	 */
	function deferred_template_effect(fn, sync = [], async = [], blockers = []) {
		if (async.length > 0 || blockers.length > 0) {
			var decrement_pending = increment_pending();
		}

		flatten(blockers, sync, async, (values) => {
			create_effect(EFFECT, () => fn(...values.map(get)));

			if (decrement_pending) {
				decrement_pending();
			}
		});
	}

	/**
	 * @param {(() => void)} fn
	 * @param {number} flags
	 */
	function block(fn, flags = 0) {
		var effect = create_effect(BLOCK_EFFECT | flags, fn);
		return effect;
	}

	/**
	 * @param {(() => void)} fn
	 */
	function branch(fn) {
		return create_effect(BRANCH_EFFECT | EFFECT_PRESERVED, fn);
	}

	/**
	 * @param {Effect} effect
	 */
	function execute_effect_teardown(effect) {
		var teardown = effect.teardown;
		if (teardown !== null) {
			const previously_destroying_effect = is_destroying_effect;
			const previous_reaction = active_reaction;
			set_is_destroying_effect(true);
			set_active_reaction(null);
			try {
				teardown.call(null);
			} finally {
				set_is_destroying_effect(previously_destroying_effect);
				set_active_reaction(previous_reaction);
			}
		}
	}

	/**
	 * @param {Effect} signal
	 * @param {boolean} remove_dom
	 * @returns {void}
	 */
	function destroy_effect_children(signal, remove_dom = false) {
		var effect = signal.first;
		signal.first = signal.last = null;

		while (effect !== null) {
			const controller = effect.ac;

			if (controller !== null) {
				without_reactive_context(() => {
					controller.abort(STALE_REACTION);
				});
			}

			var next = effect.next;

			if ((effect.f & ROOT_EFFECT) !== 0) {
				// this is now an independent root
				effect.parent = null;
			} else {
				destroy_effect(effect, remove_dom);
			}

			effect = next;
		}
	}

	/**
	 * @param {Effect} signal
	 * @returns {void}
	 */
	function destroy_block_effect_children(signal) {
		var effect = signal.first;

		while (effect !== null) {
			var next = effect.next;
			if ((effect.f & BRANCH_EFFECT) === 0) {
				destroy_effect(effect);
			}
			effect = next;
		}
	}

	/**
	 * @param {Effect} effect
	 * @param {boolean} [remove_dom]
	 * @returns {void}
	 */
	function destroy_effect(effect, remove_dom = true) {
		var removed = false;

		if (
			(remove_dom || (effect.f & HEAD_EFFECT) !== 0) &&
			effect.nodes !== null &&
			effect.nodes.end !== null
		) {
			remove_effect_dom(effect.nodes.start, /** @type {TemplateNode} */ (effect.nodes.end));
			removed = true;
		}

		set_signal_status(effect, DESTROYING);
		destroy_effect_children(effect, remove_dom && !removed);
		remove_reactions(effect, 0);

		var transitions = effect.nodes && effect.nodes.t;

		if (transitions !== null) {
			for (const transition of transitions) {
				transition.stop();
			}
		}

		execute_effect_teardown(effect);

		effect.f ^= DESTROYING;
		effect.f |= DESTROYED;

		var parent = effect.parent;

		// If the parent doesn't have any children, then skip this work altogether
		if (parent !== null && parent.first !== null) {
			unlink_effect(effect);
		}

		// `first` and `child` are nulled out in destroy_effect_children
		// we don't null out `parent` so that error propagation can work correctly
		effect.next =
			effect.prev =
			effect.teardown =
			effect.ctx =
			effect.deps =
			effect.fn =
			effect.nodes =
			effect.ac =
			effect.b =
				null;
	}

	/**
	 *
	 * @param {TemplateNode | null} node
	 * @param {TemplateNode} end
	 */
	function remove_effect_dom(node, end) {
		while (node !== null) {
			/** @type {TemplateNode | null} */
			var next = node === end ? null : get_next_sibling(node);

			node.remove();
			node = next;
		}
	}

	/**
	 * Detach an effect from the effect tree, freeing up memory and
	 * reducing the amount of work that happens on subsequent traversals
	 * @param {Effect} effect
	 */
	function unlink_effect(effect) {
		var parent = effect.parent;
		var prev = effect.prev;
		var next = effect.next;

		if (prev !== null) prev.next = next;
		if (next !== null) next.prev = prev;

		if (parent !== null) {
			if (parent.first === effect) parent.first = next;
			if (parent.last === effect) parent.last = prev;
		}
	}

	/**
	 * When a block effect is removed, we don't immediately destroy it or yank it
	 * out of the DOM, because it might have transitions. Instead, we 'pause' it.
	 * It stays around (in memory, and in the DOM) until outro transitions have
	 * completed, and if the state change is reversed then we _resume_ it.
	 * A paused effect does not update, and the DOM subtree becomes inert.
	 * @param {Effect} effect
	 * @param {() => void} [callback]
	 * @param {boolean} [destroy]
	 */
	function pause_effect(effect, callback, destroy = true) {
		/** @type {TransitionManager[]} */
		var transitions = [];

		pause_children(effect, transitions, true);

		var fn = () => {
			if (destroy) destroy_effect(effect);
			if (callback) callback();
		};

		var remaining = transitions.length;
		if (remaining > 0) {
			var check = () => --remaining || fn();
			for (var transition of transitions) {
				transition.out(check);
			}
		} else {
			fn();
		}
	}

	/**
	 * @param {Effect} effect
	 * @param {TransitionManager[]} transitions
	 * @param {boolean} local
	 */
	function pause_children(effect, transitions, local) {
		if ((effect.f & INERT) !== 0) return;
		effect.f ^= INERT;

		var t = effect.nodes && effect.nodes.t;

		if (t !== null) {
			for (const transition of t) {
				if (transition.is_global || local) {
					transitions.push(transition);
				}
			}
		}

		var child = effect.first;

		while (child !== null) {
			var sibling = child.next;
			var transparent =
				(child.f & EFFECT_TRANSPARENT) !== 0 ||
				// If this is a branch effect without a block effect parent,
				// it means the parent block effect was pruned. In that case,
				// transparency information was transferred to the branch effect.
				((child.f & BRANCH_EFFECT) !== 0 && (effect.f & BLOCK_EFFECT) !== 0);
			// TODO we don't need to call pause_children recursively with a linked list in place
			// it's slightly more involved though as we have to account for `transparent` changing
			// through the tree.
			pause_children(child, transitions, transparent ? local : false);
			child = sibling;
		}
	}

	/**
	 * The opposite of `pause_effect`. We call this if (for example)
	 * `x` becomes falsy then truthy: `{#if x}...{/if}`
	 * @param {Effect} effect
	 */
	function resume_effect(effect) {
		resume_children(effect, true);
	}

	/**
	 * @param {Effect} effect
	 * @param {boolean} local
	 */
	function resume_children(effect, local) {
		if ((effect.f & INERT) === 0) return;
		effect.f ^= INERT;

		// If a dependency of this effect changed while it was paused,
		// schedule the effect to update. we don't use `is_dirty`
		// here because we don't want to eagerly recompute a derived like
		// `{#if foo}{foo.bar()}{/if}` if `foo` is now `undefined
		if ((effect.f & CLEAN) === 0) {
			set_signal_status(effect, DIRTY);
			Batch.ensure().schedule(effect); // Assumption: This happens during the commit phase of the batch, causing another flush, but it's safe
		}

		var child = effect.first;

		while (child !== null) {
			var sibling = child.next;
			var transparent = (child.f & EFFECT_TRANSPARENT) !== 0 || (child.f & BRANCH_EFFECT) !== 0;
			// TODO we don't need to call resume_children recursively with a linked list in place
			// it's slightly more involved though as we have to account for `transparent` changing
			// through the tree.
			resume_children(child, transparent ? local : false);
			child = sibling;
		}

		var t = effect.nodes && effect.nodes.t;

		if (t !== null) {
			for (const transition of t) {
				if (transition.is_global || local) {
					transition.in();
				}
			}
		}
	}

	/**
	 * @param {Effect} effect
	 * @param {DocumentFragment} fragment
	 */
	function move_effect(effect, fragment) {
		if (!effect.nodes) return;

		/** @type {TemplateNode | null} */
		var node = effect.nodes.start;
		var end = effect.nodes.end;

		while (node !== null) {
			/** @type {TemplateNode | null} */
			var next = node === end ? null : get_next_sibling(node);

			fragment.append(node);
			node = next;
		}
	}

	/** @import { Value } from '#client' */

	/**
	 * @type {Set<Value> | null}
	 * @deprecated
	 */
	let captured_signals = null;

	/**
	 * Capture an array of all the signals that are read when `fn` is called
	 * @template T
	 * @param {() => T} fn
	 */
	function capture_signals(fn) {
		var previous_captured_signals = captured_signals;

		try {
			captured_signals = new Set();

			untrack(fn);

			if (previous_captured_signals !== null) {
				for (var signal of captured_signals) {
					previous_captured_signals.add(signal);
				}
			}

			return captured_signals;
		} finally {
			captured_signals = previous_captured_signals;
		}
	}

	/**
	 * Invokes a function and captures all signals that are read during the invocation,
	 * then invalidates them.
	 * @param {() => any} fn
	 * @deprecated
	 */
	function invalidate_inner_signals(fn) {
		for (var signal of capture_signals(fn)) {
			internal_set(signal, signal.v);
		}
	}

	/** @import { Derived, Effect, Reaction, Source, Value } from '#client' */

	let is_updating_effect = false;

	let is_destroying_effect = false;

	/** @param {boolean} value */
	function set_is_destroying_effect(value) {
		is_destroying_effect = value;
	}

	/** @type {null | Reaction} */
	let active_reaction = null;

	let untracking = false;

	/** @param {null | Reaction} reaction */
	function set_active_reaction(reaction) {
		active_reaction = reaction;
	}

	/** @type {null | Effect} */
	let active_effect = null;

	/** @param {null | Effect} effect */
	function set_active_effect(effect) {
		active_effect = effect;
	}

	/**
	 * When sources are created within a reaction, reading and writing
	 * them within that reaction should not cause a re-run
	 * @type {null | Source[]}
	 */
	let current_sources = null;

	/** @param {Value} value */
	function push_reaction_value(value) {
		if (active_reaction !== null && (true)) {
			if (current_sources === null) {
				current_sources = [value];
			} else {
				current_sources.push(value);
			}
		}
	}

	/**
	 * The dependencies of the reaction that is currently being executed. In many cases,
	 * the dependencies are unchanged between runs, and so this will be `null` unless
	 * and until a new dependency is accessed — we track this via `skipped_deps`
	 * @type {null | Value[]}
	 */
	let new_deps = null;

	let skipped_deps = 0;

	/**
	 * Tracks writes that the effect it's executed in doesn't listen to yet,
	 * so that the dependency can be added to the effect later on if it then reads it
	 * @type {null | Source[]}
	 */
	let untracked_writes = null;

	/** @param {null | Source[]} value */
	function set_untracked_writes(value) {
		untracked_writes = value;
	}

	/**
	 * @type {number} Used by sources and deriveds for handling updates.
	 * Version starts from 1 so that unowned deriveds differentiate between a created effect and a run one for tracing
	 **/
	let write_version = 1;

	/** @type {number} Used to version each read of a source of derived to avoid duplicating depedencies inside a reaction */
	let read_version = 0;

	let update_version = read_version;

	/** @param {number} value */
	function set_update_version(value) {
		update_version = value;
	}

	function increment_write_version() {
		return ++write_version;
	}

	/**
	 * Determines whether a derived or effect is dirty.
	 * If it is MAYBE_DIRTY, will set the status to CLEAN
	 * @param {Reaction} reaction
	 * @returns {boolean}
	 */
	function is_dirty(reaction) {
		var flags = reaction.f;

		if ((flags & DIRTY) !== 0) {
			return true;
		}

		if (flags & DERIVED) {
			reaction.f &= ~WAS_MARKED;
		}

		if ((flags & MAYBE_DIRTY) !== 0) {
			var dependencies = /** @type {Value[]} */ (reaction.deps);
			var length = dependencies.length;

			for (var i = 0; i < length; i++) {
				var dependency = dependencies[i];

				if (is_dirty(/** @type {Derived} */ (dependency))) {
					update_derived(/** @type {Derived} */ (dependency));
				}

				if (dependency.wv > reaction.wv) {
					return true;
				}
			}

			if (
				(flags & CONNECTED) !== 0 &&
				// During time traveling we don't want to reset the status so that
				// traversal of the graph in the other batches still happens
				batch_values === null
			) {
				set_signal_status(reaction, CLEAN);
			}
		}

		return false;
	}

	/**
	 * @param {Value} signal
	 * @param {Effect} effect
	 * @param {boolean} [root]
	 */
	function schedule_possible_effect_self_invalidation(signal, effect, root = true) {
		var reactions = signal.reactions;
		if (reactions === null) return;

		if (current_sources !== null && includes.call(current_sources, signal)) {
			return;
		}

		for (var i = 0; i < reactions.length; i++) {
			var reaction = reactions[i];

			if ((reaction.f & DERIVED) !== 0) {
				schedule_possible_effect_self_invalidation(/** @type {Derived} */ (reaction), effect, false);
			} else if (effect === reaction) {
				if (root) {
					set_signal_status(reaction, DIRTY);
				} else if ((reaction.f & CLEAN) !== 0) {
					set_signal_status(reaction, MAYBE_DIRTY);
				}
				schedule_effect(/** @type {Effect} */ (reaction));
			}
		}
	}

	/** @param {Reaction} reaction */
	function update_reaction(reaction) {
		var previous_deps = new_deps;
		var previous_skipped_deps = skipped_deps;
		var previous_untracked_writes = untracked_writes;
		var previous_reaction = active_reaction;
		var previous_sources = current_sources;
		var previous_component_context = component_context;
		var previous_untracking = untracking;
		var previous_update_version = update_version;

		var flags = reaction.f;

		new_deps = /** @type {null | Value[]} */ (null);
		skipped_deps = 0;
		untracked_writes = null;
		active_reaction = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) === 0 ? reaction : null;

		current_sources = null;
		set_component_context(reaction.ctx);
		untracking = false;
		update_version = ++read_version;

		if (reaction.ac !== null) {
			without_reactive_context(() => {
				/** @type {AbortController} */ (reaction.ac).abort(STALE_REACTION);
			});

			reaction.ac = null;
		}

		try {
			reaction.f |= REACTION_IS_UPDATING;
			var fn = /** @type {Function} */ (reaction.fn);
			var result = fn();
			reaction.f |= REACTION_RAN;
			var deps = reaction.deps;

			// Don't remove reactions during fork;
			// they must remain for when fork is discarded
			var is_fork = current_batch?.is_fork;

			if (new_deps !== null) {
				var i;

				if (!is_fork) {
					remove_reactions(reaction, skipped_deps);
				}

				if (deps !== null && skipped_deps > 0) {
					deps.length = skipped_deps + new_deps.length;
					for (i = 0; i < new_deps.length; i++) {
						deps[skipped_deps + i] = new_deps[i];
					}
				} else {
					reaction.deps = deps = new_deps;
				}

				if (effect_tracking() && (reaction.f & CONNECTED) !== 0) {
					for (i = skipped_deps; i < deps.length; i++) {
						(deps[i].reactions ??= []).push(reaction);
					}
				}
			} else if (!is_fork && deps !== null && skipped_deps < deps.length) {
				remove_reactions(reaction, skipped_deps);
				deps.length = skipped_deps;
			}

			// If we're inside an effect and we have untracked writes, then we need to
			// ensure that if any of those untracked writes result in re-invalidation
			// of the current effect, then that happens accordingly
			if (
				is_runes() &&
				untracked_writes !== null &&
				!untracking &&
				deps !== null &&
				(reaction.f & (DERIVED | MAYBE_DIRTY | DIRTY)) === 0
			) {
				for (i = 0; i < /** @type {Source[]} */ (untracked_writes).length; i++) {
					schedule_possible_effect_self_invalidation(
						untracked_writes[i],
						/** @type {Effect} */ (reaction)
					);
				}
			}

			// If we are returning to an previous reaction then
			// we need to increment the read version to ensure that
			// any dependencies in this reaction aren't marked with
			// the same version
			if (previous_reaction !== null && previous_reaction !== reaction) {
				read_version++;

				// update the `rv` of the previous reaction's deps — both existing and new —
				// so that they are not added again
				if (previous_reaction.deps !== null) {
					for (let i = 0; i < previous_skipped_deps; i += 1) {
						previous_reaction.deps[i].rv = read_version;
					}
				}

				if (previous_deps !== null) {
					for (const dep of previous_deps) {
						dep.rv = read_version;
					}
				}

				if (untracked_writes !== null) {
					if (previous_untracked_writes === null) {
						previous_untracked_writes = untracked_writes;
					} else {
						previous_untracked_writes.push(.../** @type {Source[]} */ (untracked_writes));
					}
				}
			}

			if ((reaction.f & ERROR_VALUE) !== 0) {
				reaction.f ^= ERROR_VALUE;
			}

			return result;
		} catch (error) {
			return handle_error(error);
		} finally {
			reaction.f ^= REACTION_IS_UPDATING;
			new_deps = previous_deps;
			skipped_deps = previous_skipped_deps;
			untracked_writes = previous_untracked_writes;
			active_reaction = previous_reaction;
			current_sources = previous_sources;
			set_component_context(previous_component_context);
			untracking = previous_untracking;
			update_version = previous_update_version;
		}
	}

	/**
	 * @template V
	 * @param {Reaction} signal
	 * @param {Value<V>} dependency
	 * @returns {void}
	 */
	function remove_reaction(signal, dependency) {
		let reactions = dependency.reactions;
		if (reactions !== null) {
			var index = index_of.call(reactions, signal);
			if (index !== -1) {
				var new_length = reactions.length - 1;
				if (new_length === 0) {
					reactions = dependency.reactions = null;
				} else {
					// Swap with last element and then remove.
					reactions[index] = reactions[new_length];
					reactions.pop();
				}
			}
		}

		// If the derived has no reactions, then we can disconnect it from the graph,
		// allowing it to either reconnect in the future, or be GC'd by the VM.
		if (
			reactions === null &&
			(dependency.f & DERIVED) !== 0 &&
			// Destroying a child effect while updating a parent effect can cause a dependency to appear
			// to be unused, when in fact it is used by the currently-updating parent. Checking `new_deps`
			// allows us to skip the expensive work of disconnecting and immediately reconnecting it
			(new_deps === null || !includes.call(new_deps, dependency))
		) {
			var derived = /** @type {Derived} */ (dependency);

			// If we are working with a derived that is owned by an effect, then mark it as being
			// disconnected and remove the mark flag, as it cannot be reliably removed otherwise
			if ((derived.f & CONNECTED) !== 0) {
				derived.f ^= CONNECTED;
				derived.f &= ~WAS_MARKED;
			}

			update_derived_status(derived);

			// freeze any effects inside this derived
			freeze_derived_effects(derived);

			// Disconnect any reactions owned by this reaction
			remove_reactions(derived, 0);
		}
	}

	/**
	 * @param {Reaction} signal
	 * @param {number} start_index
	 * @returns {void}
	 */
	function remove_reactions(signal, start_index) {
		var dependencies = signal.deps;
		if (dependencies === null) return;

		for (var i = start_index; i < dependencies.length; i++) {
			remove_reaction(signal, dependencies[i]);
		}
	}

	/**
	 * @param {Effect} effect
	 * @returns {void}
	 */
	function update_effect(effect) {
		var flags = effect.f;

		if ((flags & DESTROYED) !== 0) {
			return;
		}

		set_signal_status(effect, CLEAN);

		var previous_effect = active_effect;
		var was_updating_effect = is_updating_effect;

		active_effect = effect;
		is_updating_effect = true;

		try {
			if ((flags & (BLOCK_EFFECT | MANAGED_EFFECT)) !== 0) {
				destroy_block_effect_children(effect);
			} else {
				destroy_effect_children(effect);
			}

			execute_effect_teardown(effect);
			var teardown = update_reaction(effect);
			effect.teardown = typeof teardown === 'function' ? teardown : null;
			effect.wv = write_version;

			// In DEV, increment versions of any sources that were written to during the effect,
			// so that they are correctly marked as dirty when the effect re-runs
			var dep; if (DEV && tracing_mode_flag && (effect.f & DIRTY) !== 0 && effect.deps !== null) ;
		} finally {
			is_updating_effect = was_updating_effect;
			active_effect = previous_effect;
		}
	}

	/**
	 * Returns a promise that resolves once any pending state changes have been applied.
	 * @returns {Promise<void>}
	 */
	async function tick() {

		await Promise.resolve();

		// By calling flushSync we guarantee that any pending state changes are applied after one tick.
		// TODO look into whether we can make flushing subsequent updates synchronously in the future.
		flushSync();
	}

	/**
	 * @template V
	 * @param {Value<V>} signal
	 * @returns {V}
	 */
	function get(signal) {
		var flags = signal.f;
		var is_derived = (flags & DERIVED) !== 0;

		captured_signals?.add(signal);

		// Register the dependency on the current reaction signal.
		if (active_reaction !== null && !untracking) {
			// if we're in a derived that is being read inside an _async_ derived,
			// it's possible that the effect was already destroyed. In this case,
			// we don't add the dependency, because that would create a memory leak
			var destroyed = active_effect !== null && (active_effect.f & DESTROYED) !== 0;

			if (!destroyed && (current_sources === null || !includes.call(current_sources, signal))) {
				var deps = active_reaction.deps;

				if ((active_reaction.f & REACTION_IS_UPDATING) !== 0) {
					// we're in the effect init/update cycle
					if (signal.rv < read_version) {
						signal.rv = read_version;

						// If the signal is accessing the same dependencies in the same
						// order as it did last time, increment `skipped_deps`
						// rather than updating `new_deps`, which creates GC cost
						if (new_deps === null && deps !== null && deps[skipped_deps] === signal) {
							skipped_deps++;
						} else if (new_deps === null) {
							new_deps = [signal];
						} else {
							new_deps.push(signal);
						}
					}
				} else {
					// we're adding a dependency outside the init/update cycle
					// (i.e. after an `await`)
					(active_reaction.deps ??= []).push(signal);

					var reactions = signal.reactions;

					if (reactions === null) {
						signal.reactions = [active_reaction];
					} else if (!includes.call(reactions, active_reaction)) {
						reactions.push(active_reaction);
					}
				}
			}
		}

		if (is_destroying_effect && old_values.has(signal)) {
			return old_values.get(signal);
		}

		if (is_derived) {
			var derived = /** @type {Derived} */ (signal);

			if (is_destroying_effect) {
				var value = derived.v;

				// if the derived is dirty and has reactions, or depends on the values that just changed, re-execute
				// (a derived can be maybe_dirty due to the effect destroy removing its last reaction)
				if (
					((derived.f & CLEAN) === 0 && derived.reactions !== null) ||
					depends_on_old_values(derived)
				) {
					value = execute_derived(derived);
				}

				old_values.set(derived, value);

				return value;
			}

			// connect disconnected deriveds if we are reading them inside an effect,
			// or inside another derived that is already connected
			var should_connect =
				(derived.f & CONNECTED) === 0 &&
				!untracking &&
				active_reaction !== null &&
				(is_updating_effect || (active_reaction.f & CONNECTED) !== 0);

			var is_new = (derived.f & REACTION_RAN) === 0;

			if (is_dirty(derived)) {
				if (should_connect) {
					// set the flag before `update_derived`, so that the derived
					// is added as a reaction to its dependencies
					derived.f |= CONNECTED;
				}

				update_derived(derived);
			}

			if (should_connect && !is_new) {
				unfreeze_derived_effects(derived);
				reconnect(derived);
			}
		}

		if (batch_values?.has(signal)) {
			return batch_values.get(signal);
		}

		if ((signal.f & ERROR_VALUE) !== 0) {
			throw signal.v;
		}

		return signal.v;
	}

	/**
	 * (Re)connect a disconnected derived, so that it is notified
	 * of changes in `mark_reactions`
	 * @param {Derived} derived
	 */
	function reconnect(derived) {
		derived.f |= CONNECTED;

		if (derived.deps === null) return;

		for (const dep of derived.deps) {
			(dep.reactions ??= []).push(derived);

			if ((dep.f & DERIVED) !== 0 && (dep.f & CONNECTED) === 0) {
				unfreeze_derived_effects(/** @type {Derived} */ (dep));
				reconnect(/** @type {Derived} */ (dep));
			}
		}
	}

	/** @param {Derived} derived */
	function depends_on_old_values(derived) {
		if (derived.v === UNINITIALIZED) return true; // we don't know, so assume the worst
		if (derived.deps === null) return false;

		for (const dep of derived.deps) {
			if (old_values.has(dep)) {
				return true;
			}

			if ((dep.f & DERIVED) !== 0 && depends_on_old_values(/** @type {Derived} */ (dep))) {
				return true;
			}
		}

		return false;
	}

	/**
	 * When used inside a [`$derived`](https://svelte.dev/docs/svelte/$derived) or [`$effect`](https://svelte.dev/docs/svelte/$effect),
	 * any state read inside `fn` will not be treated as a dependency.
	 *
	 * ```ts
	 * $effect(() => {
	 *   // this will run when `data` changes, but not when `time` changes
	 *   save(data, {
	 *     timestamp: untrack(() => time)
	 *   });
	 * });
	 * ```
	 * @template T
	 * @param {() => T} fn
	 * @returns {T}
	 */
	function untrack(fn) {
		var previous_untracking = untracking;
		try {
			untracking = true;
			return fn();
		} finally {
			untracking = previous_untracking;
		}
	}

	/**
	 * Possibly traverse an object and read all its properties so that they're all reactive in case this is `$state`.
	 * Does only check first level of an object for performance reasons (heuristic should be good for 99% of all cases).
	 * @param {any} value
	 * @returns {void}
	 */
	function deep_read_state(value) {
		if (typeof value !== 'object' || !value || value instanceof EventTarget) {
			return;
		}

		if (STATE_SYMBOL in value) {
			deep_read(value);
		} else if (!Array.isArray(value)) {
			for (let key in value) {
				const prop = value[key];
				if (typeof prop === 'object' && prop && STATE_SYMBOL in prop) {
					deep_read(prop);
				}
			}
		}
	}

	/**
	 * Deeply traverse an object and read all its properties
	 * so that they're all reactive in case this is `$state`
	 * @param {any} value
	 * @param {Set<any>} visited
	 * @returns {void}
	 */
	function deep_read(value, visited = new Set()) {
		if (
			typeof value === 'object' &&
			value !== null &&
			// We don't want to traverse DOM elements
			!(value instanceof EventTarget) &&
			!visited.has(value)
		) {
			visited.add(value);
			// When working with a possible SvelteDate, this
			// will ensure we capture changes to it.
			if (value instanceof Date) {
				value.getTime();
			}
			for (let key in value) {
				try {
					deep_read(value[key], visited);
				} catch (e) {
					// continue
				}
			}
			const proto = get_prototype_of(value);
			if (
				proto !== Object.prototype &&
				proto !== Array.prototype &&
				proto !== Map.prototype &&
				proto !== Set.prototype &&
				proto !== Date.prototype
			) {
				const descriptors = get_descriptors(proto);
				for (let key in descriptors) {
					const get = descriptors[key].get;
					if (get) {
						try {
							get.call(value);
						} catch (e) {
							// continue
						}
					}
				}
			}
		}
	}

	/**
	 * Subset of delegated events which should be passive by default.
	 * These two are already passive via browser defaults on window, document and body.
	 * But since
	 * - we're delegating them
	 * - they happen often
	 * - they apply to mobile which is generally less performant
	 * we're marking them as passive by default for other elements, too.
	 */
	const PASSIVE_EVENTS = ['touchstart', 'touchmove'];

	/**
	 * Returns `true` if `name` is a passive event
	 * @param {string} name
	 */
	function is_passive_event(name) {
		return PASSIVE_EVENTS.includes(name);
	}

	/**
	 * Used on elements, as a map of event type -> event handler,
	 * and on events themselves to track which element handled an event
	 */
	const event_symbol = Symbol('events');

	/** @type {Set<string>} */
	const all_registered_events = new Set();

	/** @type {Set<(events: Array<string>) => void>} */
	const root_event_handles = new Set();

	/**
	 * @param {string} event_name
	 * @param {EventTarget} dom
	 * @param {EventListener} [handler]
	 * @param {AddEventListenerOptions} [options]
	 */
	function create_event(event_name, dom, handler, options = {}) {
		/**
		 * @this {EventTarget}
		 */
		function target_handler(/** @type {Event} */ event) {
			if (!options.capture) {
				// Only call in the bubble phase, else delegated events would be called before the capturing events
				handle_event_propagation.call(dom, event);
			}
			if (!event.cancelBubble) {
				return without_reactive_context(() => {
					return handler?.call(this, event);
				});
			}
		}

		// Chrome has a bug where pointer events don't work when attached to a DOM element that has been cloned
		// with cloneNode() and the DOM element is disconnected from the document. To ensure the event works, we
		// defer the attachment till after it's been appended to the document. TODO: remove this once Chrome fixes
		// this bug. The same applies to wheel events and touch events.
		if (
			event_name.startsWith('pointer') ||
			event_name.startsWith('touch') ||
			event_name === 'wheel'
		) {
			queue_micro_task(() => {
				dom.addEventListener(event_name, target_handler, options);
			});
		} else {
			dom.addEventListener(event_name, target_handler, options);
		}

		return target_handler;
	}

	/**
	 * @param {string} event_name
	 * @param {Element} dom
	 * @param {EventListener} [handler]
	 * @param {boolean} [capture]
	 * @param {boolean} [passive]
	 * @returns {void}
	 */
	function event(event_name, dom, handler, capture, passive) {
		var options = { capture, passive };
		var target_handler = create_event(event_name, dom, handler, options);

		if (
			dom === document.body ||
			// @ts-ignore
			dom === window ||
			// @ts-ignore
			dom === document ||
			// Firefox has quirky behavior, it can happen that we still get "canplay" events when the element is already removed
			dom instanceof HTMLMediaElement
		) {
			teardown(() => {
				dom.removeEventListener(event_name, target_handler, options);
			});
		}
	}

	/**
	 * @param {string} event_name
	 * @param {Element} element
	 * @param {EventListener} [handler]
	 * @returns {void}
	 */
	function delegated(event_name, element, handler) {
		// @ts-expect-error
		(element[event_symbol] ??= {})[event_name] = handler;
	}

	/**
	 * @param {Array<string>} events
	 * @returns {void}
	 */
	function delegate(events) {
		for (var i = 0; i < events.length; i++) {
			all_registered_events.add(events[i]);
		}

		for (var fn of root_event_handles) {
			fn(events);
		}
	}

	// used to store the reference to the currently propagated event
	// to prevent garbage collection between microtasks in Firefox
	// If the event object is GCed too early, the expando __root property
	// set on the event object is lost, causing the event delegation
	// to process the event twice
	let last_propagated_event = null;

	/**
	 * @this {EventTarget}
	 * @param {Event} event
	 * @returns {void}
	 */
	function handle_event_propagation(event) {
		var handler_element = this;
		var owner_document = /** @type {Node} */ (handler_element).ownerDocument;
		var event_name = event.type;
		var path = event.composedPath?.() || [];
		var current_target = /** @type {null | Element} */ (path[0] || event.target);

		last_propagated_event = event;

		// composedPath contains list of nodes the event has propagated through.
		// We check `event_symbol` to skip all nodes below it in case this is a
		// parent of the `event_symbol` node, which indicates that there's nested
		// mounted apps. In this case we don't want to trigger events multiple times.
		var path_idx = 0;

		// the `last_propagated_event === event` check is redundant, but
		// without it the variable will be DCE'd and things will
		// fail mysteriously in Firefox
		// @ts-expect-error is added below
		var handled_at = last_propagated_event === event && event[event_symbol];

		if (handled_at) {
			var at_idx = path.indexOf(handled_at);
			if (
				at_idx !== -1 &&
				(handler_element === document || handler_element === /** @type {any} */ (window))
			) {
				// This is the fallback document listener or a window listener, but the event was already handled
				// -> ignore, but set handle_at to document/window so that we're resetting the event
				// chain in case someone manually dispatches the same event object again.
				// @ts-expect-error
				event[event_symbol] = handler_element;
				return;
			}

			// We're deliberately not skipping if the index is higher, because
			// someone could create an event programmatically and emit it multiple times,
			// in which case we want to handle the whole propagation chain properly each time.
			// (this will only be a false negative if the event is dispatched multiple times and
			// the fallback document listener isn't reached in between, but that's super rare)
			var handler_idx = path.indexOf(handler_element);
			if (handler_idx === -1) {
				// handle_idx can theoretically be -1 (happened in some JSDOM testing scenarios with an event listener on the window object)
				// so guard against that, too, and assume that everything was handled at this point.
				return;
			}

			if (at_idx <= handler_idx) {
				path_idx = at_idx;
			}
		}

		current_target = /** @type {Element} */ (path[path_idx] || event.target);
		// there can only be one delegated event per element, and we either already handled the current target,
		// or this is the very first target in the chain which has a non-delegated listener, in which case it's safe
		// to handle a possible delegated event on it later (through the root delegation listener for example).
		if (current_target === handler_element) return;

		// Proxy currentTarget to correct target
		define_property(event, 'currentTarget', {
			configurable: true,
			get() {
				return current_target || owner_document;
			}
		});

		// This started because of Chromium issue https://chromestatus.com/feature/5128696823545856,
		// where removal or moving of of the DOM can cause sync `blur` events to fire, which can cause logic
		// to run inside the current `active_reaction`, which isn't what we want at all. However, on reflection,
		// it's probably best that all event handled by Svelte have this behaviour, as we don't really want
		// an event handler to run in the context of another reaction or effect.
		var previous_reaction = active_reaction;
		var previous_effect = active_effect;
		set_active_reaction(null);
		set_active_effect(null);

		try {
			/**
			 * @type {unknown}
			 */
			var throw_error;
			/**
			 * @type {unknown[]}
			 */
			var other_errors = [];

			while (current_target !== null) {
				/** @type {null | Element} */
				var parent_element =
					current_target.assignedSlot ||
					current_target.parentNode ||
					/** @type {any} */ (current_target).host ||
					null;

				try {
					// @ts-expect-error
					var delegated = current_target[event_symbol]?.[event_name];

					if (
						delegated != null &&
						(!(/** @type {any} */ (current_target).disabled) ||
							// DOM could've been updated already by the time this is reached, so we check this as well
							// -> the target could not have been disabled because it emits the event in the first place
							event.target === current_target)
					) {
						delegated.call(current_target, event);
					}
				} catch (error) {
					if (throw_error) {
						other_errors.push(error);
					} else {
						throw_error = error;
					}
				}
				if (event.cancelBubble || parent_element === handler_element || parent_element === null) {
					break;
				}
				current_target = parent_element;
			}

			if (throw_error) {
				for (let error of other_errors) {
					// Throw the rest of the errors, one-by-one on a microtask
					queueMicrotask(() => {
						throw error;
					});
				}
				throw throw_error;
			}
		} finally {
			// @ts-expect-error is used above
			event[event_symbol] = handler_element;
			// @ts-ignore remove proxy on currentTarget
			delete event.currentTarget;
			set_active_reaction(previous_reaction);
			set_active_effect(previous_effect);
		}
	}

	const policy =
		// We gotta write it like this because after downleveling the pure comment may end up in the wrong location
		globalThis?.window?.trustedTypes &&
		/* @__PURE__ */ globalThis.window.trustedTypes.createPolicy('svelte-trusted-html', {
			/** @param {string} html */
			createHTML: (html) => {
				return html;
			}
		});

	/** @param {string} html */
	function create_trusted_html(html) {
		return /** @type {string} */ (policy?.createHTML(html) ?? html);
	}

	/**
	 * @param {string} html
	 */
	function create_fragment_from_html(html) {
		var elem = create_element('template');
		elem.innerHTML = create_trusted_html(html.replaceAll('<!>', '<!---->')); // XHTML compliance
		return elem.content;
	}

	/** @import { Effect, EffectNodes, TemplateNode } from '#client' */
	/** @import { TemplateStructure } from './types' */
	const SCRIPT_TAG = IS_XHTML ? 'script' : 'SCRIPT';

	/**
	 * @param {TemplateNode} start
	 * @param {TemplateNode | null} end
	 */
	function assign_nodes(start, end) {
		var effect = /** @type {Effect} */ (active_effect);
		if (effect.nodes === null) {
			effect.nodes = { start, end, a: null, t: null };
		}
	}

	/**
	 * @param {string} content
	 * @param {number} flags
	 * @returns {() => Node | Node[]}
	 */
	/*#__NO_SIDE_EFFECTS__*/
	function from_html(content, flags) {
		var is_fragment = (flags & TEMPLATE_FRAGMENT) !== 0;
		var use_import_node = (flags & TEMPLATE_USE_IMPORT_NODE) !== 0;

		/** @type {Node} */
		var node;

		/**
		 * Whether or not the first item is a text/element node. If not, we need to
		 * create an additional comment node to act as `effect.nodes.start`
		 */
		var has_start = !content.startsWith('<!>');

		return () => {

			if (node === undefined) {
				node = create_fragment_from_html(has_start ? content : '<!>' + content);
				if (!is_fragment) node = /** @type {TemplateNode} */ (get_first_child(node));
			}

			var clone = /** @type {TemplateNode} */ (
				use_import_node || is_firefox ? document.importNode(node, true) : node.cloneNode(true)
			);

			if (is_fragment) {
				var start = /** @type {TemplateNode} */ (get_first_child(clone));
				var end = /** @type {TemplateNode} */ (clone.lastChild);

				assign_nodes(start, end);
			} else {
				assign_nodes(clone, clone);
			}

			return clone;
		};
	}

	/**
	 * @param {string} content
	 * @param {number} flags
	 * @param {'svg' | 'math'} ns
	 * @returns {() => Node | Node[]}
	 */
	/*#__NO_SIDE_EFFECTS__*/
	function from_namespace(content, flags, ns = 'svg') {
		/**
		 * Whether or not the first item is a text/element node. If not, we need to
		 * create an additional comment node to act as `effect.nodes.start`
		 */
		var has_start = !content.startsWith('<!>');
		var wrapped = `<${ns}>${has_start ? content : '<!>' + content}</${ns}>`;

		/** @type {Element | DocumentFragment} */
		var node;

		return () => {

			if (!node) {
				var fragment = /** @type {DocumentFragment} */ (create_fragment_from_html(wrapped));
				var root = /** @type {Element} */ (get_first_child(fragment));

				{
					node = /** @type {Element} */ (get_first_child(root));
				}
			}

			var clone = /** @type {TemplateNode} */ (node.cloneNode(true));

			{
				assign_nodes(clone, clone);
			}

			return clone;
		};
	}

	/**
	 * @param {string} content
	 * @param {number} flags
	 */
	/*#__NO_SIDE_EFFECTS__*/
	function from_svg(content, flags) {
		return from_namespace(content, flags, 'svg');
	}

	/**
	 * @param {() => Element | DocumentFragment} fn
	 */
	function with_script(fn) {
		return () => run_scripts(fn());
	}

	/**
	 * Creating a document fragment from HTML that contains script tags will not execute
	 * the scripts. We need to replace the script tags with new ones so that they are executed.
	 * @param {Element | DocumentFragment} node
	 * @returns {Node | Node[]}
	 */
	function run_scripts(node) {

		const is_fragment = node.nodeType === DOCUMENT_FRAGMENT_NODE;
		const scripts =
			/** @type {HTMLElement} */ (node).nodeName === SCRIPT_TAG
				? [/** @type {HTMLScriptElement} */ (node)]
				: node.querySelectorAll('script');

		const effect = /** @type {Effect & { nodes: EffectNodes }} */ (active_effect);

		for (const script of scripts) {
			const clone = create_element('script');
			for (var attribute of script.attributes) {
				clone.setAttribute(attribute.name, attribute.value);
			}

			clone.textContent = script.textContent;

			// The script has changed - if it's at the edges, the effect now points at dead nodes
			if (is_fragment ? node.firstChild === script : node === script) {
				effect.nodes.start = clone;
			}
			if (is_fragment ? node.lastChild === script : node === script) {
				effect.nodes.end = clone;
			}

			script.replaceWith(clone);
		}
		return node;
	}

	/**
	 * Don't mark this as side-effect-free, hydration needs to walk all nodes
	 * @param {any} value
	 */
	function text(value = '') {
		{
			var t = create_text(value + '');
			assign_nodes(t, t);
			return t;
		}
	}

	/**
	 * @returns {TemplateNode | DocumentFragment}
	 */
	function comment() {

		var frag = document.createDocumentFragment();
		var start = document.createComment('');
		var anchor = create_text();
		frag.append(start, anchor);

		assign_nodes(start, anchor);

		return frag;
	}

	/**
	 * Assign the created (or in hydration mode, traversed) dom elements to the current block
	 * and insert the elements into the dom (in client mode).
	 * @param {Text | Comment | Element} anchor
	 * @param {DocumentFragment | Element} dom
	 */
	function append(anchor, dom) {

		if (anchor === null) {
			// edge case — void `<svelte:element>` with content
			return;
		}

		anchor.before(/** @type {Node} */ (dom));
	}

	/** @import { ComponentContext, Effect, EffectNodes, TemplateNode } from '#client' */
	/** @import { Component, ComponentType, SvelteComponent, MountOptions } from '../../index.js' */

	/**
	 * @param {Element} text
	 * @param {string} value
	 * @returns {void}
	 */
	function set_text(text, value) {
		// For objects, we apply string coercion (which might make things like $state array references in the template reactive) before diffing
		var str = value == null ? '' : typeof value === 'object' ? `${value}` : value;
		// @ts-expect-error
		if (str !== (text.__t ??= text.nodeValue)) {
			// @ts-expect-error
			text.__t = str;
			text.nodeValue = `${str}`;
		}
	}

	/**
	 * Mounts a component to the given target and returns the exports and potentially the props (if compiled with `accessors: true`) of the component.
	 * Transitions will play during the initial render unless the `intro` option is set to `false`.
	 *
	 * @template {Record<string, any>} Props
	 * @template {Record<string, any>} Exports
	 * @param {ComponentType<SvelteComponent<Props>> | Component<Props, Exports, any>} component
	 * @param {MountOptions<Props>} options
	 * @returns {Exports}
	 */
	function mount(component, options) {
		return _mount(component, options);
	}

	/** @type {Map<EventTarget, Map<string, number>>} */
	const listeners = new Map();

	/**
	 * @template {Record<string, any>} Exports
	 * @param {ComponentType<SvelteComponent<any>> | Component<any>} Component
	 * @param {MountOptions} options
	 * @returns {Exports}
	 */
	function _mount(
		Component,
		{ target, anchor, props = {}, events, context, intro = true, transformError }
	) {
		init_operations();

		/** @type {Exports} */
		// @ts-expect-error will be defined because the render effect runs synchronously
		var component = undefined;

		var unmount = component_root(() => {
			var anchor_node = anchor ?? target.appendChild(create_text());

			boundary(
				/** @type {TemplateNode} */ (anchor_node),
				{
					pending: () => {}
				},
				(anchor_node) => {
					push({});
					var ctx = /** @type {ComponentContext} */ (component_context);
					if (context) ctx.c = context;

					if (events) {
						// We can't spread the object or else we'd lose the state proxy stuff, if it is one
						/** @type {any} */ (props).$$events = events;
					}
					// @ts-expect-error the public typings are not what the actual function looks like
					component = Component(anchor_node, props) || {};

					pop();
				},
				transformError
			);

			// Setup event delegation _after_ component is mounted - if an error would happen during mount, it would otherwise not be cleaned up
			/** @type {Set<string>} */
			var registered_events = new Set();

			/** @param {Array<string>} events */
			var event_handle = (events) => {
				for (var i = 0; i < events.length; i++) {
					var event_name = events[i];

					if (registered_events.has(event_name)) continue;
					registered_events.add(event_name);

					var passive = is_passive_event(event_name);

					// Add the event listener to both the container and the document.
					// The container listener ensures we catch events from within in case
					// the outer content stops propagation of the event.
					//
					// The document listener ensures we catch events that originate from elements that were
					// manually moved outside of the container (e.g. via manual portals).
					for (const node of [target, document]) {
						var counts = listeners.get(node);

						if (counts === undefined) {
							counts = new Map();
							listeners.set(node, counts);
						}

						var count = counts.get(event_name);

						if (count === undefined) {
							node.addEventListener(event_name, handle_event_propagation, { passive });
							counts.set(event_name, 1);
						} else {
							counts.set(event_name, count + 1);
						}
					}
				}
			};

			event_handle(array_from(all_registered_events));
			root_event_handles.add(event_handle);

			return () => {
				for (var event_name of registered_events) {
					for (const node of [target, document]) {
						var counts = /** @type {Map<string, number>} */ (listeners.get(node));
						var count = /** @type {number} */ (counts.get(event_name));

						if (--count == 0) {
							node.removeEventListener(event_name, handle_event_propagation);
							counts.delete(event_name);

							if (counts.size === 0) {
								listeners.delete(node);
							}
						} else {
							counts.set(event_name, count);
						}
					}
				}

				root_event_handles.delete(event_handle);

				if (anchor_node !== anchor) {
					anchor_node.parentNode?.removeChild(anchor_node);
				}
			};
		});

		mounted_components.set(component, unmount);
		return component;
	}

	/**
	 * References of the components that were mounted or hydrated.
	 * Uses a `WeakMap` to avoid memory leaks.
	 */
	let mounted_components = new WeakMap();

	/** @import { Effect, TemplateNode } from '#client' */

	/**
	 * @typedef {{ effect: Effect, fragment: DocumentFragment }} Branch
	 */

	/**
	 * @template Key
	 */
	class BranchManager {
		/** @type {TemplateNode} */
		anchor;

		/** @type {Map<Batch, Key>} */
		#batches = new Map();

		/**
		 * Map of keys to effects that are currently rendered in the DOM.
		 * These effects are visible and actively part of the document tree.
		 * Example:
		 * ```
		 * {#if condition}
		 * 	foo
		 * {:else}
		 * 	bar
		 * {/if}
		 * ```
		 * Can result in the entries `true->Effect` and `false->Effect`
		 * @type {Map<Key, Effect>}
		 */
		#onscreen = new Map();

		/**
		 * Similar to #onscreen with respect to the keys, but contains branches that are not yet
		 * in the DOM, because their insertion is deferred.
		 * @type {Map<Key, Branch>}
		 */
		#offscreen = new Map();

		/**
		 * Keys of effects that are currently outroing
		 * @type {Set<Key>}
		 */
		#outroing = new Set();

		/**
		 * Whether to pause (i.e. outro) on change, or destroy immediately.
		 * This is necessary for `<svelte:element>`
		 */
		#transition = true;

		/**
		 * @param {TemplateNode} anchor
		 * @param {boolean} transition
		 */
		constructor(anchor, transition = true) {
			this.anchor = anchor;
			this.#transition = transition;
		}

		/**
		 * @param {Batch} batch
		 */
		#commit = (batch) => {
			// if this batch was made obsolete, bail
			if (!this.#batches.has(batch)) return;

			var key = /** @type {Key} */ (this.#batches.get(batch));

			var onscreen = this.#onscreen.get(key);

			if (onscreen) {
				// effect is already in the DOM — abort any current outro
				resume_effect(onscreen);
				this.#outroing.delete(key);
			} else {
				// effect is currently offscreen. put it in the DOM
				var offscreen = this.#offscreen.get(key);

				if (offscreen) {
					this.#onscreen.set(key, offscreen.effect);
					this.#offscreen.delete(key);

					// remove the anchor...
					/** @type {TemplateNode} */ (offscreen.fragment.lastChild).remove();

					// ...and append the fragment
					this.anchor.before(offscreen.fragment);
					onscreen = offscreen.effect;
				}
			}

			for (const [b, k] of this.#batches) {
				this.#batches.delete(b);

				if (b === batch) {
					// keep values for newer batches
					break;
				}

				const offscreen = this.#offscreen.get(k);

				if (offscreen) {
					// for older batches, destroy offscreen effects
					// as they will never be committed
					destroy_effect(offscreen.effect);
					this.#offscreen.delete(k);
				}
			}

			// outro/destroy all onscreen effects...
			for (const [k, effect] of this.#onscreen) {
				// ...except the one that was just committed
				//    or those that are already outroing (else the transition is aborted and the effect destroyed right away)
				if (k === key || this.#outroing.has(k)) continue;

				const on_destroy = () => {
					const keys = Array.from(this.#batches.values());

					if (keys.includes(k)) {
						// keep the effect offscreen, as another batch will need it
						var fragment = document.createDocumentFragment();
						move_effect(effect, fragment);

						fragment.append(create_text()); // TODO can we avoid this?

						this.#offscreen.set(k, { effect, fragment });
					} else {
						destroy_effect(effect);
					}

					this.#outroing.delete(k);
					this.#onscreen.delete(k);
				};

				if (this.#transition || !onscreen) {
					this.#outroing.add(k);
					pause_effect(effect, on_destroy, false);
				} else {
					on_destroy();
				}
			}
		};

		/**
		 * @param {Batch} batch
		 */
		#discard = (batch) => {
			this.#batches.delete(batch);

			const keys = Array.from(this.#batches.values());

			for (const [k, branch] of this.#offscreen) {
				if (!keys.includes(k)) {
					destroy_effect(branch.effect);
					this.#offscreen.delete(k);
				}
			}
		};

		/**
		 *
		 * @param {any} key
		 * @param {null | ((target: TemplateNode) => void)} fn
		 */
		ensure(key, fn) {
			var batch = /** @type {Batch} */ (current_batch);
			var defer = should_defer_append();

			if (fn && !this.#onscreen.has(key) && !this.#offscreen.has(key)) {
				if (defer) {
					var fragment = document.createDocumentFragment();
					var target = create_text();

					fragment.append(target);

					this.#offscreen.set(key, {
						effect: branch(() => fn(target)),
						fragment
					});
				} else {
					this.#onscreen.set(
						key,
						branch(() => fn(this.anchor))
					);
				}
			}

			this.#batches.set(batch, key);

			if (defer) {
				for (const [k, effect] of this.#onscreen) {
					if (k === key) {
						batch.unskip_effect(effect);
					} else {
						batch.skip_effect(effect);
					}
				}

				for (const [k, branch] of this.#offscreen) {
					if (k === key) {
						batch.unskip_effect(branch.effect);
					} else {
						batch.skip_effect(branch.effect);
					}
				}

				batch.oncommit(this.#commit);
				batch.ondiscard(this.#discard);
			} else {

				this.#commit(batch);
			}
		}
	}

	/** @import { TemplateNode } from '#client' */

	/**
	 * @param {TemplateNode} node
	 * @param {(branch: (fn: (anchor: Node) => void, key?: number | false) => void) => void} fn
	 * @param {boolean} [elseif] True if this is an `{:else if ...}` block rather than an `{#if ...}`, as that affects which transitions are considered 'local'
	 * @returns {void}
	 */
	function if_block(node, fn, elseif = false) {

		var branches = new BranchManager(node);
		var flags = elseif ? EFFECT_TRANSPARENT : 0;

		/**
		 * @param {number | false} key
		 * @param {null | ((anchor: Node) => void)} fn
		 */
		function update_branch(key, fn) {

			branches.ensure(key, fn);
		}

		block(() => {
			var has_branch = false;

			fn((fn, key = 0) => {
				has_branch = true;
				update_branch(key, fn);
			});

			if (!has_branch) {
				update_branch(-1, null);
			}
		}, flags);
	}

	/** @import { EachItem, EachOutroGroup, EachState, Effect, EffectNodes, MaybeSource, Source, TemplateNode, TransitionManager, Value } from '#client' */
	/** @import { Batch } from '../../reactivity/batch.js'; */

	// When making substantive changes to this file, validate them with the each block stress test:
	// https://svelte.dev/playground/1972b2cf46564476ad8c8c6405b23b7b
	// This test also exists in this repo, as `packages/svelte/tests/manual/each-stress-test`

	/**
	 * @param {any} _
	 * @param {number} i
	 */
	function index(_, i) {
		return i;
	}

	/**
	 * Pause multiple effects simultaneously, and coordinate their
	 * subsequent destruction. Used in each blocks
	 * @param {EachState} state
	 * @param {Effect[]} to_destroy
	 * @param {null | Node} controlled_anchor
	 */
	function pause_effects(state, to_destroy, controlled_anchor) {
		/** @type {TransitionManager[]} */
		var transitions = [];
		var length = to_destroy.length;

		/** @type {EachOutroGroup} */
		var group;
		var remaining = to_destroy.length;

		for (var i = 0; i < length; i++) {
			let effect = to_destroy[i];

			pause_effect(
				effect,
				() => {
					if (group) {
						group.pending.delete(effect);
						group.done.add(effect);

						if (group.pending.size === 0) {
							var groups = /** @type {Set<EachOutroGroup>} */ (state.outrogroups);

							destroy_effects(state, array_from(group.done));
							groups.delete(group);

							if (groups.size === 0) {
								state.outrogroups = null;
							}
						}
					} else {
						remaining -= 1;
					}
				},
				false
			);
		}

		if (remaining === 0) {
			// If we're in a controlled each block (i.e. the block is the only child of an
			// element), and we are removing all items, _and_ there are no out transitions,
			// we can use the fast path — emptying the element and replacing the anchor
			var fast_path = transitions.length === 0 && controlled_anchor !== null;

			if (fast_path) {
				var anchor = /** @type {Element} */ (controlled_anchor);
				var parent_node = /** @type {Element} */ (anchor.parentNode);

				clear_text_content(parent_node);
				parent_node.append(anchor);

				state.items.clear();
			}

			destroy_effects(state, to_destroy, !fast_path);
		} else {
			group = {
				pending: new Set(to_destroy),
				done: new Set()
			};

			(state.outrogroups ??= new Set()).add(group);
		}
	}

	/**
	 * @param {EachState} state
	 * @param {Effect[]} to_destroy
	 * @param {boolean} remove_dom
	 */
	function destroy_effects(state, to_destroy, remove_dom = true) {
		/** @type {Set<Effect> | undefined} */
		var preserved_effects;

		// The loop-in-a-loop isn't ideal, but we should only hit this in relatively rare cases
		if (state.pending.size > 0) {
			preserved_effects = new Set();

			for (const keys of state.pending.values()) {
				for (const key of keys) {
					preserved_effects.add(/** @type {EachItem} */ (state.items.get(key)).e);
				}
			}
		}

		for (var i = 0; i < to_destroy.length; i++) {
			var e = to_destroy[i];

			if (preserved_effects?.has(e)) {
				e.f |= EFFECT_OFFSCREEN;

				const fragment = document.createDocumentFragment();
				move_effect(e, fragment);
			} else {
				destroy_effect(to_destroy[i], remove_dom);
			}
		}
	}

	/** @type {TemplateNode} */
	var offscreen_anchor;

	/**
	 * @template V
	 * @param {Element | Comment} node The next sibling node, or the parent node if this is a 'controlled' block
	 * @param {number} flags
	 * @param {() => V[]} get_collection
	 * @param {(value: V, index: number) => any} get_key
	 * @param {(anchor: Node, item: MaybeSource<V>, index: MaybeSource<number>) => void} render_fn
	 * @param {null | ((anchor: Node) => void)} fallback_fn
	 * @returns {void}
	 */
	function each(node, flags, get_collection, get_key, render_fn, fallback_fn = null) {
		var anchor = node;

		/** @type {Map<any, EachItem>} */
		var items = new Map();

		var is_controlled = (flags & EACH_IS_CONTROLLED) !== 0;

		if (is_controlled) {
			var parent_node = /** @type {Element} */ (node);

			anchor = parent_node.appendChild(create_text());
		}

		/** @type {Effect | null} */
		var fallback = null;

		// TODO: ideally we could use derived for runes mode but because of the ability
		// to use a store which can be mutated, we can't do that here as mutating a store
		// will still result in the collection array being the same from the store
		var each_array = derived_safe_equal(() => {
			var collection = get_collection();

			return is_array(collection) ? collection : collection == null ? [] : array_from(collection);
		});

		/** @type {V[]} */
		var array;

		/** @type {Map<Batch, Set<any>>} */
		var pending = new Map();

		var first_run = true;

		/**
		 * @param {Batch} batch
		 */
		function commit(batch) {
			if ((state.effect.f & DESTROYED) !== 0) {
				return;
			}

			state.pending.delete(batch);

			state.fallback = fallback;
			reconcile(state, array, anchor, flags, get_key);

			if (fallback !== null) {
				if (array.length === 0) {
					if ((fallback.f & EFFECT_OFFSCREEN) === 0) {
						resume_effect(fallback);
					} else {
						fallback.f ^= EFFECT_OFFSCREEN;
						move(fallback, null, anchor);
					}
				} else {
					pause_effect(fallback, () => {
						// TODO only null out if no pending batch needs it,
						// otherwise re-add `fallback.fragment` and move the
						// effect into it
						fallback = null;
					});
				}
			}
		}

		/**
		 * @param {Batch} batch
		 */
		function discard(batch) {
			state.pending.delete(batch);
		}

		var effect = block(() => {
			array = /** @type {V[]} */ (get(each_array));
			var length = array.length;

			var keys = new Set();
			var batch = /** @type {Batch} */ (current_batch);
			var defer = should_defer_append();

			for (var index = 0; index < length; index += 1) {

				var value = array[index];
				var key = get_key(value, index);

				var item = first_run ? null : items.get(key);

				if (item) {
					// update before reconciliation, to trigger any async updates
					if (item.v) internal_set(item.v, value);
					if (item.i) internal_set(item.i, index);

					if (defer) {
						batch.unskip_effect(item.e);
					}
				} else {
					item = create_item(
						items,
						first_run ? anchor : (offscreen_anchor ??= create_text()),
						value,
						key,
						index,
						render_fn,
						flags,
						get_collection
					);

					if (!first_run) {
						item.e.f |= EFFECT_OFFSCREEN;
					}

					items.set(key, item);
				}

				keys.add(key);
			}

			if (length === 0 && fallback_fn && !fallback) {
				if (first_run) {
					fallback = branch(() => fallback_fn(anchor));
				} else {
					fallback = branch(() => fallback_fn((offscreen_anchor ??= create_text())));
					fallback.f |= EFFECT_OFFSCREEN;
				}
			}

			if (length > keys.size) {
				{
					// in prod, the additional information isn't printed, so don't bother computing it
					each_key_duplicate();
				}
			}

			if (!first_run) {
				pending.set(batch, keys);

				if (defer) {
					for (const [key, item] of items) {
						if (!keys.has(key)) {
							batch.skip_effect(item.e);
						}
					}

					batch.oncommit(commit);
					batch.ondiscard(discard);
				} else {
					commit(batch);
				}
			}

			// When we mount the each block for the first time, the collection won't be
			// connected to this effect as the effect hasn't finished running yet and its deps
			// won't be assigned. However, it's possible that when reconciling the each block
			// that a mutation occurred and it's made the collection MAYBE_DIRTY, so reading the
			// collection again can provide consistency to the reactive graph again as the deriveds
			// will now be `CLEAN`.
			get(each_array);
		});

		/** @type {EachState} */
		var state = { effect, items, pending, outrogroups: null, fallback };

		first_run = false;
	}

	/**
	 * Skip past any non-branch effects (which could be created with `createSubscriber`, for example) to find the next branch effect
	 * @param {Effect | null} effect
	 * @returns {Effect | null}
	 */
	function skip_to_branch(effect) {
		while (effect !== null && (effect.f & BRANCH_EFFECT) === 0) {
			effect = effect.next;
		}
		return effect;
	}

	/**
	 * Add, remove, or reorder items output by an each block as its input changes
	 * @template V
	 * @param {EachState} state
	 * @param {Array<V>} array
	 * @param {Element | Comment | Text} anchor
	 * @param {number} flags
	 * @param {(value: V, index: number) => any} get_key
	 * @returns {void}
	 */
	function reconcile(state, array, anchor, flags, get_key) {
		var is_animated = (flags & EACH_IS_ANIMATED) !== 0;

		var length = array.length;
		var items = state.items;
		var current = skip_to_branch(state.effect.first);

		/** @type {undefined | Set<Effect>} */
		var seen;

		/** @type {Effect | null} */
		var prev = null;

		/** @type {undefined | Set<Effect>} */
		var to_animate;

		/** @type {Effect[]} */
		var matched = [];

		/** @type {Effect[]} */
		var stashed = [];

		/** @type {V} */
		var value;

		/** @type {any} */
		var key;

		/** @type {Effect | undefined} */
		var effect;

		/** @type {number} */
		var i;

		if (is_animated) {
			for (i = 0; i < length; i += 1) {
				value = array[i];
				key = get_key(value, i);
				effect = /** @type {EachItem} */ (items.get(key)).e;

				// offscreen == coming in now, no animation in that case,
				// else this would happen https://github.com/sveltejs/svelte/issues/17181
				if ((effect.f & EFFECT_OFFSCREEN) === 0) {
					effect.nodes?.a?.measure();
					(to_animate ??= new Set()).add(effect);
				}
			}
		}

		for (i = 0; i < length; i += 1) {
			value = array[i];
			key = get_key(value, i);

			effect = /** @type {EachItem} */ (items.get(key)).e;

			if (state.outrogroups !== null) {
				for (const group of state.outrogroups) {
					group.pending.delete(effect);
					group.done.delete(effect);
				}
			}

			if ((effect.f & INERT) !== 0) {
				resume_effect(effect);
				if (is_animated) {
					effect.nodes?.a?.unfix();
					(to_animate ??= new Set()).delete(effect);
				}
			}

			if ((effect.f & EFFECT_OFFSCREEN) !== 0) {
				effect.f ^= EFFECT_OFFSCREEN;

				if (effect === current) {
					move(effect, null, anchor);
				} else {
					var next = prev ? prev.next : current;

					if (effect === state.effect.last) {
						state.effect.last = effect.prev;
					}

					if (effect.prev) effect.prev.next = effect.next;
					if (effect.next) effect.next.prev = effect.prev;
					link(state, prev, effect);
					link(state, effect, next);

					move(effect, next, anchor);
					prev = effect;

					matched = [];
					stashed = [];

					current = skip_to_branch(prev.next);
					continue;
				}
			}

			if (effect !== current) {
				if (seen !== undefined && seen.has(effect)) {
					if (matched.length < stashed.length) {
						// more efficient to move later items to the front
						var start = stashed[0];
						var j;

						prev = start.prev;

						var a = matched[0];
						var b = matched[matched.length - 1];

						for (j = 0; j < matched.length; j += 1) {
							move(matched[j], start, anchor);
						}

						for (j = 0; j < stashed.length; j += 1) {
							seen.delete(stashed[j]);
						}

						link(state, a.prev, b.next);
						link(state, prev, a);
						link(state, b, start);

						current = start;
						prev = b;
						i -= 1;

						matched = [];
						stashed = [];
					} else {
						// more efficient to move earlier items to the back
						seen.delete(effect);
						move(effect, current, anchor);

						link(state, effect.prev, effect.next);
						link(state, effect, prev === null ? state.effect.first : prev.next);
						link(state, prev, effect);

						prev = effect;
					}

					continue;
				}

				matched = [];
				stashed = [];

				while (current !== null && current !== effect) {
					(seen ??= new Set()).add(current);
					stashed.push(current);
					current = skip_to_branch(current.next);
				}

				if (current === null) {
					continue;
				}
			}

			if ((effect.f & EFFECT_OFFSCREEN) === 0) {
				matched.push(effect);
			}

			prev = effect;
			current = skip_to_branch(effect.next);
		}

		if (state.outrogroups !== null) {
			for (const group of state.outrogroups) {
				if (group.pending.size === 0) {
					destroy_effects(state, array_from(group.done));
					state.outrogroups?.delete(group);
				}
			}

			if (state.outrogroups.size === 0) {
				state.outrogroups = null;
			}
		}

		if (current !== null || seen !== undefined) {
			/** @type {Effect[]} */
			var to_destroy = [];

			if (seen !== undefined) {
				for (effect of seen) {
					if ((effect.f & INERT) === 0) {
						to_destroy.push(effect);
					}
				}
			}

			while (current !== null) {
				// If the each block isn't inert, then inert effects are currently outroing and will be removed once the transition is finished
				if ((current.f & INERT) === 0 && current !== state.fallback) {
					to_destroy.push(current);
				}

				current = skip_to_branch(current.next);
			}

			var destroy_length = to_destroy.length;

			if (destroy_length > 0) {
				var controlled_anchor = (flags & EACH_IS_CONTROLLED) !== 0 && length === 0 ? anchor : null;

				if (is_animated) {
					for (i = 0; i < destroy_length; i += 1) {
						to_destroy[i].nodes?.a?.measure();
					}

					for (i = 0; i < destroy_length; i += 1) {
						to_destroy[i].nodes?.a?.fix();
					}
				}

				pause_effects(state, to_destroy, controlled_anchor);
			}
		}

		if (is_animated) {
			queue_micro_task(() => {
				if (to_animate === undefined) return;
				for (effect of to_animate) {
					effect.nodes?.a?.apply();
				}
			});
		}
	}

	/**
	 * @template V
	 * @param {Map<any, EachItem>} items
	 * @param {Node} anchor
	 * @param {V} value
	 * @param {unknown} key
	 * @param {number} index
	 * @param {(anchor: Node, item: V | Source<V>, index: number | Value<number>, collection: () => V[]) => void} render_fn
	 * @param {number} flags
	 * @param {() => V[]} get_collection
	 * @returns {EachItem}
	 */
	function create_item(items, anchor, value, key, index, render_fn, flags, get_collection) {
		var v =
			(flags & EACH_ITEM_REACTIVE) !== 0
				? (flags & EACH_ITEM_IMMUTABLE) === 0
					? mutable_source(value, false, false)
					: source(value)
				: null;

		var i = (flags & EACH_INDEX_REACTIVE) !== 0 ? source(index) : null;

		return {
			v,
			i,
			e: branch(() => {
				render_fn(anchor, v ?? value, i ?? index, get_collection);

				return () => {
					items.delete(key);
				};
			})
		};
	}

	/**
	 * @param {Effect} effect
	 * @param {Effect | null} next
	 * @param {Text | Element | Comment} anchor
	 */
	function move(effect, next, anchor) {
		if (!effect.nodes) return;

		var node = effect.nodes.start;
		var end = effect.nodes.end;

		var dest =
			next && (next.f & EFFECT_OFFSCREEN) === 0
				? /** @type {EffectNodes} */ (next.nodes).start
				: anchor;

		while (node !== null) {
			var next_node = /** @type {TemplateNode} */ (get_next_sibling(node));
			dest.before(node);

			if (node === end) {
				return;
			}

			node = next_node;
		}
	}

	/**
	 * @param {EachState} state
	 * @param {Effect | null} prev
	 * @param {Effect | null} next
	 */
	function link(state, prev, next) {
		if (prev === null) {
			state.effect.first = next;
		} else {
			prev.next = next;
		}

		if (next === null) {
			state.effect.last = prev;
		} else {
			next.prev = prev;
		}
	}

	/** @import { Effect, TemplateNode } from '#client' */
	/** @import {} from 'trusted-types' */

	/**
	 * @param {Element | Text | Comment} node
	 * @param {() => string | TrustedHTML} get_value
	 * @param {boolean} [is_controlled]
	 * @param {boolean} [svg]
	 * @param {boolean} [mathml]
	 * @param {boolean} [skip_warning]
	 * @returns {void}
	 */
	function html(
		node,
		get_value,
		is_controlled = false,
		svg = false,
		mathml = false,
		skip_warning = false
	) {
		var anchor = node;

		/** @type {string | TrustedHTML} */
		var value = '';

		if (is_controlled) {
			var parent_node = /** @type {Element} */ (node);
		}

		template_effect(() => {
			var effect = /** @type {Effect} */ (active_effect);

			if (value === (value = get_value() ?? '')) {
				return;
			}

			if (is_controlled && true) {
				// When @html is the only child, use innerHTML directly.
				// This also handles contenteditable, where the user may delete the anchor comment.
				effect.nodes = null;
				parent_node.innerHTML = /** @type {string} */ (value);

				if (value !== '') {
					assign_nodes(
						/** @type {TemplateNode} */ (get_first_child(parent_node)),
						/** @type {TemplateNode} */ (parent_node.lastChild)
					);
				}

				return;
			}

			if (effect.nodes !== null) {
				remove_effect_dom(effect.nodes.start, /** @type {TemplateNode} */ (effect.nodes.end));
				effect.nodes = null;
			}

			if (value === '') return;

			// Don't use create_fragment_with_script_from_html here because that would mean script tags are executed.
			// @html is basically `.innerHTML = ...` and that doesn't execute scripts either due to security reasons.
			// Use a <template>, <svg>, or <math> wrapper depending on context. If value is a TrustedHTML object,
			// it will be assigned directly to innerHTML without coercion — this allows {@html policy.createHTML(...)} to work.
			var ns = svg ? NAMESPACE_SVG : mathml ? NAMESPACE_MATHML : undefined;
			var wrapper = /** @type {HTMLTemplateElement | SVGElement | MathMLElement} */ (
				create_element(svg ? 'svg' : mathml ? 'math' : 'template', ns)
			);
			wrapper.innerHTML = /** @type {any} */ (value);

			/** @type {DocumentFragment | Element} */
			var node = svg || mathml ? wrapper : /** @type {HTMLTemplateElement} */ (wrapper).content;

			assign_nodes(
				/** @type {TemplateNode} */ (get_first_child(node)),
				/** @type {TemplateNode} */ (node.lastChild)
			);

			if (svg || mathml) {
				while (get_first_child(node)) {
					anchor.before(/** @type {TemplateNode} */ (get_first_child(node)));
				}
			} else {
				anchor.before(node);
			}
		});
	}

	/**
	 * @param {Comment} anchor
	 * @param {Record<string, any>} $$props
	 * @param {string} name
	 * @param {Record<string, unknown>} slot_props
	 * @param {null | ((anchor: Comment) => void)} fallback_fn
	 */
	function slot(anchor, $$props, name, slot_props, fallback_fn) {

		var slot_fn = $$props.$$slots?.[name];
		// Interop: Can use snippets to fill slots
		var is_interop = false;
		if (slot_fn === true) {
			slot_fn = $$props['children' ];
			is_interop = true;
		}

		if (slot_fn === undefined) ; else {
			slot_fn(anchor, is_interop ? () => slot_props : slot_props);
		}
	}

	/** @import { TemplateNode } from '#client' */

	/**
	 * @param {string} hash
	 * @param {(anchor: Node) => void} render_fn
	 * @returns {void}
	 */
	function head(hash, render_fn) {

		/** @type {Comment | Text} */
		var anchor;

		{
			anchor = document.head.appendChild(create_text());
		}

		try {
			// normally a branch is the child of a block and would have the EFFECT_PRESERVED flag,
			// but since head blocks don't necessarily only have direct branch children we add it on the block itself
			block(() => render_fn(anchor), HEAD_EFFECT | EFFECT_PRESERVED);
		} finally {
		}
	}

	function r(e){var t,f,n="";if("string"==typeof e||"number"==typeof e)n+=e;else if("object"==typeof e)if(Array.isArray(e)){var o=e.length;for(t=0;t<o;t++)e[t]&&(f=r(e[t]))&&(n&&(n+=" "),n+=f);}else for(f in e)e[f]&&(n&&(n+=" "),n+=f);return n}function clsx$1(){for(var e,t,f=0,n="",o=arguments.length;f<o;f++)(e=arguments[f])&&(t=r(e))&&(n&&(n+=" "),n+=t);return n}

	/**
	 * Small wrapper around clsx to preserve Svelte's (weird) handling of falsy values.
	 * TODO Svelte 6 revisit this, and likely turn all falsy values into the empty string (what clsx also does)
	 * @param  {any} value
	 */
	function clsx(value) {
		if (typeof value === 'object') {
			return clsx$1(value);
		} else {
			return value ?? '';
		}
	}

	/**
	 * @param {any} value
	 * @param {string | null} [hash]
	 * @param {Record<string, boolean>} [directives]
	 * @returns {string | null}
	 */
	function to_class(value, hash, directives) {
		var classname = value == null ? '' : '' + value;

		return classname === '' ? null : classname;
	}

	/**
	 * @param {any} value
	 * @param {Record<string, any> | [Record<string, any>, Record<string, any>]} [styles]
	 * @returns {string | null}
	 */
	function to_style(value, styles) {

		return value == null ? null : String(value);
	}

	/**
	 * @param {Element} dom
	 * @param {boolean | number} is_html
	 * @param {string | null} value
	 * @param {string} [hash]
	 * @param {Record<string, any>} [prev_classes]
	 * @param {Record<string, any>} [next_classes]
	 * @returns {Record<string, boolean> | undefined}
	 */
	function set_class(dom, is_html, value, hash, prev_classes, next_classes) {
		// @ts-expect-error need to add __className to patched prototype
		var prev = dom.__className;

		if (
			prev !== value ||
			prev === undefined // for edge case of `class={undefined}`
		) {
			var next_class_name = to_class(value);

			{
				// Removing the attribute when the value is only an empty string causes
				// performance issues vs simply making the className an empty string. So
				// we should only remove the class if the value is nullish
				// and there no hash/directives :
				if (next_class_name == null) {
					dom.removeAttribute('class');
				} else if (is_html) {
					dom.className = next_class_name;
				} else {
					dom.setAttribute('class', next_class_name);
				}
			}

			// @ts-expect-error need to add __className to patched prototype
			dom.__className = value;
		}

		return next_classes;
	}

	/**
	 * @param {Element & ElementCSSInlineStyle} dom
	 * @param {string | null} value
	 * @param {Record<string, any> | [Record<string, any>, Record<string, any>]} [prev_styles]
	 * @param {Record<string, any> | [Record<string, any>, Record<string, any>]} [next_styles]
	 */
	function set_style(dom, value, prev_styles, next_styles) {
		// @ts-expect-error
		var prev = dom.__style;

		if (prev !== value) {
			var next_style_attr = to_style(value);

			{
				if (next_style_attr == null) {
					dom.removeAttribute('style');
				} else {
					dom.style.cssText = next_style_attr;
				}
			}

			// @ts-expect-error
			dom.__style = value;
		}

		return next_styles;
	}

	/**
	 * Selects the correct option(s) (depending on whether this is a multiple select)
	 * @template V
	 * @param {HTMLSelectElement} select
	 * @param {V} value
	 * @param {boolean} mounting
	 */
	function select_option(select, value, mounting = false) {
		if (select.multiple) {
			// If value is null or undefined, keep the selection as is
			if (value == undefined) {
				return;
			}

			// If not an array, warn and keep the selection as is
			if (!is_array(value)) {
				return select_multiple_invalid_value();
			}

			// Otherwise, update the selection
			for (var option of select.options) {
				option.selected = value.includes(get_option_value(option));
			}

			return;
		}

		for (option of select.options) {
			var option_value = get_option_value(option);
			if (is(option_value, value)) {
				option.selected = true;
				return;
			}
		}

		if (!mounting || value !== undefined) {
			select.selectedIndex = -1; // no option should be selected
		}
	}

	/**
	 * Selects the correct option(s) if `value` is given,
	 * and then sets up a mutation observer to sync the
	 * current selection to the dom when it changes. Such
	 * changes could for example occur when options are
	 * inside an `#each` block.
	 * @param {HTMLSelectElement} select
	 */
	function init_select(select) {
		var observer = new MutationObserver(() => {
			// @ts-ignore
			select_option(select, select.__value);
			// Deliberately don't update the potential binding value,
			// the model should be preserved unless explicitly changed
		});

		observer.observe(select, {
			// Listen to option element changes
			childList: true,
			subtree: true, // because of <optgroup>
			// Listen to option element value attribute changes
			// (doesn't get notified of select value changes,
			// because that property is not reflected as an attribute)
			attributes: true,
			attributeFilter: ['value']
		});

		teardown(() => {
			observer.disconnect();
		});
	}

	/**
	 * @param {HTMLSelectElement} select
	 * @param {() => unknown} get
	 * @param {(value: unknown) => void} set
	 * @returns {void}
	 */
	function bind_select_value(select, get, set = get) {
		var batches = new WeakSet();
		var mounting = true;

		listen_to_event_and_reset_event(select, 'change', (is_reset) => {
			var query = is_reset ? '[selected]' : ':checked';
			/** @type {unknown} */
			var value;

			if (select.multiple) {
				value = [].map.call(select.querySelectorAll(query), get_option_value);
			} else {
				/** @type {HTMLOptionElement | null} */
				var selected_option =
					select.querySelector(query) ??
					// will fall back to first non-disabled option if no option is selected
					select.querySelector('option:not([disabled])');
				value = selected_option && get_option_value(selected_option);
			}

			set(value);

			// @ts-ignore
			select.__value = value;

			if (current_batch !== null) {
				batches.add(current_batch);
			}
		});

		// Needs to be an effect, not a render_effect, so that in case of each loops the logic runs after the each block has updated
		effect(() => {
			var value = get();

			if (select === document.activeElement) {
				// In sync mode render effects are executed during tree traversal -> needs current_batch
				// In async mode render effects are flushed once batch resolved, at which point current_batch is null -> needs previous_batch
				var batch = /** @type {Batch} */ (current_batch);

				// Don't update the <select> if it is focused. We can get here if, for example,
				// an update is deferred because of async work depending on the select:
				//
				// <select bind:value={selected}>...</select>
				// <p>{await find(selected)}</p>
				if (batches.has(batch)) {
					return;
				}
			}

			select_option(select, value, mounting);

			// Mounting and value undefined -> take selection from dom
			if (mounting && value === undefined) {
				/** @type {HTMLOptionElement | null} */
				var selected_option = select.querySelector(':checked');
				if (selected_option !== null) {
					value = get_option_value(selected_option);
					set(value);
				}
			}

			// @ts-ignore
			select.__value = value;
			mounting = false;
		});

		init_select(select);
	}

	/** @param {HTMLOptionElement} option */
	function get_option_value(option) {
		// __value only exists if the <option> has a value attribute
		if ('__value' in option) {
			return option.__value;
		} else {
			return option.value;
		}
	}

	/** @import { Blocker, Effect } from '#client' */

	const IS_CUSTOM_ELEMENT = Symbol('is custom element');
	const IS_HTML = Symbol('is html');
	const PROGRESS_TAG = IS_XHTML ? 'progress' : 'PROGRESS';

	/**
	 * @param {Element} element
	 * @param {any} value
	 */
	function set_value(element, value) {
		var attributes = get_attributes(element);

		if (
			attributes.value ===
				(attributes.value =
					// treat null and undefined the same for the initial value
					value ?? undefined) ||
			// @ts-expect-error
			// `progress` elements always need their value set when it's `0`
			(element.value === value && (value !== 0 || element.nodeName !== PROGRESS_TAG))
		) {
			return;
		}

		// @ts-expect-error
		element.value = value ?? '';
	}

	/**
	 * @param {Element} element
	 * @param {string} attribute
	 * @param {string | null} value
	 * @param {boolean} [skip_warning]
	 */
	function set_attribute(element, attribute, value, skip_warning) {
		var attributes = get_attributes(element);

		if (attributes[attribute] === (attributes[attribute] = value)) return;

		if (attribute === 'loading') {
			// @ts-expect-error
			element[LOADING_ATTR_SYMBOL] = value;
		}

		if (value == null) {
			element.removeAttribute(attribute);
		} else if (typeof value !== 'string' && get_setters(element).includes(attribute)) {
			// @ts-ignore
			element[attribute] = value;
		} else {
			element.setAttribute(attribute, value);
		}
	}

	/**
	 *
	 * @param {Element} element
	 */
	function get_attributes(element) {
		return /** @type {Record<string | symbol, unknown>} **/ (
			// @ts-expect-error
			element.__attributes ??= {
				[IS_CUSTOM_ELEMENT]: element.nodeName.includes('-'),
				[IS_HTML]: element.namespaceURI === NAMESPACE_HTML
			}
		);
	}

	/** @type {Map<string, string[]>} */
	var setters_cache = new Map();

	/** @param {Element} element */
	function get_setters(element) {
		var cache_key = element.getAttribute('is') || element.nodeName;
		var setters = setters_cache.get(cache_key);
		if (setters) return setters;
		setters_cache.set(cache_key, (setters = []));

		var descriptors;
		var proto = element; // In the case of custom elements there might be setters on the instance
		var element_proto = Element.prototype;

		// Stop at Element, from there on there's only unnecessary setters we're not interested in
		// Do not use contructor.name here as that's unreliable in some browser environments
		while (element_proto !== proto) {
			descriptors = get_descriptors(proto);

			for (var key in descriptors) {
				if (descriptors[key].set) {
					setters.push(key);
				}
			}

			proto = get_prototype_of(proto);
		}

		return setters;
	}

	/** @import { Batch } from '../../../reactivity/batch.js' */

	/**
	 * @param {HTMLInputElement} input
	 * @param {() => unknown} get
	 * @param {(value: unknown) => void} set
	 * @returns {void}
	 */
	function bind_value(input, get, set = get) {
		var batches = new WeakSet();

		listen_to_event_and_reset_event(input, 'input', async (is_reset) => {

			/** @type {any} */
			var value = is_reset ? input.defaultValue : input.value;
			value = is_numberlike_input(input) ? to_number(value) : value;
			set(value);

			if (current_batch !== null) {
				batches.add(current_batch);
			}

			// Because `{#each ...}` blocks work by updating sources inside the flush,
			// we need to wait a tick before checking to see if we should forcibly
			// update the input and reset the selection state
			await tick();

			// Respect any validation in accessors
			if (value !== (value = get())) {
				var start = input.selectionStart;
				var end = input.selectionEnd;
				var length = input.value.length;

				// the value is coerced on assignment
				input.value = value ?? '';

				// Restore selection
				if (end !== null) {
					var new_length = input.value.length;
					// If cursor was at end and new input is longer, move cursor to new end
					if (start === end && end === length && new_length > length) {
						input.selectionStart = new_length;
						input.selectionEnd = new_length;
					} else {
						input.selectionStart = start;
						input.selectionEnd = Math.min(end, new_length);
					}
				}
			}
		});

		if (
			// If we are hydrating and the value has since changed,
			// then use the updated value from the input instead.
			// If defaultValue is set, then value == defaultValue
			// TODO Svelte 6: remove input.value check and set to empty string?
			(untrack(get) == null && input.value)
		) {
			set(is_numberlike_input(input) ? to_number(input.value) : input.value);

			if (current_batch !== null) {
				batches.add(current_batch);
			}
		}

		render_effect(() => {

			var value = get();

			if (input === document.activeElement) {
				// In sync mode render effects are executed during tree traversal -> needs current_batch
				// In async mode render effects are flushed once batch resolved, at which point current_batch is null -> needs previous_batch
				var batch = /** @type {Batch} */ (current_batch);

				// Never rewrite the contents of a focused input. We can get here if, for example,
				// an update is deferred because of async work depending on the input:
				//
				// <input bind:value={query}>
				// <p>{await find(query)}</p>
				if (batches.has(batch)) {
					return;
				}
			}

			if (is_numberlike_input(input) && value === to_number(input.value)) {
				// handles 0 vs 00 case (see https://github.com/sveltejs/svelte/issues/9959)
				return;
			}

			if (input.type === 'date' && !value && !input.value) {
				// Handles the case where a temporarily invalid date is set (while typing, for example with a leading 0 for the day)
				// and prevents this state from clearing the other parts of the date input (see https://github.com/sveltejs/svelte/issues/7897)
				return;
			}

			// don't set the value of the input if it's the same to allow
			// minlength to work properly
			if (value !== input.value) {
				// @ts-expect-error the value is coerced on assignment
				input.value = value ?? '';
			}
		});
	}

	/**
	 * @param {HTMLInputElement} input
	 * @param {() => unknown} get
	 * @param {(value: unknown) => void} set
	 * @returns {void}
	 */
	function bind_checked(input, get, set = get) {
		listen_to_event_and_reset_event(input, 'change', (is_reset) => {
			var value = is_reset ? input.defaultChecked : input.checked;
			set(value);
		});

		if (
			// If we are hydrating and the value has since changed,
			// then use the update value from the input instead.
			// If defaultChecked is set, then checked == defaultChecked
			untrack(get) == null
		) {
			set(input.checked);
		}

		render_effect(() => {
			var value = get();
			input.checked = Boolean(value);
		});
	}

	/**
	 * @param {HTMLInputElement} input
	 */
	function is_numberlike_input(input) {
		var type = input.type;
		return type === 'number' || type === 'range';
	}

	/**
	 * @param {string} value
	 */
	function to_number(value) {
		return value === '' ? null : +value;
	}

	/** @import { ComponentContext, Effect } from '#client' */

	/**
	 * @param {any} bound_value
	 * @param {Element} element_or_component
	 * @returns {boolean}
	 */
	function is_bound_this(bound_value, element_or_component) {
		return (
			bound_value === element_or_component || bound_value?.[STATE_SYMBOL] === element_or_component
		);
	}

	/**
	 * @param {any} element_or_component
	 * @param {(value: unknown, ...parts: unknown[]) => void} update
	 * @param {(...parts: unknown[]) => unknown} get_value
	 * @param {() => unknown[]} [get_parts] Set if the this binding is used inside an each block,
	 * 										returns all the parts of the each block context that are used in the expression
	 * @returns {void}
	 */
	function bind_this(element_or_component = {}, update, get_value, get_parts) {
		var component_effect = /** @type {ComponentContext} */ (component_context).r;
		var parent = /** @type {Effect} */ (active_effect);

		effect(() => {
			/** @type {unknown[]} */
			var old_parts;

			/** @type {unknown[]} */
			var parts;

			render_effect(() => {
				old_parts = parts;
				// We only track changes to the parts, not the value itself to avoid unnecessary reruns.
				parts = [];

				untrack(() => {
					if (element_or_component !== get_value(...parts)) {
						update(element_or_component, ...parts);
						// If this is an effect rerun (cause: each block context changes), then nullify the binding at
						// the previous position if it isn't already taken over by a different effect.
						if (old_parts && is_bound_this(get_value(...old_parts), element_or_component)) {
							update(null, ...old_parts);
						}
					}
				});
			});

			return () => {
				// When the bind:this effect is destroyed, we go up the effect parent chain until we find the last parent effect that is destroyed,
				// or the effect containing the component bind:this is in (whichever comes first). That way we can time the nulling of the binding
				// as close to user/developer expectation as possible.
				// TODO Svelte 6: Decide if we want to keep this logic or just always null the binding in the component effect's teardown
				// (which would be simpler, but less intuitive in some cases, and breaks the `ondestroy-before-cleanup` test)
				let p = parent;
				while (p !== component_effect && p.parent !== null && p.parent.f & DESTROYING) {
					p = p.parent;
				}
				const teardown = () => {
					if (parts && is_bound_this(get_value(...parts), element_or_component)) {
						update(null, ...parts);
					}
				};
				const original_teardown = p.teardown;
				p.teardown = () => {
					teardown();
					original_teardown?.();
				};
			};
		});

		return element_or_component;
	}

	/** @import { ComponentContextLegacy } from '#client' */

	/**
	 * Legacy-mode only: Call `onMount` callbacks and set up `beforeUpdate`/`afterUpdate` effects
	 * @param {boolean} [immutable]
	 */
	function init(immutable = false) {
		const context = /** @type {ComponentContextLegacy} */ (component_context);

		const callbacks = context.l.u;
		if (!callbacks) return;

		let props = () => deep_read_state(context.s);

		if (immutable) {
			let version = 0;
			let prev = /** @type {Record<string, any>} */ ({});

			// In legacy immutable mode, before/afterUpdate only fire if the object identity of a prop changes
			const d = derived(() => {
				let changed = false;
				const props = context.s;
				for (const key in props) {
					if (props[key] !== prev[key]) {
						prev[key] = props[key];
						changed = true;
					}
				}
				if (changed) version++;
				return version;
			});

			props = () => get(d);
		}

		// beforeUpdate
		if (callbacks.b.length) {
			user_pre_effect(() => {
				observe_all(context, props);
				run_all(callbacks.b);
			});
		}

		// onMount (must run before afterUpdate)
		user_effect(() => {
			const fns = untrack(() => callbacks.m.map(run));
			return () => {
				for (const fn of fns) {
					if (typeof fn === 'function') {
						fn();
					}
				}
			};
		});

		// afterUpdate
		if (callbacks.a.length) {
			user_effect(() => {
				observe_all(context, props);
				run_all(callbacks.a);
			});
		}
	}

	/**
	 * Invoke the getter of all signals associated with a component
	 * so they can be registered to the effect this function is called in.
	 * @param {ComponentContextLegacy} context
	 * @param {(() => void)} props
	 */
	function observe_all(context, props) {
		if (context.l.s) {
			for (const signal of context.l.s) get(signal);
		}

		props();
	}

	/** @import { Effect, Source } from './types.js' */

	/**
	 * This function is responsible for synchronizing a possibly bound prop with the inner component state.
	 * It is used whenever the compiler sees that the component writes to the prop, or when it has a default prop_value.
	 * @template V
	 * @param {Record<string, unknown>} props
	 * @param {string} key
	 * @param {number} flags
	 * @param {V | (() => V)} [fallback]
	 * @returns {(() => V | ((arg: V) => V) | ((arg: V, mutation: boolean) => V))}
	 */
	function prop(props, key, flags, fallback) {
		var runes = !legacy_mode_flag || (flags & PROPS_IS_RUNES) !== 0;
		var bindable = (flags & PROPS_IS_BINDABLE) !== 0;
		var lazy = (flags & PROPS_IS_LAZY_INITIAL) !== 0;

		var fallback_value = /** @type {V} */ (fallback);
		var fallback_dirty = true;

		var get_fallback = () => {
			if (fallback_dirty) {
				fallback_dirty = false;

				fallback_value = lazy
					? untrack(/** @type {() => V} */ (fallback))
					: /** @type {V} */ (fallback);
			}

			return fallback_value;
		};

		/** @type {((v: V) => void) | undefined} */
		let setter;

		if (bindable) {
			// Can be the case when someone does `mount(Component, props)` with `let props = $state({...})`
			// or `createClassComponent(Component, props)`
			var is_entry_props = STATE_SYMBOL in props || LEGACY_PROPS in props;

			setter =
				get_descriptor(props, key)?.set ??
				(is_entry_props && key in props ? (v) => (props[key] = v) : undefined);
		}

		/** @type {V} */
		var initial_value;
		var is_store_sub = false;

		if (bindable) {
			[initial_value, is_store_sub] = capture_store_binding(() => /** @type {V} */ (props[key]));
		} else {
			initial_value = /** @type {V} */ (props[key]);
		}

		if (initial_value === undefined && fallback !== undefined) {
			initial_value = get_fallback();

			if (setter) {
				if (runes) props_invalid_value();
				setter(initial_value);
			}
		}

		/** @type {() => V} */
		var getter;

		if (runes) {
			getter = () => {
				var value = /** @type {V} */ (props[key]);
				if (value === undefined) return get_fallback();
				fallback_dirty = true;
				return value;
			};
		} else {
			getter = () => {
				var value = /** @type {V} */ (props[key]);

				if (value !== undefined) {
					// in legacy mode, we don't revert to the fallback value
					// if the prop goes from defined to undefined. The easiest
					// way to model this is to make the fallback undefined
					// as soon as the prop has a value
					fallback_value = /** @type {V} */ (undefined);
				}

				return value === undefined ? fallback_value : value;
			};
		}

		// prop is never written to — we only need a getter
		if (runes && (flags & PROPS_IS_UPDATED) === 0) {
			return getter;
		}

		// prop is written to, but the parent component had `bind:foo` which
		// means we can just call `$$props.foo = value` directly
		if (setter) {
			var legacy_parent = props.$$legacy;
			return /** @type {() => V} */ (
				function (/** @type {V} */ value, /** @type {boolean} */ mutation) {
					if (arguments.length > 0) {
						// We don't want to notify if the value was mutated and the parent is in runes mode.
						// In that case the state proxy (if it exists) should take care of the notification.
						// If the parent is not in runes mode, we need to notify on mutation, too, that the prop
						// has changed because the parent will not be able to detect the change otherwise.
						if (!runes || !mutation || legacy_parent || is_store_sub) {
							/** @type {Function} */ (setter)(mutation ? getter() : value);
						}

						return value;
					}

					return getter();
				}
			);
		}

		// Either prop is written to, but there's no binding, which means we
		// create a derived that we can write to locally.
		// Or we are in legacy mode where we always create a derived to replicate that
		// Svelte 4 did not trigger updates when a primitive value was updated to the same value.
		var overridden = false;

		var d = ((flags & PROPS_IS_IMMUTABLE) !== 0 ? derived : derived_safe_equal)(() => {
			overridden = false;
			return getter();
		});

		// Capture the initial value if it's bindable
		if (bindable) get(d);

		var parent_effect = /** @type {Effect} */ (active_effect);

		return /** @type {() => V} */ (
			function (/** @type {any} */ value, /** @type {boolean} */ mutation) {
				if (arguments.length > 0) {
					const new_value = mutation ? get(d) : runes && bindable ? proxy(value) : value;

					set(d, new_value);
					overridden = true;

					if (fallback_value !== undefined) {
						fallback_value = new_value;
					}

					return value;
				}

				// special case — avoid recalculating the derived if we're in a
				// teardown function and the prop was overridden locally, or the
				// component was already destroyed (people could access props in a timeout)
				if ((is_destroying_effect && overridden) || (parent_effect.f & DESTROYED) !== 0) {
					return d.v;
				}

				return get(d);
			}
		);
	}

	/** @import { ComponentContext, ComponentContextLegacy } from '#client' */
	/** @import { EventDispatcher } from './index.js' */
	/** @import { NotFunction } from './internal/types.js' */

	/**
	 * `onMount`, like [`$effect`](https://svelte.dev/docs/svelte/$effect), schedules a function to run as soon as the component has been mounted to the DOM.
	 * Unlike `$effect`, the provided function only runs once.
	 *
	 * It must be called during the component's initialisation (but doesn't need to live _inside_ the component;
	 * it can be called from an external module). If a function is returned _synchronously_ from `onMount`,
	 * it will be called when the component is unmounted.
	 *
	 * `onMount` functions do not run during [server-side rendering](https://svelte.dev/docs/svelte/svelte-server#render).
	 *
	 * @template T
	 * @param {() => NotFunction<T> | Promise<NotFunction<T>> | (() => any)} fn
	 * @returns {void}
	 */
	function onMount(fn) {
		if (component_context === null) {
			lifecycle_outside_component();
		}

		if (legacy_mode_flag && component_context.l !== null) {
			init_update_callbacks(component_context).m.push(fn);
		} else {
			user_effect(() => {
				const cleanup = untrack(fn);
				if (typeof cleanup === 'function') return /** @type {() => void} */ (cleanup);
			});
		}
	}

	/**
	 * Legacy-mode: Init callbacks object for onMount/beforeUpdate/afterUpdate
	 * @param {ComponentContext} context
	 */
	function init_update_callbacks(context) {
		var l = /** @type {ComponentContextLegacy} */ (context).l;
		return (l.u ??= { a: [], b: [], m: [] });
	}

	// generated during release, do not modify

	const PUBLIC_VERSION = '5';

	if (typeof window !== 'undefined') {
		// @ts-expect-error
		((window.__svelte ??= {}).v ??= new Set()).add(PUBLIC_VERSION);
	}

	enable_legacy_mode_flag();

	var root_1$p = from_html(`<div class="fixed inset-0 z-[999] bg-foreground/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6 animate-fade-in" role="dialog" aria-modal="true" aria-label="Shipping restriction notice"><div class="bg-background w-full md:max-w-md p-8 md:p-10 border-t md:border border-border animate-fade-up"><div class="w-12 h-12 border border-border flex items-center justify-center mb-6"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg></div> <p class="text-label text-muted-foreground mb-2">Shipping Notice</p> <h2 class="text-2xl font-display font-bold mb-3 leading-tight">We Ship Within<br/>South Africa Only</h2> <p class="text-sm text-muted-foreground leading-relaxed mb-8">Currently Others. only ships within South Africa. It looks like you're visiting from outside the country — you're welcome to browse, but orders can only be delivered to South African addresses.</p> <div class="space-y-3"><button class="w-full py-4 bg-foreground text-primary-foreground text-label tracking-[0.2em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">BROWSE THE STORE</button> <p class="text-xs text-center text-muted-foreground">Checkout is restricted to South African addresses.</p></div></div></div>`);

	function GeoBlock($$anchor, $$props) {
		push($$props, false);

		let show = mutable_source(false);

		onMount(async () => {
			// Only check once per session
			if (sessionStorage.getItem('geo-checked')) return;

			try {
				const res = await fetch('https://ipapi.co/country/', { signal: AbortSignal.timeout(4000) });
				const country = (await res.text()).trim();

				sessionStorage.setItem('geo-checked', country);

				if (country !== 'ZA') set(show, true);
			} catch {
				// Network failure → don't block
				sessionStorage.setItem('geo-checked', 'unknown');
			}
		});

		function dismiss() {
			set(show, false);
		}

		init();

		var fragment = comment();
		var node = first_child(fragment);

		{
			var consequent = ($$anchor) => {
				var div = root_1$p();
				var div_1 = child(div);
				var div_2 = sibling(child(div_1), 8);
				var button = child(div_2);
				delegated('click', button, dismiss);
				append($$anchor, div);
			};

			if_block(node, ($$render) => {
				if (get(show)) $$render(consequent);
			});
		}

		append($$anchor, fragment);
		pop();
	}

	delegate(['click']);

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

	    addItem(product, size, quantity = 1) {
	      update(items => {
	        const key = `${product.id}-${size}`;
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

	const cart = createCart();

	const cartCount = derived$1(cart, $cart =>
	  $cart.reduce((sum, i) => sum + i.quantity, 0)
	);

	const cartTotal = derived$1(cart, $cart =>
	  $cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
	);

	/**
	 * Shared data access utility for public pages.
	 * Always fetches from /api/data (MongoDB) — no localStorage, no store.json.
	 */

	let _cache = null;
	let _promise = null;

	/**
	 * Load store data. Caches for the lifetime of the page visit so multiple
	 * component onMounts don't fire redundant requests.
	 * Pass `fresh = true` to bypass cache (e.g. after a write).
	 */
	async function loadStoreData(fresh = false) {
	  if (!fresh && _cache) return _cache;
	  if (!fresh && _promise) return _promise;

	  _promise = fetch('/api/data')
	    .then(r => {
	      if (!r.ok) throw new Error(`Could not load store data: ${r.status}`);
	      return r.json();
	    })
	    .then(d => { _cache = d; _promise = null; return d; })
	    .catch(e => { _promise = null; throw e; });

	  return _promise;
	}

	var root_1$o = from_html(`<img class="h-7 w-auto object-contain"/>`);
	var root_3$p = from_html(`<a class="text-foreground text-label hover:opacity-60 transition-opacity duration-200"> </a>`);
	var root_4$h = from_html(`<span class="absolute -top-2 -right-2 bg-store-rust text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none tabular-nums"> </span>`);
	var root_5$j = from_svg(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`);
	var root_6$h = from_svg(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg>`);
	var root_8$b = from_html(`<a class="block text-foreground text-label py-3 border-b border-border"> </a>`);
	var root_7$c = from_html(`<div class="md:hidden bg-background border-t border-border px-5 pb-6 pt-3 animate-fade-in"><!> <a href="/cart" class="block text-foreground text-label py-3">CART <!></a></div>`);
	var root$l = from_html(`<nav class="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/40"><div class="flex items-center justify-between px-5 md:px-10 py-4 max-w-screen-2xl mx-auto"><a href="/" class="text-foreground font-display text-xl font-bold tracking-tight"><!></a> <div class="hidden md:flex items-center gap-8"></div> <div class="flex items-center gap-5"><a href="/cart" class="relative text-foreground hover:opacity-60 transition-opacity active:scale-95" aria-label="Cart"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg> <!></a> <button class="md:hidden text-foreground hover:opacity-60 transition-opacity active:scale-95" aria-label="Menu"><!></button></div></div> <!></nav>`);

	function Navbar($$anchor, $$props) {
		const $cartCount = () => store_get(cartCount, '$cartCount', $$stores);
		const [$$stores, $$cleanup] = setup_stores();
		let siteName = prop($$props, 'siteName', 8, 'Others.');
		let logo = prop($$props, 'logo', 8, null);

		const navLinks = [
			{ label: 'SHOP', href: '/products' },
			{ label: 'LOOKBOOK', href: '/lookbook' },
			{ label: 'COMMUNITY', href: '/community' },
			{ label: 'SS26', href: '/products' }
		];

		let mobileOpen = mutable_source(false);

		function nav(e, href) {
			e.preventDefault();

			if (window.__navigate) window.__navigate(href);

			set(mobileOpen, false);
		}

		var nav_1 = root$l();
		var div = child(nav_1);
		var a = child(div);
		var node = child(a);

		{
			var consequent = ($$anchor) => {
				var img = root_1$o();

				template_effect(() => {
					set_attribute(img, 'src', logo());
					set_attribute(img, 'alt', siteName());
				});

				append($$anchor, img);
			};

			var alternate = ($$anchor) => {
				var text$1 = text();

				template_effect(() => set_text(text$1, siteName()));
				append($$anchor, text$1);
			};

			if_block(node, ($$render) => {
				if (logo()) $$render(consequent); else $$render(alternate, -1);
			});
		}

		var div_1 = sibling(a, 2);

		each(div_1, 5, () => navLinks, index, ($$anchor, link) => {
			var a_1 = root_3$p();
			var text_1 = child(a_1);

			template_effect(() => {
				set_attribute(a_1, 'href', (get(link), untrack(() => get(link).href)));
				set_text(text_1, (get(link), untrack(() => get(link).label)));
			});

			delegated('click', a_1, (e) => nav(e, get(link).href));
			append($$anchor, a_1);
		});

		var div_2 = sibling(div_1, 2);
		var a_2 = child(div_2);
		var node_1 = sibling(child(a_2), 2);

		{
			var consequent_1 = ($$anchor) => {
				var span = root_4$h();
				var text_2 = child(span);
				template_effect(() => set_text(text_2, $cartCount() > 9 ? '9+' : $cartCount()));
				append($$anchor, span);
			};

			if_block(node_1, ($$render) => {
				if ($cartCount() > 0) $$render(consequent_1);
			});
		}

		var button = sibling(a_2, 2);
		var node_2 = child(button);

		{
			var consequent_2 = ($$anchor) => {
				var svg = root_5$j();

				append($$anchor, svg);
			};

			var alternate_1 = ($$anchor) => {
				var svg_1 = root_6$h();

				append($$anchor, svg_1);
			};

			if_block(node_2, ($$render) => {
				if (get(mobileOpen)) $$render(consequent_2); else $$render(alternate_1, -1);
			});
		}

		var node_3 = sibling(div, 2);

		{
			var consequent_4 = ($$anchor) => {
				var div_3 = root_7$c();
				var node_4 = child(div_3);

				each(node_4, 1, () => navLinks, index, ($$anchor, link) => {
					var a_3 = root_8$b();
					var text_3 = child(a_3);

					template_effect(() => {
						set_attribute(a_3, 'href', (get(link), untrack(() => get(link).href)));
						set_text(text_3, (get(link), untrack(() => get(link).label)));
					});

					delegated('click', a_3, (e) => nav(e, get(link).href));
					append($$anchor, a_3);
				});

				var a_4 = sibling(node_4, 2);
				var node_5 = sibling(child(a_4));

				{
					var consequent_3 = ($$anchor) => {
						var text_4 = text();

						template_effect(() => set_text(text_4, `(${$cartCount() ?? ''})`));
						append($$anchor, text_4);
					};

					if_block(node_5, ($$render) => {
						if ($cartCount() > 0) $$render(consequent_3);
					});
				}
				delegated('click', a_4, (e) => nav(e, '/cart'));
				append($$anchor, div_3);
			};

			if_block(node_3, ($$render) => {
				if (get(mobileOpen)) $$render(consequent_4);
			});
		}
		delegated('click', a, (e) => nav(e, '/'));
		delegated('click', a_2, (e) => nav(e, '/cart'));
		delegated('click', button, () => set(mobileOpen, !get(mobileOpen)));
		append($$anchor, nav_1);
		$$cleanup();
	}

	delegate(['click']);

	var root$k = from_html(`<div class="bg-foreground text-primary-foreground overflow-hidden whitespace-nowrap py-2"><div class="animate-marquee inline-block"><span class="text-label tracking-[0.3em] text-[10px]"> </span> <span class="text-label tracking-[0.3em] text-[10px]"> </span></div></div>`);

	function AnnouncementBar($$anchor, $$props) {
		push($$props, false);

		const repeated = mutable_source();
		let text = prop($$props, 'text', 8, '');

		legacy_pre_effect(() => (deep_read_state(text())), () => {
			set(repeated, Array(8).fill(text() + ' — ').join(''));
		});

		legacy_pre_effect_reset();
		init();

		var div = root$k();
		var div_1 = child(div);
		var span = child(div_1);
		var text_1 = child(span);

		var span_1 = sibling(span, 2);
		var text_2 = child(span_1);

		template_effect(() => {
			set_text(text_1, get(repeated));
			set_text(text_2, get(repeated));
		});

		append($$anchor, div);
		pop();
	}

	var root_1$n = from_html(`<img alt="" class="absolute inset-0 w-full h-full object-cover" aria-hidden="true" loading="eager"/>`);
	var root_2$r = from_html(`<video class="absolute inset-0 w-full h-full object-cover" autoplay="" loop="" playsinline="" aria-hidden="true"><track kind="captions"/></video>`, 2);
	var root_3$o = from_html(`<img alt="Others. collection editorial" class="absolute inset-0 w-full h-full object-cover" loading="eager"/>`);
	var root_4$g = from_html(`<p class="text-label mb-3 opacity-0 animate-fade-up" style="animation-delay:0.3s;color:hsl(40,20%,97%)"> </p>`);
	var root_5$i = from_html(` <br/>`, 1);
	var root_6$g = from_html(`<p class="text-sm md:text-base mb-6 opacity-0 animate-fade-up" style="animation-delay:0.6s;color:hsl(40,20%,97%);opacity:0.85"> </p>`);
	var root_7$b = from_html(`<a class="inline-block border border-[hsl(40,20%,97%)] px-8 py-3 text-label tracking-[0.25em] hover:bg-[hsl(40,20%,97%)] hover:text-foreground transition-all duration-300 opacity-0 animate-fade-up active:scale-[0.97]" style="animation-delay:0.7s;color:hsl(40,20%,97%)"> </a>`);
	var root$j = from_html(`<section class="relative h-screen w-full overflow-hidden"><!> <div class="absolute inset-0 bg-black/20"></div> <div class="absolute inset-0 flex items-end"><div class="px-6 md:px-10 pb-16 md:pb-20 max-w-lg"><!> <h1 class="text-5xl md:text-7xl font-display font-bold leading-[0.9] mb-4 opacity-0 animate-fade-up" style="animation-delay:0.5s;color:hsl(40,20%,97%)"></h1> <!> <!></div></div></section>`);

	function Hero($$anchor, $$props) {
		push($$props, false);

		const words = mutable_source();
		const isVideo = mutable_source();

		let hero = prop($$props, 'hero', 24, () => ({
			label: '',
			heading: '',
			subheading: '',
			cta: '',
			ctaLink: '/products',
			image: '',
			video: ''
		}));

		function nav(e) {
			const href = hero().ctaLink || '/products';

			if (href.startsWith('/') && window.__navigate) {
				e.preventDefault();
				window.__navigate(href);
			}
		}

		legacy_pre_effect(() => (deep_read_state(hero())), () => {
			set(words, hero().heading ? hero().heading.split(' ') : []);
		});

		legacy_pre_effect(() => (deep_read_state(hero())), () => {
			set(isVideo, hero().video && (hero().video.endsWith('.mp4') || hero().video.endsWith('.webm') || hero().video.endsWith('.gif')));
		});

		legacy_pre_effect_reset();
		init();

		var section = root$j();
		var node = child(section);

		{
			var consequent = ($$anchor) => {
				var img = root_1$n();

				template_effect(() => set_attribute(img, 'src', (deep_read_state(hero()), untrack(() => hero().video))));
				append($$anchor, img);
			};

			var d = user_derived(() => (
				get(isVideo),
				deep_read_state(hero()),
				untrack(() => get(isVideo) && hero().video.endsWith('.gif'))
			));

			var consequent_1 = ($$anchor) => {
				var video = root_2$r();

				video.muted = true;
				template_effect(() => set_attribute(video, 'src', (deep_read_state(hero()), untrack(() => hero().video))));
				append($$anchor, video);
			};

			var consequent_2 = ($$anchor) => {
				var img_1 = root_3$o();

				template_effect(() => set_attribute(img_1, 'src', (deep_read_state(hero()), untrack(() => hero().image))));
				append($$anchor, img_1);
			};

			if_block(node, ($$render) => {
				if (get(d)) $$render(consequent); else if (get(isVideo)) $$render(consequent_1, 1); else if ((deep_read_state(hero()), untrack(() => hero().image))) $$render(consequent_2, 2);
			});
		}

		var div = sibling(node, 4);
		var div_1 = child(div);
		var node_1 = child(div_1);

		{
			var consequent_3 = ($$anchor) => {
				var p = root_4$g();
				var text = child(p);
				template_effect(() => set_text(text, (deep_read_state(hero()), untrack(() => hero().label))));
				append($$anchor, p);
			};

			if_block(node_1, ($$render) => {
				if ((deep_read_state(hero()), untrack(() => hero().label))) $$render(consequent_3);
			});
		}

		var h1 = sibling(node_1, 2);

		each(h1, 5, () => get(words), index, ($$anchor, word) => {

			var fragment = root_5$i();
			var text_1 = first_child(fragment, true);
			template_effect(() => set_text(text_1, get(word)));
			append($$anchor, fragment);
		});

		var node_2 = sibling(h1, 2);

		{
			var consequent_4 = ($$anchor) => {
				var p_1 = root_6$g();
				var text_2 = child(p_1);

				template_effect(() => set_text(text_2, (
					deep_read_state(hero()),
					untrack(() => hero().subheading)
				)));

				append($$anchor, p_1);
			};

			if_block(node_2, ($$render) => {
				if ((
					deep_read_state(hero()),
					untrack(() => hero().subheading)
				)) $$render(consequent_4);
			});
		}

		var node_3 = sibling(node_2, 2);

		{
			var consequent_5 = ($$anchor) => {
				var a = root_7$b();
				var text_3 = child(a);

				template_effect(() => {
					set_attribute(a, 'href', (
						deep_read_state(hero()),
						untrack(() => hero().ctaLink || '/products')
					));

					set_text(text_3, (deep_read_state(hero()), untrack(() => hero().cta)));
				});

				delegated('click', a, nav);
				append($$anchor, a);
			};

			if_block(node_3, ($$render) => {
				if ((deep_read_state(hero()), untrack(() => hero().cta))) $$render(consequent_5);
			});
		}
		append($$anchor, section);
		pop();
	}

	delegate(['click']);

	var root_1$m = from_html(`<span class="absolute top-3 left-3 bg-store-rust text-accent-foreground text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium">Sold Out</span>`);
	var root_2$q = from_html(`<span class="absolute top-3 left-3 bg-foreground text-primary-foreground text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium">New</span>`);
	var root_3$n = from_html(`<p class="text-[11px] text-muted-foreground mt-0.5"> </p>`);
	var root$i = from_html(`<div class="group relative cursor-pointer" role="button" tabindex="0"><div class="relative aspect-[3/4] overflow-hidden bg-secondary mb-3"><img class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"/> <!></div> <div><h3 class="text-sm font-medium leading-tight truncate"> </h3> <p class="text-sm text-muted-foreground mt-0.5 tabular-nums"> </p> <!></div></div>`);

	function ProductCard($$anchor, $$props) {
		push($$props, false);

		const primaryImage = mutable_source();
		const hoverImage = mutable_source();
		const isOutOfStock = mutable_source();
		let product = prop($$props, 'product', 8);
		let currency = prop($$props, 'currency', 8, 'R');
		let isHovered = mutable_source(false);

		function goToProduct() {
			if (window.__navigate) window.__navigate(`/products/${product().id}`);
		}

		legacy_pre_effect(() => (deep_read_state(product())), () => {
			set(primaryImage, product().images?.[0] || product().image || '');
		});

		legacy_pre_effect(() => (deep_read_state(product()), get(primaryImage)), () => {
			set(hoverImage, product().images?.[1] || get(primaryImage));
		});

		legacy_pre_effect(() => (deep_read_state(product())), () => {
			set(isOutOfStock, product().stock === 0);
		});

		legacy_pre_effect_reset();
		init();

		var div = root$i();
		var div_1 = child(div);
		var img = child(div_1);
		var node = sibling(img, 2);

		{
			var consequent = ($$anchor) => {
				var span = root_1$m();

				append($$anchor, span);
			};

			var consequent_1 = ($$anchor) => {
				var span_1 = root_2$q();

				append($$anchor, span_1);
			};

			if_block(node, ($$render) => {
				if (get(isOutOfStock)) $$render(consequent); else if ((
					deep_read_state(product()),
					untrack(() => product().isNew)
				)) $$render(consequent_1, 1);
			});
		}

		var div_2 = sibling(div_1, 2);
		var h3 = child(div_2);
		var text = child(h3);

		var p = sibling(h3, 2);
		var text_1 = child(p);

		var node_1 = sibling(p, 2);

		{
			var consequent_2 = ($$anchor) => {
				var p_1 = root_3$n();
				var text_2 = child(p_1);

				template_effect(() => set_text(text_2, `${(
				deep_read_state(product()),
				untrack(() => product().colors.length)
			) ?? ''} colors`));

				append($$anchor, p_1);
			};

			if_block(node_1, ($$render) => {
				if ((
					deep_read_state(product()),
					untrack(() => product().colors?.length > 1)
				)) $$render(consequent_2);
			});
		}

		template_effect(
			($0) => {
				set_attribute(div, 'aria-label', `View ${(
				deep_read_state(product()),
				untrack(() => product().name)
			) ?? ''}`);

				set_attribute(img, 'src', get(isHovered) ? get(hoverImage) : get(primaryImage));

				set_attribute(img, 'alt', (
					deep_read_state(product()),
					untrack(() => product().name)
				));

				set_text(text, (
					deep_read_state(product()),
					untrack(() => product().name)
				));

				set_text(text_1, `${currency() ?? ''}${$0 ?? ''}`);
			},
			[
				() => (
					deep_read_state(product()),
					untrack(() => product().price.toFixed(2))
				)
			]
		);

		event('mouseenter', div, () => set(isHovered, true));
		event('mouseleave', div, () => set(isHovered, false));
		delegated('click', div, goToProduct);
		delegated('keydown', div, (e) => e.key === 'Enter' && goToProduct());
		append($$anchor, div);
		pop();
	}

	delegate(['click', 'keydown']);

	var root_1$l = from_html(`<div><!></div>`);
	var root$h = from_html(`<section id="products" class="px-6 md:px-10 py-20 md:py-32"><div class="flex items-end justify-between mb-12"><div><p class="text-label mb-2">Latest</p> <h2 class="text-3xl md:text-4xl font-display font-bold leading-tight">New Drops</h2></div> <a href="/products" class="text-label hover:text-foreground transition-colors border-b border-current pb-0.5">VIEW ALL</a></div> <div class="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6"></div> <div class="text-center mt-12"><a href="/products" class="inline-block border border-foreground px-10 py-4 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300 active:scale-[0.97]">SHOP ALL PRODUCTS</a></div></section>`);

	function ProductGrid($$anchor, $$props) {
		push($$props, false);

		const featured = mutable_source();
		let products = prop($$props, 'products', 24, () => []);
		let currency = prop($$props, 'currency', 8, '€');

		// Show only featured products, max 6
		let visible = mutable_source(false);

		let ref = mutable_source();

		onMount(() => {
			const observer = new IntersectionObserver(
				([entry]) => {
					if (entry.isIntersecting) set(visible, true);
				},
				{ threshold: 0.1 }
			);

			if (get(ref)) observer.observe(get(ref));

			return () => observer.disconnect();
		});

		function shopAll(e) {
			e.preventDefault();

			if (window.__navigate) window.__navigate('/products');
		}

		legacy_pre_effect(() => (deep_read_state(products())), () => {
			set(featured, products().filter((p) => p.isFeatured).slice(0, 6));
		});

		legacy_pre_effect_reset();
		init();

		var section = root$h();
		var div = child(section);
		var a = sibling(child(div), 2);

		var div_1 = sibling(div, 2);

		each(div_1, 5, () => get(featured), index, ($$anchor, p, i) => {
			var div_2 = root_1$l();

			set_style(div_2, `animation-delay:${i * 0.1}s`);

			var node = child(div_2);

			ProductCard(node, {
				get product() {
					return get(p);
				},

				get currency() {
					return currency();
				}
			});
			template_effect(() => set_class(div_2, 1, clsx(get(visible) ? 'opacity-0 animate-fade-up' : 'opacity-0')));
			append($$anchor, div_2);
		});

		var div_3 = sibling(div_1, 2);
		var a_1 = child(div_3);
		bind_this(section, ($$value) => set(ref, $$value), () => get(ref));
		delegated('click', a, shopAll);
		delegated('click', a_1, shopAll);
		append($$anchor, section);
		pop();
	}

	delegate(['click']);

	var root_1$k = from_html(`<div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"><a style="animation-delay:0.15s"><img class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy"/> <div class="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent"><span class="text-label text-white group-hover:underline underline-offset-4">VIEW LOOKBOOK</span></div></a> <a style="animation-delay:0.25s"><img class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy"/> <div class="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent"><span class="text-label text-white group-hover:underline underline-offset-4">EXPLORE</span></div></a></div>`);
	var root_3$m = from_html(`<a href="/lookbook"><img alt="Lookbook" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy"/> <div class="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent"><span class="text-label text-white group-hover:underline underline-offset-4"></span></div></a>`);
	var root_2$p = from_html(`<div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"></div>`);
	var root$g = from_html(`<section class="px-6 md:px-10 pb-20 md:pb-32"><div><p class="text-label mb-2">Editorial</p> <h2 class="text-3xl md:text-4xl font-display font-bold leading-tight"> </h2></div> <!> <div style="animation-delay:0.35s"><a href="/lookbook" class="inline-block border border-foreground px-10 py-4 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300 active:scale-[0.97]">EXPLORE FULL LOOKBOOK</a></div></section>`);

	function LookbookSection($$anchor, $$props) {
		push($$props, false);

		const lb = mutable_source();
		const images = mutable_source();
		const primary = mutable_source();
		const secondary = mutable_source();
		const lbPath = mutable_source();
		let lookbook = prop($$props, 'lookbook', 8, null // single lookbook object from parent
		);
		let allLookbooks = prop($$props, 'allLookbooks', 24, () => []);
		let visible = mutable_source(false);
		let ref = mutable_source();

		onMount(() => {
			const observer = new IntersectionObserver(
				([entry]) => {
					if (entry.isIntersecting) set(visible, true);
				},
				{ threshold: 0.15 }
			);

			if (get(ref)) observer.observe(get(ref));

			return () => observer.disconnect();
		});

		function goTo(path, e) {
			e?.preventDefault();

			if (window.__navigate) window.__navigate(path);
		}

		legacy_pre_effect(
			() => (
				deep_read_state(lookbook()),
				deep_read_state(allLookbooks())
			),
			() => {
				set(lb, lookbook() || allLookbooks()[0] || null);
			}
		);

		legacy_pre_effect(() => (get(lb)), () => {
			set(images, get(lb)
				? get(lb).images || [get(lb).cover].filter(Boolean)
				: []);
		});

		legacy_pre_effect(() => (get(images)), () => {
			set(primary, get(images)[0] || '');
		});

		legacy_pre_effect(() => (get(images)), () => {
			set(secondary, get(images)[1] || get(images)[0] || '');
		});

		legacy_pre_effect(() => (get(lb)), () => {
			set(lbPath, get(lb) ? `/lookbook/${get(lb).id}` : '/lookbook');
		});

		legacy_pre_effect_reset();
		init();

		var section = root$g();
		var div = child(section);
		var h2 = sibling(child(div), 2);
		var text = child(h2);

		var node = sibling(div, 2);

		{
			var consequent = ($$anchor) => {
				var div_1 = root_1$k();
				var a = child(div_1);
				var img = child(a);

				var a_1 = sibling(a, 2);
				var img_1 = child(a_1);

				template_effect(() => {
					set_attribute(a, 'href', get(lbPath));
					set_class(a, 1, `relative aspect-square md:aspect-[3/4] overflow-hidden group ${get(visible) ? 'opacity-0 animate-fade-up' : 'opacity-0'}`);
					set_attribute(img, 'src', get(primary));
					set_attribute(img, 'alt', (get(lb), untrack(() => get(lb).title)));
					set_attribute(a_1, 'href', get(lbPath));
					set_class(a_1, 1, `relative aspect-square md:aspect-[3/4] overflow-hidden group ${get(visible) ? 'opacity-0 animate-fade-up' : 'opacity-0'}`);
					set_attribute(img_1, 'src', get(secondary));
					set_attribute(img_1, 'alt', `${(get(lb), untrack(() => get(lb).title)) ?? ''} — behind the scenes`);
				});

				delegated('click', a, (e) => goTo(get(lbPath), e));
				delegated('click', a_1, (e) => goTo(get(lbPath), e));
				append($$anchor, div_1);
			};

			var alternate = ($$anchor) => {
				var div_2 = root_2$p();

				each(div_2, 4, () => ['/images/lookbook-1.jpg', '/images/lookbook-2.jpg'], index, ($$anchor, src, i) => {
					var a_2 = root_3$m();

					set_style(a_2, `animation-delay:${0.15 + i * 0.1}s`);

					var img_2 = child(a_2);
					var div_3 = sibling(img_2, 2);
					var span = child(div_3);

					span.textContent = i === 0 ? 'VIEW LOOKBOOK' : 'EXPLORE';

					template_effect(() => {
						set_class(a_2, 1, `relative aspect-square md:aspect-[3/4] overflow-hidden group ${get(visible) ? 'opacity-0 animate-fade-up' : 'opacity-0'}`);
						set_attribute(img_2, 'src', src);
					});

					delegated('click', a_2, (e) => goTo('/lookbook', e));
					append($$anchor, a_2);
				});
				append($$anchor, div_2);
			};

			if_block(node, ($$render) => {
				if (get(lb) && (get(primary) || get(secondary))) $$render(consequent); else $$render(alternate, -1);
			});
		}

		var div_4 = sibling(node, 2);
		var a_3 = child(div_4);
		bind_this(section, ($$value) => set(ref, $$value), () => get(ref));

		template_effect(() => {
			set_class(div, 1, `mb-12 ${get(visible) ? 'opacity-0 animate-fade-up' : 'opacity-0'}`);

			set_text(text, (
				get(lb),
				untrack(() => get(lb) ? get(lb).title : 'Lookbook')
			));

			set_class(div_4, 1, `text-center mt-10 ${get(visible) ? 'opacity-0 animate-fade-up' : 'opacity-0'}`);
		});

		delegated('click', a_3, (e) => goTo('/lookbook', e));
		append($$anchor, section);
		pop();
	}

	delegate(['click']);

	var root_2$o = from_html(`<li><a class="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors duration-200"> </a></li>`);
	var root_1$j = from_html(`<div><p class="text-label text-primary-foreground/40 mb-4"> </p> <ul class="space-y-2.5"></ul></div>`);
	var root_3$l = from_html(`<div class="flex items-center gap-2 text-sm text-primary-foreground/70"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"></path></svg> You're subscribed!</div>`);
	var root_4$f = from_html(`<p class="text-sm text-primary-foreground/50">Already subscribed.</p>`);
	var root_6$f = from_html(`<p class="text-xs text-red-400">Something went wrong. Try again.</p>`);
	var root_5$h = from_html(`<div class="flex w-full md:w-auto flex-col gap-1"><div class="flex"><input type="email" placeholder="Email address" class="bg-transparent border border-primary-foreground/20 px-4 py-3 text-sm text-primary-foreground placeholder:text-primary-foreground/30 flex-1 md:w-64 focus:outline-none focus:border-primary-foreground/50 transition-colors"/> <button class="bg-primary-foreground text-foreground px-6 py-3 text-label tracking-[0.2em] hover:bg-primary-foreground/90 transition-colors active:scale-[0.97] disabled:opacity-60"> </button></div> <!></div>`);
	var root_7$a = from_html(`<a target="_blank" rel="noopener noreferrer" class="text-xs text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors capitalize"> </a>`);
	var root$f = from_html(`<footer class="bg-foreground text-primary-foreground px-6 md:px-10 pt-16 pb-8"><div class="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16"><div class="col-span-2 md:col-span-1"><h3 class="font-display text-2xl font-bold mb-4"> </h3> <p class="text-sm text-primary-foreground/60 max-w-xs leading-relaxed"> </p></div> <!></div> <div class="border-t border-primary-foreground/10 pt-10 pb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"><div><p class="text-label text-primary-foreground/40 mb-2">NEWSLETTER</p> <p class="text-sm text-primary-foreground/60">Sign up for drops, exclusives &amp; community news.</p></div> <!></div> <div class="border-t border-primary-foreground/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4"><p class="text-xs text-primary-foreground/30"> </p> <div class="flex gap-6"></div></div></footer>`);

	function Footer($$anchor, $$props) {
		push($$props, false);

		const socials = mutable_source();
		let site = prop($$props, 'site', 24, () => ({}));

		const footerLinks = {
			Shop: [
				{ label: 'New Arrivals', href: '/products' },
				{ label: 'Hoodies', href: '/products' },
				{ label: 'T-Shirts', href: '/products' },
				{ label: 'Pants', href: '/products' },
				{ label: 'Jackets', href: '/products' },
				{ label: 'Accessories', href: '/products' }
			],
			Brand: [
				{ label: 'Community', href: '/community' },
				{ label: 'Lookbook', href: '/lookbook' },
				{ label: 'Contact', href: '/contact' }
			],
			Help: [
				{ label: 'Shipping & Returns', href: '/shipping-returns' },
				{ label: 'FAQ', href: '/faq' },
				{ label: 'Contact', href: '/contact' }
			]
		};

		let email = mutable_source('');
		let subState = mutable_source('idle' // 'idle' | 'loading' | 'done' | 'error' | 'exists'
		);

		async function subscribe() {
			if (!get(email) || get(subState) === 'loading') return;

			set(subState, 'loading');

			try {
				const res = await fetch('/api/newsletter', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: get(email) })
				});

				const data = await res.json();

				if (!res.ok) {
					set(subState, 'error');

					return;
				}

				set(subState, data.already ? 'exists' : 'done');

				if (get(subState) === 'done') set(email, '');
			} catch {
				set(subState, 'error');
			}
		}

		function nav(e, href) {
			e.preventDefault();

			if (window.__navigate) window.__navigate(href);
		}

		legacy_pre_effect(() => (deep_read_state(site())), () => {
			set(socials, site().socials ? Object.entries(site().socials) : []);
		});

		legacy_pre_effect_reset();
		init();

		var footer = root$f();
		var div = child(footer);
		var div_1 = child(div);
		var h3 = child(div_1);
		var text = child(h3);

		var p = sibling(h3, 2);
		var text_1 = child(p);

		var node = sibling(div_1, 2);

		each(node, 1, () => (untrack(() => Object.entries(footerLinks))), index, ($$anchor, $$item) => {
			var $$array = user_derived(() => to_array(get($$item), 2));
			let title = () => get($$array)[0];
			let links = () => get($$array)[1];
			var div_2 = root_1$j();
			var p_1 = child(div_2);
			var text_2 = child(p_1);

			var ul = sibling(p_1, 2);

			each(ul, 5, links, index, ($$anchor, link) => {
				var li = root_2$o();
				var a = child(li);
				var text_3 = child(a);

				template_effect(() => {
					set_attribute(a, 'href', (get(link), untrack(() => get(link).href)));
					set_text(text_3, (get(link), untrack(() => get(link).label)));
				});

				delegated('click', a, (e) => nav(e, get(link).href));
				append($$anchor, li);
			});
			template_effect(($0) => set_text(text_2, $0), [() => (title(), untrack(() => title().toUpperCase()))]);
			append($$anchor, div_2);
		});

		var div_3 = sibling(div, 2);
		var node_1 = sibling(child(div_3), 2);

		{
			var consequent = ($$anchor) => {
				var div_4 = root_3$l();

				append($$anchor, div_4);
			};

			var consequent_1 = ($$anchor) => {
				var p_2 = root_4$f();

				append($$anchor, p_2);
			};

			var alternate = ($$anchor) => {
				var div_5 = root_5$h();
				var div_6 = child(div_5);
				var input = child(div_6);

				var button = sibling(input, 2);
				var text_4 = child(button);

				var node_2 = sibling(div_6, 2);

				{
					var consequent_2 = ($$anchor) => {
						var p_3 = root_6$f();

						append($$anchor, p_3);
					};

					if_block(node_2, ($$render) => {
						if (get(subState) === 'error') $$render(consequent_2);
					});
				}

				template_effect(() => {
					button.disabled = get(subState) === 'loading';
					set_text(text_4, get(subState) === 'loading' ? '…' : 'JOIN');
				});

				delegated('keydown', input, (e) => e.key === 'Enter' && subscribe());
				bind_value(input, () => get(email), ($$value) => set(email, $$value));
				delegated('click', button, subscribe);
				append($$anchor, div_5);
			};

			if_block(node_1, ($$render) => {
				if (get(subState) === 'done') $$render(consequent); else if (get(subState) === 'exists') $$render(consequent_1, 1); else $$render(alternate, -1);
			});
		}

		var div_7 = sibling(div_3, 2);
		var p_4 = child(div_7);
		var text_5 = child(p_4);

		var div_8 = sibling(p_4, 2);

		each(div_8, 5, () => get(socials), index, ($$anchor, $$item) => {
			var $$array_1 = user_derived(() => to_array(get($$item), 2));
			let name = () => get($$array_1)[0];
			let href = () => get($$array_1)[1];
			var a_1 = root_7$a();
			var text_6 = child(a_1);

			template_effect(() => {
				set_attribute(a_1, 'href', href());
				set_text(text_6, name());
			});

			append($$anchor, a_1);
		});

		template_effect(() => {
			set_text(text, (deep_read_state(site()), untrack(() => site().name)));

			set_text(text_1, (
				deep_read_state(site()),
				untrack(() => site().description)
			));

			set_text(text_5, `© 2026 ${(deep_read_state(site()), untrack(() => site().name)) ?? ''} All rights reserved.`);
		});

		append($$anchor, footer);
		pop();
	}

	delegate(['click', 'keydown']);

	var root_1$i = from_html(`<meta name="description"/>`);
	var root_2$n = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_3$k = from_html(`<div class="min-h-screen"><!> <!> <!> <!> <!> <!></div>`);

	function Index($$anchor, $$props) {
		push($$props, false);

		const featuredId = mutable_source();
		const allLookbooks = mutable_source();
		const featuredLookbook = mutable_source();
		let data = mutable_source(null);
		let loading = mutable_source(true);

		onMount(async () => {
			try {
				set(data, await loadStoreData());
			} catch(e) {
				console.error(e);
			} finally {
				set(loading, false);
			}
		});

		legacy_pre_effect(() => (get(data)), () => {
			set(featuredId, get(data)?.site?.featuredLookbook);
		});

		legacy_pre_effect(() => (get(data)), () => {
			set(allLookbooks, get(data)?.lookbooks ?? []);
		});

		legacy_pre_effect(() => (get(featuredId), get(allLookbooks)), () => {
			set(featuredLookbook, get(featuredId)
				? get(allLookbooks).find((lb) => lb.id === get(featuredId)) || get(allLookbooks)[0] || null
				: get(allLookbooks)[0] || null);
		});

		legacy_pre_effect_reset();
		init();

		var fragment = comment();

		head('1oaxlqy', ($$anchor) => {
			var meta = root_1$i();

			template_effect(() => set_attribute(meta, 'content', (
				get(data),
				untrack(() => get(data)
					? get(data).site.description
					: 'Streetwear rooted in culture, built for everyone else.')
			)));

			deferred_template_effect(() => {
				$document.title = (
					get(data),
					untrack(() => get(data) ? get(data).site.name : 'Others.')
				) ?? '';
			});

			append($$anchor, meta);
		});

		var node = first_child(fragment);

		{
			var consequent = ($$anchor) => {
				var div = root_2$n();

				append($$anchor, div);
			};

			var alternate = ($$anchor) => {
				var div_1 = root_3$k();
				var node_1 = child(div_1);

				Navbar(node_1, {
					get siteName() {
						return (get(data), untrack(() => get(data).site.name));
					},

					get logo() {
						return (get(data), untrack(() => get(data).site.logo));
					}
				});

				var node_2 = sibling(node_1, 2);

				Hero(node_2, {
					get hero() {
						return (get(data), untrack(() => get(data).site.hero));
					}
				});

				var node_3 = sibling(node_2, 2);

				AnnouncementBar(node_3, {
					get text() {
						return (get(data), untrack(() => get(data).site.announcement));
					}
				});

				var node_4 = sibling(node_3, 2);

				ProductGrid(node_4, {
					get products() {
						return (get(data), untrack(() => get(data).products));
					},

					get currency() {
						return (get(data), untrack(() => get(data).site.currency));
					}
				});

				var node_5 = sibling(node_4, 2);

				LookbookSection(node_5, {
					get lookbook() {
						return get(featuredLookbook);
					},

					get allLookbooks() {
						return get(allLookbooks);
					}
				});

				var node_6 = sibling(node_5, 2);

				Footer(node_6, {
					get site() {
						return (get(data), untrack(() => get(data).site));
					}
				});
				append($$anchor, div_1);
			};

			if_block(node, ($$render) => {
				if (get(loading) || !get(data)) $$render(consequent); else $$render(alternate, -1);
			});
		}

		append($$anchor, fragment);
		pop();
	}

	var root_1$h = from_html(`<button><!> </button>`);
	var root_2$m = from_html(`<button class="fixed inset-0 bg-foreground/50 z-40 md:hidden w-full h-full cursor-default" aria-label="Close sidebar overlay"></button>`);
	var root$e = from_html(`<div class="min-h-screen bg-background flex"><aside><div class="flex items-center justify-between px-5 py-4 border-b border-primary-foreground/10"><span class="font-display text-base font-bold">Others. Admin</span> <button class="md:hidden text-primary-foreground/60 hover:text-primary-foreground" aria-label="Close sidebar"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div> <nav class="px-2 py-3 space-y-0.5"></nav> <div class="absolute bottom-0 left-0 right-0 px-2 py-3 border-t border-primary-foreground/10"><a href="/" class="flex items-center gap-2.5 px-3 py-2 text-[11px] tracking-[0.1em] uppercase font-medium text-primary-foreground/50 hover:text-primary-foreground transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg> Back to Store</a></div></aside> <!> <main class="flex-1 md:ml-56"><header class="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border px-6 py-3 flex items-center gap-4"><button class="md:hidden text-foreground" aria-label="Open sidebar"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg></button> <h1 class="text-sm font-medium text-foreground capitalize"> </h1></header> <div class="p-6 md:p-8"><!></div></main></div>`);

	function AdminLayout($$anchor, $$props) {
		push($$props, false);

		let activeSection = prop($$props, 'activeSection', 8, 'dashboard');
		let navigate = prop($$props, 'navigate', 8, () => {});
		let sidebarOpen = mutable_source(false);

		const sidebarItems = [
			{ key: 'dashboard', label: 'Dashboard' },
			{ key: 'products', label: 'Products' },
			{ key: 'orders', label: 'Orders' },
			{ key: 'lookbook', label: 'Lookbook' },
			{ key: 'community', label: 'Community' },
			{ key: 'pages', label: 'Pages' },
			{ key: 'subscribers', label: 'Subscribers' },
			{ key: 'settings', label: 'Settings' }
		];

		const icons = {
			dashboard: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
			products: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
			orders: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
			lookbook: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
			community: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
			pages: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
			settings: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
			subscribers: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`
		};

		function goTo(key) {
			navigate()(key);
			set(sidebarOpen, false);
		}

		init();

		var div = root$e();
		var aside = child(div);
		var div_1 = child(aside);
		var button = sibling(child(div_1), 2);

		var nav = sibling(div_1, 2);

		each(nav, 5, () => sidebarItems, index, ($$anchor, item) => {
			const isActive = derived_safe_equal(() => (
				deep_read_state(activeSection()),
				get(item),
				untrack(() => activeSection() === get(item).key)
			));

			var button_1 = root_1$h();
			var node = child(button_1);

			html(node, () => (get(item), untrack(() => icons[get(item).key])));

			var text = sibling(node);

			template_effect(() => {
				set_class(button_1, 1, `w-full flex items-center gap-2.5 px-3 py-2 text-[11px] tracking-[0.1em] uppercase font-medium transition-colors text-left ${get(isActive)
				? 'bg-primary-foreground/10 text-primary-foreground'
				: 'text-primary-foreground/50 hover:text-primary-foreground hover:bg-primary-foreground/5'}`);

				set_text(text, ` ${(get(item), untrack(() => get(item).label)) ?? ''}`);
			});

			delegated('click', button_1, () => goTo(get(item).key));
			append($$anchor, button_1);
		});

		var node_1 = sibling(aside, 2);

		{
			var consequent = ($$anchor) => {
				var button_2 = root_2$m();

				delegated('click', button_2, () => set(sidebarOpen, false));
				append($$anchor, button_2);
			};

			if_block(node_1, ($$render) => {
				if (get(sidebarOpen)) $$render(consequent);
			});
		}

		var main = sibling(node_1, 2);
		var header = child(main);
		var button_3 = child(header);
		var h1 = sibling(button_3, 2);
		var text_1 = child(h1);

		var div_2 = sibling(header, 2);
		var node_2 = child(div_2);

		slot(node_2, $$props, 'default', {});

		template_effect(
			($0) => {
				set_class(aside, 1, `fixed inset-y-0 left-0 z-50 w-56 bg-foreground text-primary-foreground transform transition-transform duration-300 md:translate-x-0 ${get(sidebarOpen) ? 'translate-x-0' : '-translate-x-full'}`);
				set_text(text_1, $0);
			},
			[
				() => (
					deep_read_state(activeSection()),
					untrack(() => sidebarItems.find((i) => i.key === activeSection())?.label ?? 'Admin')
				)
			]
		);

		delegated('click', button, () => set(sidebarOpen, false));
		delegated('click', button_3, () => set(sidebarOpen, true));
		append($$anchor, div);
		pop();
	}

	delegate(['click']);

	var root_1$g = from_html(`<tr class="border-b border-border/50 hover:bg-muted/50 transition-colors"><td class="p-3 font-medium tabular-nums"> </td><td class="p-3 text-muted-foreground"> </td><td class="p-3"><span> </span></td><td class="p-3 text-right tabular-nums"> </td></tr>`);
	var root_3$j = from_html(`<div class="flex items-center justify-between bg-card border border-border p-3"><div class="flex items-center gap-3"><img class="w-10 h-10 object-cover bg-secondary"/> <span class="text-sm font-medium"> </span></div> <span> </span></div>`);
	var root_2$l = from_html(`<div><h3 class="text-lg font-display font-bold mb-4">Stock Alerts</h3> <div class="space-y-2"></div></div>`);
	var root$d = from_html(`<div class="space-y-8"><div><h2 class="text-2xl font-display font-bold mb-1">Dashboard</h2> <p class="text-sm text-muted-foreground">Overview of your store performance.</p></div> <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><div class="bg-card border border-border p-5 hover:shadow-md transition-shadow duration-200"><div class="flex items-start justify-between mb-3"><span class="text-label">REVENUE</span> <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><line x1="12" x2="12" y1="2" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg></div> <p class="text-2xl font-display font-bold text-foreground tabular-nums"> </p> <p class="text-xs text-muted-foreground mt-1">All time</p></div> <div class="bg-card border border-border p-5 hover:shadow-md transition-shadow duration-200"><div class="flex items-start justify-between mb-3"><span class="text-label">ORDERS</span> <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg></div> <p class="text-2xl font-display font-bold text-foreground tabular-nums"> </p> <p class="text-xs text-muted-foreground mt-1"> </p></div> <div class="bg-card border border-border p-5 hover:shadow-md transition-shadow duration-200"><div class="flex items-start justify-between mb-3"><span class="text-label">PRODUCTS</span> <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="m7.5 4.27 9 5.15"></path><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg></div> <p class="text-2xl font-display font-bold text-foreground tabular-nums"> </p> <p class="text-xs text-muted-foreground mt-1"> </p></div> <div class="bg-card border border-border p-5 hover:shadow-md transition-shadow duration-200"><div class="flex items-start justify-between mb-3"><span class="text-label">LOW STOCK</span> <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg></div> <p class="text-2xl font-display font-bold text-foreground tabular-nums"> </p> <p class="text-xs text-muted-foreground mt-1">Items below 10 units</p></div></div> <div><h3 class="text-lg font-display font-bold mb-4">Recent Orders</h3> <div class="bg-card border border-border overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-border"><th class="text-left text-label p-3">ORDER</th><th class="text-left text-label p-3">CUSTOMER</th><th class="text-left text-label p-3">STATUS</th><th class="text-right text-label p-3">TOTAL</th></tr></thead><tbody></tbody></table></div></div> <!></div>`);

	function AdminDashboard($$anchor, $$props) {
		push($$props, false);

		const totalRevenue = mutable_source();
		const totalProducts = mutable_source();
		const totalOrders = mutable_source();
		const lowStock = mutable_source();
		const outOfStock = mutable_source();
		const pendingOrders = mutable_source();
		const recentOrders = mutable_source();
		const stockAlerts = mutable_source();
		let data = prop($$props, 'data', 24, () => ({ site: {}, products: [], orders: [] }));

		function statusClass(status) {
			if (status === 'shipped' || status === 'delivered') return 'bg-green-100 text-green-700';
			if (status === 'processing') return 'bg-yellow-100 text-yellow-700';
			if (status === 'cancelled') return 'bg-red-100 text-red-700';

			return 'bg-orange-100 text-orange-700';
		}

		legacy_pre_effect(() => (deep_read_state(data())), () => {
			set(totalRevenue, data().orders.reduce((sum, o) => sum + o.total, 0));
		});

		legacy_pre_effect(() => (deep_read_state(data())), () => {
			set(totalProducts, data().products.length);
		});

		legacy_pre_effect(() => (deep_read_state(data())), () => {
			set(totalOrders, data().orders.length);
		});

		legacy_pre_effect(() => (deep_read_state(data())), () => {
			set(lowStock, data().products.filter((p) => p.stock > 0 && p.stock <= 10).length);
		});

		legacy_pre_effect(() => (deep_read_state(data())), () => {
			set(outOfStock, data().products.filter((p) => p.stock === 0).length);
		});

		legacy_pre_effect(() => (deep_read_state(data())), () => {
			set(pendingOrders, data().orders.filter((o) => o.status === 'pending').length);
		});

		legacy_pre_effect(() => (deep_read_state(data())), () => {
			set(recentOrders, data().orders.slice(0, 5));
		});

		legacy_pre_effect(() => (deep_read_state(data())), () => {
			set(stockAlerts, data().products.filter((p) => p.stock <= 10));
		});

		legacy_pre_effect_reset();
		init();

		var div = root$d();
		var div_1 = sibling(child(div), 2);
		var div_2 = child(div_1);
		var p_1 = sibling(child(div_2), 2);
		var text = child(p_1);

		var div_3 = sibling(div_2, 2);
		var p_2 = sibling(child(div_3), 2);
		var text_1 = child(p_2);

		var p_3 = sibling(p_2, 2);
		var text_2 = child(p_3);

		var div_4 = sibling(div_3, 2);
		var p_4 = sibling(child(div_4), 2);
		var text_3 = child(p_4);

		var p_5 = sibling(p_4, 2);
		var text_4 = child(p_5);

		var div_5 = sibling(div_4, 2);
		var p_6 = sibling(child(div_5), 2);
		var text_5 = child(p_6);

		var div_6 = sibling(div_1, 2);
		var div_7 = sibling(child(div_6), 2);
		var table = child(div_7);
		var tbody = sibling(child(table));

		each(tbody, 5, () => get(recentOrders), index, ($$anchor, order) => {
			var tr = root_1$g();
			var td = child(tr);
			var text_6 = child(td);

			var td_1 = sibling(td);
			var text_7 = child(td_1);

			var td_2 = sibling(td_1);
			var span = child(td_2);
			var text_8 = child(span);

			var td_3 = sibling(td_2);
			var text_9 = child(td_3);

			template_effect(
				($0, $1) => {
					set_text(text_6, (get(order), untrack(() => get(order).id)));
					set_text(text_7, (get(order), untrack(() => get(order).customer)));
					set_class(span, 1, `inline-block text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 font-medium ${$0 ?? ''}`);
					set_text(text_8, (get(order), untrack(() => get(order).status)));
					set_text(text_9, `R${$1 ?? ''}`);
				},
				[
					() => (
						get(order),
						untrack(() => statusClass(get(order).status))
					),

					() => (
						get(order),
						untrack(() => get(order).total.toFixed(2).replace('.', ','))
					)
				]
			);

			append($$anchor, tr);
		});

		var node = sibling(div_6, 2);

		{
			var consequent = ($$anchor) => {
				var div_8 = root_2$l();
				var div_9 = sibling(child(div_8), 2);

				each(div_9, 5, () => get(stockAlerts), index, ($$anchor, p) => {
					var div_10 = root_3$j();
					var div_11 = child(div_10);
					var img = child(div_11);
					var span_1 = sibling(img, 2);
					var text_10 = child(span_1);

					var span_2 = sibling(div_11, 2);
					var text_11 = child(span_2);

					template_effect(() => {
						set_attribute(img, 'src', (get(p), untrack(() => get(p).image)));
						set_attribute(img, 'alt', (get(p), untrack(() => get(p).name)));
						set_text(text_10, (get(p), untrack(() => get(p).name)));

						set_class(span_2, 1, `text-sm tabular-nums font-medium ${(
						get(p),
						untrack(() => get(p).stock === 0 ? 'text-destructive' : 'text-orange-600')
					) ?? ''}`);

						set_text(text_11, (
							get(p),
							untrack(() => get(p).stock === 0 ? 'Out of stock' : `${get(p).stock} left`)
						));
					});

					append($$anchor, div_10);
				});
				append($$anchor, div_8);
			};

			if_block(node, ($$render) => {
				if ((
					get(stockAlerts),
					untrack(() => get(stockAlerts).length > 0)
				)) $$render(consequent);
			});
		}

		template_effect(
			($0) => {
				set_text(text, `R${$0 ?? ''}`);
				set_text(text_1, get(totalOrders));
				set_text(text_2, `${get(pendingOrders) ?? ''} pending`);
				set_text(text_3, get(totalProducts));
				set_text(text_4, `${get(outOfStock) ?? ''} out of stock`);
				set_text(text_5, get(lowStock));
			},
			[
				() => (
					get(totalRevenue),
					untrack(() => get(totalRevenue).toFixed(2).replace('.', ','))
				)
			]
		);

		append($$anchor, div);
		pop();
	}

	var root_1$f = from_html(`<p class="text-label"> </p>`);
	var root_2$k = from_html(`<div class="w-5 h-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mb-2"></div> <span class="text-xs text-muted-foreground">Uploading…</span>`, 1);
	var root_3$i = from_html(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mb-2 text-muted-foreground"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line></svg> <span class="text-xs text-muted-foreground"> </span>`, 1);
	var root_4$e = from_html(`<p class="text-xs text-destructive"> </p>`);
	var root_5$g = from_html(`<div class="relative w-24 h-24 border border-border"><img alt="Preview" class="w-full h-full object-cover"/> <button aria-label="Remove image" class="absolute top-0.5 right-0.5 bg-background text-foreground p-0.5 hover:bg-destructive hover:text-white transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>`);
	var root_7$9 = from_html(`<div class="relative w-20 h-20 border border-border flex-shrink-0"><img alt="Preview" class="w-full h-full object-cover"/> <button aria-label="Remove image" class="absolute top-0.5 right-0.5 bg-background text-foreground p-0.5 hover:bg-destructive hover:text-white transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>`);
	var root_6$e = from_html(`<div class="flex flex-wrap gap-2"></div>`);
	var root$c = from_html(`<div class="space-y-3"><!> <label class="flex flex-col items-center justify-center w-full border border-dashed border-border px-4 py-6 cursor-pointer hover:bg-muted/50 transition-colors"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden"/> <!></label> <!> <!> <!></div>`);

	function ImageUpload($$anchor, $$props) {
		push($$props, false);

		// Props
		let value = prop($$props, 'value', 12, '' // single URL (single mode)
		);

		let values = prop($$props, 'values', 28, () => []); // array of URLs (multi mode)
		let multi = prop($$props, 'multi', 8, false // enable multi-image mode
		);
		let label = prop($$props, 'label', 8, 'Upload Image');
		let onChange = prop($$props, 'onChange', 8, () => {} // called with (url) or ([...urls])
		);
		let uploading = mutable_source(false);
		let error = mutable_source('');

		async function handleFiles(files) {
			if (!files.length) return;

			set(uploading, true);
			set(error, '');

			try {
				if (multi()) {
					const fd = new FormData();

					Array.from(files).forEach((f) => fd.append('images', f));

					const res = await fetch('/api/upload/multi', { method: 'POST', body: fd });

					if (!res.ok) throw new Error('Upload failed');

					const { urls } = await res.json();

					values([...values(), ...urls]);
					onChange()(values());
				} else {
					const fd = new FormData();

					fd.append('image', files[0]);

					const res = await fetch('/api/upload', { method: 'POST', body: fd });

					if (!res.ok) throw new Error('Upload failed');

					const { url } = await res.json();

					value(url);
					onChange()(url);
				}
			} catch(e) {
				set(error, e.message);
			} finally {
				set(uploading, false);
			}
		}

		function removeImage(url) {
			values(values().filter((v) => v !== url));
			onChange()(values());
		}

		function handleDrop(e) {
			e.preventDefault();
			handleFiles(e.dataTransfer.files);
		}

		init();

		var div = root$c();
		var node = child(div);

		{
			var consequent = ($$anchor) => {
				var p = root_1$f();
				var text = child(p);
				template_effect(() => set_text(text, label()));
				append($$anchor, p);
			};

			if_block(node, ($$render) => {
				if (label()) $$render(consequent);
			});
		}

		var label_1 = sibling(node, 2);
		var input = child(label_1);
		var node_1 = sibling(input, 2);

		{
			var consequent_1 = ($$anchor) => {
				var fragment = root_2$k();
				append($$anchor, fragment);
			};

			var alternate = ($$anchor) => {
				var fragment_1 = root_3$i();
				var span = sibling(first_child(fragment_1), 2);
				var text_1 = child(span);
				template_effect(() => set_text(text_1, `Drop image${multi() ? 's' : ''} or click to browse`));
				append($$anchor, fragment_1);
			};

			if_block(node_1, ($$render) => {
				if (get(uploading)) $$render(consequent_1); else $$render(alternate, -1);
			});
		}

		var node_2 = sibling(label_1, 2);

		{
			var consequent_2 = ($$anchor) => {
				var p_1 = root_4$e();
				var text_2 = child(p_1);
				template_effect(() => set_text(text_2, get(error)));
				append($$anchor, p_1);
			};

			if_block(node_2, ($$render) => {
				if (get(error)) $$render(consequent_2);
			});
		}

		var node_3 = sibling(node_2, 2);

		{
			var consequent_3 = ($$anchor) => {
				var div_1 = root_5$g();
				var img = child(div_1);
				var button = sibling(img, 2);
				template_effect(() => set_attribute(img, 'src', value()));

				delegated('click', button, () => {
					value('');
					onChange()('');
				});

				append($$anchor, div_1);
			};

			if_block(node_3, ($$render) => {
				if (!multi() && value()) $$render(consequent_3);
			});
		}

		var node_4 = sibling(node_3, 2);

		{
			var consequent_4 = ($$anchor) => {
				var div_2 = root_6$e();

				each(div_2, 5, values, index, ($$anchor, url) => {
					var div_3 = root_7$9();
					var img_1 = child(div_3);
					var button_1 = sibling(img_1, 2);
					template_effect(() => set_attribute(img_1, 'src', get(url)));
					delegated('click', button_1, () => removeImage(get(url)));
					append($$anchor, div_3);
				});
				append($$anchor, div_2);
			};

			if_block(node_4, ($$render) => {
				if ((
					deep_read_state(multi()),
					deep_read_state(values()),
					untrack(() => multi() && values().length)
				)) $$render(consequent_4);
			});
		}
		template_effect(() => input.multiple = multi());
		event('dragover', label_1, (e) => e.preventDefault());
		event('drop', label_1, handleDrop);
		delegated('change', input, (e) => handleFiles(e.target.files));
		append($$anchor, div);
		pop();
	}

	delegate(['change', 'click']);

	var root_1$e = from_html(`<tr class="border-b border-border/50 hover:bg-muted/50 transition-colors"><td class="p-3"><div class="flex items-center gap-3"><img class="w-10 h-10 object-cover bg-secondary flex-shrink-0"/> <div><span class="font-medium block"> </span> <span class="text-xs text-muted-foreground"> </span></div></div></td><td class="p-3 text-muted-foreground capitalize hidden md:table-cell"> </td><td class="p-3 text-right tabular-nums"> </td><td class="p-3 text-right tabular-nums"> </td><td class="p-3 text-center"><span> </span></td><td class="p-3 text-right"><div class="flex items-center justify-end gap-1"><button aria-label="Edit product" class="p-1.5 text-muted-foreground hover:text-foreground transition-colors active:scale-90"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg></button> <button aria-label="Delete product" class="p-1.5 text-muted-foreground hover:text-destructive transition-colors active:scale-90"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg></button></div></td></tr>`);
	var root_2$j = from_html(`<div class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4"><div class="bg-background border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-fade-up"><div class="flex items-center justify-between"><h3 class="text-lg font-display font-bold"> </h3> <button aria-label="Close" class="text-muted-foreground hover:text-foreground active:scale-90"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div> <div class="space-y-4"><div><label for="edit-name" class="text-label block mb-1.5">NAME</label> <input id="edit-name" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div class="grid grid-cols-2 gap-4"><div><label for="edit-category" class="text-label block mb-1.5">CATEGORY</label> <input id="edit-category" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="edit-price" class="text-label block mb-1.5"> </label> <input id="edit-price" type="number" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors tabular-nums"/></div></div> <div><label for="edit-desc" class="text-label block mb-1.5">DESCRIPTION</label> <textarea id="edit-desc" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea></div> <!> <div class="grid grid-cols-2 gap-4"><div><label for="edit-stock" class="text-label block mb-1.5">STOCK</label> <input id="edit-stock" type="number" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors tabular-nums"/></div> <div><label for="edit-sizes" class="text-label block mb-1.5">SIZES (comma sep.)</label> <input id="edit-sizes" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div></div> <div><label for="edit-colors" class="text-label block mb-1.5">COLORS (comma sep.)</label> <input id="edit-colors" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div class="flex items-center gap-6"><label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" class="accent-foreground"/> Mark as New</label> <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" class="accent-foreground"/> Featured on Homepage</label></div></div> <div class="flex gap-3 pt-2"><button class="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"></path></svg> SAVE</button> <button class="px-5 py-2.5 text-label tracking-[0.15em] border border-border hover:bg-muted transition-colors active:scale-[0.97]">CANCEL</button></div></div></div>`);
	var root$b = from_html(`<div class="space-y-6"><div class="flex items-center justify-between"><div><h2 class="text-2xl font-display font-bold mb-1">Products</h2> <p class="text-sm text-muted-foreground"> </p></div> <button class="flex items-center gap-2 bg-foreground text-primary-foreground px-4 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg> ADD PRODUCT</button></div> <div class="bg-card border border-border overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-border"><th class="text-left text-label p-3">PRODUCT</th><th class="text-left text-label p-3 hidden md:table-cell">CATEGORY</th><th class="text-right text-label p-3">PRICE</th><th class="text-right text-label p-3">STOCK</th><th class="text-center text-label p-3">STATUS</th><th class="text-right text-label p-3">ACTIONS</th></tr></thead><tbody></tbody></table></div> <!></div>`);

	function AdminProducts($$anchor, $$props) {
		push($$props, false);

		const sizesStr = mutable_source();
		const colorsStr = mutable_source();
		let products = prop($$props, 'products', 24, () => []);
		let currency = prop($$props, 'currency', 8, '€');
		let onUpdate = prop($$props, 'onUpdate', 8, () => {});
		let editing = mutable_source(null);
		let isNew = mutable_source(false);

		const emptyProduct = {
			id: '',
			name: '',
			category: '',
			price: 0,
			image: '',
			images: [],
			description: '',
			sizes: ['S', 'M', 'L', 'XL'],
			colors: [],
			stock: 0,
			isNew: false,
			isFeatured: false
		};

		function handleSave() {
			if (!get(editing)) return;

			// Keep image in sync with first images[]
			const p = {
				...get(editing),
				image: get(editing).images[0] || get(editing).image || ''
			};

			if (get(isNew)) {
				onUpdate()([...products(), { ...p, id: `prod-${Date.now()}` }]);
			} else {
				onUpdate()(products().map((prod) => prod.id === p.id ? p : prod));
			}

			set(editing, null);
			set(isNew, false);
		}

		async function handleDelete(id, name) {
			if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

			try {
				const res = await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });

				if (!res.ok) throw new Error((await res.json()).error);

				onUpdate()(products().filter((p) => p.id !== id));
			} catch(e) {
				alert(`Failed to delete: ${e.message}`);
			}
		}

		function handleAdd() {
			set(editing, { ...emptyProduct, images: [] });
			set(isNew, true);
		}

		function statusClass(p) {
			if (p.stock === 0) return 'bg-red-100 text-red-700';
			if (p.isNew) return 'bg-green-100 text-green-700';

			return 'bg-muted text-muted-foreground';
		}

		function statusLabel(p) {
			if (p.stock === 0) return 'Out of stock';
			if (p.isNew) return 'New';

			return 'Active';
		}

		function updateSizes(e) {
			set(editing, {
				...get(editing),
				sizes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
			});
		}

		function updateColors(e) {
			set(editing, {
				...get(editing),
				colors: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
			});
		}

		legacy_pre_effect(() => (get(editing)), () => {
			set(sizesStr, get(editing) ? get(editing).sizes.join(', ') : '');
		});

		legacy_pre_effect(() => (get(editing)), () => {
			set(colorsStr, get(editing) ? get(editing).colors.join(', ') : '');
		});

		legacy_pre_effect_reset();
		init();

		var div = root$b();
		var div_1 = child(div);
		var div_2 = child(div_1);
		var p_1 = sibling(child(div_2), 2);
		var text = child(p_1);

		var button = sibling(div_2, 2);

		var div_3 = sibling(div_1, 2);
		var table = child(div_3);
		var tbody = sibling(child(table));

		each(tbody, 5, products, index, ($$anchor, p) => {
			var tr = root_1$e();
			var td = child(tr);
			var div_4 = child(td);
			var img = child(div_4);
			var div_5 = sibling(img, 2);
			var span = child(div_5);
			var text_1 = child(span);

			var span_1 = sibling(span, 2);
			var text_2 = child(span_1);

			var td_1 = sibling(td);
			var text_3 = child(td_1);

			var td_2 = sibling(td_1);
			var text_4 = child(td_2);

			var td_3 = sibling(td_2);
			var text_5 = child(td_3);

			var td_4 = sibling(td_3);
			var span_2 = child(td_4);
			var text_6 = child(span_2);

			var td_5 = sibling(td_4);
			var div_6 = child(td_5);
			var button_1 = child(div_6);
			var button_2 = sibling(button_1, 2);

			template_effect(
				($0, $1, $2) => {
					set_attribute(img, 'src', (
						get(p),
						untrack(() => get(p).image || get(p).images?.[0] || '/images/product-1.jpg')
					));

					set_attribute(img, 'alt', (get(p), untrack(() => get(p).name)));
					set_text(text_1, (get(p), untrack(() => get(p).name)));

					set_text(text_2, `${(get(p), untrack(() => (get(p).images || []).length)) ?? ''} image${(
					get(p),
					untrack(() => (get(p).images || []).length !== 1 ? 's' : '')
				) ?? ''}`);

					set_text(text_3, (get(p), untrack(() => get(p).category)));
					set_text(text_4, `${currency() ?? ''}${$0 ?? ''}`);
					set_text(text_5, (get(p), untrack(() => get(p).stock)));
					set_class(span_2, 1, `inline-block text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 font-medium ${$1 ?? ''}`);
					set_text(text_6, $2);
				},
				[
					() => (get(p), untrack(() => get(p).price.toFixed(2))),
					() => (get(p), untrack(() => statusClass(get(p)))),
					() => (get(p), untrack(() => statusLabel(get(p))))
				]
			);

			delegated('click', button_1, () => {
				set(editing, {
					...get(p),
					images: [...get(p).images || [get(p).image].filter(Boolean)]
				});

				set(isNew, false);
			});

			delegated('click', button_2, () => handleDelete(get(p).id, get(p).name));
			append($$anchor, tr);
		});

		var node = sibling(div_3, 2);

		{
			var consequent = ($$anchor) => {
				var div_7 = root_2$j();
				var div_8 = child(div_7);
				var div_9 = child(div_8);
				var h3 = child(div_9);
				var text_7 = child(h3);

				var button_3 = sibling(h3, 2);

				var div_10 = sibling(div_9, 2);
				var div_11 = child(div_10);
				var input = sibling(child(div_11), 2);

				var div_12 = sibling(div_11, 2);
				var div_13 = child(div_12);
				var input_1 = sibling(child(div_13), 2);

				var div_14 = sibling(div_13, 2);
				var label = child(div_14);
				var text_8 = child(label);

				var input_2 = sibling(label, 2);

				var div_15 = sibling(div_12, 2);
				var textarea = sibling(child(div_15), 2);
				set_attribute(textarea, 'rows', 3);

				var node_1 = sibling(div_15, 2);

				ImageUpload(node_1, {
					multi: true,
					label: 'PRODUCT IMAGES (first image = primary)',
					get values() {
						return (get(editing), untrack(() => get(editing).images));
					},
					onChange: (urls) => set(editing, { ...get(editing), images: urls, image: urls[0] || '' })
				});

				var div_16 = sibling(node_1, 2);
				var div_17 = child(div_16);
				var input_3 = sibling(child(div_17), 2);

				var div_18 = sibling(div_17, 2);
				var input_4 = sibling(child(div_18), 2);

				var div_19 = sibling(div_16, 2);
				var input_5 = sibling(child(div_19), 2);

				var div_20 = sibling(div_19, 2);
				var label_1 = child(div_20);
				var input_6 = child(label_1);

				var label_2 = sibling(label_1, 2);
				var input_7 = child(label_2);

				var div_21 = sibling(div_10, 2);
				var button_4 = child(div_21);
				var button_5 = sibling(button_4, 2);

				template_effect(() => {
					set_text(text_7, get(isNew) ? 'Add Product' : 'Edit Product');
					set_text(text_8, `PRICE (${currency() ?? ''})`);
					set_value(input_4, get(sizesStr));
					set_value(input_5, get(colorsStr));
				});

				delegated('click', button_3, () => {
					set(editing, null);
					set(isNew, false);
				});

				bind_value(input, () => get(editing).name, ($$value) => mutate(editing, get(editing).name = $$value));
				bind_value(input_1, () => get(editing).category, ($$value) => mutate(editing, get(editing).category = $$value));
				bind_value(input_2, () => get(editing).price, ($$value) => mutate(editing, get(editing).price = $$value));
				bind_value(textarea, () => get(editing).description, ($$value) => mutate(editing, get(editing).description = $$value));
				bind_value(input_3, () => get(editing).stock, ($$value) => mutate(editing, get(editing).stock = $$value));
				delegated('input', input_4, updateSizes);
				delegated('input', input_5, updateColors);
				bind_checked(input_6, () => get(editing).isNew, ($$value) => mutate(editing, get(editing).isNew = $$value));
				bind_checked(input_7, () => get(editing).isFeatured, ($$value) => mutate(editing, get(editing).isFeatured = $$value));
				delegated('click', button_4, handleSave);

				delegated('click', button_5, () => {
					set(editing, null);
					set(isNew, false);
				});

				append($$anchor, div_7);
			};

			if_block(node, ($$render) => {
				if (get(editing)) $$render(consequent);
			});
		}

		template_effect(() => set_text(text, `${(
		deep_read_state(products()),
		untrack(() => products().length)
	) ?? ''} products total`));

		delegated('click', button, handleAdd);
		append($$anchor, div);
		pop();
	}

	delegate(['click', 'input']);

	var root_1$d = with_script(from_html(`<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script> <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>`, 1));
	var root_2$i = from_html(`<option> </option>`);
	var root_4$d = from_html(`<button class="text-[10px] uppercase font-medium tracking-wider px-3 py-1 bg-green-600 text-white hover:bg-green-700 transition-colors active:scale-95">✓ ACCEPT</button> <button class="text-[10px] uppercase font-medium tracking-wider px-3 py-1 bg-red-600 text-white hover:bg-red-700 transition-colors active:scale-95">✕ REJECT</button>`, 1);
	var root_5$f = from_html(`<option> </option>`);
	var root_6$d = from_html(`<div class="flex gap-2 mt-1"><input placeholder="Rejection reason (optional)…" class="flex-1 bg-transparent border border-red-300 px-3 py-1.5 text-xs focus:outline-none"/> <button class="bg-red-600 text-white text-[10px] uppercase tracking-wider px-3 py-1.5 hover:bg-red-700 transition-colors">Confirm Reject</button> <button class="text-xs text-muted-foreground hover:text-foreground px-2 transition-colors">Cancel</button></div>`);
	var root_8$a = from_html(`<img alt="" class="w-6 h-6 object-cover bg-secondary"/>`);
	var root_7$8 = from_html(`<div class="flex items-center justify-between text-sm"><span class="text-muted-foreground flex items-center gap-2"><!> <span> <span class="text-xs"> </span></span></span> <span class="tabular-nums"> </span></div>`);
	var root_3$h = from_html(`<div class="bg-card border border-border p-5 space-y-4 animate-fade-in relative"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p class="font-medium tabular-nums text-foreground"> </p> <p class="text-sm text-muted-foreground"> </p></div> <div class="flex flex-wrap items-center gap-2"><span> </span> <!> <select class="bg-transparent border border-border px-2 py-1 text-[10px] uppercase font-medium tracking-[0.1em] focus:outline-none focus:border-foreground transition-colors cursor-pointer ml-auto"></select> <button class="text-[10px] uppercase text-muted-foreground hover:text-foreground border border-border px-2 py-1 transition-colors">PDF</button></div> <!></div> <div class="border-t border-border/50 pt-3 space-y-2"></div> <div class="text-xs text-muted-foreground flex flex-col sm:flex-row gap-4 sm:items-center border-t border-border/50 pt-3"><div><span class="text-label">ADDRESS:</span> </div> <div><span class="text-label">EMAIL:</span> </div> <div><span class="text-label">PHONE:</span> </div> <div class="sm:hidden mt-2"><button class="text-[10px] uppercase text-muted-foreground hover:text-foreground underline transition-colors">Download PDF</button></div></div></div>`);
	var root_9$7 = from_html(`<div class="py-12 border border-dashed border-border text-center"><p class="text-muted-foreground text-sm">No orders found for this filter.</p></div>`);
	var root$a = from_html(`<div class="space-y-6 max-w-4xl"><div class="flex items-center justify-between"><div><h2 class="text-2xl font-display font-bold mb-1">Orders</h2> <p class="text-sm text-muted-foreground"> </p></div> <select class="bg-transparent border border-border px-4 py-2 text-sm focus:outline-none focus:border-foreground transition-colors cursor-pointer"><option>All Orders</option><!></select></div> <div class="space-y-4"><!> <!></div></div>`);

	function AdminOrders($$anchor, $$props) {
		push($$props, false);

		const sortedOrders = mutable_source();
		const filteredOrders = mutable_source();
		let orders = prop($$props, 'orders', 24, () => []);
		let currency = prop($$props, 'currency', 8, 'R');
		let onUpdate = prop($$props, 'onUpdate', 8, () => {});
		let filter = mutable_source('all');

		const statusOptions = [
			'all',
			'pending',
			'pending_payment',
			'paid',
			'processing',
			'shipped',
			'cancelled'
		];

		let rejectingId = mutable_source(null);
		let rejectReason = mutable_source('');

		// Sort orders newest first
		async function patchStatus(orderId, status, reason = '') {
			try {
				const res = await fetch(`/api/orders/${orderId}/status`, {
					method: 'PATCH',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status, reason })
				});

				if (!res.ok) throw new Error((await res.json()).error);

				onUpdate()(orders().map((o) => o.id === orderId
					? { ...o, status, adminNote: reason || o.adminNote }
					: o));
			} catch(e) {
				alert(`Failed to update order: ${e.message}`);
			}
		}

		function handleAccept(orderId) {
			patchStatus(orderId, 'processing');
		}

		function handleReject(orderId) {
			set(rejectingId, orderId);
			set(rejectReason, '');
		}

		function confirmReject(orderId) {
			patchStatus(orderId, 'cancelled', get(rejectReason));
			set(rejectingId, null);
			set(rejectReason, '');
		}

		function exportPDF(order) {
			if (!window.jspdf) return alert('PDF library loading, try again in a moment...');

			const { jsPDF } = window.jspdf;
			const doc = new jsPDF();

			doc.setFontSize(20);
			doc.text(`Invoice - ${order.id}`, 14, 22);
			doc.setFontSize(11);
			doc.text(`Customer: ${order.customer}`, 14, 32);
			doc.text(`Email: ${order.email}`, 14, 38);
			doc.text(`Address: ${order.address}`, 14, 44);
			doc.text(`Date: ${new Date(order.createdAt || order.date || Date.now()).toLocaleDateString()}`, 14, 50);
			doc.text(`Status: ${order.status.toUpperCase().replace('_', ' ')}`, 14, 56);

			const tableData = (order.items || []).map((item) => [
				item.name,
				item.size || '-',
				item.quantity.toString(),
				`${currency()}${item.price.toFixed(2)}`,
				`${currency()}${(item.price * item.quantity).toFixed(2)}`
			]);

			doc.autoTable({
				startY: 65,
				head: [['Item', 'Size', 'Qty', 'Unit Price', 'Total']],
				body: tableData,
				theme: 'grid',
				headStyles: { fillColor: [20, 20, 20] }
			});

			const finalY = doc.lastAutoTable.finalY || 65;

			doc.text(`Shipping: ${currency()}${(order.shippingCost || 0).toFixed(2)}`, 14, finalY + 10);
			doc.setFontSize(14);
			doc.text(`Grand Total: ${currency()}${order.total.toFixed(2)}`, 14, finalY + 20);
			doc.save(`${order.id}.pdf`);
		}

		legacy_pre_effect(() => (deep_read_state(orders())), () => {
			set(sortedOrders, [...orders()].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)));
		});

		legacy_pre_effect(() => (get(filter), get(sortedOrders)), () => {
			set(filteredOrders, get(filter) === 'all'
				? get(sortedOrders)
				: get(sortedOrders).filter((o) => o.status === get(filter)));
		});

		legacy_pre_effect_reset();
		init();

		var div = root$a();

		head('roy1ce', ($$anchor) => {
			var fragment = root_1$d();
			append($$anchor, fragment);
		});

		var div_1 = child(div);
		var div_2 = child(div_1);
		var p = sibling(child(div_2), 2);
		var text = child(p);

		var select = sibling(div_2, 2);
		var option = child(select);

		option.value = option.__value = 'all';

		var node = sibling(option);

		each(node, 1, () => statusOptions, index, ($$anchor, s) => {
			var option_1 = root_2$i();
			var text_1 = child(option_1);

			var option_1_value = {};

			template_effect(
				($0) => {
					set_text(text_1, $0);

					if (option_1_value !== (option_1_value = get(s))) {
						option_1.value = (option_1.__value = get(s)) ?? '';
					}
				},
				[
					() => (
						get(s),
						untrack(() => get(s).replace('_', ' ').toUpperCase())
					)
				]
			);

			append($$anchor, option_1);
		});

		var div_3 = sibling(div_1, 2);
		var node_1 = child(div_3);

		each(node_1, 1, () => get(filteredOrders), (order) => order.id, ($$anchor, order) => {
			var div_4 = root_3$h();
			var div_5 = child(div_4);
			var div_6 = child(div_5);
			var p_1 = child(div_6);
			var text_2 = child(p_1);

			var p_2 = sibling(p_1, 2);
			var text_3 = child(p_2);

			var div_7 = sibling(div_6, 2);
			var span = child(div_7);
			var text_4 = child(span);

			var node_2 = sibling(span, 2);

			{
				var consequent = ($$anchor) => {
					var fragment_1 = root_4$d();
					var button = first_child(fragment_1);
					var button_1 = sibling(button, 2);

					delegated('click', button, () => handleAccept(get(order).id));
					delegated('click', button_1, () => handleReject(get(order).id));
					append($$anchor, fragment_1);
				};

				if_block(node_2, ($$render) => {
					if ((
						get(order),
						untrack(() => get(order).status === 'paid')
					)) $$render(consequent);
				});
			}

			var select_1 = sibling(node_2, 2);

			each(
				select_1,
				4,
				() => [
					'pending',
					'pending_payment',
					'paid',
					'processing',
					'shipped',
					'delivered',
					'cancelled'
				],
				index,
				($$anchor, s) => {
					var option_2 = root_5$f();
					var text_5 = child(option_2);

					var option_2_value = {};

					template_effect(
						($0) => {
							set_text(text_5, $0);

							if (option_2_value !== (option_2_value = s)) {
								option_2.value = (option_2.__value = s) ?? '';
							}
						},
						[() => (untrack(() => s.replace('_', ' ')))]
					);

					append($$anchor, option_2);
				}
			);

			var select_1_value;

			init_select(select_1);

			var button_2 = sibling(select_1, 2);

			var node_3 = sibling(div_7, 2);

			{
				var consequent_1 = ($$anchor) => {
					var div_8 = root_6$d();
					var input = child(div_8);

					var button_3 = sibling(input, 2);
					var button_4 = sibling(button_3, 2);
					bind_value(input, () => get(rejectReason), ($$value) => set(rejectReason, $$value));
					delegated('click', button_3, () => confirmReject(get(order).id));
					delegated('click', button_4, () => set(rejectingId, null));
					append($$anchor, div_8);
				};

				if_block(node_3, ($$render) => {
					if ((
						get(rejectingId),
						get(order),
						untrack(() => get(rejectingId) === get(order).id)
					)) $$render(consequent_1);
				});
			}

			var div_9 = sibling(div_5, 2);

			each(div_9, 5, () => (get(order), untrack(() => get(order).items || [])), index, ($$anchor, item) => {
				var div_10 = root_7$8();
				var span_1 = child(div_10);
				var node_4 = child(span_1);

				{
					var consequent_2 = ($$anchor) => {
						var img = root_8$a();

						template_effect(() => set_attribute(img, 'src', (get(item), untrack(() => get(item).image))));
						append($$anchor, img);
					};

					if_block(node_4, ($$render) => {
						if ((get(item), untrack(() => get(item).image))) $$render(consequent_2);
					});
				}

				var span_2 = sibling(node_4, 2);
				var text_6 = child(span_2);
				var span_3 = sibling(text_6);
				var text_7 = child(span_3);

				var span_4 = sibling(span_1, 2);
				var text_8 = child(span_4);

				template_effect(
					($0) => {
						set_text(text_6, `${(get(item), untrack(() => get(item).quantity)) ?? ''}× ${(get(item), untrack(() => get(item).name)) ?? ''} `);
						set_text(text_7, `(${(get(item), untrack(() => get(item).size)) ?? ''})`);
						set_text(text_8, `${currency() ?? ''}${$0 ?? ''}`);
					},
					[
						() => (
							get(item),
							untrack(() => (get(item).price * get(item).quantity).toFixed(2).replace('.', ','))
						)
					]
				);

				append($$anchor, div_10);
			});

			var div_11 = sibling(div_9, 2);
			var div_12 = child(div_11);
			var text_9 = sibling(child(div_12));

			var div_13 = sibling(div_12, 2);
			var text_10 = sibling(child(div_13));

			var div_14 = sibling(div_13, 2);
			var text_11 = sibling(child(div_14));

			var div_15 = sibling(div_14, 2);
			var button_5 = child(div_15);

			template_effect(
				($0, $1, $2) => {
					set_text(text_2, `${(get(order), untrack(() => get(order).id)) ?? ''} • ${currency() ?? ''}${$0 ?? ''}`);
					set_text(text_3, `${(get(order), untrack(() => get(order).customer)) ?? ''} · ${$1 ?? ''}`);

					set_class(span, 1, `text-[10px] uppercase font-medium tracking-[0.1em] px-2 py-1 rounded
              ${(
					get(order),
					untrack(() => get(order).status === 'paid'
						? 'bg-green-100 text-green-700'
						: get(order).status === 'processing'
							? 'bg-blue-100 text-blue-700'
							: get(order).status === 'shipped'
								? 'bg-purple-100 text-purple-700'
								: get(order).status === 'cancelled'
									? 'bg-red-100 text-red-700'
									: get(order).status === 'pending_payment'
										? 'bg-yellow-100 text-yellow-700'
										: 'bg-muted text-muted-foreground')
				) ?? ''}`);

					set_text(text_4, $2);

					if (select_1_value !== (select_1_value = (get(order), untrack(() => get(order).status)))) {
						(
							select_1.value = (select_1.__value = (get(order), untrack(() => get(order).status))) ?? '',
							select_option(select_1, (get(order), untrack(() => get(order).status)))
						);
					}

					set_text(text_9, ` ${(get(order), untrack(() => get(order).address || '-')) ?? ''}`);
					set_text(text_10, ` ${(get(order), untrack(() => get(order).email || '-')) ?? ''}`);
					set_text(text_11, ` ${(get(order), untrack(() => get(order).phone || '-')) ?? ''}`);
				},
				[
					() => (
						get(order),
						untrack(() => get(order).total.toFixed(2).replace('.', ','))
					),

					() => (
						get(order),
						untrack(() => new Date(get(order).createdAt || get(order).date || Date.now()).toLocaleDateString())
					),

					() => (
						get(order),
						untrack(() => get(order).status.replace('_', ' '))
					)
				]
			);

			delegated('change', select_1, (e) => patchStatus(get(order).id, e.target.value));
			delegated('click', button_2, () => exportPDF(get(order)));
			delegated('click', button_5, () => exportPDF(get(order)));
			append($$anchor, div_4);
		});

		var node_5 = sibling(node_1, 2);

		{
			var consequent_3 = ($$anchor) => {
				var div_16 = root_9$7();

				append($$anchor, div_16);
			};

			if_block(node_5, ($$render) => {
				if ((
					get(filteredOrders),
					untrack(() => get(filteredOrders).length === 0)
				)) $$render(consequent_3);
			});
		}

		template_effect(() => set_text(text, `${(
		get(filteredOrders),
		untrack(() => get(filteredOrders).length)
	) ?? ''} orders total`));

		bind_select_value(select, () => get(filter), ($$value) => set(filter, $$value));
		append($$anchor, div);
		pop();
	}

	delegate(['click', 'change']);

	var root_1$c = from_html(`<div class="flex items-center gap-3"><img alt="Logo" class="h-10 w-auto max-w-[120px] object-contain bg-secondary p-1"/> <button class="text-xs text-destructive hover:underline">Remove</button></div>`);
	var root_2$h = from_html(`<div class="flex items-center gap-3 mb-2"><span class="text-xs text-muted-foreground truncate max-w-[200px]"> </span> <button class="text-xs text-destructive hover:underline">Remove</button></div>`);
	var root_4$c = from_html(`<div class="flex items-center gap-3"><img alt="Maintenance BG" class="h-16 w-24 object-cover bg-secondary"/> <button class="text-xs text-destructive hover:underline">Remove</button></div>`);
	var root_3$g = from_html(`<div class="pt-2 space-y-4 border-t border-border/50"><p class="text-[11px] uppercase tracking-widest text-red-500 font-medium">⚠ Maintenance mode is ON — visitors cannot access the store.</p> <div class="flex items-center justify-between bg-muted/40 px-4 py-3 rounded"><div><p class="text-sm font-medium">Collect email addresses</p> <p class="text-xs text-muted-foreground mt-0.5">Show a "Notify me" form on the maintenance page.</p></div> <button role="switch" aria-label="Toggle email collection"><span></span></button></div> <div><label for="maint-title" class="text-label block mb-1.5">MAINTENANCE TITLE</label> <input id="maint-title" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="maint-msg" class="text-label block mb-1.5">MAINTENANCE MESSAGE</label> <textarea id="maint-msg" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea></div> <div><p class="text-label block mb-1.5">BACKGROUND IMAGE (optional)</p> <p class="text-xs text-muted-foreground mb-2">Shown behind the maintenance message. Recommended: a dark or moody image.</p> <div class="flex items-start gap-4"><!> <!></div></div></div>`);
	var root_5$e = from_html(`<p class="text-xs text-muted-foreground italic">No lookbooks yet — create one in the Lookbook section first.</p>`);
	var root_7$7 = from_html(`<option> </option>`);
	var root_6$c = from_html(`<select class="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors cursor-pointer"><option>— Latest lookbook (default) —</option><!></select>`);
	var root_8$9 = from_html(`<div><label class="text-label block mb-1.5"> </label> <input class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div>`);
	var root$9 = from_html(`<div class="space-y-8 max-w-2xl"><div><h2 class="text-2xl font-display font-bold mb-1">Settings</h2> <p class="text-sm text-muted-foreground">Manage store settings, branding and content.</p></div> <div class="space-y-6"><div class="space-y-4 bg-card border border-border p-5"><h3 class="text-label">BRANDING</h3> <div><label for="s-name" class="text-label block mb-1.5">STORE NAME</label> <input id="s-name" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="s-tagline" class="text-label block mb-1.5">TAGLINE</label> <input id="s-tagline" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="s-desc" class="text-label block mb-1.5">DESCRIPTION</label> <textarea id="s-desc" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea></div> <div><p class="text-label block mb-1.5">LOGO IMAGE</p> <p class="text-xs text-muted-foreground mb-2">Upload a logo image. If none, the store name text is shown.</p> <div class="flex items-start gap-4"><!> <!></div></div></div> <div class="space-y-4 bg-card border border-border p-5"><h3 class="text-label">ANNOUNCEMENT BAR</h3> <div><label for="s-ann" class="text-label block mb-1.5">ANNOUNCEMENT TEXT</label> <input id="s-ann" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="s-cur" class="text-label block mb-1.5">CURRENCY SYMBOL</label> <input id="s-cur" class="w-full max-w-[80px] bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div></div> <div class="space-y-4 bg-card border border-border p-5"><h3 class="text-label">SHIPPING</h3> <div class="grid grid-cols-2 gap-4"><div><label for="s-free-min" class="text-label block mb-1.5"> </label> <input id="s-free-min" type="number" min="0" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors tabular-nums"/></div> <div><label for="s-std-rate" class="text-label block mb-1.5"> </label> <input id="s-std-rate" type="number" min="0" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors tabular-nums"/></div></div> <p class="text-xs text-muted-foreground">Orders above the free shipping minimum qualify for free delivery. Checkout is restricted to South Africa only.</p></div> <div class="space-y-4 bg-card border border-border p-5"><h3 class="text-label">HERO SECTION</h3> <div><label for="h-label" class="text-label block mb-1.5">SEASON LABEL</label> <input id="h-label" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="h-heading" class="text-label block mb-1.5">HERO TITLE</label> <input id="h-heading" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="h-sub" class="text-label block mb-1.5">HERO SUBTITLE</label> <input id="h-sub" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="h-cta" class="text-label block mb-1.5">CTA BUTTON TEXT</label> <input id="h-cta" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="h-cta-link" class="text-label block mb-1.5">CTA BUTTON LINK</label> <input id="h-cta-link" placeholder="/products" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/> <p class="text-xs text-muted-foreground mt-1">Use a relative path (e.g. /products, /lookbook) or a full URL.</p></div> <div class="space-y-3"><p class="text-label">HERO BACKGROUND</p> <p class="text-xs text-muted-foreground">Upload an image <em>or</em> a video/GIF. If both are set, video takes priority.</p> <!> <div><p class="text-label block mb-1.5">VIDEO / GIF (MP4, WEBM, GIF)</p> <!> <label class="cursor-pointer inline-flex items-center gap-2 border border-border px-3 py-2 text-label hover:bg-muted transition-colors text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line></svg> UPLOAD VIDEO/GIF <input type="file" accept="video/mp4,video/webm,image/gif" class="sr-only"/></label></div></div></div> <div><div class="flex items-start justify-between gap-4"><div><h3 class="text-label text-red-500">MAINTENANCE MODE</h3> <p class="text-xs text-muted-foreground mt-0.5">When enabled, visitors see a maintenance page. Admins can still access /admin.</p></div> <button role="switch" aria-label="Toggle maintenance mode"><span></span></button></div> <!></div> <div class="space-y-3 bg-card border border-border p-5"><h3 class="text-label">FEATURED LOOKBOOK</h3> <p class="text-xs text-muted-foreground">Choose which lookbook is shown on the homepage.</p> <!></div> <div class="space-y-4 bg-card border border-border p-5"><h3 class="text-label">SOCIAL LINKS</h3> <!></div> <div class="flex gap-3"><button class="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"></path></svg> </button> <button class="flex items-center gap-2 px-5 py-2.5 text-label tracking-[0.15em] border border-border hover:bg-muted transition-colors active:scale-[0.97] text-destructive"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg> RESET ALL DATA</button></div></div></div>`);

	function AdminSettings($$anchor, $$props) {
		push($$props, false);

		let site = prop($$props, 'site', 24, () => ({}));
		let onUpdate = prop($$props, 'onUpdate', 8, () => {});
		let onReset = prop($$props, 'onReset', 8, () => {});
		let lookbooks = prop($$props, 'lookbooks', 24, () => []);
		let form = mutable_source(JSON.parse(JSON.stringify(site())));

		if (!get(form).shipping) (
			mutate(form, get(form).shipping = { freeMinimum: 500, standardRate: 99, country: 'South Africa' }),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		);

		if (!get(form).hero) (
			mutate(form, get(form).hero = {}),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		);

		if (get(form).hero.ctaLink === undefined) (
			mutate(form, get(form).hero.ctaLink = '/products'),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		);

		if (get(form).hero.video === undefined) (
			mutate(form, get(form).hero.video = ''),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		);

		if (!get(form).maintenance) (
			mutate(form, get(form).maintenance = {
				enabled: false,
				collectEmails: false,
				title: "We'll be back soon.",
				message: 'Our store is currently undergoing scheduled maintenance. Please check back shortly.',
				background: ''
			}),

			invalidate_inner_signals(() => {
				lookbooks();
			})
		);

		if (get(form).maintenance.collectEmails === undefined) (
			mutate(form, get(form).maintenance.collectEmails = false),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		);

		if (!get(form).socials) (
			mutate(form, get(form).socials = { instagram: '', twitter: '', tiktok: '' }),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		);

		if (get(form).featuredLookbook === undefined) (
			mutate(form, get(form).featuredLookbook = ''),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		);

		let saved = mutable_source(false);

		function handleSave() {
			onUpdate()(get(form));
			set(saved, true);
			setTimeout(() => set(saved, false), 2000);
		}

		init();

		var div = root$9();
		var div_1 = sibling(child(div), 2);
		var div_2 = child(div_1);
		var div_3 = sibling(child(div_2), 2);
		var input = sibling(child(div_3), 2);

		var div_4 = sibling(div_3, 2);
		var input_1 = sibling(child(div_4), 2);

		var div_5 = sibling(div_4, 2);
		var textarea = sibling(child(div_5), 2);
		set_attribute(textarea, 'rows', 2);

		var div_6 = sibling(div_5, 2);
		var div_7 = sibling(child(div_6), 4);
		var node = child(div_7);

		{
			var consequent = ($$anchor) => {
				var div_8 = root_1$c();
				var img = child(div_8);
				var button = sibling(img, 2);
				template_effect(() => set_attribute(img, 'src', (get(form), untrack(() => get(form).logo))));

				delegated('click', button, () => (
					mutate(form, get(form).logo = null),
					invalidate_inner_signals(() => {
						lookbooks();
					})
				));

				append($$anchor, div_8);
			};

			if_block(node, ($$render) => {
				if ((get(form), untrack(() => get(form).logo))) $$render(consequent);
			});
		}

		var node_1 = sibling(node, 2);

		{
			let $0 = derived_safe_equal(() => (get(form), untrack(() => get(form).logo || '')));

			ImageUpload(node_1, {
				label: '',
				get value() {
					return get($0);
				},

				onChange: (url) => (
					mutate(form, get(form).logo = url),
					invalidate_inner_signals(() => {
						lookbooks();
					})
				)
			});
		}

		var div_9 = sibling(div_2, 2);
		var div_10 = sibling(child(div_9), 2);
		var input_2 = sibling(child(div_10), 2);

		var div_11 = sibling(div_10, 2);
		var input_3 = sibling(child(div_11), 2);

		var div_12 = sibling(div_9, 2);
		var div_13 = sibling(child(div_12), 2);
		var div_14 = child(div_13);
		var label_1 = child(div_14);
		var text = child(label_1);

		var input_4 = sibling(label_1, 2);

		var div_15 = sibling(div_14, 2);
		var label_2 = child(div_15);
		var text_1 = child(label_2);

		var input_5 = sibling(label_2, 2);

		var div_16 = sibling(div_12, 2);
		var div_17 = sibling(child(div_16), 2);
		var input_6 = sibling(child(div_17), 2);

		var div_18 = sibling(div_17, 2);
		var input_7 = sibling(child(div_18), 2);

		var div_19 = sibling(div_18, 2);
		var input_8 = sibling(child(div_19), 2);

		var div_20 = sibling(div_19, 2);
		var input_9 = sibling(child(div_20), 2);

		var div_21 = sibling(div_20, 2);
		var input_10 = sibling(child(div_21), 2);

		var div_22 = sibling(div_21, 2);
		var node_2 = sibling(child(div_22), 4);

		ImageUpload(node_2, {
			label: 'IMAGE (JPG/PNG/WEBP)',
			get value() {
				return (get(form), untrack(() => get(form).hero.image));
			},

			onChange: (url) => (
				mutate(form, get(form).hero.image = url),
				invalidate_inner_signals(() => {
					lookbooks();
				})
			)
		});

		var div_23 = sibling(node_2, 2);
		var node_3 = sibling(child(div_23), 2);

		{
			var consequent_1 = ($$anchor) => {
				var div_24 = root_2$h();
				var span = child(div_24);
				var text_2 = child(span);

				var button_1 = sibling(span, 2);
				template_effect(() => set_text(text_2, (get(form), untrack(() => get(form).hero.video))));

				delegated('click', button_1, () => (
					mutate(form, get(form).hero.video = ''),
					invalidate_inner_signals(() => {
						lookbooks();
					})
				));

				append($$anchor, div_24);
			};

			if_block(node_3, ($$render) => {
				if ((get(form), untrack(() => get(form).hero.video))) $$render(consequent_1);
			});
		}

		var label_3 = sibling(node_3, 2);
		var input_11 = sibling(child(label_3), 2);

		var div_25 = sibling(div_16, 2);
		var div_26 = child(div_25);
		var button_2 = sibling(child(div_26), 2);
		var span_1 = child(button_2);

		var node_4 = sibling(div_26, 2);

		{
			var consequent_3 = ($$anchor) => {
				var div_27 = root_3$g();
				var div_28 = sibling(child(div_27), 2);
				var button_3 = sibling(child(div_28), 2);
				var span_2 = child(button_3);

				var div_29 = sibling(div_28, 2);
				var input_12 = sibling(child(div_29), 2);

				var div_30 = sibling(div_29, 2);
				var textarea_1 = sibling(child(div_30), 2);
				set_attribute(textarea_1, 'rows', 3);

				var div_31 = sibling(div_30, 2);
				var div_32 = sibling(child(div_31), 4);
				var node_5 = child(div_32);

				{
					var consequent_2 = ($$anchor) => {
						var div_33 = root_4$c();
						var img_1 = child(div_33);
						var button_4 = sibling(img_1, 2);

						template_effect(() => set_attribute(img_1, 'src', (
							get(form),
							untrack(() => get(form).maintenance.background)
						)));

						delegated('click', button_4, () => (
							mutate(form, get(form).maintenance.background = ''),
							invalidate_inner_signals(() => {
								lookbooks();
							})
						));

						append($$anchor, div_33);
					};

					if_block(node_5, ($$render) => {
						if ((
							get(form),
							untrack(() => get(form).maintenance.background)
						)) $$render(consequent_2);
					});
				}

				var node_6 = sibling(node_5, 2);

				{
					let $0 = derived_safe_equal(() => (
						get(form),
						untrack(() => get(form).maintenance.background || '')
					));

					ImageUpload(node_6, {
						label: '',
						get value() {
							return get($0);
						},

						onChange: (url) => (
							mutate(form, get(form).maintenance.background = url),
							invalidate_inner_signals(() => {
								lookbooks();
							})
						)
					});
				}

				template_effect(() => {
					set_attribute(button_3, 'aria-checked', (
						get(form),
						untrack(() => get(form).maintenance.collectEmails)
					));

					set_class(button_3, 1, `relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${(
					get(form),
					untrack(() => get(form).maintenance.collectEmails ? 'bg-foreground' : 'bg-muted')
				) ?? ''}`);

					set_class(span_2, 1, `absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${(
					get(form),
					untrack(() => get(form).maintenance.collectEmails ? 'translate-x-5' : 'translate-x-0')
				) ?? ''}`);
				});

				delegated('click', button_3, () => (
					mutate(form, get(form).maintenance.collectEmails = !get(form).maintenance.collectEmails),
					invalidate_inner_signals(() => {
						lookbooks();
					})
				));

				bind_value(input_12, () => get(form).maintenance.title, ($$value) => (
					mutate(form, get(form).maintenance.title = $$value),
					invalidate_inner_signals(() => {
						lookbooks();
					})
				));

				bind_value(textarea_1, () => get(form).maintenance.message, ($$value) => (
					mutate(form, get(form).maintenance.message = $$value),
					invalidate_inner_signals(() => {
						lookbooks();
					})
				));

				append($$anchor, div_27);
			};

			if_block(node_4, ($$render) => {
				if ((
					get(form),
					untrack(() => get(form).maintenance.enabled)
				)) $$render(consequent_3);
			});
		}

		var div_34 = sibling(div_25, 2);
		var node_7 = sibling(child(div_34), 4);

		{
			var consequent_4 = ($$anchor) => {
				var p = root_5$e();

				append($$anchor, p);
			};

			var alternate = ($$anchor) => {
				var select = root_6$c();
				var option = child(select);

				option.value = option.__value = '';

				var node_8 = sibling(option);

				each(node_8, 1, lookbooks, index, ($$anchor, lb) => {
					var option_1 = root_7$7();
					var text_3 = child(option_1);

					var option_1_value = {};

					template_effect(() => {
						set_text(text_3, (get(lb), untrack(() => get(lb).title)));

						if (option_1_value !== (option_1_value = (get(lb), untrack(() => get(lb).id)))) {
							option_1.value = (option_1.__value = (get(lb), untrack(() => get(lb).id))) ?? '';
						}
					});

					append($$anchor, option_1);
				});

				bind_select_value(select, () => get(form).featuredLookbook, ($$value) => (
					mutate(form, get(form).featuredLookbook = $$value),
					invalidate_inner_signals(() => {
						lookbooks();
					})
				));

				append($$anchor, select);
			};

			if_block(node_7, ($$render) => {
				if ((
					deep_read_state(lookbooks()),
					untrack(() => lookbooks().length === 0)
				)) $$render(consequent_4); else $$render(alternate, -1);
			});
		}

		var div_35 = sibling(div_34, 2);
		var node_9 = sibling(child(div_35), 2);

		each(
			node_9,
			0,
			() => [
				['instagram', 'Instagram'],
				['twitter', 'X / Twitter'],
				['tiktok', 'TikTok']
			],
			index,
			($$anchor, $$item) => {
				var $$array = user_derived(() => to_array($$item, 2));
				let key = () => get($$array)[0];
				let label = () => get($$array)[1];
				var div_36 = root_8$9();
				var label_4 = child(div_36);
				var text_4 = child(label_4);

				var input_13 = sibling(label_4, 2);

				template_effect(() => {
					set_attribute(label_4, 'for', `social-${key() ?? ''}`);
					set_text(text_4, label());
					set_attribute(input_13, 'id', `social-${key() ?? ''}`);
				});

				bind_value(input_13, () => get(form).socials[key()], ($$value) => (
					mutate(form, get(form).socials[key()] = $$value),
					invalidate_inner_signals(() => {
						lookbooks();
					})
				));

				append($$anchor, div_36);
			}
		);

		var div_37 = sibling(div_35, 2);
		var button_5 = child(div_37);
		var text_5 = sibling(child(button_5));

		var button_6 = sibling(button_5, 2);

		template_effect(() => {
			set_text(text, `FREE SHIPPING MINIMUM (${(get(form), untrack(() => get(form).currency)) ?? ''})`);
			set_text(text_1, `STANDARD RATE (${(get(form), untrack(() => get(form).currency)) ?? ''})`);

			set_class(div_25, 1, `space-y-4 bg-card border ${(
			get(form),
			untrack(() => get(form).maintenance.enabled ? 'border-red-400' : 'border-border')
		) ?? ''} p-5`);

			set_attribute(button_2, 'aria-checked', (
				get(form),
				untrack(() => get(form).maintenance.enabled)
			));

			set_class(button_2, 1, `relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${(
			get(form),
			untrack(() => get(form).maintenance.enabled ? 'bg-red-500' : 'bg-muted')
		) ?? ''}`);

			set_class(span_1, 1, `absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${(
			get(form),
			untrack(() => get(form).maintenance.enabled ? 'translate-x-6' : 'translate-x-0')
		) ?? ''}`);

			set_text(text_5, ` ${get(saved) ? 'SAVED!' : 'SAVE CHANGES'}`);
		});

		bind_value(input, () => get(form).name, ($$value) => (
			mutate(form, get(form).name = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(input_1, () => get(form).tagline, ($$value) => (
			mutate(form, get(form).tagline = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(textarea, () => get(form).description, ($$value) => (
			mutate(form, get(form).description = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(input_2, () => get(form).announcement, ($$value) => (
			mutate(form, get(form).announcement = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(input_3, () => get(form).currency, ($$value) => (
			mutate(form, get(form).currency = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(input_4, () => get(form).shipping.freeMinimum, ($$value) => (
			mutate(form, get(form).shipping.freeMinimum = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(input_5, () => get(form).shipping.standardRate, ($$value) => (
			mutate(form, get(form).shipping.standardRate = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(input_6, () => get(form).hero.label, ($$value) => (
			mutate(form, get(form).hero.label = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(input_7, () => get(form).hero.heading, ($$value) => (
			mutate(form, get(form).hero.heading = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(input_8, () => get(form).hero.subheading, ($$value) => (
			mutate(form, get(form).hero.subheading = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(input_9, () => get(form).hero.cta, ($$value) => (
			mutate(form, get(form).hero.cta = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		bind_value(input_10, () => get(form).hero.ctaLink, ($$value) => (
			mutate(form, get(form).hero.ctaLink = $$value),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		delegated('change', input_11, async (e) => {
			const file = e.target.files[0];

			if (!file) return;

			const fd = new FormData();

			fd.append('image', file);

			const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });

			if (res.ok) {
				const { url } = await res.json();

				(
					mutate(form, get(form).hero.video = url),
					invalidate_inner_signals(() => {
						lookbooks();
					})
				);
			}
		});

		delegated('click', button_2, () => (
			mutate(form, get(form).maintenance.enabled = !get(form).maintenance.enabled),
			invalidate_inner_signals(() => {
				lookbooks();
			})
		));

		delegated('click', button_5, handleSave);

		delegated('click', button_6, function (...$$args) {
			onReset()?.apply(this, $$args);
		});

		append($$anchor, div);
		pop();
	}

	delegate(['click', 'change']);

	var root_2$g = from_html(`<img class="w-20 h-24 object-cover flex-shrink-0 bg-secondary"/>`);
	var root_3$f = from_html(`<div class="w-20 h-24 bg-secondary flex-shrink-0 flex items-center justify-center text-muted-foreground text-xs">No cover</div>`);
	var root_1$b = from_html(`<div class="bg-card border border-border p-4 flex gap-4 items-start"><!> <div class="flex-1 min-w-0"><p class="font-medium"> </p> <p class="text-xs text-muted-foreground mt-0.5"> </p> <p class="text-sm text-muted-foreground mt-1 truncate"> </p></div> <div class="flex gap-1 flex-shrink-0"><button aria-label="Edit lookbook" class="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg></button> <button aria-label="Delete lookbook" class="p-1.5 text-muted-foreground hover:text-destructive transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path></svg></button></div></div>`);
	var root_4$b = from_html(`<div class="text-center py-16 border border-dashed border-border text-muted-foreground text-sm">No lookbooks yet. Click ADD LOOKBOOK to create one.</div>`);
	var root_8$8 = from_html(`<input class="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors font-mono"/>`);
	var root_6$b = from_html(`<div class="border border-border p-3 mb-2 space-y-2"><div class="flex items-center justify-between"><span class="text-[10px] tracking-[0.15em] uppercase text-muted-foreground"> </span> <div class="flex items-center gap-1"><button aria-label="Move up" class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"></path></svg></button> <button aria-label="Move down" class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"></path></svg></button> <button aria-label="Remove item" class="p-1 text-muted-foreground hover:text-destructive"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div></div> <!> <input placeholder="Caption (optional)" class="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors"/></div>`);
	var root_5$d = from_html(`<div class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4"><div class="bg-background border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-fade-up"><div class="flex items-center justify-between"><h3 class="text-lg font-display font-bold"> </h3> <button aria-label="Close" class="text-muted-foreground hover:text-foreground"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div> <div class="space-y-4"><div class="grid grid-cols-2 gap-4"><div><label for="lb-title" class="text-label block mb-1.5">TITLE</label> <input id="lb-title" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="lb-date" class="text-label block mb-1.5">DATE</label> <input id="lb-date" type="date" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div></div> <div><label for="lb-desc" class="text-label block mb-1.5">DESCRIPTION</label> <textarea id="lb-desc" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea></div> <!> <div><p class="text-label mb-3">MEDIA ITEMS <span class="text-muted-foreground font-normal normal-case text-xs"> </span></p> <!> <div class="flex gap-2 flex-wrap pt-1"><button class="flex items-center gap-1.5 border border-dashed border-border px-3 py-2 text-label text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg> ADD IMAGE</button> <button class="flex items-center gap-1.5 border border-dashed border-border px-3 py-2 text-label text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"></path><rect width="14" height="12" x="2" y="6" rx="2"></rect></svg> ADD VIDEO</button> <button class="flex items-center gap-1.5 border border-dashed border-border px-3 py-2 text-label text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 17a24.12 24.12 0 0 1 0-10"></path><path d="m10 15 5-3-5-3z"></path></svg> EMBED YT/VIMEO</button></div></div></div> <div class="flex gap-3 pt-2"><button class="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"></path></svg> SAVE</button> <button class="px-5 py-2.5 text-label tracking-[0.15em] border border-border hover:bg-muted transition-colors active:scale-[0.97]">CANCEL</button></div></div></div>`);
	var root$8 = from_html(`<div class="space-y-6"><div class="flex items-center justify-between"><div><h2 class="text-2xl font-display font-bold mb-1">Lookbook</h2> <p class="text-sm text-muted-foreground"> </p></div> <button class="flex items-center gap-2 bg-foreground text-primary-foreground px-4 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg> ADD LOOKBOOK</button></div> <div class="grid gap-4"><!> <!></div> <!></div>`);

	function AdminLookbook($$anchor, $$props) {
		push($$props, false);

		let lookbooks = prop($$props, 'lookbooks', 24, () => []);
		let onUpdate = prop($$props, 'onUpdate', 8, () => {});
		let editing = mutable_source(null);
		let isNew = mutable_source(false);

		const empty = () => ({
			id: '',
			title: '',
			description: '',
			date: new Date().toISOString().slice(0, 10),
			coverImage: '',
			items: []
		});

		function handleSave() {
			if (get(isNew)) {
				onUpdate()([
					...lookbooks(),
					{ ...get(editing), id: `lb-${Date.now()}` }
				]);
			} else {
				onUpdate()(lookbooks().map((l) => l.id === get(editing).id ? get(editing) : l));
			}

			set(editing, null);
			set(isNew, false);
		}

		function handleDelete(id) {
			onUpdate()(lookbooks().filter((l) => l.id !== id));
		}

		// ── Item helpers ────────────────────────────────────────────────────────────
		function addItem(type) {
			set(editing, {
				...get(editing),
				items: [...get(editing).items, { type, url: '', caption: '' }]
			});
		}

		function removeItem(i) {
			set(editing, {
				...get(editing),
				items: get(editing).items.filter((_, idx) => idx !== i)
			});
		}

		function updateItem(i, field, val) {
			set(editing, {
				...get(editing),
				items: get(editing).items.map((item, idx) => idx === i ? { ...item, [field]: val } : item)
			});
		}

		function moveItem(i, dir) {
			const items = [...get(editing).items];
			const j = i + dir;

			if (j < 0 || j >= items.length) return;

			[items[i], items[j]] = [items[j], items[i]];
			set(editing, { ...get(editing), items });
		}

		init();

		var div = root$8();
		var div_1 = child(div);
		var div_2 = child(div_1);
		var p = sibling(child(div_2), 2);
		var text = child(p);

		var button = sibling(div_2, 2);

		var div_3 = sibling(div_1, 2);
		var node = child(div_3);

		each(node, 1, lookbooks, index, ($$anchor, lb) => {
			const cover = derived_safe_equal(() => (
				get(lb),
				untrack(() => get(lb).coverImage ?? get(lb).items?.find((i) => i.type !== 'video')?.url ?? get(lb).images?.[0])
			));

			var div_4 = root_1$b();
			var node_1 = child(div_4);

			{
				var consequent = ($$anchor) => {
					var img = root_2$g();

					template_effect(() => {
						set_attribute(img, 'src', get(cover));
						set_attribute(img, 'alt', (get(lb), untrack(() => get(lb).title)));
					});

					append($$anchor, img);
				};

				var alternate = ($$anchor) => {
					var div_5 = root_3$f();

					append($$anchor, div_5);
				};

				if_block(node_1, ($$render) => {
					if (get(cover)) $$render(consequent); else $$render(alternate, -1);
				});
			}

			var div_6 = sibling(node_1, 2);
			var p_1 = child(div_6);
			var text_1 = child(p_1);

			var p_2 = sibling(p_1, 2);
			var text_2 = child(p_2);

			var p_3 = sibling(p_2, 2);
			var text_3 = child(p_3);

			var div_7 = sibling(div_6, 2);
			var button_1 = child(div_7);
			var button_2 = sibling(button_1, 2);

			template_effect(() => {
				set_text(text_1, (get(lb), untrack(() => get(lb).title)));

				set_text(text_2, `${(get(lb), untrack(() => get(lb).date)) ?? ''} · ${(
				get(lb),
				untrack(() => (get(lb).items ?? get(lb).images ?? []).length)
			) ?? ''} item${(
				get(lb),
				untrack(() => (get(lb).items ?? get(lb).images ?? []).length !== 1 ? 's' : '')
			) ?? ''}`);

				set_text(text_3, (get(lb), untrack(() => get(lb).description)));
			});

			delegated('click', button_1, () => {
				set(editing, {
					...get(lb),
					items: get(lb).items ?? get(lb).images?.map((url) => ({ type: 'image', url, caption: '' })) ?? []
				});

				set(isNew, false);
			});

			delegated('click', button_2, () => handleDelete(get(lb).id));
			append($$anchor, div_4);
		});

		var node_2 = sibling(node, 2);

		{
			var consequent_1 = ($$anchor) => {
				var div_8 = root_4$b();

				append($$anchor, div_8);
			};

			if_block(node_2, ($$render) => {
				if ((
					deep_read_state(lookbooks()),
					untrack(() => !lookbooks().length)
				)) $$render(consequent_1);
			});
		}

		var node_3 = sibling(div_3, 2);

		{
			var consequent_3 = ($$anchor) => {
				var div_9 = root_5$d();
				var div_10 = child(div_9);
				var div_11 = child(div_10);
				var h3 = child(div_11);
				var text_4 = child(h3);

				var button_3 = sibling(h3, 2);

				var div_12 = sibling(div_11, 2);
				var div_13 = child(div_12);
				var div_14 = child(div_13);
				var input = sibling(child(div_14), 2);

				var div_15 = sibling(div_14, 2);
				var input_1 = sibling(child(div_15), 2);

				var div_16 = sibling(div_13, 2);
				var textarea = sibling(child(div_16), 2);
				set_attribute(textarea, 'rows', 2);

				var node_4 = sibling(div_16, 2);

				{
					let $0 = derived_safe_equal(() => (
						get(editing),
						untrack(() => get(editing).coverImage ?? '')
					));

					ImageUpload(node_4, {
						label: 'COVER IMAGE',
						get value() {
							return get($0);
						},
						onChange: (url) => set(editing, { ...get(editing), coverImage: url })
					});
				}

				var div_17 = sibling(node_4, 2);
				var p_4 = child(div_17);
				var span = sibling(child(p_4));
				var text_5 = child(span);

				var node_5 = sibling(p_4, 2);

				each(node_5, 1, () => (get(editing), untrack(() => get(editing).items)), index, ($$anchor, item, i) => {
					var div_18 = root_6$b();
					var div_19 = child(div_18);
					var span_1 = child(div_19);
					var text_6 = child(span_1);

					var div_20 = sibling(span_1, 2);
					var button_4 = child(div_20);

					button_4.disabled = i === 0;

					var button_5 = sibling(button_4, 2);
					var button_6 = sibling(button_5, 2);

					var node_6 = sibling(div_19, 2);

					{
						var consequent_2 = ($$anchor) => {
							ImageUpload($$anchor, {
								label: '',
								get value() {
									return (get(item), untrack(() => get(item).url));
								},
								onChange: (url) => updateItem(i, 'url', url)
							});
						};

						var alternate_1 = ($$anchor) => {
							var input_2 = root_8$8();

							template_effect(() => {
								set_value(input_2, (get(item), untrack(() => get(item).url)));

								set_attribute(input_2, 'placeholder', (
									get(item),
									untrack(() => get(item).type === 'embed' ? 'YouTube or Vimeo URL' : 'Video file URL')
								));
							});

							delegated('input', input_2, (e) => updateItem(i, 'url', e.target.value));
							append($$anchor, input_2);
						};

						if_block(node_6, ($$render) => {
							if ((get(item), untrack(() => get(item).type === 'image'))) $$render(consequent_2); else $$render(alternate_1, -1);
						});
					}

					var input_3 = sibling(node_6, 2);

					template_effect(() => {
						set_text(text_6, (get(item), untrack(() => get(item).type)));

						button_5.disabled = (
							get(editing),
							untrack(() => i === get(editing).items.length - 1)
						);

						set_value(input_3, (get(item), untrack(() => get(item).caption)));
					});

					delegated('click', button_4, () => moveItem(i, -1));
					delegated('click', button_5, () => moveItem(i, 1));
					delegated('click', button_6, () => removeItem(i));
					delegated('input', input_3, (e) => updateItem(i, 'caption', e.target.value));
					append($$anchor, div_18);
				});

				var div_21 = sibling(node_5, 2);
				var button_7 = child(div_21);
				var button_8 = sibling(button_7, 2);
				var button_9 = sibling(button_8, 2);

				var div_22 = sibling(div_12, 2);
				var button_10 = child(div_22);
				var button_11 = sibling(button_10, 2);

				template_effect(() => {
					set_text(text_4, get(isNew) ? 'Add Lookbook' : 'Edit Lookbook');
					set_text(text_5, `(${(get(editing), untrack(() => get(editing).items.length)) ?? ''} items)`);
				});

				delegated('click', button_3, () => {
					set(editing, null);
					set(isNew, false);
				});

				bind_value(input, () => get(editing).title, ($$value) => mutate(editing, get(editing).title = $$value));
				bind_value(input_1, () => get(editing).date, ($$value) => mutate(editing, get(editing).date = $$value));
				bind_value(textarea, () => get(editing).description, ($$value) => mutate(editing, get(editing).description = $$value));
				delegated('click', button_7, () => addItem('image'));
				delegated('click', button_8, () => addItem('video'));
				delegated('click', button_9, () => addItem('embed'));
				delegated('click', button_10, handleSave);

				delegated('click', button_11, () => {
					set(editing, null);
					set(isNew, false);
				});

				append($$anchor, div_9);
			};

			if_block(node_3, ($$render) => {
				if (get(editing)) $$render(consequent_3);
			});
		}

		template_effect(() => set_text(text, `${(
		deep_read_state(lookbooks()),
		untrack(() => lookbooks().length)
	) ?? ''} lookbook${(
		deep_read_state(lookbooks()),
		untrack(() => lookbooks().length !== 1 ? 's' : '')
	) ?? ''}`));

		delegated('click', button, () => {
			set(editing, empty());
			set(isNew, true);
		});

		append($$anchor, div);
		pop();
	}

	delegate(['click', 'input']);

	var root_2$f = from_html(`<div class="w-px bg-border mx-1 self-stretch"></div>`);
	var root_3$e = from_html(`<button type="button" class="px-2 py-1 text-xs font-medium hover:bg-muted rounded transition-colors min-w-[28px] text-center"> </button>`);
	var root_4$a = from_html(`<div class="w-3 h-3 border border-foreground/30 border-t-foreground rounded-full animate-spin"></div>`);
	var root_5$c = from_svg(`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>`);
	var root$7 = from_html(`<div class="border border-border focus-within:border-foreground transition-colors"><div class="flex flex-wrap gap-0.5 p-2 border-b border-border bg-muted/40"><!> <button type="button" title="Insert image" class="px-2 py-1 text-xs font-medium hover:bg-muted rounded transition-colors flex items-center gap-1"><!> IMG</button> <button type="button" title="Insert video file" class="px-2 py-1 text-xs font-medium hover:bg-muted rounded transition-colors flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"></path><rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect></svg> VID</button> <button type="button" title="Embed YouTube/Vimeo" class="px-2 py-1 text-xs font-medium hover:bg-muted rounded transition-colors flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"></path><path d="m10 15 5-3-5-3z"></path></svg> EMBED</button></div> <div contenteditable="true" class="min-h-[280px] p-4 text-sm focus:outline-none prose prose-sm max-w-none [&amp;_h2]:font-display [&amp;_h2]:font-bold [&amp;_h2]:text-xl [&amp;_h2]:my-3 [&amp;_h3]:font-display [&amp;_h3]:font-semibold [&amp;_h3]:text-lg [&amp;_h3]:my-2 [&amp;_p]:mb-3 [&amp;_ul]:list-disc [&amp;_ul]:ml-5 [&amp;_ol]:list-decimal [&amp;_ol]:ml-5 [&amp;_a]:underline [&amp;_a]:text-foreground [&amp;_img]:max-w-full [&amp;_img]:rounded [&amp;_video]:max-w-full"></div></div>`);

	function RichEditor($$anchor, $$props) {
		push($$props, false);

		// A contenteditable rich text editor with toolbar
		// Emits HTML via onChange
		let value = prop($$props, 'value', 8, '');

		let onChange = prop($$props, 'onChange', 8, () => {});
		let editor = mutable_source();
		let uploading = mutable_source(false);

		// Sync initial value once
		let initialized = mutable_source(false);

		function exec(cmd, arg = null) {
			get(editor).focus();
			document.execCommand(cmd, false, arg);
			emit();
		}

		function emit() {
			onChange()(get(editor).innerHTML);
		}

		async function insertImage() {
			const input = document.createElement('input');

			input.type = 'file';
			input.accept = 'image/jpeg,image/png,image/webp,image/gif';
			input.click();

			input.onchange = async () => {
				const file = input.files[0];

				if (!file) return;

				set(uploading, true);

				try {
					const fd = new FormData();

					fd.append('image', file);

					const res = await fetch('/api/upload', { method: 'POST', body: fd });
					const { url } = await res.json();

					exec('insertHTML', `<img src="${url}" alt="" style="max-width:100%;height:auto;margin:1rem 0;" />`);
				} finally {
					set(uploading, false);
				}
			};
		}

		async function insertVideo() {
			const input = document.createElement('input');

			input.type = 'file';
			input.accept = 'video/mp4,video/webm';
			input.click();

			input.onchange = async () => {
				const file = input.files[0];

				if (!file) return;

				set(uploading, true);

				try {
					const fd = new FormData();

					fd.append('image', file); // server accepts video too via updated mimetype filter

					const res = await fetch('/api/upload', { method: 'POST', body: fd });
					const { url } = await res.json();

					exec('insertHTML', `<video src="${url}" controls style="max-width:100%;height:auto;margin:1rem 0;"></video>`);
				} finally {
					set(uploading, false);
				}
			};
		}

		function insertEmbed() {
			const url = prompt('Paste a YouTube or Vimeo URL:');

			if (!url) return;

			let embedUrl = url;

			// Convert YouTube watch URL to embed URL
			const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);

			if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;

			// Convert Vimeo URL
			const vmMatch = url.match(/vimeo\.com\/(\d+)/);

			if (vmMatch) embedUrl = `https://player.vimeo.com/video/${vmMatch[1]}`;

			exec('insertHTML', `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1rem 0;"><iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allowfullscreen></iframe></div>`);
		}

		function insertLink() {
			const url = prompt('Enter URL:');

			if (url) exec('createLink', url);
		}

		const tools = [
			{ label: 'B', title: 'Bold', action: () => exec('bold') },
			{ label: 'I', title: 'Italic', action: () => exec('italic') },
			{
				label: 'H2',
				title: 'Heading 2',
				action: () => exec('formatBlock', 'h2')
			},

			{
				label: 'H3',
				title: 'Heading 3',
				action: () => exec('formatBlock', 'h3')
			},

			{
				label: '¶',
				title: 'Paragraph',
				action: () => exec('formatBlock', 'p')
			},
			{ label: '—', title: 'Divider', action: null },
			{
				label: '≡',
				title: 'Bullet list',
				action: () => exec('insertUnorderedList')
			},

			{
				label: '1.',
				title: 'Numbered list',
				action: () => exec('insertOrderedList')
			},
			{ label: '—', title: 'Divider', action: null },
			{ label: '🔗', title: 'Link', action: insertLink }
		];

		legacy_pre_effect(
			() => (
				get(editor),
				get(initialized),
				deep_read_state(value())
			),
			() => {
				if (get(editor) && !get(initialized) && value()) {
					mutate(editor, get(editor).innerHTML = value());
					set(initialized, true);
				}
			}
		);

		legacy_pre_effect_reset();
		init();

		var // server accepts video too via updated mimetype filter
		// Convert YouTube watch URL to embed URL
		// Convert Vimeo URL
		div = root$7();

		var div_1 = child(div);
		var node = child(div_1);

		each(node, 1, () => tools, index, ($$anchor, tool) => {
			var fragment = comment();
			var node_1 = first_child(fragment);

			{
				var consequent = ($$anchor) => {
					var div_2 = root_2$f();

					append($$anchor, div_2);
				};

				var alternate = ($$anchor) => {
					var button = root_3$e();
					var text = child(button);

					template_effect(() => {
						set_attribute(button, 'title', (get(tool), untrack(() => get(tool).title)));
						set_text(text, (get(tool), untrack(() => get(tool).label)));
					});

					delegated('click', button, function (...$$args) {
						get(tool).action?.apply(this, $$args);
					});

					append($$anchor, button);
				};

				if_block(node_1, ($$render) => {
					if ((
						get(tool),
						untrack(() => get(tool).title === 'Divider')
					)) $$render(consequent); else $$render(alternate, -1);
				});
			}

			append($$anchor, fragment);
		});

		var button_1 = sibling(node, 2);
		var node_2 = child(button_1);

		{
			var consequent_1 = ($$anchor) => {
				var div_3 = root_4$a();

				append($$anchor, div_3);
			};

			var alternate_1 = ($$anchor) => {
				var svg = root_5$c();

				append($$anchor, svg);
			};

			if_block(node_2, ($$render) => {
				if (get(uploading)) $$render(consequent_1); else $$render(alternate_1, -1);
			});
		}

		var button_2 = sibling(button_1, 2);
		var button_3 = sibling(button_2, 2);

		var div_4 = sibling(div_1, 2);

		bind_this(div_4, ($$value) => set(editor, $$value), () => get(editor));
		delegated('click', button_1, insertImage);
		delegated('click', button_2, insertVideo);
		delegated('click', button_3, insertEmbed);
		delegated('input', div_4, emit);
		append($$anchor, div);
		pop();
	}

	delegate(['click', 'input']);

	var root_1$a = from_html(`<tr class="border-b border-border/50 hover:bg-muted/50 transition-colors"><td class="p-3 font-medium"> </td><td class="p-3 text-muted-foreground hidden md:table-cell"> </td><td class="p-3 text-muted-foreground hidden md:table-cell"> </td><td class="p-3 text-center"><span> </span></td><td class="p-3 text-right"><div class="flex items-center justify-end gap-1"><button aria-label="Edit post" class="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg></button> <button aria-label="Delete post" class="p-1.5 text-muted-foreground hover:text-destructive transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path></svg></button></div></td></tr>`);
	var root_2$e = from_html(`<tr><td colspan="5" class="p-8 text-center text-muted-foreground text-sm">No posts yet.</td></tr>`);
	var root_4$9 = from_html(`<option> </option>`);
	var root_3$d = from_html(`<div class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4"><div class="bg-background border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-fade-up"><div class="flex items-center justify-between"><h3 class="text-lg font-display font-bold"> </h3> <button aria-label="Close" class="text-muted-foreground hover:text-foreground"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div> <div class="space-y-4"><div><label for="post-title" class="text-label block mb-1.5">TITLE</label> <input id="post-title" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div class="grid grid-cols-2 gap-4"><div><label for="post-slug" class="text-label block mb-1.5">SLUG</label> <input id="post-slug" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors font-mono"/></div> <div><label for="post-cat" class="text-label block mb-1.5">CATEGORY</label> <select id="post-cat" class="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"></select></div></div> <div class="grid grid-cols-2 gap-4"><div><label for="post-author" class="text-label block mb-1.5">AUTHOR</label> <input id="post-author" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div> <div><label for="post-date" class="text-label block mb-1.5">DATE</label> <input id="post-date" type="date" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"/></div></div> <div><label for="post-excerpt" class="text-label block mb-1.5">EXCERPT</label> <textarea id="post-excerpt" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea></div> <div><p class="text-label block mb-1.5">CONTENT</p> <!></div> <!> <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" class="accent-foreground"/> Published (visible on site)</label></div> <div class="flex gap-3 pt-2"><button class="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"></path></svg> SAVE</button> <button class="px-5 py-2.5 text-label tracking-[0.15em] border border-border hover:bg-muted transition-colors active:scale-[0.97]">CANCEL</button></div></div></div>`);
	var root$6 = from_html(`<div class="space-y-6"><div class="flex items-center justify-between"><div><h2 class="text-2xl font-display font-bold mb-1">Community</h2> <p class="text-sm text-muted-foreground"> </p></div> <button class="flex items-center gap-2 bg-foreground text-primary-foreground px-4 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg> ADD POST</button></div> <div class="bg-card border border-border overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-border"><th class="text-left text-label p-3">TITLE</th><th class="text-left text-label p-3 hidden md:table-cell">CATEGORY</th><th class="text-left text-label p-3 hidden md:table-cell">DATE</th><th class="text-center text-label p-3">STATUS</th><th class="text-right text-label p-3">ACTIONS</th></tr></thead><tbody><!><!></tbody></table></div> <!></div>`);

	function AdminCommunity($$anchor, $$props) {
		push($$props, false);

		let community = prop($$props, 'community', 24, () => []);
		let onUpdate = prop($$props, 'onUpdate', 8, () => {});
		let editing = mutable_source(null);
		let isNew = mutable_source(false);

		const empty = () => ({
			id: '',
			slug: '',
			title: '',
			excerpt: '',
			content: '',
			author: 'Others.',
			date: new Date().toISOString().slice(0, 10),
			category: 'Collection',
			image: '',
			published: true
		});

		function slugify(str) {
			return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		}

		function handleSave() {
			const post = {
				...get(editing),
				slug: get(editing).slug || slugify(get(editing).title)
			};

			if (get(isNew)) {
				onUpdate()([...community(), { ...post, id: `post-${Date.now()}` }]);
			} else {
				onUpdate()(community().map((p) => p.id === get(editing).id ? post : p));
			}

			set(editing, null);
			set(isNew, false);
		}

		function handleDelete(id) {
			onUpdate()(community().filter((p) => p.id !== id));
		}

		const CATEGORIES = [
			'Collection',
			'Community',
			'News',
			'Collaboration',
			'Culture',
			'Other'
		];

		init();

		var div = root$6();
		var div_1 = child(div);
		var div_2 = child(div_1);
		var p_1 = sibling(child(div_2), 2);
		var text = child(p_1);

		var button = sibling(div_2, 2);

		var div_3 = sibling(div_1, 2);
		var table = child(div_3);
		var tbody = sibling(child(table));
		var node = child(tbody);

		each(node, 1, community, index, ($$anchor, post) => {
			var tr = root_1$a();
			var td = child(tr);
			var text_1 = child(td);

			var td_1 = sibling(td);
			var text_2 = child(td_1);

			var td_2 = sibling(td_1);
			var text_3 = child(td_2);

			var td_3 = sibling(td_2);
			var span = child(td_3);
			var text_4 = child(span);

			var td_4 = sibling(td_3);
			var div_4 = child(td_4);
			var button_1 = child(div_4);
			var button_2 = sibling(button_1, 2);

			template_effect(() => {
				set_text(text_1, (get(post), untrack(() => get(post).title)));
				set_text(text_2, (get(post), untrack(() => get(post).category)));
				set_text(text_3, (get(post), untrack(() => get(post).date)));

				set_class(span, 1, `inline-block text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 font-medium ${(
				get(post),
				untrack(() => get(post).published
					? 'bg-green-100 text-green-700'
					: 'bg-muted text-muted-foreground')
			) ?? ''}`);

				set_text(text_4, (
					get(post),
					untrack(() => get(post).published ? 'Published' : 'Draft')
				));
			});

			delegated('click', button_1, () => {
				set(editing, { ...get(post) });
				set(isNew, false);
			});

			delegated('click', button_2, () => handleDelete(get(post).id));
			append($$anchor, tr);
		});

		var node_1 = sibling(node);

		{
			var consequent = ($$anchor) => {
				var tr_1 = root_2$e();

				append($$anchor, tr_1);
			};

			if_block(node_1, ($$render) => {
				if ((
					deep_read_state(community()),
					untrack(() => !community().length)
				)) $$render(consequent);
			});
		}

		var node_2 = sibling(div_3, 2);

		{
			var consequent_1 = ($$anchor) => {
				var div_5 = root_3$d();
				var div_6 = child(div_5);
				var div_7 = child(div_6);
				var h3 = child(div_7);
				var text_5 = child(h3);

				var button_3 = sibling(h3, 2);

				var div_8 = sibling(div_7, 2);
				var div_9 = child(div_8);
				var input = sibling(child(div_9), 2);

				var div_10 = sibling(div_9, 2);
				var div_11 = child(div_10);
				var input_1 = sibling(child(div_11), 2);

				var div_12 = sibling(div_11, 2);
				var select = sibling(child(div_12), 2);

				each(select, 5, () => CATEGORIES, index, ($$anchor, c) => {
					var option = root_4$9();
					var text_6 = child(option);

					var option_value = {};

					template_effect(() => {
						set_text(text_6, get(c));

						if (option_value !== (option_value = get(c))) {
							option.value = (option.__value = get(c)) ?? '';
						}
					});

					append($$anchor, option);
				});

				var div_13 = sibling(div_10, 2);
				var div_14 = child(div_13);
				var input_2 = sibling(child(div_14), 2);

				var div_15 = sibling(div_14, 2);
				var input_3 = sibling(child(div_15), 2);

				var div_16 = sibling(div_13, 2);
				var textarea = sibling(child(div_16), 2);
				set_attribute(textarea, 'rows', 2);

				var div_17 = sibling(div_16, 2);
				var node_3 = sibling(child(div_17), 2);

				RichEditor(node_3, {
					get value() {
						return (get(editing), untrack(() => get(editing).content));
					},
					onChange: (html) => set(editing, { ...get(editing), content: html })
				});

				var node_4 = sibling(div_17, 2);

				ImageUpload(node_4, {
					label: 'COVER IMAGE',
					get value() {
						return (get(editing), untrack(() => get(editing).image));
					},
					onChange: (url) => set(editing, { ...get(editing), image: url })
				});

				var label = sibling(node_4, 2);
				var input_4 = child(label);

				var div_18 = sibling(div_8, 2);
				var button_4 = child(div_18);
				var button_5 = sibling(button_4, 2);
				template_effect(() => set_text(text_5, get(isNew) ? 'New Post' : 'Edit Post'));

				delegated('click', button_3, () => {
					set(editing, null);
					set(isNew, false);
				});

				delegated('input', input, () => {
					if (get(isNew)) (
						mutate(editing, get(editing).slug = slugify(get(editing).title)),
						invalidate_inner_signals(() => {
						})
					);
				});

				bind_value(input, () => get(editing).title, ($$value) => (
					mutate(editing, get(editing).title = $$value),
					invalidate_inner_signals(() => {
					})
				));

				bind_value(input_1, () => get(editing).slug, ($$value) => (
					mutate(editing, get(editing).slug = $$value),
					invalidate_inner_signals(() => {
					})
				));

				bind_select_value(select, () => get(editing).category, ($$value) => (
					mutate(editing, get(editing).category = $$value),
					invalidate_inner_signals(() => {
					})
				));

				bind_value(input_2, () => get(editing).author, ($$value) => (
					mutate(editing, get(editing).author = $$value),
					invalidate_inner_signals(() => {
					})
				));

				bind_value(input_3, () => get(editing).date, ($$value) => (
					mutate(editing, get(editing).date = $$value),
					invalidate_inner_signals(() => {
					})
				));

				bind_value(textarea, () => get(editing).excerpt, ($$value) => (
					mutate(editing, get(editing).excerpt = $$value),
					invalidate_inner_signals(() => {
					})
				));

				bind_checked(input_4, () => get(editing).published, ($$value) => (
					mutate(editing, get(editing).published = $$value),
					invalidate_inner_signals(() => {
					})
				));

				delegated('click', button_4, handleSave);

				delegated('click', button_5, () => {
					set(editing, null);
					set(isNew, false);
				});

				append($$anchor, div_5);
			};

			if_block(node_2, ($$render) => {
				if (get(editing)) $$render(consequent_1);
			});
		}

		template_effect(() => set_text(text, `${(
		deep_read_state(community()),
		untrack(() => community().length)
	) ?? ''} post${(
		deep_read_state(community()),
		untrack(() => community().length !== 1 ? 's' : '')
	) ?? ''}`));

		delegated('click', button, () => {
			set(editing, empty());
			set(isNew, true);
		});

		append($$anchor, div);
		pop();
	}

	delegate(['click', 'input']);

	var root_1$9 = from_html(`<button> </button>`);
	var root_2$d = from_html(`<div class="space-y-4"><p class="text-xs text-muted-foreground">Supports HTML. Use &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, etc.</p> <textarea class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-y font-mono"></textarea></div>`);
	var root_4$8 = from_html(`<div class="border border-border p-4 space-y-3"><div class="flex items-center justify-between"><span class="text-label"></span> <button aria-label="Remove FAQ" class="text-muted-foreground hover:text-destructive"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div> <input placeholder="Question" class="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors"/> <textarea placeholder="Answer" class="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea></div>`);
	var root_3$c = from_html(`<div class="space-y-4"><!> <button class="flex items-center gap-2 border border-dashed border-border px-4 py-3 w-full text-label text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg> ADD QUESTION</button></div>`);
	var root_6$a = from_html(`<div class="flex gap-2 items-start"><input placeholder="Label (e.g. General Enquiries)" class="flex-1 bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors"/> <input placeholder="Value (e.g. email or phone)" class="flex-1 bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors"/> <button aria-label="Remove contact" class="p-2 text-muted-foreground hover:text-destructive transition-colors mt-0.5"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>`);
	var root_5$b = from_html(`<div class="space-y-4"><div><label for="contact-address" class="text-label block mb-1.5">ADDRESS</label> <textarea id="contact-address" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea></div> <div class="space-y-3"><p class="text-label">CONTACT DETAILS</p> <!> <button class="flex items-center gap-2 border border-dashed border-border px-4 py-3 w-full text-label text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg> ADD CONTACT</button></div></div>`);
	var root$5 = from_html(`<div class="space-y-6 max-w-3xl"><div><h2 class="text-2xl font-display font-bold mb-1">Pages</h2> <p class="text-sm text-muted-foreground">Edit public-facing informational pages.</p></div> <div class="flex gap-2 border-b border-border pb-4"></div> <!> <button class="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"></path></svg> </button></div>`);

	function AdminPages($$anchor, $$props) {
		push($$props, false);

		let pages = prop($$props, 'pages', 24, () => ({}));
		let onUpdate = prop($$props, 'onUpdate', 8, () => {});
		let section = mutable_source('shipping');
		let shipping = mutable_source(pages().shipping?.content ?? '');

		let faq = mutable_source(Array.isArray(pages().faq)
			? JSON.parse(JSON.stringify(pages().faq))
			: pages().faq?.items ? JSON.parse(JSON.stringify(pages().faq.items)) : []);

		let contact = mutable_source(pages().contact
			? JSON.parse(JSON.stringify(pages().contact))
			: { address: '', details: [] });

		let saved = mutable_source(false);

		function save() {
			onUpdate()({
				shipping: { content: get(shipping) },
				faq: { items: get(faq) },
				contact: get(contact)
			});

			set(saved, true);
			setTimeout(() => set(saved, false), 2000);
		}

		function addFaq() {
			set(faq, [
				...get(faq),
				{ id: `faq-${Date.now()}`, question: '', answer: '' }
			]);
		}

		function removeFaq(id) {
			set(faq, get(faq).filter((f) => f.id !== id));
		}

		function addContact() {
			set(contact, {
				...get(contact),
				details: [
					...get(contact).details,
					{ id: `c-${Date.now()}`, label: '', value: '' }
				]
			});
		}

		function removeContact(id) {
			set(contact, {
				...get(contact),
				details: get(contact).details.filter((d) => d.id !== id)
			});
		}

		init();

		var div = root$5();
		var div_1 = sibling(child(div), 2);

		each(
			div_1,
			4,
			() => [
				['shipping', 'Shipping & Returns'],
				['faq', 'FAQ'],
				['contact', 'Contact']
			],
			index,
			($$anchor, $$item) => {
				var $$array = user_derived(() => to_array($$item, 2));
				let key = () => get($$array)[0];
				let label = () => get($$array)[1];
				var button = root_1$9();
				var text = child(button);

				template_effect(() => {
					set_class(button, 1, `px-4 py-2 text-label tracking-[0.15em] transition-colors ${get(section) === key()
					? 'bg-foreground text-primary-foreground'
					: 'hover:bg-muted text-muted-foreground hover:text-foreground'}`);

					set_text(text, label());
				});

				delegated('click', button, () => set(section, key()));
				append($$anchor, button);
			}
		);

		var node = sibling(div_1, 2);

		{
			var consequent = ($$anchor) => {
				var div_2 = root_2$d();
				var textarea = sibling(child(div_2), 2);
				set_attribute(textarea, 'rows', 16);
				bind_value(textarea, () => get(shipping), ($$value) => set(shipping, $$value));
				append($$anchor, div_2);
			};

			var consequent_1 = ($$anchor) => {
				var div_3 = root_3$c();
				var node_1 = child(div_3);

				each(node_1, 1, () => get(faq), index, ($$anchor, item, i) => {
					var div_4 = root_4$8();
					var div_5 = child(div_4);
					var span = child(div_5);

					span.textContent = `Q${i + 1}`;

					var button_1 = sibling(span, 2);

					var input = sibling(div_5, 2);

					var textarea_1 = sibling(input, 2);
					set_attribute(textarea_1, 'rows', 2);
					delegated('click', button_1, () => removeFaq(get(item).id));

					bind_value(input, () => get(item).question, ($$value) => (
						get(item).question = $$value,
						invalidate_inner_signals(() => (get(faq)))
					));

					bind_value(textarea_1, () => get(item).answer, ($$value) => (
						get(item).answer = $$value,
						invalidate_inner_signals(() => (get(faq)))
					));

					append($$anchor, div_4);
				});

				var button_2 = sibling(node_1, 2);
				delegated('click', button_2, addFaq);
				append($$anchor, div_3);
			};

			var consequent_2 = ($$anchor) => {
				var div_6 = root_5$b();
				var div_7 = child(div_6);
				var textarea_2 = sibling(child(div_7), 2);
				set_attribute(textarea_2, 'rows', 2);

				var div_8 = sibling(div_7, 2);
				var node_2 = sibling(child(div_8), 2);

				each(node_2, 1, () => (get(contact), untrack(() => get(contact).details)), index, ($$anchor, detail, $$index_2) => {
					var div_9 = root_6$a();
					var input_1 = child(div_9);

					var input_2 = sibling(input_1, 2);

					var button_3 = sibling(input_2, 2);

					bind_value(input_1, () => get(detail).label, ($$value) => (
						get(detail).label = $$value,
						invalidate_inner_signals(() => (get(contact)))
					));

					bind_value(input_2, () => get(detail).value, ($$value) => (
						get(detail).value = $$value,
						invalidate_inner_signals(() => (get(contact)))
					));

					delegated('click', button_3, () => removeContact(get(detail).id));
					append($$anchor, div_9);
				});

				var button_4 = sibling(node_2, 2);
				bind_value(textarea_2, () => get(contact).address, ($$value) => mutate(contact, get(contact).address = $$value));
				delegated('click', button_4, addContact);
				append($$anchor, div_6);
			};

			if_block(node, ($$render) => {
				if (get(section) === 'shipping') $$render(consequent); else if (get(section) === 'faq') $$render(consequent_1, 1); else if (get(section) === 'contact') $$render(consequent_2, 2);
			});
		}

		var button_5 = sibling(node, 2);
		var text_1 = sibling(child(button_5));
		template_effect(() => set_text(text_1, ` ${get(saved) ? 'SAVED!' : 'SAVE CHANGES'}`));
		delegated('click', button_5, save);
		append($$anchor, div);
		pop();
	}

	delegate(['click']);

	var root_1$8 = from_html(`<button class="flex items-center gap-2 border border-border px-4 py-2.5 text-label tracking-[0.15em] hover:bg-muted transition-colors active:scale-[0.97]"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" x2="12" y1="15" y2="3"></line></svg> EXPORT CSV</button>`);
	var root_2$c = from_html(`<tr class="border-b border-border/50 hover:bg-muted/50 transition-colors"><td class="p-3 font-medium"> </td><td class="p-3 text-muted-foreground hidden md:table-cell"> </td><td class="p-3 text-right"><button aria-label="Remove subscriber" class="p-1.5 text-muted-foreground hover:text-destructive transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg></button></td></tr>`);
	var root_3$b = from_html(`<tr><td colspan="3" class="p-8 text-center text-muted-foreground text-sm">No subscribers yet. The newsletter form in the footer collects emails.</td></tr>`);
	var root$4 = from_html(`<div class="space-y-6"><div class="flex items-center justify-between"><div><h2 class="text-2xl font-display font-bold mb-1">Newsletter Subscribers</h2> <p class="text-sm text-muted-foreground"> </p></div> <!></div> <div class="bg-card border border-border overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-border"><th class="text-left text-label p-3">EMAIL</th><th class="text-left text-label p-3 hidden md:table-cell">DATE SUBSCRIBED</th><th class="text-right text-label p-3">REMOVE</th></tr></thead><tbody><!><!></tbody></table></div></div>`);

	function AdminSubscribers($$anchor, $$props) {
		push($$props, false);

		let subscribers = prop($$props, 'subscribers', 24, () => []);
		let onUpdate = prop($$props, 'onUpdate', 8, () => {});

		function exportCSV() {
			const rows = [
				['Email', 'Date'],
				...subscribers().map((s) => [s.email, s.date])
			];

			const csv = rows.map((r) => r.join(',')).join('\n');
			const blob = new Blob([csv], { type: 'text/csv' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');

			a.href = url;
			a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
			a.click();
			URL.revokeObjectURL(url);
		}

		function removeSubscriber(id) {
			onUpdate()(subscribers().filter((s) => s.id !== id));
		}

		init();

		var div = root$4();
		var div_1 = child(div);
		var div_2 = child(div_1);
		var p = sibling(child(div_2), 2);
		var text = child(p);

		var node = sibling(div_2, 2);

		{
			var consequent = ($$anchor) => {
				var button = root_1$8();

				delegated('click', button, exportCSV);
				append($$anchor, button);
			};

			if_block(node, ($$render) => {
				if ((
					deep_read_state(subscribers()),
					untrack(() => subscribers().length > 0)
				)) $$render(consequent);
			});
		}

		var div_3 = sibling(div_1, 2);
		var table = child(div_3);
		var tbody = sibling(child(table));
		var node_1 = child(tbody);

		each(node_1, 1, subscribers, index, ($$anchor, sub) => {
			var tr = root_2$c();
			var td = child(tr);
			var text_1 = child(td);

			var td_1 = sibling(td);
			var text_2 = child(td_1);

			var td_2 = sibling(td_1);
			var button_1 = child(td_2);

			template_effect(() => {
				set_text(text_1, (get(sub), untrack(() => get(sub).email)));
				set_text(text_2, (get(sub), untrack(() => get(sub).date)));
			});

			delegated('click', button_1, () => removeSubscriber(get(sub).id));
			append($$anchor, tr);
		});

		var node_2 = sibling(node_1);

		{
			var consequent_1 = ($$anchor) => {
				var tr_1 = root_3$b();

				append($$anchor, tr_1);
			};

			if_block(node_2, ($$render) => {
				if ((
					deep_read_state(subscribers()),
					untrack(() => !subscribers().length)
				)) $$render(consequent_1);
			});
		}

		template_effect(() => set_text(text, `${(
		deep_read_state(subscribers()),
		untrack(() => subscribers().length)
	) ?? ''} subscriber${(
		deep_read_state(subscribers()),
		untrack(() => subscribers().length !== 1 ? 's' : '')
	) ?? ''}`));

		append($$anchor, div);
		pop();
	}

	delegate(['click']);

	var root_1$7 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_3$a = from_html(`<p class="text-xs text-destructive"> </p>`);
	var root_2$b = from_html(`<div class="flex min-h-screen items-center justify-center flex-col gap-4"><p class="text-muted-foreground">Could not connect to the database.</p> <!> <button class="border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">Retry</button></div>`);
	var root_5$a = from_html(`<div class="fixed bottom-4 right-4 z-50 bg-destructive text-destructive-foreground px-4 py-2 text-sm shadow-lg animate-fade-up max-w-xs"> </div>`);
	var root_6$9 = from_html(`<div class="fixed bottom-4 right-4 z-50 bg-foreground text-primary-foreground px-4 py-2 text-sm shadow-lg animate-fade-up flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"></path></svg> Saved to database</div>`);
	var root_4$7 = from_html(`<!> <!> <!>`, 1);

	function Admin($$anchor, $$props) {
		push($$props, false);

		let data = mutable_source(null);
		let loading = mutable_source(true);
		let saveError = mutable_source(null);
		let saveSuccess = mutable_source(false);
		let activeSection = mutable_source('dashboard');

		// ── Read from MongoDB (via /api/data) ─────────────────────────────────────
		async function loadData() {
			const res = await fetch('/api/data');

			if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);

			return res.json();
		}

		// ── Write to MongoDB (via POST /api/data) ──────────────────────────────────
		async function saveData(updated) {
			set(saveError, null);

			const res = await fetch('/api/data', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updated),
				credentials: 'include'
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));

				throw new Error(body.error || `Save failed: ${res.status}`);
			}

			set(saveSuccess, true);
			setTimeout(() => set(saveSuccess, false), 2000);

			// Re-fetch fresh data from DB to confirm what was persisted
			set(data, await loadData());
		}

		onMount(async () => {
			try {
				set(data, await loadData());
			} catch(e) {
				console.error('Admin load error:', e);
				set(saveError, e.message);
			} finally {
				set(loading, false);
			}
		});

		// ── Section update handlers — each calls saveData with the full merged object
		async function updateSection(key, value) {
			const updated = { ...get(data), [key]: value };

			set(data, updated // optimistic update
			);

			try {
				await saveData(updated);
			} catch(e) {
				set(saveError, e.message);
			}
		}

		function updateProducts(products) {
			updateSection('products', products);
		}

		function updateOrders(orders) {
			updateSection('orders', orders);
		}

		function updateSite(site) {
			updateSection('site', site);
		}

		function updateLookbooks(lookbooks) {
			updateSection('lookbooks', lookbooks);
		}

		function updateCommunity(community) {
			updateSection('community', community);
		}

		function updatePages(pages) {
			updateSection('pages', pages);
		}

		function updateSubscribers(subs) {
			updateSection('subscribers', subs);
		}

		async function resetData() {
			if (!confirm('Reset ALL store data? This cannot be undone.')) return;

			set(data, await loadData());
		}

		function navigate(section) {
			set(activeSection, section);
		}

		init();

		var fragment = comment();
		var node = first_child(fragment);

		{
			var consequent = ($$anchor) => {
				var div = root_1$7();

				append($$anchor, div);
			};

			var consequent_2 = ($$anchor) => {
				var div_1 = root_2$b();
				var node_1 = sibling(child(div_1), 2);

				{
					var consequent_1 = ($$anchor) => {
						var p = root_3$a();
						var text = child(p);
						template_effect(() => set_text(text, get(saveError)));
						append($$anchor, p);
					};

					if_block(node_1, ($$render) => {
						if (get(saveError)) $$render(consequent_1);
					});
				}

				var button = sibling(node_1, 2);
				delegated('click', button, () => location.reload());
				append($$anchor, div_1);
			};

			var alternate = ($$anchor) => {
				var fragment_1 = root_4$7();
				var node_2 = first_child(fragment_1);

				{
					var consequent_3 = ($$anchor) => {
						var div_2 = root_5$a();
						var text_1 = child(div_2);
						template_effect(() => set_text(text_1, get(saveError)));
						append($$anchor, div_2);
					};

					if_block(node_2, ($$render) => {
						if (get(saveError)) $$render(consequent_3);
					});
				}

				var node_3 = sibling(node_2, 2);

				{
					var consequent_4 = ($$anchor) => {
						var div_3 = root_6$9();

						append($$anchor, div_3);
					};

					if_block(node_3, ($$render) => {
						if (get(saveSuccess)) $$render(consequent_4);
					});
				}

				var node_4 = sibling(node_3, 2);

				AdminLayout(node_4, {
					get activeSection() {
						return get(activeSection);
					},
					navigate,
					children: ($$anchor, $$slotProps) => {
						var fragment_2 = comment();
						var node_5 = first_child(fragment_2);

						{
							var consequent_5 = ($$anchor) => {
								AdminDashboard($$anchor, {
									get data() {
										return get(data);
									}
								});
							};

							var consequent_6 = ($$anchor) => {
								AdminProducts($$anchor, {
									get products() {
										return get(data).products;
									},

									get currency() {
										return get(data).site.currency;
									},
									onUpdate: updateProducts
								});
							};

							var consequent_7 = ($$anchor) => {
								AdminOrders($$anchor, {
									get orders() {
										return get(data).orders;
									},

									get currency() {
										return get(data).site.currency;
									},
									onUpdate: updateOrders
								});
							};

							var consequent_8 = ($$anchor) => {
								AdminLookbook($$anchor, {
									get lookbooks() {
										return get(data).lookbooks;
									},
									onUpdate: updateLookbooks
								});
							};

							var consequent_9 = ($$anchor) => {
								AdminCommunity($$anchor, {
									get community() {
										return get(data).community;
									},
									onUpdate: updateCommunity
								});
							};

							var consequent_10 = ($$anchor) => {
								AdminPages($$anchor, {
									get pages() {
										return get(data).pages;
									},
									onUpdate: updatePages
								});
							};

							var consequent_11 = ($$anchor) => {
								AdminSubscribers($$anchor, {
									get subscribers() {
										return get(data).subscribers;
									},
									onUpdate: updateSubscribers
								});
							};

							var consequent_12 = ($$anchor) => {
								AdminSettings($$anchor, {
									get site() {
										return get(data).site;
									},

									get lookbooks() {
										return get(data).lookbooks;
									},
									onUpdate: updateSite,
									onReset: resetData
								});
							};

							if_block(node_5, ($$render) => {
								if (get(activeSection) === 'dashboard') $$render(consequent_5); else if (get(activeSection) === 'products') $$render(consequent_6, 1); else if (get(activeSection) === 'orders') $$render(consequent_7, 2); else if (get(activeSection) === 'lookbook') $$render(consequent_8, 3); else if (get(activeSection) === 'community') $$render(consequent_9, 4); else if (get(activeSection) === 'pages') $$render(consequent_10, 5); else if (get(activeSection) === 'subscribers') $$render(consequent_11, 6); else if (get(activeSection) === 'settings') $$render(consequent_12, 7);
							});
						}

						append($$anchor, fragment_2);
					},
					$$slots: { default: true }
				});

				append($$anchor, fragment_1);
			};

			if_block(node, ($$render) => {
				if (get(loading)) $$render(consequent); else if (!get(data)) $$render(consequent_2, 1); else $$render(alternate, -1);
			});
		}

		append($$anchor, fragment);
		pop();
	}

	delegate(['click']);

	var root_1$6 = from_html(`<meta name="description" content="Browse the full Others. collection — hoodies, tees, cargo pants, jackets and accessories."/>`);
	var root_2$a = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_5$9 = from_html(`<button> </button>`);
	var root_6$8 = from_html(`<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6"></div>`);
	var root_8$7 = from_html(`<div class="text-center py-24 text-muted-foreground">No products in this category.</div>`);
	var root_3$9 = from_html(`<div class="min-h-screen"><!> <div class="pt-28 pb-20 px-6 md:px-10 max-w-7xl mx-auto"><div class="mb-10"><p class="text-label mb-2">Collection</p> <h1 class="text-4xl md:text-5xl font-display font-bold">All Products</h1></div> <div class="flex flex-wrap gap-2 mb-10 border-b border-border pb-6"><button> </button> <!></div> <!></div> <!></div>`);

	function Products($$anchor, $$props) {
		push($$props, false);

		const filtered = mutable_source();
		let data = mutable_source(null);
		let loading = mutable_source(true);
		let activeCategory = mutable_source('all');

		onMount(async () => {
			try {
				set(data, await loadStoreData());
			} finally {
				set(loading, false);
			}
		});

		legacy_pre_effect(() => (get(data), get(activeCategory)), () => {
			set(filtered, get(data)
				? get(activeCategory) === 'all'
					? get(data).products
					: get(data).products.filter((p) => p.category === get(activeCategory))
				: []);
		});

		legacy_pre_effect_reset();
		init();

		var fragment = comment();

		head('1dxun1a', ($$anchor) => {
			var meta = root_1$6();

			deferred_template_effect(() => {
				$document.title = (
					get(data),
					untrack(() => get(data) ? `Shop All — ${get(data).site.name}` : 'Shop')
				) ?? '';
			});

			append($$anchor, meta);
		});

		var node = first_child(fragment);

		{
			var consequent = ($$anchor) => {
				var div = root_2$a();

				append($$anchor, div);
			};

			var alternate_1 = ($$anchor) => {
				var div_1 = root_3$9();
				var node_1 = child(div_1);

				Navbar(node_1, {
					get siteName() {
						return (get(data), untrack(() => get(data).site.name));
					},

					get logo() {
						return (get(data), untrack(() => get(data).site.logo));
					}
				});

				var div_2 = sibling(node_1, 2);
				var div_3 = sibling(child(div_2), 2);
				var button = child(div_3);
				var text = child(button);

				var node_2 = sibling(button, 2);

				each(node_2, 1, () => (get(data), untrack(() => get(data).categories)), index, ($$anchor, cat) => {
					const count = derived_safe_equal(() => (
						get(data),
						untrack(() => get(data).products.filter((p) => p.category === get(cat).id).length)
					));

					var fragment_1 = comment();
					var node_3 = first_child(fragment_1);

					{
						var consequent_1 = ($$anchor) => {
							var button_1 = root_5$9();
							var text_1 = child(button_1);

							template_effect(
								($0) => {
									set_class(button_1, 1, `px-4 py-2 text-label tracking-[0.15em] transition-colors ${(
									get(activeCategory),
									get(cat),
									untrack(() => get(activeCategory) === get(cat).id
										? 'bg-foreground text-primary-foreground'
										: 'border border-border hover:bg-muted')
								) ?? ''}`);

									set_text(text_1, `${$0 ?? ''} (${get(count) ?? ''})`);
								},
								[
									() => (get(cat), untrack(() => get(cat).name.toUpperCase()))
								]
							);

							delegated('click', button_1, () => set(activeCategory, get(cat).id));
							append($$anchor, button_1);
						};

						if_block(node_3, ($$render) => {
							if (get(count) > 0) $$render(consequent_1);
						});
					}

					append($$anchor, fragment_1);
				});

				var node_4 = sibling(div_3, 2);

				{
					var consequent_2 = ($$anchor) => {
						var div_4 = root_6$8();

						each(div_4, 5, () => get(filtered), index, ($$anchor, product) => {
							ProductCard($$anchor, {
								get product() {
									return get(product);
								},

								get currency() {
									return (get(data), untrack(() => get(data).site.currency));
								}
							});
						});
						append($$anchor, div_4);
					};

					var alternate = ($$anchor) => {
						var div_5 = root_8$7();

						append($$anchor, div_5);
					};

					if_block(node_4, ($$render) => {
						if ((get(filtered), untrack(() => get(filtered).length))) $$render(consequent_2); else $$render(alternate, -1);
					});
				}

				var node_5 = sibling(div_2, 2);

				Footer(node_5, {
					get site() {
						return (get(data), untrack(() => get(data).site));
					}
				});

				template_effect(() => {
					set_class(button, 1, `px-4 py-2 text-label tracking-[0.15em] transition-colors ${get(activeCategory) === 'all'
					? 'bg-foreground text-primary-foreground'
					: 'border border-border hover:bg-muted'}`);

					set_text(text, `ALL (${(get(data), untrack(() => get(data).products.length)) ?? ''})`);
				});

				delegated('click', button, () => set(activeCategory, 'all'));
				append($$anchor, div_1);
			};

			if_block(node, ($$render) => {
				if (get(loading) || !get(data)) $$render(consequent); else $$render(alternate_1, -1);
			});
		}

		append($$anchor, fragment);
		pop();
	}

	delegate(['click']);

	var root_2$9 = from_html(`<meta name="description"/>`);
	var root_4$6 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_5$8 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background flex-col gap-4"><p class="text-muted-foreground">Product not found.</p> <a href="/products" class="text-label border-b border-current">← Back to Shop</a></div>`);
	var root_8$6 = from_html(`<button><img alt="" class="w-full h-full object-cover"/></button>`);
	var root_7$6 = from_html(`<div class="flex gap-2 flex-wrap"></div>`);
	var root_9$6 = from_html(`<span class="inline-block text-[10px] tracking-[0.2em] uppercase bg-foreground text-primary-foreground px-2 py-0.5 mb-3">New</span>`);
	var root_11$3 = from_html(`<span class="text-xs border border-border px-3 py-1.5"> </span>`);
	var root_10$5 = from_html(`<div><p class="text-label mb-3"> </p> <div class="flex gap-2"></div></div>`);
	var root_13$2 = from_html(`<button> </button>`);
	var root_12$2 = from_html(`<div><p class="text-label mb-3">SIZE</p> <div class="flex flex-wrap gap-2"></div></div>`);
	var root_14$2 = from_html(`<p class="text-xs text-store-rust font-medium"> </p>`);
	var root_6$7 = from_html(`<div class="min-h-screen"><!> <div class="pt-24 pb-20 px-6 md:px-10 max-w-6xl mx-auto"><nav class="mb-8 text-xs text-muted-foreground flex items-center gap-2"><a href="/" class="hover:text-foreground transition-colors">Home</a> <span>/</span> <a href="/products" class="hover:text-foreground transition-colors">Shop</a> <span>/</span> <span class="text-foreground"> </span></nav> <div class="grid md:grid-cols-2 gap-10 lg:gap-16"><div class="space-y-3"><div class="aspect-[4/5] bg-secondary overflow-hidden"><img class="w-full h-full object-cover transition-opacity duration-300"/></div> <!></div> <div class="space-y-6"><div><!> <h1 class="text-3xl md:text-4xl font-display font-bold leading-tight mb-2"> </h1> <p class="text-2xl font-medium tabular-nums"> </p></div> <p class="text-sm text-muted-foreground leading-relaxed"> </p> <!> <!> <div class="space-y-3 pt-2"><button> </button> <a href="/cart" class="block w-full py-3.5 text-label tracking-[0.25em] text-center border border-border hover:bg-muted transition-colors">VIEW CART</a></div> <!></div></div></div> <!></div>`);

	function Product($$anchor, $$props) {
		push($$props, false);

		const images = mutable_source();
		let productId = prop($$props, 'productId', 8, '');
		let data = mutable_source(null);
		let product = mutable_source(null);
		let loading = mutable_source(true);
		let selectedSize = mutable_source('');
		let selectedImage = mutable_source(0);
		let added = mutable_source(false);

		onMount(async () => {
			try {
				set(data, await loadStoreData());
				set(product, get(data).products.find((p) => p.id === productId()) ?? null);

				if (get(product)) set(selectedSize, get(product).sizes[0] || '');
			} finally {
				set(loading, false);
			}
		});

		function addToCart() {
			if (!get(selectedSize) || !get(product)) return;

			cart.addItem(get(product), get(selectedSize));
			set(added, true);
			setTimeout(() => set(added, false), 2000);
		}

		legacy_pre_effect(() => (get(product)), () => {
			set(images, get(product)
				? get(product).images?.length ? get(product).images : [get(product).image]
				: []);
		});

		legacy_pre_effect_reset();
		init();

		var fragment_1 = comment();

		head('bpq9gz', ($$anchor) => {
			var fragment = comment();
			var node = first_child(fragment);

			{
				var consequent = ($$anchor) => {
					var meta = root_2$9();

					template_effect(() => set_attribute(meta, 'content', (get(product), untrack(() => get(product).description))));

					deferred_template_effect(() => {
						$document.title = `${(get(product), untrack(() => get(product).name)) ?? ''} — ${(
						get(data),
						untrack(() => get(data)?.site?.name ?? 'Others.')
					) ?? ''}`;
					});

					append($$anchor, meta);
				};

				var alternate = ($$anchor) => {
					effect(() => {
						$document.title = 'Product — Others.';
					});
				};

				if_block(node, ($$render) => {
					if (get(product)) $$render(consequent); else $$render(alternate, -1);
				});
			}

			append($$anchor, fragment);
		});

		var node_1 = first_child(fragment_1);

		{
			var consequent_1 = ($$anchor) => {
				var div = root_4$6();

				append($$anchor, div);
			};

			var consequent_2 = ($$anchor) => {
				var div_1 = root_5$8();

				append($$anchor, div_1);
			};

			var alternate_1 = ($$anchor) => {
				var div_2 = root_6$7();
				var node_2 = child(div_2);

				Navbar(node_2, {
					get siteName() {
						return (get(data), untrack(() => get(data).site.name));
					},

					get logo() {
						return (get(data), untrack(() => get(data).site.logo));
					}
				});

				var div_3 = sibling(node_2, 2);
				var nav = child(div_3);
				var span = sibling(child(nav), 8);
				var text = child(span);

				var div_4 = sibling(nav, 2);
				var div_5 = child(div_4);
				var div_6 = child(div_5);
				var img_1 = child(div_6);

				var node_3 = sibling(div_6, 2);

				{
					var consequent_3 = ($$anchor) => {
						var div_7 = root_7$6();

						each(div_7, 5, () => get(images), index, ($$anchor, img, i) => {
							var button = root_8$6();

							set_attribute(button, 'aria-label', `View image ${i + 1}`);

							var img_2 = child(button);

							template_effect(() => {
								set_class(button, 1, `w-16 h-16 border-2 transition-colors overflow-hidden flex-shrink-0 ${get(selectedImage) === i ? 'border-foreground' : 'border-transparent'}`);
								set_attribute(img_2, 'src', get(img));
							});

							delegated('click', button, () => set(selectedImage, i));
							append($$anchor, button);
						});
						append($$anchor, div_7);
					};

					if_block(node_3, ($$render) => {
						if ((get(images), untrack(() => get(images).length > 1))) $$render(consequent_3);
					});
				}

				var div_8 = sibling(div_5, 2);
				var div_9 = child(div_8);
				var node_4 = child(div_9);

				{
					var consequent_4 = ($$anchor) => {
						var span_1 = root_9$6();

						append($$anchor, span_1);
					};

					if_block(node_4, ($$render) => {
						if ((get(product), untrack(() => get(product).isNew))) $$render(consequent_4);
					});
				}

				var h1 = sibling(node_4, 2);
				var text_1 = child(h1);

				var p_1 = sibling(h1, 2);
				var text_2 = child(p_1);

				var p_2 = sibling(div_9, 2);
				var text_3 = child(p_2);

				var node_5 = sibling(p_2, 2);

				{
					var consequent_5 = ($$anchor) => {
						var div_10 = root_10$5();
						var p_3 = child(div_10);
						var text_4 = child(p_3);

						var div_11 = sibling(p_3, 2);

						each(div_11, 5, () => (get(product), untrack(() => get(product).colors)), index, ($$anchor, color) => {
							var span_2 = root_11$3();
							var text_5 = child(span_2);
							template_effect(() => set_text(text_5, get(color)));
							append($$anchor, span_2);
						});
						template_effect(() => set_text(text_4, `COLOR: ${(get(product), untrack(() => get(product).colors[0])) ?? ''}`));
						append($$anchor, div_10);
					};

					if_block(node_5, ($$render) => {
						if ((
							get(product),
							untrack(() => get(product).colors?.length)
						)) $$render(consequent_5);
					});
				}

				var node_6 = sibling(node_5, 2);

				{
					var consequent_6 = ($$anchor) => {
						var div_12 = root_12$2();
						var div_13 = sibling(child(div_12), 2);

						each(div_13, 5, () => (get(product), untrack(() => get(product).sizes)), index, ($$anchor, size) => {
							var button_1 = root_13$2();
							var text_6 = child(button_1);

							template_effect(() => {
								button_1.disabled = (get(product), untrack(() => get(product).stock === 0));

								set_class(button_1, 1, `border px-4 py-2 text-sm transition-colors ${get(selectedSize) === get(size)
								? 'bg-foreground text-primary-foreground border-foreground'
								: 'border-border hover:border-foreground'} ${(
								get(product),
								untrack(() => get(product).stock === 0 ? 'opacity-40 cursor-not-allowed line-through' : '')
							) ?? ''}`);

								set_text(text_6, get(size));
							});

							delegated('click', button_1, () => set(selectedSize, get(size)));
							append($$anchor, button_1);
						});
						append($$anchor, div_12);
					};

					if_block(node_6, ($$render) => {
						if ((
							get(product),
							untrack(() => get(product).sizes?.length)
						)) $$render(consequent_6);
					});
				}

				var div_14 = sibling(node_6, 2);
				var button_2 = child(div_14);
				var text_7 = child(button_2);

				var node_7 = sibling(div_14, 2);

				{
					var consequent_7 = ($$anchor) => {
						var p_4 = root_14$2();
						var text_8 = child(p_4);
						template_effect(() => set_text(text_8, `Only ${(get(product), untrack(() => get(product).stock)) ?? ''} left in stock`));
						append($$anchor, p_4);
					};

					if_block(node_7, ($$render) => {
						if ((
							get(product),
							untrack(() => get(product).stock > 0 && get(product).stock <= 5)
						)) $$render(consequent_7);
					});
				}

				var node_8 = sibling(div_3, 2);

				Footer(node_8, {
					get site() {
						return (get(data), untrack(() => get(data).site));
					}
				});

				template_effect(
					($0) => {
						set_text(text, (get(product), untrack(() => get(product).name)));

						set_attribute(img_1, 'src', (
							get(images),
							get(selectedImage),
							untrack(() => get(images)[get(selectedImage)])
						));

						set_attribute(img_1, 'alt', (get(product), untrack(() => get(product).name)));
						set_text(text_1, (get(product), untrack(() => get(product).name)));
						set_text(text_2, `${(get(data), untrack(() => get(data).site.currency)) ?? ''}${$0 ?? ''}`);
						set_text(text_3, (get(product), untrack(() => get(product).description)));

						button_2.disabled = (
							get(product),
							get(selectedSize),
							untrack(() => get(product).stock === 0 || !get(selectedSize))
						);

						set_class(button_2, 1, `w-full py-4 text-label tracking-[0.25em] transition-all duration-300 ${(
						get(product),
						get(added),
						untrack(() => get(product).stock === 0
							? 'bg-muted text-muted-foreground cursor-not-allowed'
							: get(added)
								? 'bg-green-700 text-white'
								: 'bg-foreground text-primary-foreground hover:bg-foreground/90 active:scale-[0.97]')
					) ?? ''}`);

						set_text(text_7, (
							get(product),
							get(added),
							untrack(() => get(product).stock === 0
								? 'SOLD OUT'
								: get(added) ? 'ADDED TO CART ✓' : 'ADD TO CART')
						));
					},
					[
						() => (
							get(product),
							untrack(() => get(product).price.toFixed(2))
						)
					]
				);

				delegated('click', button_2, addToCart);
				append($$anchor, div_2);
			};

			if_block(node_1, ($$render) => {
				if (get(loading)) $$render(consequent_1); else if (!get(product)) $$render(consequent_2, 1); else $$render(alternate_1, -1);
			});
		}

		append($$anchor, fragment_1);
		pop();
	}

	delegate(['click']);

	var root_1$5 = from_html(`<meta name="description" content="Browse the Others. lookbook — editorial photography and campaign imagery from our latest collections."/>`);
	var root_2$8 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_6$6 = from_html(`<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy"/>`);
	var root_7$5 = from_html(`<div class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No cover</div>`);
	var root_8$5 = from_html(`<span class="absolute bottom-3 right-3 bg-background/90 backdrop-blur-sm text-foreground text-[10px] tracking-[0.15em] uppercase px-2 py-1"> </span>`);
	var root_9$5 = from_html(`<p class="text-sm text-muted-foreground mt-1 line-clamp-2"> </p>`);
	var root_5$7 = from_html(`<button class="group text-left"><div class="aspect-[3/4] overflow-hidden bg-secondary mb-4 relative"><!> <!></div> <div><h2 class="font-display font-bold text-lg group-hover:underline underline-offset-2 transition-all"> </h2> <p class="text-xs text-muted-foreground mt-0.5"> </p> <!></div></button>`);
	var root_4$5 = from_html(`<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>`);
	var root_10$4 = from_html(`<div class="text-center py-24 text-muted-foreground">No lookbooks yet.</div>`);
	var root_3$8 = from_html(`<div class="min-h-screen"><!> <div class="pt-28 pb-20 px-6 md:px-10 max-w-7xl mx-auto"><div class="mb-12"><p class="text-label mb-2">Editorial</p> <h1 class="text-4xl md:text-5xl font-display font-bold">Lookbook</h1></div> <!></div> <!></div>`);

	function Lookbook($$anchor, $$props) {
		push($$props, false);

		let data = mutable_source(null);
		let loading = mutable_source(true);

		onMount(async () => {
			try {
				set(data, await loadStoreData());
			} finally {
				set(loading, false);
			}
		});

		function goLookbook(id) {
			if (window.__navigate) window.__navigate(`/lookbook/${id}`);
		}

		init();

		var fragment = comment();

		head('zcrx70', ($$anchor) => {
			var meta = root_1$5();

			deferred_template_effect(() => {
				$document.title = get(data) ? `Lookbook — ${get(data).site.name}` : 'Lookbook';
			});

			append($$anchor, meta);
		});

		var node = first_child(fragment);

		{
			var consequent = ($$anchor) => {
				var div = root_2$8();

				append($$anchor, div);
			};

			var alternate_2 = ($$anchor) => {
				var div_1 = root_3$8();
				var node_1 = child(div_1);

				Navbar(node_1, {
					get siteName() {
						return get(data).site.name;
					},

					get logo() {
						return get(data).site.logo;
					}
				});

				var div_2 = sibling(node_1, 2);
				var node_2 = sibling(child(div_2), 2);

				{
					var consequent_4 = ($$anchor) => {
						var div_3 = root_4$5();

						each(div_3, 5, () => get(data).lookbooks, index, ($$anchor, lb) => {
							const cover = derived_safe_equal(() => get(lb).coverImage ?? get(lb).items?.find((i) => i.type !== 'video')?.url ?? get(lb).images?.[0] ?? '');
							const count = derived_safe_equal(() => (get(lb).items ?? get(lb).images ?? []).length);
							var button = root_5$7();
							var div_4 = child(button);
							var node_3 = child(div_4);

							{
								var consequent_1 = ($$anchor) => {
									var img = root_6$6();

									template_effect(() => {
										set_attribute(img, 'src', get(cover));
										set_attribute(img, 'alt', get(lb).title);
									});

									append($$anchor, img);
								};

								var alternate = ($$anchor) => {
									var div_5 = root_7$5();

									append($$anchor, div_5);
								};

								if_block(node_3, ($$render) => {
									if (get(cover)) $$render(consequent_1); else $$render(alternate, -1);
								});
							}

							var node_4 = sibling(node_3, 2);

							{
								var consequent_2 = ($$anchor) => {
									var span = root_8$5();
									var text = child(span);
									template_effect(() => set_text(text, `${get(count) ?? ''} ${get(count) === 1 ? 'image' : 'images'}`));
									append($$anchor, span);
								};

								if_block(node_4, ($$render) => {
									if (get(count) > 0) $$render(consequent_2);
								});
							}

							var div_6 = sibling(div_4, 2);
							var h2 = child(div_6);
							var text_1 = child(h2);

							var p = sibling(h2, 2);
							var text_2 = child(p);

							var node_5 = sibling(p, 2);

							{
								var consequent_3 = ($$anchor) => {
									var p_1 = root_9$5();
									var text_3 = child(p_1);
									template_effect(() => set_text(text_3, get(lb).description));
									append($$anchor, p_1);
								};

								if_block(node_5, ($$render) => {
									if (get(lb).description) $$render(consequent_3);
								});
							}

							template_effect(() => {
								set_attribute(button, 'aria-label', `Open ${get(lb).title ?? ''} lookbook`);
								set_text(text_1, get(lb).title);
								set_text(text_2, get(lb).date);
							});

							delegated('click', button, () => goLookbook(get(lb).id));
							append($$anchor, button);
						});
						append($$anchor, div_3);
					};

					var alternate_1 = ($$anchor) => {
						var div_7 = root_10$4();

						append($$anchor, div_7);
					};

					if_block(node_2, ($$render) => {
						if (get(data).lookbooks.length) $$render(consequent_4); else $$render(alternate_1, -1);
					});
				}

				var node_6 = sibling(div_2, 2);

				Footer(node_6, {
					get site() {
						return get(data).site;
					}
				});
				append($$anchor, div_1);
			};

			if_block(node, ($$render) => {
				if (get(loading) || !get(data)) $$render(consequent); else $$render(alternate_2, -1);
			});
		}

		append($$anchor, fragment);
		pop();
	}

	delegate(['click']);

	var root_3$7 = from_html(`<meta property="og:image"/>`);
	var root_2$7 = from_html(`<meta name="description"/> <meta property="og:type" content="article"/> <meta property="og:title"/> <meta property="og:description"/> <!>`, 1);
	var root_5$6 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_6$5 = from_html(`<div class="flex min-h-screen items-center justify-center flex-col gap-4"><p class="text-muted-foreground">Lookbook not found.</p> <a href="/lookbook" class="text-label border-b border-current">← Back to Lookbook</a></div>`);
	var root_8$4 = from_html(`<p class="text-muted-foreground max-w-xl"> </p>`);
	var root_10$3 = from_html(`<div class="relative w-full" style="padding-bottom:56.25%;height:0;"><iframe class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen=""></iframe></div>`);
	var root_11$2 = from_html(`<video controls="" class="w-full h-auto object-cover" preload="metadata"><track kind="captions"/></video>`, 2);
	var root_12$1 = from_html(`<button aria-label="View full image" class="group w-full overflow-hidden bg-secondary block"><img class="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-700" loading="lazy"/></button>`);
	var root_13$1 = from_html(`<p class="text-xs text-muted-foreground mt-2 italic"> </p>`);
	var root_9$4 = from_html(`<div class="break-inside-avoid"><!> <!></div>`);
	var root_14$1 = from_html(`<div class="text-center py-24 text-muted-foreground">No media in this lookbook yet.</div>`);
	var root_7$4 = from_html(`<div class="min-h-screen"><!> <div class="pt-28 pb-20 px-6 md:px-10 max-w-7xl mx-auto"><nav class="mb-6 text-xs text-muted-foreground flex items-center gap-2"><a href="/" class="hover:text-foreground transition-colors">Home</a> <span>/</span> <a href="/lookbook" class="hover:text-foreground transition-colors">Lookbook</a> <span>/</span> <span class="text-foreground"> </span></nav> <div class="mb-12"><p class="text-label text-muted-foreground mb-2"> </p> <h1 class="text-4xl md:text-5xl font-display font-bold mb-4"> </h1> <!></div> <div class="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4"></div> <!> <div class="mt-14 pt-8 border-t border-border"><a href="/lookbook" class="text-label hover:opacity-60 transition-opacity">← All Lookbooks</a></div></div> <!></div>`);
	var root_16$1 = from_html(`<button aria-label="Previous" class="absolute left-4 text-primary-foreground/70 hover:text-primary-foreground"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m15 18-6-6 6-6"></path></svg></button> <button aria-label="Next" class="absolute right-12 text-primary-foreground/70 hover:text-primary-foreground"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m9 18 6-6-6-6"></path></svg></button>`, 1);
	var root_15$1 = from_html(`<div class="fixed inset-0 z-50 bg-foreground/95 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Image lightbox"><button aria-label="Close" class="absolute top-4 right-4 z-10 text-primary-foreground/70 hover:text-primary-foreground"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button> <img class="max-h-[90vh] max-w-full object-contain"/> <!></div>`);
	var root$3 = from_html(`<!> <!>`, 1);

	function LookbookDetail($$anchor, $$props) {
		push($$props, false);

		const items = mutable_source();
		let lookbookId = prop($$props, 'lookbookId', 8, '');
		let data = mutable_source(null);
		let lb = mutable_source(null);
		let loading = mutable_source(true);
		let expanded = mutable_source(null);

		onMount(async () => {
			try {
				set(data, await loadStoreData());

				const lookbooks = get(data).lookbooks || [];

				set(lb, lookbooks.find((l) => l.id === lookbookId()) ?? null);
			} finally {
				set(loading, false);
			}
		});

		function isVideo(item) {
			return item.type === 'video' || item.url && (/\.(mp4|webm)$/).test(item.url.toLowerCase());
		}

		function isEmbed(item) {
			return item.type === 'embed' || item.url && (item.url.includes('youtube') || item.url.includes('vimeo'));
		}

		legacy_pre_effect(() => (get(lb)), () => {
			set(items, get(lb)?.items ?? get(lb)?.images?.map((url) => ({ type: 'image', url, caption: '' })) ?? []);
		});

		legacy_pre_effect_reset();
		init();

		var fragment_2 = root$3();

		head('zdcrnd', ($$anchor) => {
			var fragment = comment();
			var node = first_child(fragment);

			{
				var consequent_1 = ($$anchor) => {
					var fragment_1 = root_2$7();
					var meta = first_child(fragment_1);
					var meta_1 = sibling(meta, 4);
					var meta_2 = sibling(meta_1, 2);
					var node_1 = sibling(meta_2, 2);

					{
						var consequent = ($$anchor) => {
							var meta_3 = root_3$7();

							template_effect(() => set_attribute(meta_3, 'content', (
								get(lb),
								untrack(() => get(lb).coverImage ?? get(lb).images[0])
							)));

							append($$anchor, meta_3);
						};

						if_block(node_1, ($$render) => {
							if ((
								get(lb),
								untrack(() => get(lb).coverImage || get(lb).images?.[0])
							)) $$render(consequent);
						});
					}

					template_effect(() => {
						set_attribute(meta, 'content', (get(lb), untrack(() => get(lb).description)));
						set_attribute(meta_1, 'content', `${(get(lb), untrack(() => get(lb).title)) ?? ''} Lookbook`);
						set_attribute(meta_2, 'content', (get(lb), untrack(() => get(lb).description)));
					});

					deferred_template_effect(() => {
						$document.title = `${(get(lb), untrack(() => get(lb).title)) ?? ''} — ${(
						get(data),
						untrack(() => get(data)?.site?.name ?? 'Others.')
					) ?? ''} Lookbook`;
					});

					append($$anchor, fragment_1);
				};

				var alternate = ($$anchor) => {
					effect(() => {
						$document.title = 'Lookbook — Others.';
					});
				};

				if_block(node, ($$render) => {
					if (get(lb)) $$render(consequent_1); else $$render(alternate, -1);
				});
			}

			append($$anchor, fragment);
		});

		var node_2 = first_child(fragment_2);

		{
			var consequent_2 = ($$anchor) => {
				var div = root_5$6();

				append($$anchor, div);
			};

			var consequent_3 = ($$anchor) => {
				var div_1 = root_6$5();

				append($$anchor, div_1);
			};

			var alternate_2 = ($$anchor) => {
				var div_2 = root_7$4();
				var node_3 = child(div_2);

				Navbar(node_3, {
					get siteName() {
						return (get(data), untrack(() => get(data).site.name));
					},

					get logo() {
						return (get(data), untrack(() => get(data).site.logo));
					}
				});

				var div_3 = sibling(node_3, 2);
				var nav = child(div_3);
				var a = child(nav);
				var a_1 = sibling(a, 4);
				var span = sibling(a_1, 4);
				var text = child(span);

				var div_4 = sibling(nav, 2);
				var p = child(div_4);
				var text_1 = child(p);

				var h1 = sibling(p, 2);
				var text_2 = child(h1);

				var node_4 = sibling(h1, 2);

				{
					var consequent_4 = ($$anchor) => {
						var p_1 = root_8$4();
						var text_3 = child(p_1);
						template_effect(() => set_text(text_3, (get(lb), untrack(() => get(lb).description))));
						append($$anchor, p_1);
					};

					if_block(node_4, ($$render) => {
						if ((get(lb), untrack(() => get(lb).description))) $$render(consequent_4);
					});
				}

				var div_5 = sibling(div_4, 2);

				each(div_5, 5, () => get(items), index, ($$anchor, item, i) => {
					var div_6 = root_9$4();
					var node_5 = child(div_6);

					{
						var consequent_5 = ($$anchor) => {
							var div_7 = root_10$3();
							var iframe = child(div_7);

							template_effect(() => {
								set_attribute(iframe, 'src', (get(item), untrack(() => get(item).url)));
								set_attribute(iframe, 'title', (get(item), untrack(() => get(item).caption || 'Video')));
							});

							append($$anchor, div_7);
						};

						var d = user_derived(() => (get(item), untrack(() => isEmbed(get(item)))));

						var consequent_6 = ($$anchor) => {
							var video = root_11$2();

							template_effect(() => set_attribute(video, 'src', (get(item), untrack(() => get(item).url))));
							append($$anchor, video);
						};

						var d_1 = user_derived(() => (get(item), untrack(() => isVideo(get(item)))));

						var alternate_1 = ($$anchor) => {
							var button = root_12$1();
							var img = child(button);

							template_effect(() => {
								set_attribute(img, 'src', (get(item), untrack(() => get(item).url)));

								set_attribute(img, 'alt', (
									get(item),
									get(lb),
									untrack(() => get(item).caption || get(lb).title)
								));
							});

							delegated('click', button, () => set(expanded, { items: get(items), index: i }));
							append($$anchor, button);
						};

						if_block(node_5, ($$render) => {
							if (get(d)) $$render(consequent_5); else if (get(d_1)) $$render(consequent_6, 1); else $$render(alternate_1, -1);
						});
					}

					var node_6 = sibling(node_5, 2);

					{
						var consequent_7 = ($$anchor) => {
							var p_2 = root_13$1();
							var text_4 = child(p_2);
							template_effect(() => set_text(text_4, (get(item), untrack(() => get(item).caption))));
							append($$anchor, p_2);
						};

						if_block(node_6, ($$render) => {
							if ((get(item), untrack(() => get(item).caption))) $$render(consequent_7);
						});
					}
					append($$anchor, div_6);
				});

				var node_7 = sibling(div_5, 2);

				{
					var consequent_8 = ($$anchor) => {
						var div_8 = root_14$1();

						append($$anchor, div_8);
					};

					if_block(node_7, ($$render) => {
						if ((get(items), untrack(() => get(items).length === 0))) $$render(consequent_8);
					});
				}

				var div_9 = sibling(node_7, 2);
				var a_2 = child(div_9);

				var node_8 = sibling(div_3, 2);

				Footer(node_8, {
					get site() {
						return (get(data), untrack(() => get(data).site));
					}
				});

				template_effect(() => {
					set_text(text, (get(lb), untrack(() => get(lb).title)));
					set_text(text_1, (get(lb), untrack(() => get(lb).date)));
					set_text(text_2, (get(lb), untrack(() => get(lb).title)));
				});

				delegated('click', a, (e) => {
					e.preventDefault();
					window.__navigate('/');
				});

				delegated('click', a_1, (e) => {
					e.preventDefault();
					window.__navigate('/lookbook');
				});

				delegated('click', a_2, (e) => {
					e.preventDefault();
					window.__navigate('/lookbook');
				});

				append($$anchor, div_2);
			};

			if_block(node_2, ($$render) => {
				if (get(loading)) $$render(consequent_2); else if (!get(lb)) $$render(consequent_3, 1); else $$render(alternate_2, -1);
			});
		}

		var node_9 = sibling(node_2, 2);

		{
			var consequent_10 = ($$anchor) => {
				const cur = derived_safe_equal(() => (
					get(expanded),
					untrack(() => get(expanded).items[get(expanded).index])
				));

				var div_10 = root_15$1();
				var button_1 = child(div_10);
				var img_1 = sibling(button_1, 2);
				var node_10 = sibling(img_1, 2);

				{
					var consequent_9 = ($$anchor) => {
						var fragment_3 = root_16$1();
						var button_2 = first_child(fragment_3);
						var button_3 = sibling(button_2, 2);

						delegated('click', button_2, () => set(expanded, {
							...get(expanded),
							index: (get(expanded).index - 1 + get(expanded).items.length) % get(expanded).items.length
						}));

						delegated('click', button_3, () => set(expanded, {
							...get(expanded),
							index: (get(expanded).index + 1) % get(expanded).items.length
						}));

						append($$anchor, fragment_3);
					};

					if_block(node_10, ($$render) => {
						if ((
							get(expanded),
							untrack(() => get(expanded).items.length > 1)
						)) $$render(consequent_9);
					});
				}

				template_effect(() => {
					set_attribute(img_1, 'src', (
						deep_read_state(get(cur)),
						untrack(() => get(cur).url)
					));

					set_attribute(img_1, 'alt', (
						deep_read_state(get(cur)),
						untrack(() => get(cur).caption || '')
					));
				});

				delegated('click', button_1, () => set(expanded, null));
				append($$anchor, div_10);
			};

			if_block(node_9, ($$render) => {
				if (get(expanded)) $$render(consequent_10);
			});
		}

		append($$anchor, fragment_2);
		pop();
	}

	delegate(['click']);

	var root_1$4 = from_html(`<meta name="description" content="Stories, news, and culture from the Others. community. Collections, collaborations and announcements."/> <meta property="og:type" content="website"/> <meta property="og:title" content="Community — Others."/> <meta property="og:description" content="Stories, news, and culture from the Others. community."/>`, 1);
	var root_2$6 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_5$5 = from_html(`<button> </button>`);
	var root_4$4 = from_html(`<div class="flex flex-wrap gap-2 mb-10 border-b border-border pb-6"><button>ALL</button> <!></div>`);
	var root_8$3 = from_html(`<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"/>`);
	var root_9$3 = from_html(`<div class="w-full h-full flex items-center justify-center text-xs text-muted-foreground"> </div>`);
	var root_7$3 = from_html(`<a class="group block cursor-pointer"><div class="aspect-[16/9] bg-secondary overflow-hidden mb-4"><!></div> <div><span class="text-label text-xs text-muted-foreground"> </span> <h2 class="text-lg font-display font-bold mt-1 mb-2 group-hover:underline underline-offset-2 transition-all"> </h2> <p class="text-sm text-muted-foreground line-clamp-2"> </p></div></a>`);
	var root_6$4 = from_html(`<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8"></div>`);
	var root_10$2 = from_html(`<div class="text-center py-24 text-muted-foreground">No posts yet.</div>`);
	var root_3$6 = from_html(`<div class="min-h-screen"><!> <div class="pt-28 pb-20 px-6 md:px-10 max-w-7xl mx-auto"><div class="mb-10"><p class="text-label mb-2">Journal</p> <h1 class="text-4xl md:text-5xl font-display font-bold">Community</h1></div> <!> <!></div> <!></div>`);

	function Community($$anchor, $$props) {
		push($$props, false);

		const posts = mutable_source();
		const categories = mutable_source();
		let data = mutable_source(null);
		let loading = mutable_source(true);
		let activeCategory = mutable_source('all');

		onMount(async () => {
			try {
				set(data, await loadStoreData());
			} finally {
				set(loading, false);
			}
		});

		function goArticle(slug) {
			if (window.__navigate) window.__navigate('/community/' + slug);
		}

		legacy_pre_effect(() => (get(data), get(activeCategory)), () => {
			set(posts, get(data)
				? get(activeCategory) === 'all'
					? get(data).community
					: get(data).community.filter((p) => p.category === get(activeCategory))
				: []);
		});

		legacy_pre_effect(() => (get(data)), () => {
			set(categories, get(data)
				? [...new Set(get(data).community.map((p) => p.category))]
				: []);
		});

		legacy_pre_effect_reset();
		init();

		var fragment_1 = comment();

		head('ge4z2p', ($$anchor) => {
			var fragment = root_1$4();

			deferred_template_effect(() => {
				$document.title = (
					get(data),
					untrack(() => get(data) ? `Community — ${get(data).site.name}` : 'Community')
				) ?? '';
			});

			append($$anchor, fragment);
		});

		var node = first_child(fragment_1);

		{
			var consequent = ($$anchor) => {
				var div = root_2$6();

				append($$anchor, div);
			};

			var alternate_2 = ($$anchor) => {
				var div_1 = root_3$6();
				var node_1 = child(div_1);

				Navbar(node_1, {
					get siteName() {
						return (get(data), untrack(() => get(data).site.name));
					},

					get logo() {
						return (get(data), untrack(() => get(data).site.logo));
					}
				});

				var div_2 = sibling(node_1, 2);
				var node_2 = sibling(child(div_2), 2);

				{
					var consequent_1 = ($$anchor) => {
						var div_3 = root_4$4();
						var button = child(div_3);
						var node_3 = sibling(button, 2);

						each(node_3, 1, () => get(categories), index, ($$anchor, cat) => {
							var button_1 = root_5$5();
							var text = child(button_1);

							template_effect(
								($0) => {
									set_class(button_1, 1, `px-4 py-2 text-label tracking-[0.15em] transition-colors ${get(activeCategory) === get(cat)
									? 'bg-foreground text-primary-foreground'
									: 'border border-border hover:bg-muted'}`);

									set_text(text, $0);
								},
								[
									() => (get(cat), untrack(() => get(cat).toUpperCase()))
								]
							);

							delegated('click', button_1, () => set(activeCategory, get(cat)));
							append($$anchor, button_1);
						});

						template_effect(() => set_class(button, 1, `px-4 py-2 text-label tracking-[0.15em] transition-colors ${get(activeCategory) === 'all'
						? 'bg-foreground text-primary-foreground'
						: 'border border-border hover:bg-muted'}`));

						delegated('click', button, () => set(activeCategory, 'all'));
						append($$anchor, div_3);
					};

					if_block(node_2, ($$render) => {
						if ((
							get(categories),
							untrack(() => get(categories).length > 1)
						)) $$render(consequent_1);
					});
				}

				var node_4 = sibling(node_2, 2);

				{
					var consequent_3 = ($$anchor) => {
						var div_4 = root_6$4();

						each(div_4, 5, () => get(posts), index, ($$anchor, post) => {
							var a = root_7$3();
							var div_5 = child(a);
							var node_5 = child(div_5);

							{
								var consequent_2 = ($$anchor) => {
									var img = root_8$3();

									template_effect(() => {
										set_attribute(img, 'src', (get(post), untrack(() => get(post).image)));
										set_attribute(img, 'alt', (get(post), untrack(() => get(post).title)));
									});

									append($$anchor, img);
								};

								var alternate = ($$anchor) => {
									var div_6 = root_9$3();
									var text_1 = child(div_6);
									template_effect(() => set_text(text_1, (get(post), untrack(() => get(post).category))));
									append($$anchor, div_6);
								};

								if_block(node_5, ($$render) => {
									if ((get(post), untrack(() => get(post).image))) $$render(consequent_2); else $$render(alternate, -1);
								});
							}

							var div_7 = sibling(div_5, 2);
							var span = child(div_7);
							var text_2 = child(span);

							var h2 = sibling(span, 2);
							var text_3 = child(h2);

							var p_1 = sibling(h2, 2);
							var text_4 = child(p_1);

							template_effect(() => {
								set_attribute(a, 'href', (
									get(post),
									untrack(() => `/community/${get(post).slug}`)
								));

								set_text(text_2, `${(get(post), untrack(() => get(post).category)) ?? ''} · ${(get(post), untrack(() => get(post).date)) ?? ''}`);
								set_text(text_3, (get(post), untrack(() => get(post).title)));
								set_text(text_4, (get(post), untrack(() => get(post).excerpt)));
							});

							delegated('click', a, (e) => {
								e.preventDefault();
								goArticle(get(post).slug);
							});

							append($$anchor, a);
						});
						append($$anchor, div_4);
					};

					var alternate_1 = ($$anchor) => {
						var div_8 = root_10$2();

						append($$anchor, div_8);
					};

					if_block(node_4, ($$render) => {
						if ((get(posts), untrack(() => get(posts).length))) $$render(consequent_3); else $$render(alternate_1, -1);
					});
				}

				var node_6 = sibling(div_2, 2);

				Footer(node_6, {
					get site() {
						return (get(data), untrack(() => get(data).site));
					}
				});
				append($$anchor, div_1);
			};

			if_block(node, ($$render) => {
				if (get(loading) || !get(data)) $$render(consequent); else $$render(alternate_2, -1);
			});
		}

		append($$anchor, fragment_1);
		pop();
	}

	delegate(['click']);

	var root_3$5 = from_html(`<meta property="og:image"/>`);
	var root_2$5 = from_html(`<meta name="description"/> <meta property="og:type" content="article"/> <meta property="og:title"/> <meta property="og:description"/> <!> <meta property="article:published_time"/> <meta property="article:author"/>`, 1);
	var root_5$4 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_6$3 = from_html(`<div class="flex min-h-screen items-center justify-center flex-col gap-4"><p class="text-muted-foreground">Article not found.</p> <a href="/community" class="text-label border-b border-current">← Back to Community</a></div>`);
	var root_8$2 = from_html(`<div class="aspect-[16/7] bg-secondary overflow-hidden mb-8"><img class="w-full h-full object-cover"/></div>`);
	var root_9$2 = from_html(`<p class="text-lg text-muted-foreground mt-3 leading-relaxed"> </p>`);
	var root_7$2 = from_html(`<div class="min-h-screen"><!> <div class="pt-24 pb-20 px-6 md:px-10 max-w-3xl mx-auto"><nav class="mb-8 text-xs text-muted-foreground flex items-center gap-2"><a href="/" class="hover:text-foreground transition-colors">Home</a> <span>/</span> <a href="/community" class="hover:text-foreground transition-colors">Community</a> <span>/</span> <span class="text-foreground truncate max-w-[200px]"> </span></nav> <!> <header class="mb-8"><span class="text-label text-xs text-muted-foreground"> </span> <h1 class="text-3xl md:text-4xl font-display font-bold leading-tight mt-2"> </h1> <!></header> <article class="prose prose-sm max-w-none text-foreground [&amp;_h2]:font-display [&amp;_h2]:font-bold [&amp;_h2]:text-xl [&amp;_h2]:mt-6 [&amp;_h2]:mb-3 [&amp;_p]:text-muted-foreground [&amp;_p]:leading-relaxed [&amp;_p]:mb-4"></article> <div class="mt-12 pt-8 border-t border-border"><a href="/community" class="text-label hover:opacity-60 transition-opacity">← Back to Community</a></div></div> <!></div>`);

	function Article($$anchor, $$props) {
		push($$props, false);

		let slug = prop($$props, 'slug', 8, '');
		let data = mutable_source(null);
		let post = mutable_source(null);
		let loading = mutable_source(true);

		onMount(async () => {
			try {
				set(data, await loadStoreData());
				set(post, get(data)?.community?.find((p) => p.slug === slug() && p.published) ?? null);
			} finally {
				set(loading, false);
			}
		});

		init();

		var fragment_2 = comment();

		head('k7h7gk', ($$anchor) => {
			var fragment = comment();
			var node = first_child(fragment);

			{
				var consequent_1 = ($$anchor) => {
					var fragment_1 = root_2$5();
					var meta = first_child(fragment_1);
					var meta_1 = sibling(meta, 4);
					var meta_2 = sibling(meta_1, 2);
					var node_1 = sibling(meta_2, 2);

					{
						var consequent = ($$anchor) => {
							var meta_3 = root_3$5();

							template_effect(() => set_attribute(meta_3, 'content', (get(post), untrack(() => get(post).image))));
							append($$anchor, meta_3);
						};

						if_block(node_1, ($$render) => {
							if ((get(post), untrack(() => get(post).image))) $$render(consequent);
						});
					}

					var meta_4 = sibling(node_1, 2);
					var meta_5 = sibling(meta_4, 2);

					template_effect(() => {
						set_attribute(meta, 'content', (get(post), untrack(() => get(post).excerpt)));
						set_attribute(meta_1, 'content', (get(post), untrack(() => get(post).title)));
						set_attribute(meta_2, 'content', (get(post), untrack(() => get(post).excerpt)));
						set_attribute(meta_4, 'content', (get(post), untrack(() => get(post).date)));
						set_attribute(meta_5, 'content', (get(post), untrack(() => get(post).author)));
					});

					deferred_template_effect(() => {
						$document.title = `${(get(post), untrack(() => get(post).title)) ?? ''} — ${(
						get(data),
						untrack(() => get(data)?.site?.name ?? 'Others.')
					) ?? ''}`;
					});

					append($$anchor, fragment_1);
				};

				var alternate = ($$anchor) => {
					effect(() => {
						$document.title = 'Article — Others.';
					});
				};

				if_block(node, ($$render) => {
					if (get(post)) $$render(consequent_1); else $$render(alternate, -1);
				});
			}

			append($$anchor, fragment);
		});

		var node_2 = first_child(fragment_2);

		{
			var consequent_2 = ($$anchor) => {
				var div = root_5$4();

				append($$anchor, div);
			};

			var consequent_3 = ($$anchor) => {
				var div_1 = root_6$3();

				append($$anchor, div_1);
			};

			var alternate_1 = ($$anchor) => {
				var div_2 = root_7$2();
				var node_3 = child(div_2);

				Navbar(node_3, {
					get siteName() {
						return (get(data), untrack(() => get(data).site.name));
					},

					get logo() {
						return (get(data), untrack(() => get(data).site.logo));
					}
				});

				var div_3 = sibling(node_3, 2);
				var nav = child(div_3);
				var span = sibling(child(nav), 8);
				var text = child(span);

				var node_4 = sibling(nav, 2);

				{
					var consequent_4 = ($$anchor) => {
						var div_4 = root_8$2();
						var img = child(div_4);

						template_effect(() => {
							set_attribute(img, 'src', (get(post), untrack(() => get(post).image)));
							set_attribute(img, 'alt', (get(post), untrack(() => get(post).title)));
						});

						append($$anchor, div_4);
					};

					if_block(node_4, ($$render) => {
						if ((get(post), untrack(() => get(post).image))) $$render(consequent_4);
					});
				}

				var header = sibling(node_4, 2);
				var span_1 = child(header);
				var text_1 = child(span_1);

				var h1 = sibling(span_1, 2);
				var text_2 = child(h1);

				var node_5 = sibling(h1, 2);

				{
					var consequent_5 = ($$anchor) => {
						var p_1 = root_9$2();
						var text_3 = child(p_1);
						template_effect(() => set_text(text_3, (get(post), untrack(() => get(post).excerpt))));
						append($$anchor, p_1);
					};

					if_block(node_5, ($$render) => {
						if ((get(post), untrack(() => get(post).excerpt))) $$render(consequent_5);
					});
				}

				var article = sibling(header, 2);

				html(article, () => (get(post), untrack(() => get(post).content)), true);

				var node_6 = sibling(div_3, 2);

				Footer(node_6, {
					get site() {
						return (get(data), untrack(() => get(data).site));
					}
				});

				template_effect(() => {
					set_text(text, (get(post), untrack(() => get(post).title)));
					set_text(text_1, `${(get(post), untrack(() => get(post).category)) ?? ''} · ${(get(post), untrack(() => get(post).date)) ?? ''} · ${(get(post), untrack(() => get(post).author)) ?? ''}`);
					set_text(text_2, (get(post), untrack(() => get(post).title)));
				});

				append($$anchor, div_2);
			};

			if_block(node_2, ($$render) => {
				if (get(loading)) $$render(consequent_2); else if (!get(post)) $$render(consequent_3, 1); else $$render(alternate_1, -1);
			});
		}

		append($$anchor, fragment_2);
		pop();
	}

	var root_2$4 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_4$3 = from_html(`<div class="flex flex-col items-center justify-center py-32 gap-6"><div class="w-10 h-10 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div> <p class="text-sm text-muted-foreground">Redirecting to secure payment…</p></div>`);
	var root_5$3 = from_html(`<div class="text-center py-24"><div class="w-16 h-16 border-2 border-green-600 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"></path></svg></div> <h1 class="text-3xl font-display font-bold mb-3">Payment Successful</h1> <p class="text-muted-foreground mb-2">Your order has been confirmed and is being processed.</p> <p class="text-sm text-muted-foreground mb-10">A confirmation will be sent to your email address.</p> <a href="/products" class="inline-block bg-foreground text-primary-foreground px-8 py-3.5 text-label tracking-[0.25em] hover:bg-foreground/90 transition-colors">CONTINUE SHOPPING</a></div>`);
	var root_6$2 = from_html(`<div class="text-center py-24"><div class="w-16 h-16 border-2 border-muted-foreground rounded-full flex items-center justify-center mx-auto mb-6 text-muted-foreground"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></div> <h1 class="text-3xl font-display font-bold mb-3">Payment Cancelled</h1> <p class="text-muted-foreground mb-10">Your payment was not completed. Your cart has been saved.</p> <a href="/cart" class="inline-block border border-foreground px-8 py-3.5 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300">BACK TO CART</a></div>`);
	var root_8$1 = from_html(`<div class="text-center py-24"><p class="text-muted-foreground mb-6">Your cart is empty.</p> <a href="/products" class="inline-block border border-foreground px-8 py-3 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300">SHOP NOW</a></div>`);
	var root_10$1 = from_html(`<div class="flex gap-4 border-b border-border pb-4"><img class="w-20 h-24 object-cover bg-secondary flex-shrink-0"/> <div class="flex-1 min-w-0"><p class="font-medium"> </p> <p class="text-xs text-muted-foreground mt-0.5"> </p> <p class="text-sm font-medium mt-1 tabular-nums"> </p> <div class="flex items-center gap-2 mt-2"><button aria-label="Decrease quantity" class="w-6 h-6 border border-border flex items-center justify-center hover:bg-muted transition-colors text-sm">−</button> <span class="w-6 text-center text-sm tabular-nums"> </span> <button aria-label="Increase quantity" class="w-6 h-6 border border-border flex items-center justify-center hover:bg-muted transition-colors text-sm">+</button> <button aria-label="Remove item" class="ml-2 text-xs text-muted-foreground hover:text-destructive transition-colors">Remove</button></div></div> <p class="font-medium tabular-nums flex-shrink-0"> </p></div>`);
	var root_11$1 = from_html(`<span class="text-green-600">Free</span>`);
	var root_13 = from_html(`<p class="text-xs text-muted-foreground"> </p>`);
	var root_9$1 = from_html(`<div class="grid md:grid-cols-[1fr_320px] gap-10"><div class="space-y-4"></div> <div class="bg-card border border-border p-6 h-fit space-y-4"><h2 class="font-display font-bold text-lg">Order Summary</h2> <div class="space-y-2 text-sm"><div class="flex justify-between"><span class="text-muted-foreground">Subtotal</span><span class="tabular-nums"> </span></div> <div class="flex justify-between"><span class="text-muted-foreground">Shipping</span> <span><!></span></div> <!> <div class="border-t border-border pt-2 flex justify-between font-medium"><span>Total</span> <span class="tabular-nums"> </span></div></div> <div class="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Secured by PayFast · SA only</div> <button class="w-full py-3.5 bg-foreground text-primary-foreground text-label tracking-[0.2em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">CHECKOUT</button></div></div>`);
	var root_7$1 = from_html(`<div class="mb-8"><h1 class="text-3xl md:text-4xl font-display font-bold">Your Cart</h1> <p class="text-sm text-muted-foreground mt-1"> </p></div> <!>`, 1);
	var root_15 = from_html(`<option> </option>`);
	var root_17 = from_html(`<p class="text-xs text-destructive"> </p>`);
	var root_16 = from_html(`<div class="border border-destructive bg-destructive/5 px-4 py-3 space-y-1"><p class="text-sm font-medium text-destructive">Cannot complete checkout:</p> <!> <p class="text-xs text-muted-foreground mt-1">Please update your cart and try again.</p></div>`);
	var root_18 = from_html(`<p class="text-sm text-destructive"> </p>`);
	var root_19 = from_html(`<div class="flex gap-3 text-sm"><img class="w-12 h-12 object-cover bg-secondary flex-shrink-0"/> <div class="flex-1"><p class="font-medium"> </p> <p class="text-xs text-muted-foreground"> </p></div> <span class="tabular-nums"> </span></div>`);
	var root_14 = from_html(`<div class="mb-8"><button class="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"></path></svg> Back to cart</button> <h1 class="text-3xl md:text-4xl font-display font-bold">Delivery Details</h1> <p class="text-sm text-muted-foreground mt-1 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg> South Africa delivery only</p></div> <div class="grid md:grid-cols-[1fr_320px] gap-10"><form class="space-y-6"><div class="space-y-4"><h2 class="text-label border-b border-border pb-3">CONTACT INFORMATION</h2> <div class="grid sm:grid-cols-2 gap-4"><div><label for="co-first" class="text-label block mb-1.5">FIRST NAME</label> <input id="co-first" required=""/></div> <div><label for="co-last" class="text-label block mb-1.5">LAST NAME</label> <input id="co-last" required=""/></div></div> <div class="grid sm:grid-cols-2 gap-4"><div><label for="co-email" class="text-label block mb-1.5">EMAIL</label> <input id="co-email" type="email" required=""/></div> <div><label for="co-phone" class="text-label block mb-1.5">PHONE</label> <input id="co-phone" type="tel" required=""/></div></div></div> <div class="space-y-4"><h2 class="text-label border-b border-border pb-3">DELIVERY ADDRESS</h2> <div><label for="co-addr" class="text-label block mb-1.5">STREET ADDRESS</label> <input id="co-addr" required=""/></div> <div class="grid sm:grid-cols-3 gap-4"><div class="sm:col-span-1"><label for="co-post" class="text-label block mb-1.5">POSTAL CODE</label> <input id="co-post" required=""/></div> <div class="sm:col-span-2"><label for="co-city" class="text-label block mb-1.5">CITY / SUBURB</label> <input id="co-city" required=""/></div></div> <div><label for="co-prov" class="text-label block mb-1.5">PROVINCE</label> <select id="co-prov" required="" class="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"><option>Select province…</option><!></select></div> <div><p class="text-label block mb-1.5">COUNTRY</p> <div class="flex items-center gap-2 border border-border/50 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">🇿🇦 South Africa <span class="ml-auto text-xs">(delivery locked to SA)</span></div></div></div> <!> <button type="submit" class="w-full py-4 bg-foreground text-primary-foreground text-label tracking-[0.2em] hover:bg-foreground/90 transition-colors active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect width="18" height="11" x="3" y="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> </button> <p class="text-xs text-center text-muted-foreground">Powered by PayFast · Secured with 256-bit SSL</p></form> <div class="bg-card border border-border p-5 h-fit space-y-3"><h2 class="text-label">ORDER SUMMARY</h2> <!> <div class="border-t border-border pt-3 text-sm space-y-1"><div class="flex justify-between"><span class="text-muted-foreground">Shipping</span><span> </span></div> <div class="flex justify-between font-medium"><span>Total</span><span> </span></div></div></div></div>`, 1);
	var root_3$4 = from_html(`<div class="min-h-screen"><!> <div class="pt-24 pb-20 px-6 md:px-10 max-w-5xl mx-auto"><!></div> <!></div>`);

	function Cart($$anchor, $$props) {
		push($$props, false);

		const $cartTotal = () => store_get(cartTotal, '$cartTotal', $$stores);
		const $cart = () => store_get(cart, '$cart', $$stores);
		const $cartCount = () => store_get(cartCount, '$cartCount', $$stores);
		const [$$stores, $$cleanup] = setup_stores();
		const shippingConfig = mutable_source();
		const shippingCost = mutable_source();
		const grandTotal = mutable_source();
		const currency = mutable_source();
		let data = mutable_source(null);
		let loading = mutable_source(true);
		let step = mutable_source('cart');
		let submitting = mutable_source(false);
		let orderId = '';
		let stockErrors = mutable_source([]);
		let checkoutError = mutable_source('');

		let form = mutable_source({
			firstName: '',
			lastName: '',
			email: '',
			phone: '',
			address: '',
			city: '',
			postcode: '',
			province: ''
		});

		onMount(async () => {
			try {
				set(data, await loadStoreData());

				const path = window.location.pathname;

				if (path === '/payment/success') set(step, 'success'); else if (path === '/payment/cancel') set(step, 'cancel');
			} finally {
				set(loading, false);
			}
		});

		async function proceedToPayment() {
			if (get(submitting)) return;

			set(submitting, true);
			set(stockErrors, []);
			set(checkoutError, '');
			set(step, 'processing');

			try {
				const res = await fetch('/api/checkout', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						order: {
							customer: `${get(form).firstName} ${get(form).lastName}`.trim(),
							email: get(form).email,
							phone: get(form).phone,
							address: `${get(form).address}, ${get(form).city} ${get(form).postcode}, ${get(form).province}, South Africa`,
							items: $cart(),
							total: $cartTotal()
						}
					})
				});

				if (!res.ok) {
					const body = await res.json();

					set(stockErrors, body.stockErrors || []);
					set(checkoutError, body.error || 'Something went wrong.');
					set(step, 'checkout');
					set(submitting, false);

					return;
				}

				const { paymentUrl, params, orderId: oid } = await res.json();

				orderId = oid;
				cart.clear();

				const formEl = document.createElement('form');

				formEl.method = 'POST';
				formEl.action = paymentUrl;

				Object.entries(params).forEach(([k, v]) => {
					const input = document.createElement('input');

					input.type = 'hidden';
					input.name = k;
					input.value = v;
					formEl.appendChild(input);
				});

				document.body.appendChild(formEl);
				formEl.submit();
			} catch(e) {
				console.error(e);
				set(checkoutError, 'Connection error. Please try again.');
				set(step, 'checkout');
				set(submitting, false);
			}
		}

		function inputClass() {
			return 'w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors';
		}

		const SA_PROVINCES = [
			'Eastern Cape',
			'Free State',
			'Gauteng',
			'KwaZulu-Natal',
			'Limpopo',
			'Mpumalanga',
			'North West',
			'Northern Cape',
			'Western Cape'
		];

		legacy_pre_effect(() => (get(data)), () => {
			set(shippingConfig, get(data)?.site?.shipping ?? { freeMinimum: 500, standardRate: 99 });
		});

		legacy_pre_effect(() => ($cartTotal(), get(shippingConfig)), () => {
			set(shippingCost, $cartTotal() >= get(shippingConfig).freeMinimum ? 0 : get(shippingConfig).standardRate);
		});

		legacy_pre_effect(() => ($cartTotal(), get(shippingCost)), () => {
			set(grandTotal, $cartTotal() + get(shippingCost));
		});

		legacy_pre_effect(() => (get(data)), () => {
			set(currency, get(data)?.site?.currency ?? 'R');
		});

		legacy_pre_effect_reset();
		init();

		var fragment = comment();

		head('1rnf4a4', ($$anchor) => {
			deferred_template_effect(() => {
				$document.title = (
					get(data),
					untrack(() => get(data) ? `Cart — ${get(data).site.name}` : 'Cart')
				) ?? '';
			});
		});

		var node = first_child(fragment);

		{
			var consequent = ($$anchor) => {
				var div = root_2$4();

				append($$anchor, div);
			};

			var alternate_2 = ($$anchor) => {
				var div_1 = root_3$4();
				var node_1 = child(div_1);

				Navbar(node_1, {
					get siteName() {
						return (get(data), untrack(() => get(data).site.name));
					},

					get logo() {
						return (get(data), untrack(() => get(data).site.logo));
					}
				});

				var div_2 = sibling(node_1, 2);
				var node_2 = child(div_2);

				{
					var consequent_1 = ($$anchor) => {
						var div_3 = root_4$3();

						append($$anchor, div_3);
					};

					var consequent_2 = ($$anchor) => {
						var div_4 = root_5$3();
						var a = sibling(child(div_4), 8);

						delegated('click', a, (e) => {
							e.preventDefault();
							window.__navigate('/products');
						});

						append($$anchor, div_4);
					};

					var consequent_3 = ($$anchor) => {
						var div_5 = root_6$2();
						var a_1 = sibling(child(div_5), 6);

						delegated('click', a_1, (e) => {
							e.preventDefault();
							window.__navigate('/cart');
						});

						append($$anchor, div_5);
					};

					var consequent_7 = ($$anchor) => {
						var fragment_1 = root_7$1();
						var div_6 = first_child(fragment_1);
						var p_1 = sibling(child(div_6), 2);
						var text$1 = child(p_1);

						var node_3 = sibling(div_6, 2);

						{
							var consequent_4 = ($$anchor) => {
								var div_7 = root_8$1();
								var a_2 = sibling(child(div_7), 2);

								delegated('click', a_2, (e) => {
									e.preventDefault();
									window.__navigate('/products');
								});

								append($$anchor, div_7);
							};

							var alternate_1 = ($$anchor) => {
								var div_8 = root_9$1();
								var div_9 = child(div_8);

								each(div_9, 5, $cart, index, ($$anchor, item) => {
									var div_10 = root_10$1();
									var img = child(div_10);
									var div_11 = sibling(img, 2);
									var p_2 = child(div_11);
									var text_1 = child(p_2);

									var p_3 = sibling(p_2, 2);
									var text_2 = child(p_3);

									var p_4 = sibling(p_3, 2);
									var text_3 = child(p_4);

									var div_12 = sibling(p_4, 2);
									var button = child(div_12);
									var span = sibling(button, 2);
									var text_4 = child(span);

									var button_1 = sibling(span, 2);
									var button_2 = sibling(button_1, 2);

									var p_5 = sibling(div_11, 2);
									var text_5 = child(p_5);

									template_effect(
										($0, $1) => {
											set_attribute(img, 'src', (get(item), untrack(() => get(item).image)));
											set_attribute(img, 'alt', (get(item), untrack(() => get(item).name)));
											set_text(text_1, (get(item), untrack(() => get(item).name)));
											set_text(text_2, `Size: ${(get(item), untrack(() => get(item).size)) ?? ''}`);
											set_text(text_3, `${get(currency) ?? ''}${$0 ?? ''}`);
											set_text(text_4, (get(item), untrack(() => get(item).quantity)));
											set_text(text_5, `${get(currency) ?? ''}${$1 ?? ''}`);
										},
										[
											() => (get(item), untrack(() => get(item).price.toFixed(2))),
											() => (
												get(item),
												untrack(() => (get(item).price * get(item).quantity).toFixed(2))
											)
										]
									);

									delegated('click', button, () => cart.updateQuantity(get(item).key, get(item).quantity - 1));
									delegated('click', button_1, () => cart.updateQuantity(get(item).key, get(item).quantity + 1));
									delegated('click', button_2, () => cart.removeItem(get(item).key));
									append($$anchor, div_10);
								});

								var div_13 = sibling(div_9, 2);
								var div_14 = sibling(child(div_13), 2);
								var div_15 = child(div_14);
								var span_1 = sibling(child(div_15));
								var text_6 = child(span_1);

								var div_16 = sibling(div_15, 2);
								var span_2 = sibling(child(div_16), 2);
								var node_4 = child(span_2);

								{
									var consequent_5 = ($$anchor) => {
										var span_3 = root_11$1();

										append($$anchor, span_3);
									};

									var alternate = ($$anchor) => {
										var text_7 = text();

										template_effect(($0) => set_text(text_7, `${get(currency) ?? ''}${$0 ?? ''}`), [
											() => (
												get(shippingCost),
												untrack(() => get(shippingCost).toFixed(2))
											)
										]);

										append($$anchor, text_7);
									};

									if_block(node_4, ($$render) => {
										if (get(shippingCost) === 0) $$render(consequent_5); else $$render(alternate, -1);
									});
								}

								var node_5 = sibling(div_16, 2);

								{
									var consequent_6 = ($$anchor) => {
										var p_6 = root_13();
										var text_8 = child(p_6);

										template_effect(($0) => set_text(text_8, `Spend ${get(currency) ?? ''}${$0 ?? ''} more for free shipping`), [
											() => (
												get(shippingConfig),
												$cartTotal(),
												untrack(() => (get(shippingConfig).freeMinimum - $cartTotal()).toFixed(2))
											)
										]);

										append($$anchor, p_6);
									};

									if_block(node_5, ($$render) => {
										if (get(shippingCost) > 0) $$render(consequent_6);
									});
								}

								var div_17 = sibling(node_5, 2);
								var span_4 = sibling(child(div_17), 2);
								var text_9 = child(span_4);

								var button_3 = sibling(div_14, 4);

								template_effect(
									($0, $1) => {
										set_text(text_6, `${get(currency) ?? ''}${$0 ?? ''}`);
										set_text(text_9, `${get(currency) ?? ''}${$1 ?? ''}`);
									},
									[
										() => ($cartTotal(), untrack(() => $cartTotal().toFixed(2))),
										() => (
											get(grandTotal),
											untrack(() => get(grandTotal).toFixed(2))
										)
									]
								);

								delegated('click', button_3, () => set(step, 'checkout'));
								append($$anchor, div_8);
							};

							if_block(node_3, ($$render) => {
								if (($cart(), untrack(() => $cart().length === 0))) $$render(consequent_4); else $$render(alternate_1, -1);
							});
						}

						template_effect(() => set_text(text$1, `${$cartCount() ?? ''} item${$cartCount() !== 1 ? 's' : ''}`));
						append($$anchor, fragment_1);
					};

					var consequent_10 = ($$anchor) => {
						var fragment_3 = root_14();
						var div_18 = first_child(fragment_3);
						var button_4 = child(div_18);

						var div_19 = sibling(div_18, 2);
						var form_1 = child(div_19);
						var div_20 = child(form_1);
						var div_21 = sibling(child(div_20), 2);
						var div_22 = child(div_21);
						var input_1 = sibling(child(div_22), 2);

						var div_23 = sibling(div_22, 2);
						var input_2 = sibling(child(div_23), 2);

						var div_24 = sibling(div_21, 2);
						var div_25 = child(div_24);
						var input_3 = sibling(child(div_25), 2);

						var div_26 = sibling(div_25, 2);
						var input_4 = sibling(child(div_26), 2);

						var div_27 = sibling(div_20, 2);
						var div_28 = sibling(child(div_27), 2);
						var input_5 = sibling(child(div_28), 2);

						var div_29 = sibling(div_28, 2);
						var div_30 = child(div_29);
						var input_6 = sibling(child(div_30), 2);

						var div_31 = sibling(div_30, 2);
						var input_7 = sibling(child(div_31), 2);

						var div_32 = sibling(div_29, 2);
						var select = sibling(child(div_32), 2);
						var option = child(select);

						option.value = option.__value = '';

						var node_6 = sibling(option);

						each(node_6, 1, () => SA_PROVINCES, index, ($$anchor, p) => {
							var option_1 = root_15();
							var text_10 = child(option_1);

							var option_1_value = {};

							template_effect(() => {
								set_text(text_10, get(p));

								if (option_1_value !== (option_1_value = get(p))) {
									option_1.value = (option_1.__value = get(p)) ?? '';
								}
							});

							append($$anchor, option_1);
						});

						var node_7 = sibling(div_27, 2);

						{
							var consequent_8 = ($$anchor) => {
								var div_33 = root_16();
								var node_8 = sibling(child(div_33), 2);

								each(node_8, 1, () => get(stockErrors), index, ($$anchor, err) => {
									var p_7 = root_17();
									var text_11 = child(p_7);
									template_effect(() => set_text(text_11, get(err)));
									append($$anchor, p_7);
								});
								append($$anchor, div_33);
							};

							var consequent_9 = ($$anchor) => {
								var p_8 = root_18();
								var text_12 = child(p_8);
								template_effect(() => set_text(text_12, get(checkoutError)));
								append($$anchor, p_8);
							};

							if_block(node_7, ($$render) => {
								if ((
									get(stockErrors),
									untrack(() => get(stockErrors).length > 0)
								)) $$render(consequent_8); else if (get(checkoutError)) $$render(consequent_9, 1);
							});
						}

						var button_5 = sibling(node_7, 2);
						var text_13 = sibling(child(button_5));

						var div_34 = sibling(form_1, 2);
						var node_9 = sibling(child(div_34), 2);

						each(node_9, 1, $cart, index, ($$anchor, item) => {
							var div_35 = root_19();
							var img_1 = child(div_35);
							var div_36 = sibling(img_1, 2);
							var p_9 = child(div_36);
							var text_14 = child(p_9);

							var p_10 = sibling(p_9, 2);
							var text_15 = child(p_10);

							var span_5 = sibling(div_36, 2);
							var text_16 = child(span_5);

							template_effect(
								($0) => {
									set_attribute(img_1, 'src', (get(item), untrack(() => get(item).image)));
									set_attribute(img_1, 'alt', (get(item), untrack(() => get(item).name)));
									set_text(text_14, (get(item), untrack(() => get(item).name)));
									set_text(text_15, `${(get(item), untrack(() => get(item).size)) ?? ''} × ${(get(item), untrack(() => get(item).quantity)) ?? ''}`);
									set_text(text_16, `${get(currency) ?? ''}${$0 ?? ''}`);
								},
								[
									() => (
										get(item),
										untrack(() => (get(item).price * get(item).quantity).toFixed(2))
									)
								]
							);

							append($$anchor, div_35);
						});

						var div_37 = sibling(node_9, 2);
						var div_38 = child(div_37);
						var span_6 = sibling(child(div_38));
						var text_17 = child(span_6);

						var div_39 = sibling(div_38, 2);
						var span_7 = sibling(child(div_39));
						var text_18 = child(span_7);

						template_effect(
							($0, $1, $2, $3, $4, $5, $6, $7, $8, $9) => {
								set_class(input_1, 1, $0);
								set_class(input_2, 1, $1);
								set_class(input_3, 1, $2);
								set_class(input_4, 1, $3);
								set_class(input_5, 1, $4);
								set_class(input_6, 1, $5);
								set_class(input_7, 1, $6);
								button_5.disabled = get(submitting);
								set_text(text_13, ` PAY SECURELY — ${get(currency) ?? ''}${$7 ?? ''}`);
								set_text(text_17, $8);
								set_text(text_18, `${get(currency) ?? ''}${$9 ?? ''}`);
							},
							[
								() => clsx((untrack(inputClass))),
								() => clsx((untrack(inputClass))),
								() => clsx((untrack(inputClass))),
								() => clsx((untrack(inputClass))),
								() => clsx((untrack(inputClass))),
								() => clsx((untrack(inputClass))),
								() => clsx((untrack(inputClass))),
								() => (
									get(grandTotal),
									untrack(() => get(grandTotal).toFixed(2))
								),

								() => (
									get(shippingCost),
									get(currency),
									untrack(() => get(shippingCost) === 0
										? 'Free'
										: `${get(currency)}${get(shippingCost).toFixed(2)}`)
								),

								() => (
									get(grandTotal),
									untrack(() => get(grandTotal).toFixed(2))
								)
							]
						);

						delegated('click', button_4, () => set(step, 'cart'));

						event('submit', form_1, (e) => {
							e.preventDefault();
							proceedToPayment();
						});

						bind_value(input_1, () => get(form).firstName, ($$value) => (
							mutate(form, get(form).firstName = $$value),
							invalidate_inner_signals(() => {
							})
						));

						bind_value(input_2, () => get(form).lastName, ($$value) => (
							mutate(form, get(form).lastName = $$value),
							invalidate_inner_signals(() => {
							})
						));

						bind_value(input_3, () => get(form).email, ($$value) => (
							mutate(form, get(form).email = $$value),
							invalidate_inner_signals(() => {
							})
						));

						bind_value(input_4, () => get(form).phone, ($$value) => (
							mutate(form, get(form).phone = $$value),
							invalidate_inner_signals(() => {
							})
						));

						bind_value(input_5, () => get(form).address, ($$value) => (
							mutate(form, get(form).address = $$value),
							invalidate_inner_signals(() => {
							})
						));

						bind_value(input_6, () => get(form).postcode, ($$value) => (
							mutate(form, get(form).postcode = $$value),
							invalidate_inner_signals(() => {
							})
						));

						bind_value(input_7, () => get(form).city, ($$value) => (
							mutate(form, get(form).city = $$value),
							invalidate_inner_signals(() => {
							})
						));

						bind_select_value(select, () => get(form).province, ($$value) => (
							mutate(form, get(form).province = $$value),
							invalidate_inner_signals(() => {
							})
						));

						append($$anchor, fragment_3);
					};

					if_block(node_2, ($$render) => {
						if (get(step) === 'processing') $$render(consequent_1); else if (get(step) === 'success') $$render(consequent_2, 1); else if (get(step) === 'cancel') $$render(consequent_3, 2); else if (get(step) === 'cart') $$render(consequent_7, 3); else if (get(step) === 'checkout') $$render(consequent_10, 4);
					});
				}

				var node_10 = sibling(div_2, 2);

				Footer(node_10, {
					get site() {
						return (get(data), untrack(() => get(data).site));
					}
				});
				append($$anchor, div_1);
			};

			if_block(node, ($$render) => {
				if (get(loading) || !get(data)) $$render(consequent); else $$render(alternate_2, -1);
			});
		}

		append($$anchor, fragment);
		pop();
		$$cleanup();
	}

	delegate(['click']);

	var root_1$3 = from_html(`<meta name="description" content="Others. shipping policy, return information and delivery times."/>`);
	var root_2$3 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_3$3 = from_html(`<div class="min-h-screen"><!> <div class="pt-28 pb-20 px-6 md:px-10 max-w-3xl mx-auto"><h1 class="text-3xl md:text-4xl font-display font-bold mb-10">Shipping &amp; Returns</h1> <div class="prose prose-sm max-w-none text-foreground [&amp;_h2]:font-display [&amp;_h2]:font-bold [&amp;_h2]:text-xl [&amp;_h2]:mt-6 [&amp;_h2]:mb-3 [&amp;_p]:text-muted-foreground [&amp;_p]:leading-relaxed [&amp;_p]:mb-4"></div></div> <!></div>`);

	function Shipping($$anchor, $$props) {
		push($$props, false);

		let data = mutable_source(null);
		let loading = mutable_source(true);

		onMount(async () => {
			try {
				set(data, await loadStoreData());
			} finally {
				set(loading, false);
			}
		});

		init();

		var fragment = comment();

		head('aputeo', ($$anchor) => {
			var meta = root_1$3();

			deferred_template_effect(() => {
				$document.title = get(data)
					? `Shipping & Returns — ${get(data).site.name}`
					: 'Shipping & Returns';
			});

			append($$anchor, meta);
		});

		var node = first_child(fragment);

		{
			var consequent = ($$anchor) => {
				var div = root_2$3();

				append($$anchor, div);
			};

			var alternate = ($$anchor) => {
				var div_1 = root_3$3();
				var node_1 = child(div_1);

				Navbar(node_1, {
					get siteName() {
						return get(data).site.name;
					},

					get logo() {
						return get(data).site.logo;
					}
				});

				var div_2 = sibling(node_1, 2);
				var div_3 = sibling(child(div_2), 2);

				html(div_3, () => get(data).pages?.shipping?.content ?? '<p>Shipping information coming soon.</p>', true);

				var node_2 = sibling(div_2, 2);

				Footer(node_2, {
					get site() {
						return get(data).site;
					}
				});
				append($$anchor, div_1);
			};

			if_block(node, ($$render) => {
				if (get(loading) || !get(data)) $$render(consequent); else $$render(alternate, -1);
			});
		}

		append($$anchor, fragment);
		pop();
	}

	var root_1$2 = from_html(`<meta name="description" content="Frequently asked questions about Others. products, shipping, returns and more."/>`);
	var root_2$2 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_5$2 = from_html(`<p class="pb-5 text-sm text-muted-foreground leading-relaxed animate-fade-in"> </p>`);
	var root_4$2 = from_html(`<div><button class="w-full flex items-center justify-between py-5 text-left font-medium hover:text-foreground transition-colors"><span> </span> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 9 6 6 6-6"></path></svg></button> <!></div>`);
	var root_6$1 = from_html(`<p class="py-8 text-muted-foreground text-sm">No FAQs yet.</p>`);
	var root_3$2 = from_html(`<div class="min-h-screen"><!> <div class="pt-28 pb-20 px-6 md:px-10 max-w-3xl mx-auto"><h1 class="text-3xl md:text-4xl font-display font-bold mb-10">Frequently Asked Questions</h1> <div class="space-y-0 divide-y divide-border"><!> <!></div></div> <!></div>`);

	function FAQ($$anchor, $$props) {
		push($$props, false);

		const faqItems = mutable_source();
		let data = mutable_source(null);
		let loading = mutable_source(true);
		let open = mutable_source(null);

		onMount(async () => {
			try {
				set(data, await loadStoreData());
			} finally {
				set(loading, false);
			}
		});

		legacy_pre_effect(() => (get(data)), () => {
			set(faqItems, Array.isArray(get(data)?.pages?.faq)
				? get(data).pages.faq
				: get(data)?.pages?.faq?.items ?? []);
		});

		legacy_pre_effect_reset();
		init();

		var fragment = comment();

		head('1s9hvqm', ($$anchor) => {
			var meta = root_1$2();

			deferred_template_effect(() => {
				$document.title = (
					get(data),
					untrack(() => get(data) ? `FAQ — ${get(data).site.name}` : 'FAQ')
				) ?? '';
			});

			append($$anchor, meta);
		});

		var node = first_child(fragment);

		{
			var consequent = ($$anchor) => {
				var div = root_2$2();

				append($$anchor, div);
			};

			var alternate = ($$anchor) => {
				var div_1 = root_3$2();
				var node_1 = child(div_1);

				Navbar(node_1, {
					get siteName() {
						return (get(data), untrack(() => get(data).site.name));
					},

					get logo() {
						return (get(data), untrack(() => get(data).site.logo));
					}
				});

				var div_2 = sibling(node_1, 2);
				var div_3 = sibling(child(div_2), 2);
				var node_2 = child(div_3);

				each(node_2, 1, () => get(faqItems), index, ($$anchor, item) => {
					var div_4 = root_4$2();
					var button = child(div_4);
					var span = child(button);
					var text = child(span);

					var svg = sibling(span, 2);

					var node_3 = sibling(button, 2);

					{
						var consequent_1 = ($$anchor) => {
							var p = root_5$2();
							var text_1 = child(p);
							template_effect(() => set_text(text_1, (get(item), untrack(() => get(item).answer))));
							append($$anchor, p);
						};

						if_block(node_3, ($$render) => {
							if ((
								get(open),
								get(item),
								untrack(() => get(open) === get(item).id)
							)) $$render(consequent_1);
						});
					}

					template_effect(() => {
						set_text(text, (get(item), untrack(() => get(item).question)));

						set_class(svg, 0, `flex-shrink-0 transition-transform duration-200 ${(
						get(open),
						get(item),
						untrack(() => get(open) === get(item).id ? 'rotate-180' : '')
					) ?? ''}`);
					});

					delegated('click', button, () => set(open, get(open) === get(item).id ? null : get(item).id));
					append($$anchor, div_4);
				});

				var node_4 = sibling(node_2, 2);

				{
					var consequent_2 = ($$anchor) => {
						var p_1 = root_6$1();

						append($$anchor, p_1);
					};

					if_block(node_4, ($$render) => {
						if ((get(faqItems), untrack(() => !get(faqItems).length))) $$render(consequent_2);
					});
				}

				var node_5 = sibling(div_2, 2);

				Footer(node_5, {
					get site() {
						return (get(data), untrack(() => get(data).site));
					}
				});
				append($$anchor, div_1);
			};

			if_block(node, ($$render) => {
				if (get(loading) || !get(data)) $$render(consequent); else $$render(alternate, -1);
			});
		}

		append($$anchor, fragment);
		pop();
	}

	delegate(['click']);

	var root_1$1 = from_html(`<meta name="description" content="Get in touch with the Others. team. Enquiries, returns, press and collaborations."/>`);
	var root_2$1 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>`);
	var root_4$1 = from_html(`<div><p class="text-label mb-1"> </p> <a class="text-sm hover:underline underline-offset-2 transition-all"> </a></div>`);
	var root_5$1 = from_html(`<div><p class="text-label mb-1">FIND US</p> <address class="text-sm not-italic text-muted-foreground leading-relaxed"> </address></div>`);
	var root_3$1 = from_html(`<div class="min-h-screen"><!> <div class="pt-28 pb-20 px-6 md:px-10 max-w-4xl mx-auto"><h1 class="text-3xl md:text-4xl font-display font-bold mb-10">Contact</h1> <div class="grid md:grid-cols-2 gap-12"><div class="space-y-6"></div> <!></div></div> <!></div>`);

	function Contact($$anchor, $$props) {
		push($$props, false);

		const contact = mutable_source();
		let data = mutable_source(null);
		let loading = mutable_source(true);

		onMount(async () => {
			try {
				set(data, await loadStoreData());
			} finally {
				set(loading, false);
			}
		});

		legacy_pre_effect(() => (get(data)), () => {
			set(contact, get(data)?.pages?.contact ?? { address: '', details: [] });
		});

		legacy_pre_effect_reset();
		init();

		var fragment = comment();

		head('1ffqsuu', ($$anchor) => {
			var meta = root_1$1();

			deferred_template_effect(() => {
				$document.title = (
					get(data),
					untrack(() => get(data) ? `Contact — ${get(data).site.name}` : 'Contact')
				) ?? '';
			});

			append($$anchor, meta);
		});

		var node = first_child(fragment);

		{
			var consequent = ($$anchor) => {
				var div = root_2$1();

				append($$anchor, div);
			};

			var alternate = ($$anchor) => {
				var div_1 = root_3$1();
				var node_1 = child(div_1);

				Navbar(node_1, {
					get siteName() {
						return (get(data), untrack(() => get(data).site.name));
					},

					get logo() {
						return (get(data), untrack(() => get(data).site.logo));
					}
				});

				var div_2 = sibling(node_1, 2);
				var div_3 = sibling(child(div_2), 2);
				var div_4 = child(div_3);

				each(div_4, 5, () => (get(contact), untrack(() => get(contact).details)), index, ($$anchor, detail) => {
					var div_5 = root_4$1();
					var p = child(div_5);
					var text = child(p);

					var a = sibling(p, 2);
					var text_1 = child(a);

					template_effect(
						($0, $1) => {
							set_text(text, $0);
							set_attribute(a, 'href', $1);
							set_text(text_1, (get(detail), untrack(() => get(detail).value)));
						},
						[
							() => (
								get(detail),
								untrack(() => get(detail).label.toUpperCase())
							),

							() => (
								get(detail),
								untrack(() => get(detail).value.includes('@')
									? `mailto:${get(detail).value}`
									: `tel:${get(detail).value}`)
							)
						]
					);

					append($$anchor, div_5);
				});

				var node_2 = sibling(div_4, 2);

				{
					var consequent_1 = ($$anchor) => {
						var div_6 = root_5$1();
						var address = sibling(child(div_6), 2);
						var text_2 = child(address);
						template_effect(() => set_text(text_2, (get(contact), untrack(() => get(contact).address))));
						append($$anchor, div_6);
					};

					if_block(node_2, ($$render) => {
						if ((get(contact), untrack(() => get(contact).address))) $$render(consequent_1);
					});
				}

				var node_3 = sibling(div_2, 2);

				Footer(node_3, {
					get site() {
						return (get(data), untrack(() => get(data).site));
					}
				});
				append($$anchor, div_1);
			};

			if_block(node, ($$render) => {
				if (get(loading) || !get(data)) $$render(consequent); else $$render(alternate, -1);
			});
		}

		append($$anchor, fragment);
		pop();
	}

	var root$2 = from_html(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="text-center px-6"><p class="text-label mb-4">404</p> <h1 class="text-4xl font-display font-bold mb-6">Page Not Found</h1> <a href="/" class="inline-block border border-foreground px-8 py-3 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300">GO HOME</a></div></div>`);

	function NotFound($$anchor) {
		function goHome(e) {
			e.preventDefault();

			if (window.__navigate) window.__navigate('/');
		}

		var div = root$2();
		var div_1 = child(div);
		var a = sibling(child(div_1), 4);
		delegated('click', a, goHome);
		append($$anchor, div);
	}

	delegate(['click']);

	var root_1 = from_html(`<meta name="robots" content="noindex"/>`);
	var root_2 = from_html(`<div class="absolute inset-0 bg-black/60 backdrop-blur-[2px]"></div>`);
	var root_3 = from_html(`<img class="h-10 w-auto mx-auto mb-10 object-contain drop-shadow"/>`);
	var root_4 = from_html(`<p class="text-label tracking-[0.4em] mb-10 opacity-60"> </p>`);
	var root_6 = from_html(`<div><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"></path></svg> You're on the list — we'll notify you when we're back!</div>`);
	var root_8 = from_html(`<p class="text-xs text-red-400 mt-2"> </p>`);
	var root_7 = from_html(`<p class="text-xs opacity-60 mb-3 tracking-widest uppercase">Notify me when you're back</p> <form class="flex gap-2 max-w-sm mx-auto"><input type="email" required="" placeholder="your@email.com"/> <button type="submit" aria-label="Notify me"> </button></form> <!>`, 1);
	var root_5 = from_html(`<div class="mt-10"><!></div>`);
	var root_10 = from_html(`<a target="_blank" rel="noopener noreferrer" class="opacity-60 hover:opacity-100 transition-opacity" aria-label="Instagram"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></a>`);
	var root_11 = from_html(`<a target="_blank" rel="noopener noreferrer" class="opacity-60 hover:opacity-100 transition-opacity" aria-label="X (Twitter)"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg></a>`);
	var root_12 = from_html(`<a target="_blank" rel="noopener noreferrer" class="opacity-60 hover:opacity-100 transition-opacity" aria-label="TikTok"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path></svg></a>`);
	var root_9 = from_html(`<div class="flex items-center justify-center gap-6 mt-10"><!> <!> <!></div>`);
	var root$1 = from_html(`<div class="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-background"><!> <div><!> <div><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"></path></svg></div> <h1 class="font-display text-3xl md:text-4xl font-bold mb-5 leading-tight"> </h1> <p class="text-sm leading-relaxed opacity-75 max-w-sm mx-auto"> </p> <!> <div></div> <p class="text-xs mt-4 opacity-40 tracking-widest uppercase">Back Soon</p> <!></div></div>`);

	function Maintenance($$anchor, $$props) {
		push($$props, false);

		let title = prop($$props, 'title', 8, "We'll be back soon.");
		let message = prop($$props, 'message', 8, "Our store is currently undergoing scheduled maintenance. Please check back shortly.");
		let background = prop($$props, 'background', 8, '');
		let siteName = prop($$props, 'siteName', 8, 'Others.');
		let logo = prop($$props, 'logo', 8, '');
		let socials = prop($$props, 'socials', 24, () => ({}));
		let collectEmails = prop($$props, 'collectEmails', 8, false);
		let email = mutable_source('');
		let submitted = mutable_source(false);
		let submitting = mutable_source(false);
		let submitError = mutable_source('');

		async function handleSubmit(e) {
			e.preventDefault();

			if (!get(email) || get(submitting)) return;

			set(submitting, true);
			set(submitError, '');

			try {
				const res = await fetch('/api/newsletter', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: get(email) })
				});

				const body = await res.json();

				if (!res.ok) throw new Error(body.error || 'Something went wrong.');

				set(submitted, true);
			} catch(err) {
				set(submitError, err.message);
			} finally {
				set(submitting, false);
			}
		}

		init();

		var div = root$1();

		head('1k05bxv', ($$anchor) => {
			var meta = root_1();

			deferred_template_effect(() => {
				$document.title = `Maintenance — ${siteName() ?? ''}`;
			});

			append($$anchor, meta);
		});

		var node = child(div);

		{
			var consequent = ($$anchor) => {
				var div_1 = root_2();

				append($$anchor, div_1);
			};

			if_block(node, ($$render) => {
				if (background()) $$render(consequent);
			});
		}

		var div_2 = sibling(node, 2);
		var node_1 = child(div_2);

		{
			var consequent_1 = ($$anchor) => {
				var img = root_3();

				template_effect(() => {
					set_attribute(img, 'src', logo());
					set_attribute(img, 'alt', siteName());
				});

				append($$anchor, img);
			};

			var alternate = ($$anchor) => {
				var p = root_4();
				var text = child(p);
				template_effect(() => set_text(text, siteName()));
				append($$anchor, p);
			};

			if_block(node_1, ($$render) => {
				if (logo()) $$render(consequent_1); else $$render(alternate, -1);
			});
		}

		var div_3 = sibling(node_1, 2);
		var h1 = sibling(div_3, 2);
		var text_1 = child(h1);

		var p_1 = sibling(h1, 2);
		var text_2 = child(p_1);

		var node_2 = sibling(p_1, 2);

		{
			var consequent_4 = ($$anchor) => {
				var div_4 = root_5();
				var node_3 = child(div_4);

				{
					var consequent_2 = ($$anchor) => {
						var div_5 = root_6();

						template_effect(() => set_class(div_5, 1, `flex items-center justify-center gap-2 text-sm ${background() ? 'text-white' : 'text-foreground'} opacity-80`));
						append($$anchor, div_5);
					};

					var alternate_1 = ($$anchor) => {
						var fragment = root_7();
						var form = sibling(first_child(fragment), 2);
						var input = child(form);

						var button = sibling(input, 2);
						var text_3 = child(button);

						var node_4 = sibling(form, 2);

						{
							var consequent_3 = ($$anchor) => {
								var p_2 = root_8();
								var text_4 = child(p_2);
								template_effect(() => set_text(text_4, get(submitError)));
								append($$anchor, p_2);
							};

							if_block(node_4, ($$render) => {
								if (get(submitError)) $$render(consequent_3);
							});
						}

						template_effect(() => {
							set_class(input, 1, `flex-1 px-4 py-2.5 text-sm bg-transparent border focus:outline-none transition-colors
                ${background()
							? 'border-white/40 text-white placeholder-white/40 focus:border-white/80'
							: 'border-border focus:border-foreground'}`);

							button.disabled = get(submitting);

							set_class(button, 1, `px-5 py-2.5 text-[10px] tracking-[0.2em] uppercase font-medium transition-colors disabled:opacity-60
                ${background()
							? 'bg-white text-black hover:bg-white/90'
							: 'bg-foreground text-primary-foreground hover:bg-foreground/90'}`);

							set_text(text_3, get(submitting) ? '…' : 'NOTIFY');
						});

						event('submit', form, handleSubmit);
						bind_value(input, () => get(email), ($$value) => set(email, $$value));
						append($$anchor, fragment);
					};

					if_block(node_3, ($$render) => {
						if (get(submitted)) $$render(consequent_2); else $$render(alternate_1, -1);
					});
				}
				append($$anchor, div_4);
			};

			if_block(node_2, ($$render) => {
				if (collectEmails()) $$render(consequent_4);
			});
		}

		var div_6 = sibling(node_2, 2);
		var node_5 = sibling(div_6, 4);

		{
			var consequent_8 = ($$anchor) => {
				var div_7 = root_9();
				var node_6 = child(div_7);

				{
					var consequent_5 = ($$anchor) => {
						var a = root_10();

						template_effect(($0) => set_attribute(a, 'href', $0), [
							() => (
								deep_read_state(socials()),
								untrack(() => socials().instagram.trim())
							)
						]);

						append($$anchor, a);
					};

					var d = user_derived(() => (
						deep_read_state(socials()),
						untrack(() => socials().instagram?.trim())
					));

					if_block(node_6, ($$render) => {
						if (get(d)) $$render(consequent_5);
					});
				}

				var node_7 = sibling(node_6, 2);

				{
					var consequent_6 = ($$anchor) => {
						var a_1 = root_11();

						template_effect(($0) => set_attribute(a_1, 'href', $0), [
							() => (
								deep_read_state(socials()),
								untrack(() => socials().twitter.trim())
							)
						]);

						append($$anchor, a_1);
					};

					var d_1 = user_derived(() => (
						deep_read_state(socials()),
						untrack(() => socials().twitter?.trim())
					));

					if_block(node_7, ($$render) => {
						if (get(d_1)) $$render(consequent_6);
					});
				}

				var node_8 = sibling(node_7, 2);

				{
					var consequent_7 = ($$anchor) => {
						var a_2 = root_12();

						template_effect(($0) => set_attribute(a_2, 'href', $0), [
							() => (
								deep_read_state(socials()),
								untrack(() => socials().tiktok.trim())
							)
						]);

						append($$anchor, a_2);
					};

					var d_2 = user_derived(() => (
						deep_read_state(socials()),
						untrack(() => socials().tiktok?.trim())
					));

					if_block(node_8, ($$render) => {
						if (get(d_2)) $$render(consequent_7);
					});
				}
				append($$anchor, div_7);
			};

			var d_3 = user_derived(() => (
				deep_read_state(socials()),
				untrack(() => socials() && (socials().instagram?.trim() || socials().twitter?.trim() || socials().tiktok?.trim()))
			));

			if_block(node_5, ($$render) => {
				if (get(d_3)) $$render(consequent_8);
			});
		}

		template_effect(() => {
			set_style(div, background()
				? `background-image: url('${background()}'); background-size: cover; background-position: center;`
				: '');

			set_class(div_2, 1, `relative z-10 text-center max-w-lg px-8 py-16 ${background() ? 'text-white' : ''}`);
			set_class(div_3, 1, `w-16 h-16 mx-auto mb-8 rounded-full flex items-center justify-center border ${background() ? 'border-white/30' : 'border-border'}`);
			set_text(text_1, title());
			set_text(text_2, message());
			set_class(div_6, 1, `w-12 h-px mx-auto mt-12 ${background() ? 'bg-white/30' : 'bg-border'}`);
		});

		append($$anchor, div);
		pop();
	}

	var root = from_html(`<!> <!>`, 1);

	function App($$anchor, $$props) {
		push($$props, false);

		const route = mutable_source();

		// ── Pages ──────────────────────────────────────────────────────────────────
		let path = mutable_source(window.location.pathname);

		let maintenance = mutable_source(null // null = not yet checked
		);
		let site = mutable_source(null);

		onMount(async () => {
			const handler = () => {
				set(path, window.location.pathname);
			};

			window.addEventListener('popstate', handler);

			try {
				const data = await loadStoreData();

				set(site, data?.site);
				set(maintenance, data?.site?.maintenance?.enabled ? data.site.maintenance : false);
			} catch {
				set(maintenance, false);
			}

			return () => window.removeEventListener('popstate', handler);
		});

		window.__navigate = (to) => {
			history.pushState({}, '', to);
			set(path, to);
			window.scrollTo(0, 0);
		};

		// ── Route resolver ─────────────────────────────────────────────────────────
		function resolveRoute(p) {
			if (p === '/') return { page: 'index' };
			if (p.startsWith('/admin')) return { page: 'admin' };
			if (p === '/products') return { page: 'products' };
			if (p.startsWith('/products/')) return { page: 'product', id: p.slice(('/products/').length) };
			if (p === '/lookbook') return { page: 'lookbook' };
			if (p.startsWith('/lookbook/')) return { page: 'lookbook-detail', id: p.slice(('/lookbook/').length) };
			if (p === '/community') return { page: 'community' };
			if (p.startsWith('/community/')) return { page: 'article', slug: p.slice(('/community/').length) };
			if (p === '/cart') return { page: 'cart' };
			if (p === '/payment/success') return { page: 'cart' }; // Cart handles this step
			if (p === '/payment/cancel') return { page: 'cart' };
			if (p === '/shipping-returns') return { page: 'shipping' };
			if (p === '/faq') return { page: 'faq' };
			if (p === '/contact') return { page: 'contact' };

			return { page: 'notfound' };
		}

		legacy_pre_effect(() => (get(path)), () => {
			set(route, resolveRoute(get(path)));
		});

		legacy_pre_effect_reset();
		init();

		var fragment = root();
		var node = first_child(fragment);

		GeoBlock(node, {});

		var node_1 = sibling(node, 2);

		{
			var consequent = ($$anchor) => {
				{
					let $0 = derived_safe_equal(() => (get(site), untrack(() => get(site)?.logo)));
					let $1 = derived_safe_equal(() => (get(site), untrack(() => get(site)?.socials)));

					Maintenance($$anchor, {
						get title() {
							return (
								get(maintenance),
								untrack(() => get(maintenance).title)
							);
						},

						get message() {
							return (
								get(maintenance),
								untrack(() => get(maintenance).message)
							);
						},

						get background() {
							return (
								get(maintenance),
								untrack(() => get(maintenance).background)
							);
						},

						get collectEmails() {
							return (
								get(maintenance),
								untrack(() => get(maintenance).collectEmails)
							);
						},

						get logo() {
							return get($0);
						},

						get socials() {
							return get($1);
						}
					});
				}
			};

			var consequent_1 = ($$anchor) => {
				Index($$anchor, {});
			};

			var consequent_2 = ($$anchor) => {
				Admin($$anchor, {});
			};

			var consequent_3 = ($$anchor) => {
				Products($$anchor, {});
			};

			var consequent_4 = ($$anchor) => {
				Product($$anchor, {
					get productId() {
						return (get(route), untrack(() => get(route).id));
					}
				});
			};

			var consequent_5 = ($$anchor) => {
				Lookbook($$anchor, {});
			};

			var consequent_6 = ($$anchor) => {
				LookbookDetail($$anchor, {
					get lookbookId() {
						return (get(route), untrack(() => get(route).id));
					}
				});
			};

			var consequent_7 = ($$anchor) => {
				Community($$anchor, {});
			};

			var consequent_8 = ($$anchor) => {
				Article($$anchor, {
					get slug() {
						return (get(route), untrack(() => get(route).slug));
					}
				});
			};

			var consequent_9 = ($$anchor) => {
				Cart($$anchor, {});
			};

			var consequent_10 = ($$anchor) => {
				Shipping($$anchor, {});
			};

			var consequent_11 = ($$anchor) => {
				FAQ($$anchor, {});
			};

			var consequent_12 = ($$anchor) => {
				Contact($$anchor, {});
			};

			var alternate = ($$anchor) => {
				NotFound($$anchor);
			};

			if_block(node_1, ($$render) => {
				if ((
					get(maintenance),
					get(route),
					untrack(() => get(maintenance) !== null && get(maintenance) !== false && get(route).page !== 'admin')
				)) $$render(consequent); else if ((get(route), untrack(() => get(route).page === 'index'))) $$render(consequent_1, 1); else if ((get(route), untrack(() => get(route).page === 'admin'))) $$render(consequent_2, 2); else if ((
					get(route),
					untrack(() => get(route).page === 'products')
				)) $$render(consequent_3, 3); else if ((
					get(route),
					untrack(() => get(route).page === 'product')
				)) $$render(consequent_4, 4); else if ((
					get(route),
					untrack(() => get(route).page === 'lookbook')
				)) $$render(consequent_5, 5); else if ((
					get(route),
					untrack(() => get(route).page === 'lookbook-detail')
				)) $$render(consequent_6, 6); else if ((
					get(route),
					untrack(() => get(route).page === 'community')
				)) $$render(consequent_7, 7); else if ((
					get(route),
					untrack(() => get(route).page === 'article')
				)) $$render(consequent_8, 8); else if ((get(route), untrack(() => get(route).page === 'cart'))) $$render(consequent_9, 9); else if ((
					get(route),
					untrack(() => get(route).page === 'shipping')
				)) $$render(consequent_10, 10); else if ((get(route), untrack(() => get(route).page === 'faq'))) $$render(consequent_11, 11); else if ((
					get(route),
					untrack(() => get(route).page === 'contact')
				)) $$render(consequent_12, 12); else $$render(alternate, -1);
			});
		}

		append($$anchor, fragment);
		pop();
	}

	mount(App, { target: document.body });

})();
//# sourceMappingURL=bundle.js.map
