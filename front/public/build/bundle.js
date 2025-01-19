
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? null : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        if (value == null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=} start
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
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
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
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

    /* src/App.svelte generated by Svelte v3.59.2 */

    const { Error: Error_1, console: console_1 } = globals;
    const file = "src/App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[50] = list[i];
    	child_ctx[52] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[50] = list[i];
    	child_ctx[54] = i;
    	return child_ctx;
    }

    // (440:8) {#each $gaussians as g, i}
    function create_each_block_1(ctx) {
    	let div0;
    	let t;
    	let div1;
    	let mounted;
    	let dispose;

    	function mousedown_handler(...args) {
    		return /*mousedown_handler*/ ctx[24](/*g*/ ctx[50], ...args);
    	}

    	function mousedown_handler_1(...args) {
    		return /*mousedown_handler_1*/ ctx[25](/*g*/ ctx[50], ...args);
    	}

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			t = space();
    			div1 = element("div");
    			attr_dev(div0, "class", "variance-circle svelte-12uy645");
    			set_style(div0, "width", 129 * /*g*/ ctx[50].variance + "px");
    			set_style(div0, "height", 129 * /*g*/ ctx[50].variance + "px");
    			set_style(div0, "left", 176 + 176 / 3 * /*g*/ ctx[50].mean.x + "px");
    			set_style(div0, "top", 176 - 176 / 3 * /*g*/ ctx[50].mean.y + "px");
    			toggle_class(div0, "highlight", /*i*/ ctx[54] === /*hoveredGaussian*/ ctx[10] || /*isRunning*/ ctx[8]);
    			add_location(div0, file, 441, 10, 12978);
    			attr_dev(div1, "class", "mean-circle svelte-12uy645");
    			set_style(div1, "left", 176 + 176 / 3 * /*g*/ ctx[50].mean.x + "px");
    			set_style(div1, "top", 176 - 176 / 3 * /*g*/ ctx[50].mean.y + "px");
    			toggle_class(div1, "highlight", /*i*/ ctx[54] === /*hoveredGaussian*/ ctx[10]);
    			add_location(div1, file, 454, 10, 13418);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			insert_dev(target, t, anchor);
    			insert_dev(target, div1, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(div0, "mousedown", mousedown_handler, false, false, false, false),
    					listen_dev(div1, "mousedown", mousedown_handler_1, false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty[0] & /*$gaussians*/ 4096) {
    				set_style(div0, "width", 129 * /*g*/ ctx[50].variance + "px");
    			}

    			if (dirty[0] & /*$gaussians*/ 4096) {
    				set_style(div0, "height", 129 * /*g*/ ctx[50].variance + "px");
    			}

    			if (dirty[0] & /*$gaussians*/ 4096) {
    				set_style(div0, "left", 176 + 176 / 3 * /*g*/ ctx[50].mean.x + "px");
    			}

    			if (dirty[0] & /*$gaussians*/ 4096) {
    				set_style(div0, "top", 176 - 176 / 3 * /*g*/ ctx[50].mean.y + "px");
    			}

    			if (dirty[0] & /*hoveredGaussian, isRunning*/ 1280) {
    				toggle_class(div0, "highlight", /*i*/ ctx[54] === /*hoveredGaussian*/ ctx[10] || /*isRunning*/ ctx[8]);
    			}

    			if (dirty[0] & /*$gaussians*/ 4096) {
    				set_style(div1, "left", 176 + 176 / 3 * /*g*/ ctx[50].mean.x + "px");
    			}

    			if (dirty[0] & /*$gaussians*/ 4096) {
    				set_style(div1, "top", 176 - 176 / 3 * /*g*/ ctx[50].mean.y + "px");
    			}

    			if (dirty[0] & /*hoveredGaussian*/ 1024) {
    				toggle_class(div1, "highlight", /*i*/ ctx[54] === /*hoveredGaussian*/ ctx[10]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t);
    			if (detaching) detach_dev(div1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(440:8) {#each $gaussians as g, i}",
    		ctx
    	});

    	return block;
    }

    // (491:8) {#each $gaussians as g, _}
    function create_each_block(ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*g*/ ctx[50].mean.x.toFixed(2) + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2_value = /*g*/ ctx[50].mean.y.toFixed(2) + "";
    	let t2;
    	let t3;
    	let td2;
    	let t4_value = /*g*/ ctx[50].variance.toFixed(2) + "";
    	let t4;
    	let t5;

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			td2 = element("td");
    			t4 = text(t4_value);
    			t5 = space();
    			attr_dev(td0, "class", "svelte-12uy645");
    			add_location(td0, file, 492, 12, 14419);
    			attr_dev(td1, "class", "svelte-12uy645");
    			add_location(td1, file, 493, 12, 14462);
    			attr_dev(td2, "class", "svelte-12uy645");
    			add_location(td2, file, 494, 12, 14505);
    			attr_dev(tr, "class", "svelte-12uy645");
    			add_location(tr, file, 491, 10, 14402);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td0);
    			append_dev(td0, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, t2);
    			append_dev(tr, t3);
    			append_dev(tr, td2);
    			append_dev(td2, t4);
    			append_dev(tr, t5);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*$gaussians*/ 4096 && t0_value !== (t0_value = /*g*/ ctx[50].mean.x.toFixed(2) + "")) set_data_dev(t0, t0_value);
    			if (dirty[0] & /*$gaussians*/ 4096 && t2_value !== (t2_value = /*g*/ ctx[50].mean.y.toFixed(2) + "")) set_data_dev(t2, t2_value);
    			if (dirty[0] & /*$gaussians*/ 4096 && t4_value !== (t4_value = /*g*/ ctx[50].variance.toFixed(2) + "")) set_data_dev(t4, t4_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(491:8) {#each $gaussians as g, _}",
    		ctx
    	});

    	return block;
    }

    // (619:26) 
    function create_if_block_1(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Loading visualization...";
    			attr_dev(p, "class", "svelte-12uy645");
    			add_location(p, file, 619, 8, 18083);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(619:26) ",
    		ctx
    	});

    	return block;
    }

    // (617:6) {#if currentImage}
    function create_if_block(ctx) {
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			img = element("img");
    			if (!src_url_equal(img.src, img_src_value = /*currentImage*/ ctx[9])) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Visualization");
    			attr_dev(img, "class", "svelte-12uy645");
    			add_location(img, file, 617, 8, 18001);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*currentImage*/ 512 && !src_url_equal(img.src, img_src_value = /*currentImage*/ ctx[9])) {
    				attr_dev(img, "src", img_src_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(617:6) {#if currentImage}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let main;
    	let header;
    	let div0;
    	let h10;
    	let t1;
    	let p0;
    	let t3;
    	let section0;
    	let h20;
    	let t5;
    	let p1;
    	let t7;
    	let h21;
    	let t9;
    	let p2;
    	let t11;
    	let ul;
    	let li0;
    	let t13;
    	let li1;
    	let t15;
    	let li2;
    	let t17;
    	let div1;
    	let img0;
    	let img0_src_value;
    	let t18;
    	let section1;
    	let h22;
    	let t20;
    	let p3;
    	let t22;
    	let div2;
    	let img1;
    	let img1_src_value;
    	let t23;
    	let h23;
    	let t25;
    	let p4;
    	let t27;
    	let div3;
    	let img2;
    	let img2_src_value;
    	let t28;
    	let p5;
    	let t30;
    	let div4;
    	let img3;
    	let img3_src_value;
    	let t31;
    	let section2;
    	let h24;
    	let t33;
    	let p6;
    	let t35;
    	let section3;
    	let div5;
    	let h11;
    	let t37;
    	let p7;
    	let t39;
    	let section4;
    	let p8;
    	let t41;
    	let div8;
    	let div6;
    	let t42;
    	let div7;
    	let t43;
    	let div9;
    	let t44;
    	let button0;
    	let t45;
    	let button0_disabled_value;
    	let t46;
    	let span0;
    	let t47_value = /*$gaussians*/ ctx[12].length + "";
    	let t47;
    	let t48;
    	let button1;
    	let t49;
    	let button1_disabled_value;
    	let t50;
    	let table;
    	let thead;
    	let tr;
    	let th0;
    	let t52;
    	let th1;
    	let t54;
    	let th2;
    	let t56;
    	let tbody;
    	let t57;
    	let p9;
    	let t59;
    	let div10;
    	let button2;
    	let t60;
    	let t61;
    	let button3;
    	let t62_value = (/*isRunning*/ ctx[8] ? 'Stop' : 'Start') + "";
    	let t62;
    	let t63;
    	let div19;
    	let div11;
    	let label0;
    	let t65;
    	let input0;
    	let t66;
    	let span1;
    	let t67;
    	let t68;
    	let div12;
    	let label1;
    	let t70;
    	let input1;
    	let t71;
    	let span2;
    	let t72;
    	let t73;
    	let div13;
    	let label2;
    	let t75;
    	let input2;
    	let t76;
    	let span3;
    	let t77_value = /*lr_model_value*/ ctx[3].toFixed(4) + "";
    	let t77;
    	let t78;
    	let div14;
    	let label3;
    	let t80;
    	let input3;
    	let t81;
    	let span4;
    	let t82_value = /*lr_logz_value*/ ctx[4].toFixed(3) + "";
    	let t82;
    	let t83;
    	let div15;
    	let label4;
    	let t85;
    	let input4;
    	let t86;
    	let span5;
    	let t87;
    	let t88;
    	let div16;
    	let label5;
    	let t90;
    	let input5;
    	let t91;
    	let span6;
    	let t92;
    	let t93;
    	let div17;
    	let label6;
    	let t95;
    	let input6;
    	let t96;
    	let span7;
    	let t97;
    	let t98;
    	let div18;
    	let label7;
    	let t100;
    	let input7;
    	let t101;
    	let span8;
    	let t102;
    	let t103;
    	let div20;
    	let t104;
    	let section5;
    	let h25;
    	let t106;
    	let p10;
    	let mounted;
    	let dispose;
    	let each_value_1 = /*$gaussians*/ ctx[12];
    	validate_each_argument(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*$gaussians*/ ctx[12];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	function select_block_type(ctx, dirty) {
    		if (/*currentImage*/ ctx[9]) return create_if_block;
    		if (/*isRunning*/ ctx[8]) return create_if_block_1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	const block = {
    		c: function create() {
    			main = element("main");
    			header = element("header");
    			div0 = element("div");
    			h10 = element("h1");
    			h10.textContent = "Understanding GFlowNets";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Gaining intuition for Generative Flow Networks and how to train them";
    			t3 = space();
    			section0 = element("section");
    			h20 = element("h2");
    			h20.textContent = "What is a GFlowNet?";
    			t5 = space();
    			p1 = element("p");
    			p1.textContent = "Short Description: What can they do, how do they work, advantages";
    			t7 = space();
    			h21 = element("h2");
    			h21.textContent = "Toy Environment";
    			t9 = space();
    			p2 = element("p");
    			p2.textContent = "A 2-dimensional multivariate Gaussian environment with two modes. GFlowNet\n      takes steps in the x or y direction, and rewards are calculated based on the mixture of\n      Gaussians.";
    			t11 = space();
    			ul = element("ul");
    			li0 = element("li");
    			li0.textContent = "Variable sequence length is typically supported, but fixed here for simplicity.";
    			t13 = space();
    			li1 = element("li");
    			li1.textContent = "State does not depend on the order of steps.";
    			t15 = space();
    			li2 = element("li");
    			li2.textContent = "Added a counter to avoid circular paths in the graph.";
    			t17 = space();
    			div1 = element("div");
    			img0 = element("img");
    			t18 = space();
    			section1 = element("section");
    			h22 = element("h2");
    			h22.textContent = "Training";
    			t20 = space();
    			p3 = element("p");
    			p3.textContent = "Visualizing how GFlowNet samples from the underlying distribution.\n      -> Learns full distribution given enough compute\n      TODO: Add slider over training iterations to visualizations to add interactivity and see training progress";
    			t22 = space();
    			div2 = element("div");
    			img1 = element("img");
    			t23 = space();
    			h23 = element("h2");
    			h23.textContent = "Mode Collapse";
    			t25 = space();
    			p4 = element("p");
    			p4.textContent = "If there is little probability mass between modes, we see mode collapse.";
    			t27 = space();
    			div3 = element("div");
    			img2 = element("img");
    			t28 = space();
    			p5 = element("p");
    			p5.textContent = "Training off-policy mitigates this issue.\n      We added variance to each step -> more exploring";
    			t30 = space();
    			div4 = element("div");
    			img3 = element("img");
    			t31 = space();
    			section2 = element("section");
    			h24 = element("h2");
    			h24.textContent = "Flow";
    			t33 = space();
    			p6 = element("p");
    			p6.textContent = "Visualize flow between states. Probably interactive:\n      Hovering over env and displaying flow in 8 directions with arrows.\n      Probably need to discretize for this?";
    			t35 = space();
    			section3 = element("section");
    			div5 = element("div");
    			h11 = element("h1");
    			h11.textContent = "Playground";
    			t37 = space();
    			p7 = element("p");
    			p7.textContent = "Change the environment and train your own GFlowNet to get a feeling on how they work.";
    			t39 = space();
    			section4 = element("section");
    			p8 = element("p");
    			p8.textContent = "Here you can change the environment.\n      Drag the center of the circles to change the mean and the border to change the variance.\n      You can also add more Gaussians if you want.";
    			t41 = space();
    			div8 = element("div");
    			div6 = element("div");
    			t42 = space();
    			div7 = element("div");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t43 = space();
    			div9 = element("div");
    			t44 = text("Number of Gaussians:\n      ");
    			button0 = element("button");
    			t45 = text("-");
    			t46 = space();
    			span0 = element("span");
    			t47 = text(t47_value);
    			t48 = space();
    			button1 = element("button");
    			t49 = text("+");
    			t50 = space();
    			table = element("table");
    			thead = element("thead");
    			tr = element("tr");
    			th0 = element("th");
    			th0.textContent = "Mean X";
    			t52 = space();
    			th1 = element("th");
    			th1.textContent = "Mean Y";
    			t54 = space();
    			th2 = element("th");
    			th2.textContent = "Variance";
    			t56 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t57 = space();
    			p9 = element("p");
    			p9.textContent = "change training settings and start training (visualize training by sampling every n steps),\n      all interactivty deactivated while training, add stop button.";
    			t59 = space();
    			div10 = element("div");
    			button2 = element("button");
    			t60 = text("Reset");
    			t61 = space();
    			button3 = element("button");
    			t62 = text(t62_value);
    			t63 = space();
    			div19 = element("div");
    			div11 = element("div");
    			label0 = element("label");
    			label0.textContent = "Off-policy";
    			t65 = space();
    			input0 = element("input");
    			t66 = space();
    			span1 = element("span");
    			t67 = text(/*off_policy_value*/ ctx[1]);
    			t68 = space();
    			div12 = element("div");
    			label1 = element("label");
    			label1.textContent = "Iterations to train";
    			t70 = space();
    			input1 = element("input");
    			t71 = space();
    			span2 = element("span");
    			t72 = text(/*n_iterations_value*/ ctx[2]);
    			t73 = space();
    			div13 = element("div");
    			label2 = element("label");
    			label2.textContent = "Learning rate of the model";
    			t75 = space();
    			input2 = element("input");
    			t76 = space();
    			span3 = element("span");
    			t77 = text(t77_value);
    			t78 = space();
    			div14 = element("div");
    			label3 = element("label");
    			label3.textContent = "Learning rate of LogZ";
    			t80 = space();
    			input3 = element("input");
    			t81 = space();
    			span4 = element("span");
    			t82 = text(t82_value);
    			t83 = space();
    			div15 = element("div");
    			label4 = element("label");
    			label4.textContent = "Length of trajectory";
    			t85 = space();
    			input4 = element("input");
    			t86 = space();
    			span5 = element("span");
    			t87 = text(/*trajectory_length_value*/ ctx[5]);
    			t88 = space();
    			div16 = element("div");
    			label5 = element("label");
    			label5.textContent = "Number of hidden layers";
    			t90 = space();
    			input5 = element("input");
    			t91 = space();
    			span6 = element("span");
    			t92 = text(/*hidden_layer_value*/ ctx[6]);
    			t93 = space();
    			div17 = element("div");
    			label6 = element("label");
    			label6.textContent = "Seed";
    			t95 = space();
    			input6 = element("input");
    			t96 = space();
    			span7 = element("span");
    			t97 = text(/*seed_value*/ ctx[7]);
    			t98 = space();
    			div18 = element("div");
    			label7 = element("label");
    			label7.textContent = "Training batch size";
    			t100 = space();
    			input7 = element("input");
    			t101 = space();
    			span8 = element("span");
    			t102 = text(/*batch_size_value*/ ctx[11]);
    			t103 = space();
    			div20 = element("div");
    			if (if_block) if_block.c();
    			t104 = space();
    			section5 = element("section");
    			h25 = element("h2");
    			h25.textContent = "Sources";
    			t106 = space();
    			p10 = element("p");
    			p10.textContent = "Add sources";
    			attr_dev(h10, "class", "title svelte-12uy645");
    			add_location(h10, file, 350, 6, 9570);
    			attr_dev(p0, "class", "subtitle svelte-12uy645");
    			add_location(p0, file, 351, 6, 9623);
    			attr_dev(div0, "class", "container svelte-12uy645");
    			add_location(div0, file, 349, 4, 9540);
    			attr_dev(header, "class", "header svelte-12uy645");
    			add_location(header, file, 348, 2, 9512);
    			attr_dev(h20, "class", "section-title svelte-12uy645");
    			add_location(h20, file, 356, 4, 9772);
    			attr_dev(p1, "class", "section-text svelte-12uy645");
    			add_location(p1, file, 357, 4, 9827);
    			attr_dev(h21, "class", "section-title svelte-12uy645");
    			add_location(h21, file, 361, 4, 9938);
    			attr_dev(p2, "class", "section-text svelte-12uy645");
    			add_location(p2, file, 362, 4, 9989);
    			attr_dev(li0, "class", "svelte-12uy645");
    			add_location(li0, file, 368, 6, 10250);
    			attr_dev(li1, "class", "svelte-12uy645");
    			add_location(li1, file, 369, 6, 10345);
    			attr_dev(li2, "class", "svelte-12uy645");
    			add_location(li2, file, 370, 6, 10405);
    			attr_dev(ul, "class", "bullet-list svelte-12uy645");
    			add_location(ul, file, 367, 4, 10219);
    			if (!src_url_equal(img0.src, img0_src_value = "/images/env1.png")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "class", "image svelte-12uy645");
    			attr_dev(img0, "alt", "Rendering of the environment");
    			add_location(img0, file, 373, 6, 10518);
    			attr_dev(div1, "class", "image-container svelte-12uy645");
    			add_location(div1, file, 372, 4, 10482);
    			attr_dev(section0, "class", "section svelte-12uy645");
    			add_location(section0, file, 355, 2, 9742);
    			attr_dev(h22, "class", "section-title svelte-12uy645");
    			add_location(h22, file, 378, 4, 10667);
    			attr_dev(p3, "class", "section-text svelte-12uy645");
    			add_location(p3, file, 379, 4, 10711);
    			if (!src_url_equal(img1.src, img1_src_value = "/images/run1.png")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "class", "image svelte-12uy645");
    			attr_dev(img1, "alt", "GFN samples from the underlying distribution");
    			add_location(img1, file, 385, 6, 11026);
    			attr_dev(div2, "class", "image-container svelte-12uy645");
    			add_location(div2, file, 384, 4, 10990);
    			attr_dev(h23, "class", "section-title svelte-12uy645");
    			add_location(h23, file, 388, 4, 11136);
    			attr_dev(p4, "class", "section-text svelte-12uy645");
    			add_location(p4, file, 389, 4, 11185);
    			if (!src_url_equal(img2.src, img2_src_value = "/images/run2.png")) attr_dev(img2, "src", img2_src_value);
    			attr_dev(img2, "class", "image svelte-12uy645");
    			attr_dev(img2, "alt", "Low variance leads to sampling from one mode");
    			add_location(img2, file, 393, 6, 11338);
    			attr_dev(div3, "class", "image-container svelte-12uy645");
    			add_location(div3, file, 392, 4, 11302);
    			attr_dev(p5, "class", "section-text svelte-12uy645");
    			add_location(p5, file, 395, 4, 11447);
    			if (!src_url_equal(img3.src, img3_src_value = "/images/run3.png")) attr_dev(img3, "src", img3_src_value);
    			attr_dev(img3, "class", "image svelte-12uy645");
    			attr_dev(img3, "alt", "Off-policy training helps");
    			add_location(img3, file, 400, 6, 11624);
    			attr_dev(div4, "class", "image-container svelte-12uy645");
    			add_location(div4, file, 399, 4, 11588);
    			attr_dev(section1, "class", "section section-light svelte-12uy645");
    			add_location(section1, file, 377, 2, 10623);
    			attr_dev(h24, "class", "section-title svelte-12uy645");
    			add_location(h24, file, 405, 4, 11756);
    			attr_dev(p6, "class", "section-text svelte-12uy645");
    			add_location(p6, file, 406, 4, 11796);
    			attr_dev(section2, "class", "section svelte-12uy645");
    			add_location(section2, file, 404, 2, 11726);
    			attr_dev(h11, "class", "title svelte-12uy645");
    			add_location(h11, file, 415, 6, 12085);
    			attr_dev(p7, "class", "subtitle svelte-12uy645");
    			add_location(p7, file, 416, 6, 12125);
    			attr_dev(div5, "class", "container svelte-12uy645");
    			add_location(div5, file, 414, 4, 12055);
    			attr_dev(section3, "class", "playground svelte-12uy645");
    			add_location(section3, file, 413, 2, 12022);
    			attr_dev(p8, "class", "section-text svelte-12uy645");
    			add_location(p8, file, 423, 4, 12314);
    			attr_dev(div6, "id", /*plotContainerId*/ ctx[23]);
    			attr_dev(div6, "style", "width: 1000px; position: relative; top: 0; left: 0; z-index: 1; /* Ensure the image is below the canvas */");
    			attr_dev(div6, "class", "svelte-12uy645");
    			add_location(div6, file, 431, 6, 12671);
    			attr_dev(div7, "class", "canvas-container svelte-12uy645");
    			add_location(div7, file, 438, 6, 12867);
    			attr_dev(div8, "class", "env-container svelte-12uy645");
    			add_location(div8, file, 429, 4, 12542);
    			button0.disabled = button0_disabled_value = /*isRunning*/ ctx[8] || /*$gaussians*/ ctx[12].length === 1;
    			attr_dev(button0, "class", "svelte-12uy645");
    			add_location(button0, file, 469, 6, 13809);
    			attr_dev(span0, "class", "svelte-12uy645");
    			add_location(span0, file, 477, 6, 14054);
    			button1.disabled = button1_disabled_value = /*isRunning*/ ctx[8] || /*$gaussians*/ ctx[12].length === 4;
    			attr_dev(button1, "class", "svelte-12uy645");
    			add_location(button1, file, 478, 6, 14093);
    			attr_dev(div9, "class", "controls svelte-12uy645");
    			add_location(div9, file, 467, 4, 13753);
    			attr_dev(th0, "class", "svelte-12uy645");
    			add_location(th0, file, 484, 10, 14244);
    			attr_dev(th1, "class", "svelte-12uy645");
    			add_location(th1, file, 485, 10, 14270);
    			attr_dev(th2, "class", "svelte-12uy645");
    			add_location(th2, file, 486, 10, 14296);
    			attr_dev(tr, "class", "svelte-12uy645");
    			add_location(tr, file, 483, 8, 14229);
    			attr_dev(thead, "class", "svelte-12uy645");
    			add_location(thead, file, 482, 6, 14213);
    			attr_dev(tbody, "class", "svelte-12uy645");
    			add_location(tbody, file, 489, 6, 14349);
    			attr_dev(table, "class", "svelte-12uy645");
    			add_location(table, file, 481, 4, 14199);
    			attr_dev(p9, "class", "section-text svelte-12uy645");
    			add_location(p9, file, 500, 4, 14603);
    			attr_dev(button2, "class", "reset-button svelte-12uy645");
    			button2.disabled = /*isRunning*/ ctx[8];
    			add_location(button2, file, 505, 6, 14844);
    			attr_dev(button3, "class", "reset-button svelte-12uy645");
    			add_location(button3, file, 506, 6, 14943);
    			attr_dev(div10, "class", "buttonscontainer svelte-12uy645");
    			add_location(div10, file, 504, 4, 14807);
    			attr_dev(label0, "for", "off_policy");
    			attr_dev(label0, "class", "svelte-12uy645");
    			add_location(label0, file, 511, 8, 15166);
    			attr_dev(input0, "type", "range");
    			attr_dev(input0, "min", "0");
    			attr_dev(input0, "max", "3");
    			attr_dev(input0, "step", "0.1");
    			attr_dev(input0, "id", "off_policy");
    			input0.disabled = /*isRunning*/ ctx[8];
    			attr_dev(input0, "class", "svelte-12uy645");
    			add_location(input0, file, 512, 8, 15217);
    			attr_dev(span1, "class", "svelte-12uy645");
    			add_location(span1, file, 521, 8, 15422);
    			attr_dev(div11, "class", "slider svelte-12uy645");
    			add_location(div11, file, 510, 6, 15137);
    			attr_dev(label1, "for", "n_iterations");
    			attr_dev(label1, "class", "svelte-12uy645");
    			add_location(label1, file, 524, 8, 15502);
    			attr_dev(input1, "type", "range");
    			attr_dev(input1, "min", "100");
    			attr_dev(input1, "max", "10000");
    			attr_dev(input1, "step", "10");
    			attr_dev(input1, "id", "n_iterations");
    			input1.disabled = /*isRunning*/ ctx[8];
    			attr_dev(input1, "class", "svelte-12uy645");
    			add_location(input1, file, 525, 8, 15564);
    			attr_dev(span2, "class", "svelte-12uy645");
    			add_location(span2, file, 534, 8, 15778);
    			attr_dev(div12, "class", "slider svelte-12uy645");
    			add_location(div12, file, 523, 6, 15473);
    			attr_dev(label2, "for", "lr_model");
    			attr_dev(label2, "class", "svelte-12uy645");
    			add_location(label2, file, 537, 8, 15860);
    			attr_dev(input2, "type", "range");
    			attr_dev(input2, "min", "0.0001");
    			attr_dev(input2, "max", "0.1");
    			attr_dev(input2, "step", "0.0001");
    			attr_dev(input2, "id", "lr_model");
    			input2.disabled = /*isRunning*/ ctx[8];
    			attr_dev(input2, "class", "svelte-12uy645");
    			add_location(input2, file, 538, 8, 15925);
    			attr_dev(span3, "class", "svelte-12uy645");
    			add_location(span3, file, 547, 8, 16136);
    			attr_dev(div13, "class", "slider svelte-12uy645");
    			add_location(div13, file, 536, 6, 15831);
    			attr_dev(label3, "for", "lr_logz");
    			attr_dev(label3, "class", "svelte-12uy645");
    			add_location(label3, file, 550, 8, 16225);
    			attr_dev(input3, "type", "range");
    			attr_dev(input3, "min", "0.001");
    			attr_dev(input3, "max", "0.3");
    			attr_dev(input3, "step", "0.001");
    			attr_dev(input3, "id", "lr_logz");
    			input3.disabled = /*isRunning*/ ctx[8];
    			attr_dev(input3, "class", "svelte-12uy645");
    			add_location(input3, file, 551, 8, 16284);
    			attr_dev(span4, "class", "svelte-12uy645");
    			add_location(span4, file, 560, 8, 16491);
    			attr_dev(div14, "class", "slider svelte-12uy645");
    			add_location(div14, file, 549, 6, 16196);
    			attr_dev(label4, "for", "trajectory_length");
    			attr_dev(label4, "class", "svelte-12uy645");
    			add_location(label4, file, 563, 8, 16579);
    			attr_dev(input4, "type", "range");
    			attr_dev(input4, "min", "1");
    			attr_dev(input4, "max", "8");
    			attr_dev(input4, "step", "1");
    			attr_dev(input4, "id", "trajectory_lenght");
    			input4.disabled = /*isRunning*/ ctx[8];
    			attr_dev(input4, "class", "svelte-12uy645");
    			add_location(input4, file, 564, 8, 16647);
    			attr_dev(span5, "class", "svelte-12uy645");
    			add_location(span5, file, 573, 8, 16864);
    			attr_dev(div15, "class", "slider svelte-12uy645");
    			add_location(div15, file, 562, 6, 16550);
    			attr_dev(label5, "for", "hidden_layer");
    			attr_dev(label5, "class", "svelte-12uy645");
    			add_location(label5, file, 576, 8, 16951);
    			attr_dev(input5, "type", "range");
    			attr_dev(input5, "min", "1");
    			attr_dev(input5, "max", "8");
    			attr_dev(input5, "step", "1");
    			attr_dev(input5, "id", "hidden_layer");
    			input5.disabled = /*isRunning*/ ctx[8];
    			attr_dev(input5, "class", "svelte-12uy645");
    			add_location(input5, file, 577, 8, 17017);
    			attr_dev(span6, "class", "svelte-12uy645");
    			add_location(span6, file, 586, 8, 17224);
    			attr_dev(div16, "class", "slider svelte-12uy645");
    			add_location(div16, file, 575, 6, 16922);
    			attr_dev(label6, "for", "seed");
    			attr_dev(label6, "class", "svelte-12uy645");
    			add_location(label6, file, 589, 8, 17306);
    			attr_dev(input6, "type", "range");
    			attr_dev(input6, "min", "0");
    			attr_dev(input6, "max", "9999");
    			attr_dev(input6, "step", "1");
    			attr_dev(input6, "id", "seed");
    			input6.disabled = /*isRunning*/ ctx[8];
    			attr_dev(input6, "class", "svelte-12uy645");
    			add_location(input6, file, 590, 8, 17345);
    			attr_dev(span7, "class", "svelte-12uy645");
    			add_location(span7, file, 599, 8, 17539);
    			attr_dev(div17, "class", "slider svelte-12uy645");
    			add_location(div17, file, 588, 6, 17277);
    			attr_dev(label7, "for", "batch_size");
    			attr_dev(label7, "class", "svelte-12uy645");
    			add_location(label7, file, 602, 8, 17613);
    			attr_dev(input7, "type", "range");
    			attr_dev(input7, "min", "3");
    			attr_dev(input7, "max", "11");
    			attr_dev(input7, "step", "1");
    			attr_dev(input7, "id", "batch_size");
    			input7.disabled = /*isRunning*/ ctx[8];
    			attr_dev(input7, "class", "svelte-12uy645");
    			add_location(input7, file, 603, 8, 17673);
    			attr_dev(span8, "class", "svelte-12uy645");
    			add_location(span8, file, 612, 8, 17880);
    			attr_dev(div18, "class", "slider svelte-12uy645");
    			add_location(div18, file, 601, 6, 17584);
    			attr_dev(div19, "class", "slider-container svelte-12uy645");
    			add_location(div19, file, 509, 4, 15100);
    			attr_dev(div20, "class", "visualization svelte-12uy645");
    			add_location(div20, file, 615, 4, 17940);
    			attr_dev(section4, "class", "section-light svelte-12uy645");
    			add_location(section4, file, 422, 2, 12278);
    			attr_dev(h25, "class", "section-title svelte-12uy645");
    			add_location(h25, file, 626, 4, 18185);
    			attr_dev(p10, "class", "section-text svelte-12uy645");
    			add_location(p10, file, 627, 4, 18228);
    			attr_dev(section5, "class", "section svelte-12uy645");
    			add_location(section5, file, 625, 2, 18155);
    			attr_dev(main, "class", "main-content svelte-12uy645");
    			add_location(main, file, 347, 0, 9482);
    		},
    		l: function claim(nodes) {
    			throw new Error_1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, header);
    			append_dev(header, div0);
    			append_dev(div0, h10);
    			append_dev(div0, t1);
    			append_dev(div0, p0);
    			append_dev(main, t3);
    			append_dev(main, section0);
    			append_dev(section0, h20);
    			append_dev(section0, t5);
    			append_dev(section0, p1);
    			append_dev(section0, t7);
    			append_dev(section0, h21);
    			append_dev(section0, t9);
    			append_dev(section0, p2);
    			append_dev(section0, t11);
    			append_dev(section0, ul);
    			append_dev(ul, li0);
    			append_dev(ul, t13);
    			append_dev(ul, li1);
    			append_dev(ul, t15);
    			append_dev(ul, li2);
    			append_dev(section0, t17);
    			append_dev(section0, div1);
    			append_dev(div1, img0);
    			append_dev(main, t18);
    			append_dev(main, section1);
    			append_dev(section1, h22);
    			append_dev(section1, t20);
    			append_dev(section1, p3);
    			append_dev(section1, t22);
    			append_dev(section1, div2);
    			append_dev(div2, img1);
    			append_dev(section1, t23);
    			append_dev(section1, h23);
    			append_dev(section1, t25);
    			append_dev(section1, p4);
    			append_dev(section1, t27);
    			append_dev(section1, div3);
    			append_dev(div3, img2);
    			append_dev(section1, t28);
    			append_dev(section1, p5);
    			append_dev(section1, t30);
    			append_dev(section1, div4);
    			append_dev(div4, img3);
    			append_dev(main, t31);
    			append_dev(main, section2);
    			append_dev(section2, h24);
    			append_dev(section2, t33);
    			append_dev(section2, p6);
    			append_dev(main, t35);
    			append_dev(main, section3);
    			append_dev(section3, div5);
    			append_dev(div5, h11);
    			append_dev(div5, t37);
    			append_dev(div5, p7);
    			append_dev(main, t39);
    			append_dev(main, section4);
    			append_dev(section4, p8);
    			append_dev(section4, t41);
    			append_dev(section4, div8);
    			append_dev(div8, div6);
    			append_dev(div8, t42);
    			append_dev(div8, div7);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				if (each_blocks_1[i]) {
    					each_blocks_1[i].m(div7, null);
    				}
    			}

    			append_dev(section4, t43);
    			append_dev(section4, div9);
    			append_dev(div9, t44);
    			append_dev(div9, button0);
    			append_dev(button0, t45);
    			append_dev(div9, t46);
    			append_dev(div9, span0);
    			append_dev(span0, t47);
    			append_dev(div9, t48);
    			append_dev(div9, button1);
    			append_dev(button1, t49);
    			append_dev(section4, t50);
    			append_dev(section4, table);
    			append_dev(table, thead);
    			append_dev(thead, tr);
    			append_dev(tr, th0);
    			append_dev(tr, t52);
    			append_dev(tr, th1);
    			append_dev(tr, t54);
    			append_dev(tr, th2);
    			append_dev(table, t56);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(tbody, null);
    				}
    			}

    			append_dev(section4, t57);
    			append_dev(section4, p9);
    			append_dev(section4, t59);
    			append_dev(section4, div10);
    			append_dev(div10, button2);
    			append_dev(button2, t60);
    			append_dev(div10, t61);
    			append_dev(div10, button3);
    			append_dev(button3, t62);
    			append_dev(section4, t63);
    			append_dev(section4, div19);
    			append_dev(div19, div11);
    			append_dev(div11, label0);
    			append_dev(div11, t65);
    			append_dev(div11, input0);
    			set_input_value(input0, /*off_policy_value*/ ctx[1]);
    			append_dev(div11, t66);
    			append_dev(div11, span1);
    			append_dev(span1, t67);
    			append_dev(div19, t68);
    			append_dev(div19, div12);
    			append_dev(div12, label1);
    			append_dev(div12, t70);
    			append_dev(div12, input1);
    			set_input_value(input1, /*n_iterations_value*/ ctx[2]);
    			append_dev(div12, t71);
    			append_dev(div12, span2);
    			append_dev(span2, t72);
    			append_dev(div19, t73);
    			append_dev(div19, div13);
    			append_dev(div13, label2);
    			append_dev(div13, t75);
    			append_dev(div13, input2);
    			set_input_value(input2, /*lr_model_value*/ ctx[3]);
    			append_dev(div13, t76);
    			append_dev(div13, span3);
    			append_dev(span3, t77);
    			append_dev(div19, t78);
    			append_dev(div19, div14);
    			append_dev(div14, label3);
    			append_dev(div14, t80);
    			append_dev(div14, input3);
    			set_input_value(input3, /*lr_logz_value*/ ctx[4]);
    			append_dev(div14, t81);
    			append_dev(div14, span4);
    			append_dev(span4, t82);
    			append_dev(div19, t83);
    			append_dev(div19, div15);
    			append_dev(div15, label4);
    			append_dev(div15, t85);
    			append_dev(div15, input4);
    			set_input_value(input4, /*trajectory_length_value*/ ctx[5]);
    			append_dev(div15, t86);
    			append_dev(div15, span5);
    			append_dev(span5, t87);
    			append_dev(div19, t88);
    			append_dev(div19, div16);
    			append_dev(div16, label5);
    			append_dev(div16, t90);
    			append_dev(div16, input5);
    			set_input_value(input5, /*hidden_layer_value*/ ctx[6]);
    			append_dev(div16, t91);
    			append_dev(div16, span6);
    			append_dev(span6, t92);
    			append_dev(div19, t93);
    			append_dev(div19, div17);
    			append_dev(div17, label6);
    			append_dev(div17, t95);
    			append_dev(div17, input6);
    			set_input_value(input6, /*seed_value*/ ctx[7]);
    			append_dev(div17, t96);
    			append_dev(div17, span7);
    			append_dev(span7, t97);
    			append_dev(div19, t98);
    			append_dev(div19, div18);
    			append_dev(div18, label7);
    			append_dev(div18, t100);
    			append_dev(div18, input7);
    			set_input_value(input7, /*batch_size_exponent*/ ctx[0]);
    			append_dev(div18, t101);
    			append_dev(div18, span8);
    			append_dev(span8, t102);
    			append_dev(section4, t103);
    			append_dev(section4, div20);
    			if (if_block) if_block.m(div20, null);
    			append_dev(main, t104);
    			append_dev(main, section5);
    			append_dev(section5, h25);
    			append_dev(section5, t106);
    			append_dev(section5, p10);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "mouseover", /*mouseover_handler*/ ctx[26], false, false, false, false),
    					listen_dev(button0, "mouseout", /*clearHighlight*/ ctx[15], false, false, false, false),
    					listen_dev(button0, "click", /*removeGaussian*/ ctx[20], false, false, false, false),
    					listen_dev(button1, "click", /*addGaussian*/ ctx[19], false, false, false, false),
    					listen_dev(button2, "click", /*resetSliders*/ ctx[16], false, false, false, false),
    					listen_dev(
    						button3,
    						"click",
    						function () {
    							if (is_function(/*isRunning*/ ctx[8]
    							? /*stopVisualization*/ ctx[18]
    							: /*startVisualization*/ ctx[17])) (/*isRunning*/ ctx[8]
    							? /*stopVisualization*/ ctx[18]
    							: /*startVisualization*/ ctx[17]).apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(input0, "change", /*input0_change_input_handler*/ ctx[27]),
    					listen_dev(input0, "input", /*input0_change_input_handler*/ ctx[27]),
    					listen_dev(input1, "change", /*input1_change_input_handler*/ ctx[28]),
    					listen_dev(input1, "input", /*input1_change_input_handler*/ ctx[28]),
    					listen_dev(input2, "change", /*input2_change_input_handler*/ ctx[29]),
    					listen_dev(input2, "input", /*input2_change_input_handler*/ ctx[29]),
    					listen_dev(input3, "change", /*input3_change_input_handler*/ ctx[30]),
    					listen_dev(input3, "input", /*input3_change_input_handler*/ ctx[30]),
    					listen_dev(input4, "change", /*input4_change_input_handler*/ ctx[31]),
    					listen_dev(input4, "input", /*input4_change_input_handler*/ ctx[31]),
    					listen_dev(input5, "change", /*input5_change_input_handler*/ ctx[32]),
    					listen_dev(input5, "input", /*input5_change_input_handler*/ ctx[32]),
    					listen_dev(input6, "change", /*input6_change_input_handler*/ ctx[33]),
    					listen_dev(input6, "input", /*input6_change_input_handler*/ ctx[33]),
    					listen_dev(input7, "change", /*input7_change_input_handler*/ ctx[34]),
    					listen_dev(input7, "input", /*input7_change_input_handler*/ ctx[34])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty[0] & /*$gaussians, hoveredGaussian, startDragMean, isRunning, startDragVariance*/ 6296832) {
    				each_value_1 = /*$gaussians*/ ctx[12];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div7, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty[0] & /*isRunning, $gaussians*/ 4352 && button0_disabled_value !== (button0_disabled_value = /*isRunning*/ ctx[8] || /*$gaussians*/ ctx[12].length === 1)) {
    				prop_dev(button0, "disabled", button0_disabled_value);
    			}

    			if (dirty[0] & /*$gaussians*/ 4096 && t47_value !== (t47_value = /*$gaussians*/ ctx[12].length + "")) set_data_dev(t47, t47_value);

    			if (dirty[0] & /*isRunning, $gaussians*/ 4352 && button1_disabled_value !== (button1_disabled_value = /*isRunning*/ ctx[8] || /*$gaussians*/ ctx[12].length === 4)) {
    				prop_dev(button1, "disabled", button1_disabled_value);
    			}

    			if (dirty[0] & /*$gaussians*/ 4096) {
    				each_value = /*$gaussians*/ ctx[12];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty[0] & /*isRunning*/ 256) {
    				prop_dev(button2, "disabled", /*isRunning*/ ctx[8]);
    			}

    			if (dirty[0] & /*isRunning*/ 256 && t62_value !== (t62_value = (/*isRunning*/ ctx[8] ? 'Stop' : 'Start') + "")) set_data_dev(t62, t62_value);

    			if (dirty[0] & /*isRunning*/ 256) {
    				prop_dev(input0, "disabled", /*isRunning*/ ctx[8]);
    			}

    			if (dirty[0] & /*off_policy_value*/ 2) {
    				set_input_value(input0, /*off_policy_value*/ ctx[1]);
    			}

    			if (dirty[0] & /*off_policy_value*/ 2) set_data_dev(t67, /*off_policy_value*/ ctx[1]);

    			if (dirty[0] & /*isRunning*/ 256) {
    				prop_dev(input1, "disabled", /*isRunning*/ ctx[8]);
    			}

    			if (dirty[0] & /*n_iterations_value*/ 4) {
    				set_input_value(input1, /*n_iterations_value*/ ctx[2]);
    			}

    			if (dirty[0] & /*n_iterations_value*/ 4) set_data_dev(t72, /*n_iterations_value*/ ctx[2]);

    			if (dirty[0] & /*isRunning*/ 256) {
    				prop_dev(input2, "disabled", /*isRunning*/ ctx[8]);
    			}

    			if (dirty[0] & /*lr_model_value*/ 8) {
    				set_input_value(input2, /*lr_model_value*/ ctx[3]);
    			}

    			if (dirty[0] & /*lr_model_value*/ 8 && t77_value !== (t77_value = /*lr_model_value*/ ctx[3].toFixed(4) + "")) set_data_dev(t77, t77_value);

    			if (dirty[0] & /*isRunning*/ 256) {
    				prop_dev(input3, "disabled", /*isRunning*/ ctx[8]);
    			}

    			if (dirty[0] & /*lr_logz_value*/ 16) {
    				set_input_value(input3, /*lr_logz_value*/ ctx[4]);
    			}

    			if (dirty[0] & /*lr_logz_value*/ 16 && t82_value !== (t82_value = /*lr_logz_value*/ ctx[4].toFixed(3) + "")) set_data_dev(t82, t82_value);

    			if (dirty[0] & /*isRunning*/ 256) {
    				prop_dev(input4, "disabled", /*isRunning*/ ctx[8]);
    			}

    			if (dirty[0] & /*trajectory_length_value*/ 32) {
    				set_input_value(input4, /*trajectory_length_value*/ ctx[5]);
    			}

    			if (dirty[0] & /*trajectory_length_value*/ 32) set_data_dev(t87, /*trajectory_length_value*/ ctx[5]);

    			if (dirty[0] & /*isRunning*/ 256) {
    				prop_dev(input5, "disabled", /*isRunning*/ ctx[8]);
    			}

    			if (dirty[0] & /*hidden_layer_value*/ 64) {
    				set_input_value(input5, /*hidden_layer_value*/ ctx[6]);
    			}

    			if (dirty[0] & /*hidden_layer_value*/ 64) set_data_dev(t92, /*hidden_layer_value*/ ctx[6]);

    			if (dirty[0] & /*isRunning*/ 256) {
    				prop_dev(input6, "disabled", /*isRunning*/ ctx[8]);
    			}

    			if (dirty[0] & /*seed_value*/ 128) {
    				set_input_value(input6, /*seed_value*/ ctx[7]);
    			}

    			if (dirty[0] & /*seed_value*/ 128) set_data_dev(t97, /*seed_value*/ ctx[7]);

    			if (dirty[0] & /*isRunning*/ 256) {
    				prop_dev(input7, "disabled", /*isRunning*/ ctx[8]);
    			}

    			if (dirty[0] & /*batch_size_exponent*/ 1) {
    				set_input_value(input7, /*batch_size_exponent*/ ctx[0]);
    			}

    			if (dirty[0] & /*batch_size_value*/ 2048) set_data_dev(t102, /*batch_size_value*/ ctx[11]);

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div20, null);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);

    			if (if_block) {
    				if_block.d();
    			}

    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const POLLING_INTERVAL = 200;

    // functions for computing the reward and visualizing the Environment
    // calculate reward
    function gaussianPDF(x, y, mean, variance) {
    	const dx = x - mean.x;
    	const dy = y - mean.y;
    	const sigma2 = variance;
    	return Math.exp(-(dx ** 2 + dy ** 2) / (2 * sigma2)) / (2 * Math.PI * Math.sqrt(sigma2));
    }

    // Density (reward for whole grid)
    function computeDensity(grid, gaussians) {
    	const { x, y } = grid;
    	const density = Array.from({ length: x.length }, () => Array(y.length).fill(0));

    	for (const { mean, variance } of gaussians) {
    		for (let i = 0; i < x.length; i++) {
    			for (let j = 0; j < y.length; j++) {
    				density[j][i] += gaussianPDF(x[i], y[j], mean, variance);
    			}
    		}
    	}

    	return density;
    }

    function instance($$self, $$props, $$invalidate) {
    	let batch_size_value;
    	let $gaussians;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let off_policy_value = 0;
    	let n_iterations_value = 2000;
    	let lr_model_value = 0.001;
    	let lr_logz_value = 0.1;
    	let trajectory_length_value = 2;
    	let hidden_layer_value = 2;
    	let hidden_dim_value = 2;
    	let seed_value = 7614;
    	let batch_size_exponent = 6;
    	let isRunning = false;
    	let currentImage = null;
    	let pollingTimer;

    	// storing gaussians
    	const gaussians = writable([
    		{ mean: { x: -1, y: -1 }, variance: 0.5 },
    		{ mean: { x: 1, y: 1 }, variance: 0.5 }
    	]);

    	validate_store(gaussians, 'gaussians');
    	component_subscribe($$self, gaussians, value => $$invalidate(12, $gaussians = value));

    	// ranges for means and variances
    	const range = { min: -3, max: 3 };

    	const varianceRange = { min: 0.1, max: 1.0 };

    	// Gaussian tracking
    	let selectedGaussian = null; // Tracks the currently selected Gaussian

    	let hoveredGaussian = null; // Tracks the Gaussian to be highlighted for deletion

    	const highlightGaussian = index => {
    		$$invalidate(10, hoveredGaussian = index);
    	};

    	const clearHighlight = () => {
    		$$invalidate(10, hoveredGaussian = null);
    	};

    	// Mouse interaction handlers
    	let isDraggingMean = false;

    	let isDraggingVariance = false;
    	let initialMouse = { x: 0, y: 0 };

    	// Utility functions
    	const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    	function resetSliders() {
    		$$invalidate(1, off_policy_value = 0);
    		$$invalidate(2, n_iterations_value = 2000);
    		$$invalidate(3, lr_model_value = 0.001);
    		$$invalidate(4, lr_logz_value = 0.1);
    		$$invalidate(5, trajectory_length_value = 2);
    		$$invalidate(6, hidden_layer_value = 2);
    		hidden_dim_value = 2;
    		$$invalidate(7, seed_value = 7614);
    		$$invalidate(0, batch_size_exponent = 6);
    	}

    	let Plotly; // Load Plotly from CDN

    	async function loadPlotly() {
    		const script = document.createElement('script');
    		script.src = 'https://cdn.plot.ly/plotly-latest.min.js';
    		document.head.appendChild(script);

    		return new Promise(resolve => {
    				script.onload = () => {
    					Plotly = window.Plotly;
    					resolve();
    				};
    			});
    	}

    	// Functions used to start, stop and update the training process
    	async function startVisualization() {
    		try {
    			// Disable sliders and switch button state
    			$$invalidate(8, isRunning = true);

    			const curr_gaussians = $gaussians;

    			// Start visualization on backend
    			const response = await fetch('http://localhost:8000/start_visualization', {
    				method: 'POST',
    				headers: { 'Content-Type': 'application/json' },
    				body: JSON.stringify({
    					off_policy_value,
    					n_iterations_value,
    					lr_model_value,
    					lr_logz_value,
    					trajectory_length_value,
    					hidden_layer_value,
    					hidden_dim_value,
    					seed_value,
    					batch_size_value,
    					curr_gaussians
    				})
    			});

    			if (!response.ok) {
    				throw new Error('Failed to start visualization.');
    			}

    			// Start polling for visualizations
    			pollVisualization();
    		} catch(error) {
    			console.error(error);
    			$$invalidate(8, isRunning = false);
    		}
    	}

    	async function stopVisualization() {
    		try {
    			// Stop visualization on backend
    			const response = await fetch('http://localhost:8000/stop_visualization', { method: 'POST' });

    			if (!response.ok) {
    				throw new Error('Failed to stop visualization.');
    			}

    			// Stop polling and reset button state
    			clearInterval(pollingTimer);

    			$$invalidate(8, isRunning = false);
    		} catch(error) {
    			console.error(error);
    		}
    	}

    	function pollVisualization() {
    		pollingTimer = setInterval(
    			async () => {
    				try {
    					const response = await fetch('http://localhost:8000/get_visualization');

    					if (!response.ok) {
    						throw new Error('Failed to fetch visualization.');
    					}

    					const data = await response.json();

    					if (data.image) {
    						$$invalidate(9, currentImage = `data:image/png;base64,${data.image}`);
    					}

    					if (data.completed) {
    						console.log("Visualization process completed.");
    						$$invalidate(8, isRunning = false); // Update the UI state to reflect the stopped process
    						clearInterval(pollingTimer); // Stop the polling
    						return; // Stop polling
    					}
    				} catch(error) {
    					console.error(error);
    				}
    			},
    			POLLING_INTERVAL
    		);
    	}

    	// Functions for setting the environment
    	const addGaussian = () => {
    		gaussians.update(gs => {
    			if (gs.length < 4) {
    				gs.push({ mean: { x: 0, y: 0 }, variance: 0.5 });
    			}

    			return gs;
    		});

    		plotEnvironment(plotContainerId, $gaussians, {
    			gridSize: 100,
    			alpha2D: 1.0,
    			alpha3D: 0.8,
    			levels: 50
    		});
    	};

    	const removeGaussian = () => {
    		gaussians.update(gs => {
    			if (gs.length > 1) {
    				gs.pop();
    			}

    			return gs;
    		});

    		plotEnvironment(plotContainerId, $gaussians, {
    			gridSize: 100,
    			alpha2D: 1.0,
    			alpha3D: 0.8,
    			levels: 50
    		});
    	};

    	const startDragMean = (event, gaussian) => {
    		if (isRunning) return;
    		isDraggingMean = true;
    		selectedGaussian = gaussian;
    		initialMouse = { x: event.clientX, y: event.clientY };
    	};

    	const startDragVariance = (event, gaussian) => {
    		if (isRunning) return;
    		isDraggingVariance = true;
    		selectedGaussian = gaussian;
    		initialMouse = { x: event.clientX, y: event.clientY };
    	};

    	const handleMouseMove = event => {
    		if (!selectedGaussian || isRunning) return;
    		const dx = (event.clientX - initialMouse.x) / 100;
    		const dy = (event.clientY - initialMouse.y) / 100;

    		gaussians.update(gs => {
    			const g = gs.find(g => g === selectedGaussian);

    			if (isDraggingMean && g) {
    				g.mean.x = clamp(g.mean.x + dx, range.min, range.max);
    				g.mean.y = clamp(g.mean.y - dy, range.min, range.max);
    			} else if (isDraggingVariance && g) {
    				const newVariance = g.variance + dx;
    				g.variance = clamp(newVariance, varianceRange.min, varianceRange.max);
    			}

    			return gs;
    		});

    		initialMouse = { x: event.clientX, y: event.clientY };
    	};

    	const stopDrag = () => {
    		if (isDraggingMean || isDraggingVariance) {
    			console.log($gaussians);

    			plotEnvironment(plotContainerId, $gaussians, {
    				gridSize: 100,
    				alpha2D: 1.0,
    				alpha3D: 0.8,
    				levels: 50
    			});
    		}

    		isDraggingMean = false;
    		isDraggingVariance = false;
    		selectedGaussian = null;
    	};

    	function plotEnvironment(containerId, gaussians, options = {}) {
    		const gridSize = options.gridSize || 100;
    		const alpha2D = options.alpha2D || 1.0;
    		const alpha3D = options.alpha3D || 0.8;

    		// Generate grid
    		const range = [-3, 3];

    		const x = Array.from({ length: gridSize }, (_, i) => range[0] + i * (range[1] - range[0]) / (gridSize - 1));
    		const y = Array.from({ length: gridSize }, (_, i) => range[0] + i * (range[1] - range[0]) / (gridSize - 1));
    		const density = computeDensity({ x, y }, gaussians);

    		// 2D plot data
    		const contourData = {
    			x,
    			y,
    			z: density,
    			type: "contour",
    			colorscale: "Viridis",
    			opacity: alpha2D,
    			contours: { coloring: "fill", showlines: false },
    			colorbar: { len: 0.8, x: 0.45, thickness: 20 }, // Position shared colorbar in the middle
    			
    		};

    		// 3D plot data
    		const surfaceData = {
    			x,
    			y,
    			z: density,
    			type: "surface",
    			colorscale: "Viridis",
    			opacity: alpha3D,
    			showscale: false, // Disable individual colorbar
    			
    		};

    		const layout = {
    			title: options.title || null,
    			grid: {
    				rows: 1,
    				columns: 2,
    				pattern: "independent"
    			},
    			xaxis: { title: "x", domain: [0, 0.45] }, // Left plot domain
    			yaxis: { title: "y", scaleanchor: "x" },
    			scene: { domain: { x: [0.55, 1] } }, // Right plot domain for 3D scene
    			margin: { t: 50, b: 50, l: 50, r: 50 }
    		};

    		const config = {
    			staticplot: true,
    			displayModeBar: false, // Hide toolbar
    			
    		};

    		Plotly.newPlot(containerId, [contourData, surfaceData], layout, config);
    	}

    	let plotContainerId = "plot-container";

    	// Mounting
    	onMount(async () => {
    		//visualize the environment
    		await loadPlotly();

    		plotEnvironment(plotContainerId, $gaussians, {
    			title: null,
    			gridSize: 100,
    			alpha2D: 1.0,
    			alpha3D: 0.8,
    			levels: 50
    		});

    		// add listeners for changing the Environment
    		window.addEventListener('mousemove', handleMouseMove);

    		window.addEventListener('mouseup', stopDrag);

    		return () => {
    			window.removeEventListener('mousemove', handleMouseMove);
    			window.removeEventListener('mouseup', stopDrag);
    		};
    	});

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	const mousedown_handler = (g, e) => startDragVariance(e, g);
    	const mousedown_handler_1 = (g, e) => startDragMean(e, g);
    	const mouseover_handler = () => highlightGaussian($gaussians.length - 1);

    	function input0_change_input_handler() {
    		off_policy_value = to_number(this.value);
    		$$invalidate(1, off_policy_value);
    	}

    	function input1_change_input_handler() {
    		n_iterations_value = to_number(this.value);
    		$$invalidate(2, n_iterations_value);
    	}

    	function input2_change_input_handler() {
    		lr_model_value = to_number(this.value);
    		$$invalidate(3, lr_model_value);
    	}

    	function input3_change_input_handler() {
    		lr_logz_value = to_number(this.value);
    		$$invalidate(4, lr_logz_value);
    	}

    	function input4_change_input_handler() {
    		trajectory_length_value = to_number(this.value);
    		$$invalidate(5, trajectory_length_value);
    	}

    	function input5_change_input_handler() {
    		hidden_layer_value = to_number(this.value);
    		$$invalidate(6, hidden_layer_value);
    	}

    	function input6_change_input_handler() {
    		seed_value = to_number(this.value);
    		$$invalidate(7, seed_value);
    	}

    	function input7_change_input_handler() {
    		batch_size_exponent = to_number(this.value);
    		$$invalidate(0, batch_size_exponent);
    	}

    	$$self.$capture_state = () => ({
    		onMount,
    		writable,
    		off_policy_value,
    		n_iterations_value,
    		lr_model_value,
    		lr_logz_value,
    		trajectory_length_value,
    		hidden_layer_value,
    		hidden_dim_value,
    		seed_value,
    		batch_size_exponent,
    		POLLING_INTERVAL,
    		isRunning,
    		currentImage,
    		pollingTimer,
    		gaussians,
    		range,
    		varianceRange,
    		selectedGaussian,
    		hoveredGaussian,
    		highlightGaussian,
    		clearHighlight,
    		isDraggingMean,
    		isDraggingVariance,
    		initialMouse,
    		clamp,
    		resetSliders,
    		Plotly,
    		loadPlotly,
    		startVisualization,
    		stopVisualization,
    		pollVisualization,
    		addGaussian,
    		removeGaussian,
    		startDragMean,
    		startDragVariance,
    		handleMouseMove,
    		stopDrag,
    		gaussianPDF,
    		computeDensity,
    		plotEnvironment,
    		plotContainerId,
    		batch_size_value,
    		$gaussians
    	});

    	$$self.$inject_state = $$props => {
    		if ('off_policy_value' in $$props) $$invalidate(1, off_policy_value = $$props.off_policy_value);
    		if ('n_iterations_value' in $$props) $$invalidate(2, n_iterations_value = $$props.n_iterations_value);
    		if ('lr_model_value' in $$props) $$invalidate(3, lr_model_value = $$props.lr_model_value);
    		if ('lr_logz_value' in $$props) $$invalidate(4, lr_logz_value = $$props.lr_logz_value);
    		if ('trajectory_length_value' in $$props) $$invalidate(5, trajectory_length_value = $$props.trajectory_length_value);
    		if ('hidden_layer_value' in $$props) $$invalidate(6, hidden_layer_value = $$props.hidden_layer_value);
    		if ('hidden_dim_value' in $$props) hidden_dim_value = $$props.hidden_dim_value;
    		if ('seed_value' in $$props) $$invalidate(7, seed_value = $$props.seed_value);
    		if ('batch_size_exponent' in $$props) $$invalidate(0, batch_size_exponent = $$props.batch_size_exponent);
    		if ('isRunning' in $$props) $$invalidate(8, isRunning = $$props.isRunning);
    		if ('currentImage' in $$props) $$invalidate(9, currentImage = $$props.currentImage);
    		if ('pollingTimer' in $$props) pollingTimer = $$props.pollingTimer;
    		if ('selectedGaussian' in $$props) selectedGaussian = $$props.selectedGaussian;
    		if ('hoveredGaussian' in $$props) $$invalidate(10, hoveredGaussian = $$props.hoveredGaussian);
    		if ('isDraggingMean' in $$props) isDraggingMean = $$props.isDraggingMean;
    		if ('isDraggingVariance' in $$props) isDraggingVariance = $$props.isDraggingVariance;
    		if ('initialMouse' in $$props) initialMouse = $$props.initialMouse;
    		if ('Plotly' in $$props) Plotly = $$props.Plotly;
    		if ('plotContainerId' in $$props) $$invalidate(23, plotContainerId = $$props.plotContainerId);
    		if ('batch_size_value' in $$props) $$invalidate(11, batch_size_value = $$props.batch_size_value);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*batch_size_exponent*/ 1) {
    			$$invalidate(11, batch_size_value = 2 ** batch_size_exponent);
    		}
    	};

    	return [
    		batch_size_exponent,
    		off_policy_value,
    		n_iterations_value,
    		lr_model_value,
    		lr_logz_value,
    		trajectory_length_value,
    		hidden_layer_value,
    		seed_value,
    		isRunning,
    		currentImage,
    		hoveredGaussian,
    		batch_size_value,
    		$gaussians,
    		gaussians,
    		highlightGaussian,
    		clearHighlight,
    		resetSliders,
    		startVisualization,
    		stopVisualization,
    		addGaussian,
    		removeGaussian,
    		startDragMean,
    		startDragVariance,
    		plotContainerId,
    		mousedown_handler,
    		mousedown_handler_1,
    		mouseover_handler,
    		input0_change_input_handler,
    		input1_change_input_handler,
    		input2_change_input_handler,
    		input3_change_input_handler,
    		input4_change_input_handler,
    		input5_change_input_handler,
    		input6_change_input_handler,
    		input7_change_input_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {}, null, [-1, -1]);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
