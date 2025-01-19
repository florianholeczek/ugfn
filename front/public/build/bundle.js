
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35730/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
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
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
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
    	child_ctx[55] = list[i];
    	child_ctx[57] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[55] = list[i];
    	child_ctx[57] = i;
    	return child_ctx;
    }

    // (450:8) {#each $gaussians as g, i}
    function create_each_block_1(ctx) {
    	let div0;
    	let t;
    	let div1;
    	let mounted;
    	let dispose;

    	function mousedown_handler(...args) {
    		return /*mousedown_handler*/ ctx[26](/*g*/ ctx[55], ...args);
    	}

    	function mousedown_handler_1(...args) {
    		return /*mousedown_handler_1*/ ctx[27](/*g*/ ctx[55], ...args);
    	}

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			t = space();
    			div1 = element("div");
    			attr_dev(div0, "class", "variance-circle svelte-12qsw1d");
    			set_style(div0, "width", 129 * /*g*/ ctx[55].variance + "px");
    			set_style(div0, "height", 129 * /*g*/ ctx[55].variance + "px");
    			set_style(div0, "left", 193 + 193 / 3 * /*g*/ ctx[55].mean.x + "px");
    			set_style(div0, "top", 193 - 193 / 3 * /*g*/ ctx[55].mean.y + "px");
    			toggle_class(div0, "highlight", /*i*/ ctx[57] === /*hoveredGaussian*/ ctx[12] || /*isRunning*/ ctx[10]);
    			add_location(div0, file, 451, 10, 12642);
    			attr_dev(div1, "class", "mean-circle svelte-12qsw1d");
    			set_style(div1, "left", 193 + 193 / 3 * /*g*/ ctx[55].mean.x + "px");
    			set_style(div1, "top", 193 - 193 / 3 * /*g*/ ctx[55].mean.y + "px");
    			toggle_class(div1, "highlight", /*i*/ ctx[57] === /*hoveredGaussian*/ ctx[12]);
    			add_location(div1, file, 464, 10, 13082);
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

    			if (dirty[0] & /*$gaussians*/ 16384) {
    				set_style(div0, "width", 129 * /*g*/ ctx[55].variance + "px");
    			}

    			if (dirty[0] & /*$gaussians*/ 16384) {
    				set_style(div0, "height", 129 * /*g*/ ctx[55].variance + "px");
    			}

    			if (dirty[0] & /*$gaussians*/ 16384) {
    				set_style(div0, "left", 193 + 193 / 3 * /*g*/ ctx[55].mean.x + "px");
    			}

    			if (dirty[0] & /*$gaussians*/ 16384) {
    				set_style(div0, "top", 193 - 193 / 3 * /*g*/ ctx[55].mean.y + "px");
    			}

    			if (dirty[0] & /*hoveredGaussian, isRunning*/ 5120) {
    				toggle_class(div0, "highlight", /*i*/ ctx[57] === /*hoveredGaussian*/ ctx[12] || /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*$gaussians*/ 16384) {
    				set_style(div1, "left", 193 + 193 / 3 * /*g*/ ctx[55].mean.x + "px");
    			}

    			if (dirty[0] & /*$gaussians*/ 16384) {
    				set_style(div1, "top", 193 - 193 / 3 * /*g*/ ctx[55].mean.y + "px");
    			}

    			if (dirty[0] & /*hoveredGaussian*/ 4096) {
    				toggle_class(div1, "highlight", /*i*/ ctx[57] === /*hoveredGaussian*/ ctx[12]);
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
    		source: "(450:8) {#each $gaussians as g, i}",
    		ctx
    	});

    	return block;
    }

    // (500:8) {#each $gaussians as g, i}
    function create_each_block(ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*g*/ ctx[55].mean.x.toFixed(2) + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2_value = /*g*/ ctx[55].mean.y.toFixed(2) + "";
    	let t2;
    	let t3;
    	let td2;
    	let t4_value = /*g*/ ctx[55].variance.toFixed(2) + "";
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
    			attr_dev(td0, "class", "svelte-12qsw1d");
    			add_location(td0, file, 501, 12, 14076);
    			attr_dev(td1, "class", "svelte-12qsw1d");
    			add_location(td1, file, 502, 12, 14119);
    			attr_dev(td2, "class", "svelte-12qsw1d");
    			add_location(td2, file, 503, 12, 14162);
    			attr_dev(tr, "class", "svelte-12qsw1d");
    			add_location(tr, file, 500, 10, 14059);
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
    			if (dirty[0] & /*$gaussians*/ 16384 && t0_value !== (t0_value = /*g*/ ctx[55].mean.x.toFixed(2) + "")) set_data_dev(t0, t0_value);
    			if (dirty[0] & /*$gaussians*/ 16384 && t2_value !== (t2_value = /*g*/ ctx[55].mean.y.toFixed(2) + "")) set_data_dev(t2, t2_value);
    			if (dirty[0] & /*$gaussians*/ 16384 && t4_value !== (t4_value = /*g*/ ctx[55].variance.toFixed(2) + "")) set_data_dev(t4, t4_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(500:8) {#each $gaussians as g, i}",
    		ctx
    	});

    	return block;
    }

    // (641:26) 
    function create_if_block_1(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Loading visualization...";
    			attr_dev(p, "class", "svelte-12qsw1d");
    			add_location(p, file, 641, 8, 18109);
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
    		source: "(641:26) ",
    		ctx
    	});

    	return block;
    }

    // (639:6) {#if currentImage}
    function create_if_block(ctx) {
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			img = element("img");
    			if (!src_url_equal(img.src, img_src_value = /*currentImage*/ ctx[11])) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Visualization");
    			attr_dev(img, "class", "svelte-12qsw1d");
    			add_location(img, file, 639, 8, 18027);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*currentImage*/ 2048 && !src_url_equal(img.src, img_src_value = /*currentImage*/ ctx[11])) {
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
    		source: "(639:6) {#if currentImage}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div0;
    	let t0;
    	let main;
    	let div1;
    	let t1;
    	let header;
    	let div2;
    	let h10;
    	let t3;
    	let p0;
    	let t5;
    	let section0;
    	let h20;
    	let t7;
    	let p1;
    	let t9;
    	let h21;
    	let t11;
    	let p2;
    	let t13;
    	let ul;
    	let li0;
    	let t15;
    	let li1;
    	let t17;
    	let li2;
    	let t19;
    	let div3;
    	let img0;
    	let img0_src_value;
    	let t20;
    	let section1;
    	let h22;
    	let t22;
    	let p3;
    	let t24;
    	let div4;
    	let img1;
    	let img1_src_value;
    	let t25;
    	let h23;
    	let t27;
    	let p4;
    	let t29;
    	let div5;
    	let img2;
    	let img2_src_value;
    	let t30;
    	let p5;
    	let t32;
    	let div6;
    	let img3;
    	let img3_src_value;
    	let t33;
    	let section2;
    	let h24;
    	let t35;
    	let p6;
    	let t37;
    	let section3;
    	let div7;
    	let h11;
    	let t39;
    	let p7;
    	let t41;
    	let section4;
    	let p8;
    	let t43;
    	let div8;
    	let img4;
    	let img4_src_value;
    	let t44;
    	let div10;
    	let img5;
    	let img5_src_value;
    	let t45;
    	let div9;
    	let t46;
    	let div11;
    	let t47;
    	let button0;
    	let t48;
    	let button0_disabled_value;
    	let t49;
    	let span0;
    	let t50_value = /*$gaussians*/ ctx[14].length + "";
    	let t50;
    	let t51;
    	let button1;
    	let t52;
    	let button1_disabled_value;
    	let t53;
    	let table;
    	let thead;
    	let tr;
    	let th0;
    	let t55;
    	let th1;
    	let t57;
    	let th2;
    	let t59;
    	let tbody;
    	let t60;
    	let p9;
    	let t62;
    	let div12;
    	let button2;
    	let t63;
    	let t64;
    	let button3;
    	let t65_value = (/*isRunning*/ ctx[10] ? 'Stop' : 'Start') + "";
    	let t65;
    	let t66;
    	let div22;
    	let div13;
    	let label0;
    	let t68;
    	let input0;
    	let t69;
    	let span1;
    	let t70;
    	let t71;
    	let div14;
    	let label1;
    	let t73;
    	let input1;
    	let t74;
    	let span2;
    	let t75;
    	let t76;
    	let div15;
    	let label2;
    	let t78;
    	let input2;
    	let t79;
    	let span3;
    	let t80_value = /*lr_model_value*/ ctx[3].toFixed(4) + "";
    	let t80;
    	let t81;
    	let div16;
    	let label3;
    	let t83;
    	let input3;
    	let t84;
    	let span4;
    	let t85_value = /*lr_logz_value*/ ctx[4].toFixed(3) + "";
    	let t85;
    	let t86;
    	let div17;
    	let label4;
    	let t88;
    	let input4;
    	let t89;
    	let span5;
    	let t90;
    	let t91;
    	let div18;
    	let label5;
    	let t93;
    	let input5;
    	let t94;
    	let span6;
    	let t95;
    	let t96;
    	let div19;
    	let label6;
    	let t98;
    	let input6;
    	let t99;
    	let span7;
    	let t100;
    	let t101;
    	let div20;
    	let label7;
    	let t103;
    	let input7;
    	let t104;
    	let span8;
    	let t105;
    	let t106;
    	let div21;
    	let label8;
    	let t108;
    	let input8;
    	let t109;
    	let span9;
    	let t110;
    	let t111;
    	let div23;
    	let t112;
    	let section5;
    	let h25;
    	let t114;
    	let p10;
    	let mounted;
    	let dispose;
    	let each_value_1 = /*$gaussians*/ ctx[14];
    	validate_each_argument(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*$gaussians*/ ctx[14];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	function select_block_type(ctx, dirty) {
    		if (/*currentImage*/ ctx[11]) return create_if_block;
    		if (/*isRunning*/ ctx[10]) return create_if_block_1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			t0 = space();
    			main = element("main");
    			div1 = element("div");
    			t1 = space();
    			header = element("header");
    			div2 = element("div");
    			h10 = element("h1");
    			h10.textContent = "Understanding GFlowNets";
    			t3 = space();
    			p0 = element("p");
    			p0.textContent = "Gaining intuition for Generative Flow Networks and how to train them";
    			t5 = space();
    			section0 = element("section");
    			h20 = element("h2");
    			h20.textContent = "What is a GFlowNet?";
    			t7 = space();
    			p1 = element("p");
    			p1.textContent = "Short Description: What can they do, how do they work, advantages";
    			t9 = space();
    			h21 = element("h2");
    			h21.textContent = "Toy Environment";
    			t11 = space();
    			p2 = element("p");
    			p2.textContent = "A 2-dimensional multivariate Gaussian environment with two modes. GFlowNet\n      takes steps in the x or y direction, and rewards are calculated based on the mixture of\n      Gaussians.";
    			t13 = space();
    			ul = element("ul");
    			li0 = element("li");
    			li0.textContent = "Variable sequence length is typically supported, but fixed here for simplicity.";
    			t15 = space();
    			li1 = element("li");
    			li1.textContent = "State does not depend on the order of steps.";
    			t17 = space();
    			li2 = element("li");
    			li2.textContent = "Added a counter to avoid circular paths in the graph.";
    			t19 = space();
    			div3 = element("div");
    			img0 = element("img");
    			t20 = space();
    			section1 = element("section");
    			h22 = element("h2");
    			h22.textContent = "Training";
    			t22 = space();
    			p3 = element("p");
    			p3.textContent = "Visualizing how GFlowNet samples from the underlying distribution.\n      -> Learns full distribution given enough compute\n      TODO: Add slider over training iterations to visualizations to add interactivity and see training progress";
    			t24 = space();
    			div4 = element("div");
    			img1 = element("img");
    			t25 = space();
    			h23 = element("h2");
    			h23.textContent = "Mode Collapse";
    			t27 = space();
    			p4 = element("p");
    			p4.textContent = "If there is little probability mass between modes, we see mode collapse.";
    			t29 = space();
    			div5 = element("div");
    			img2 = element("img");
    			t30 = space();
    			p5 = element("p");
    			p5.textContent = "Training off-policy mitigates this issue.\n      We added variance to each step -> more exploring";
    			t32 = space();
    			div6 = element("div");
    			img3 = element("img");
    			t33 = space();
    			section2 = element("section");
    			h24 = element("h2");
    			h24.textContent = "Flow";
    			t35 = space();
    			p6 = element("p");
    			p6.textContent = "Visualize flow between states. Probably interactive:\n      Hovering over env and displaying flow in 8 directions with arrows.\n      Probably need to discretize for this?";
    			t37 = space();
    			section3 = element("section");
    			div7 = element("div");
    			h11 = element("h1");
    			h11.textContent = "Playground";
    			t39 = space();
    			p7 = element("p");
    			p7.textContent = "Change the environment and train your own GFlowNet to get a feeling on how they work.";
    			t41 = space();
    			section4 = element("section");
    			p8 = element("p");
    			p8.textContent = "Here you can change the environment.\n      Drag the center of the circles to change the mean and the border to change the variance.\n      You can also add more Gaussians if you want.";
    			t43 = space();
    			div8 = element("div");
    			img4 = element("img");
    			t44 = space();
    			div10 = element("div");
    			img5 = element("img");
    			t45 = space();
    			div9 = element("div");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t46 = space();
    			div11 = element("div");
    			t47 = text("Number of Gaussians:\n      ");
    			button0 = element("button");
    			t48 = text("-");
    			t49 = space();
    			span0 = element("span");
    			t50 = text(t50_value);
    			t51 = space();
    			button1 = element("button");
    			t52 = text("+");
    			t53 = space();
    			table = element("table");
    			thead = element("thead");
    			tr = element("tr");
    			th0 = element("th");
    			th0.textContent = "Mean X";
    			t55 = space();
    			th1 = element("th");
    			th1.textContent = "Mean Y";
    			t57 = space();
    			th2 = element("th");
    			th2.textContent = "Variance";
    			t59 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t60 = space();
    			p9 = element("p");
    			p9.textContent = "change training settings and start training (visualize training by sampling every n steps),\n      all interactivty deactivated while training, add stop button.";
    			t62 = space();
    			div12 = element("div");
    			button2 = element("button");
    			t63 = text("Reset");
    			t64 = space();
    			button3 = element("button");
    			t65 = text(t65_value);
    			t66 = space();
    			div22 = element("div");
    			div13 = element("div");
    			label0 = element("label");
    			label0.textContent = "Off-policy";
    			t68 = space();
    			input0 = element("input");
    			t69 = space();
    			span1 = element("span");
    			t70 = text(/*off_policy_value*/ ctx[1]);
    			t71 = space();
    			div14 = element("div");
    			label1 = element("label");
    			label1.textContent = "Iterations to train";
    			t73 = space();
    			input1 = element("input");
    			t74 = space();
    			span2 = element("span");
    			t75 = text(/*n_iterations_value*/ ctx[2]);
    			t76 = space();
    			div15 = element("div");
    			label2 = element("label");
    			label2.textContent = "Learning rate of the model";
    			t78 = space();
    			input2 = element("input");
    			t79 = space();
    			span3 = element("span");
    			t80 = text(t80_value);
    			t81 = space();
    			div16 = element("div");
    			label3 = element("label");
    			label3.textContent = "Learning rate of LogZ";
    			t83 = space();
    			input3 = element("input");
    			t84 = space();
    			span4 = element("span");
    			t85 = text(t85_value);
    			t86 = space();
    			div17 = element("div");
    			label4 = element("label");
    			label4.textContent = "Length of trajectory";
    			t88 = space();
    			input4 = element("input");
    			t89 = space();
    			span5 = element("span");
    			t90 = text(/*trajectory_length_value*/ ctx[6]);
    			t91 = space();
    			div18 = element("div");
    			label5 = element("label");
    			label5.textContent = "Number of hidden layers";
    			t93 = space();
    			input5 = element("input");
    			t94 = space();
    			span6 = element("span");
    			t95 = text(/*hidden_layer_value*/ ctx[7]);
    			t96 = space();
    			div19 = element("div");
    			label6 = element("label");
    			label6.textContent = "Seed (TODO)";
    			t98 = space();
    			input6 = element("input");
    			t99 = space();
    			span7 = element("span");
    			t100 = text(/*seed_value*/ ctx[8]);
    			t101 = space();
    			div20 = element("div");
    			label7 = element("label");
    			label7.textContent = "Training batch size";
    			t103 = space();
    			input7 = element("input");
    			t104 = space();
    			span8 = element("span");
    			t105 = text(/*batch_size_value*/ ctx[13]);
    			t106 = space();
    			div21 = element("div");
    			label8 = element("label");
    			label8.textContent = "Update visualization every n interations";
    			t108 = space();
    			input8 = element("input");
    			t109 = space();
    			span9 = element("span");
    			t110 = text(/*visualize_every*/ ctx[5]);
    			t111 = space();
    			div23 = element("div");
    			if (if_block) if_block.c();
    			t112 = space();
    			section5 = element("section");
    			h25 = element("h2");
    			h25.textContent = "Sources";
    			t114 = space();
    			p10 = element("p");
    			p10.textContent = "Add sources";
    			attr_dev(div0, "id", /*chartId*/ ctx[25]);
    			attr_dev(div0, "class", "svelte-12qsw1d");
    			add_location(div0, file, 359, 0, 9140);
    			attr_dev(div1, "id", "plot-container");
    			set_style(div1, "width", "100%");
    			set_style(div1, "height", "100%");
    			attr_dev(div1, "class", "svelte-12qsw1d");
    			add_location(div1, file, 362, 2, 9196);
    			attr_dev(h10, "class", "title svelte-12qsw1d");
    			add_location(h10, file, 365, 6, 9323);
    			attr_dev(p0, "class", "subtitle svelte-12qsw1d");
    			add_location(p0, file, 366, 6, 9376);
    			attr_dev(div2, "class", "container svelte-12qsw1d");
    			add_location(div2, file, 364, 4, 9293);
    			attr_dev(header, "class", "header svelte-12qsw1d");
    			add_location(header, file, 363, 2, 9265);
    			attr_dev(h20, "class", "section-title svelte-12qsw1d");
    			add_location(h20, file, 371, 4, 9525);
    			attr_dev(p1, "class", "section-text svelte-12qsw1d");
    			add_location(p1, file, 372, 4, 9580);
    			attr_dev(h21, "class", "section-title svelte-12qsw1d");
    			add_location(h21, file, 376, 4, 9691);
    			attr_dev(p2, "class", "section-text svelte-12qsw1d");
    			add_location(p2, file, 377, 4, 9742);
    			attr_dev(li0, "class", "svelte-12qsw1d");
    			add_location(li0, file, 383, 6, 10003);
    			attr_dev(li1, "class", "svelte-12qsw1d");
    			add_location(li1, file, 384, 6, 10098);
    			attr_dev(li2, "class", "svelte-12qsw1d");
    			add_location(li2, file, 385, 6, 10158);
    			attr_dev(ul, "class", "bullet-list svelte-12qsw1d");
    			add_location(ul, file, 382, 4, 9972);
    			if (!src_url_equal(img0.src, img0_src_value = "/images/env1.png")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "class", "image svelte-12qsw1d");
    			attr_dev(img0, "alt", "Rendering of the environment");
    			add_location(img0, file, 388, 6, 10271);
    			attr_dev(div3, "class", "image-container svelte-12qsw1d");
    			add_location(div3, file, 387, 4, 10235);
    			attr_dev(section0, "class", "section svelte-12qsw1d");
    			add_location(section0, file, 370, 2, 9495);
    			attr_dev(h22, "class", "section-title svelte-12qsw1d");
    			add_location(h22, file, 393, 4, 10420);
    			attr_dev(p3, "class", "section-text svelte-12qsw1d");
    			add_location(p3, file, 394, 4, 10464);
    			if (!src_url_equal(img1.src, img1_src_value = "/images/run1.png")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "class", "image svelte-12qsw1d");
    			attr_dev(img1, "alt", "GFN samples from the underlying distribution");
    			add_location(img1, file, 400, 6, 10779);
    			attr_dev(div4, "class", "image-container svelte-12qsw1d");
    			add_location(div4, file, 399, 4, 10743);
    			attr_dev(h23, "class", "section-title svelte-12qsw1d");
    			add_location(h23, file, 403, 4, 10889);
    			attr_dev(p4, "class", "section-text svelte-12qsw1d");
    			add_location(p4, file, 404, 4, 10938);
    			if (!src_url_equal(img2.src, img2_src_value = "/images/run2.png")) attr_dev(img2, "src", img2_src_value);
    			attr_dev(img2, "class", "image svelte-12qsw1d");
    			attr_dev(img2, "alt", "Low variance leads to sampling from one mode");
    			add_location(img2, file, 408, 6, 11091);
    			attr_dev(div5, "class", "image-container svelte-12qsw1d");
    			add_location(div5, file, 407, 4, 11055);
    			attr_dev(p5, "class", "section-text svelte-12qsw1d");
    			add_location(p5, file, 410, 4, 11200);
    			if (!src_url_equal(img3.src, img3_src_value = "/images/run3.png")) attr_dev(img3, "src", img3_src_value);
    			attr_dev(img3, "class", "image svelte-12qsw1d");
    			attr_dev(img3, "alt", "Off-policy training helps");
    			add_location(img3, file, 415, 6, 11377);
    			attr_dev(div6, "class", "image-container svelte-12qsw1d");
    			add_location(div6, file, 414, 4, 11341);
    			attr_dev(section1, "class", "section section-light svelte-12qsw1d");
    			add_location(section1, file, 392, 2, 10376);
    			attr_dev(h24, "class", "section-title svelte-12qsw1d");
    			add_location(h24, file, 420, 4, 11509);
    			attr_dev(p6, "class", "section-text svelte-12qsw1d");
    			add_location(p6, file, 421, 4, 11549);
    			attr_dev(section2, "class", "section svelte-12qsw1d");
    			add_location(section2, file, 419, 2, 11479);
    			attr_dev(h11, "class", "title svelte-12qsw1d");
    			add_location(h11, file, 430, 6, 11838);
    			attr_dev(p7, "class", "subtitle svelte-12qsw1d");
    			add_location(p7, file, 431, 6, 11878);
    			attr_dev(div7, "class", "container svelte-12qsw1d");
    			add_location(div7, file, 429, 4, 11808);
    			attr_dev(section3, "class", "playground svelte-12qsw1d");
    			add_location(section3, file, 428, 2, 11775);
    			attr_dev(p8, "class", "section-text svelte-12qsw1d");
    			add_location(p8, file, 438, 4, 12067);
    			if (!src_url_equal(img4.src, img4_src_value = /*current_env_image*/ ctx[9])) attr_dev(img4, "src", img4_src_value);
    			attr_dev(img4, "alt", "Rendering of the environment");
    			attr_dev(img4, "class", "svelte-12qsw1d");
    			add_location(img4, file, 444, 6, 12328);
    			attr_dev(div8, "class", "visualization svelte-12qsw1d");
    			add_location(div8, file, 443, 4, 12294);
    			if (!src_url_equal(img5.src, img5_src_value = "/images/env1.png")) attr_dev(img5, "src", img5_src_value);
    			attr_dev(img5, "class", "env-image svelte-12qsw1d");
    			attr_dev(img5, "alt", "Rendering of the environment");
    			add_location(img5, file, 447, 6, 12443);
    			attr_dev(div9, "class", "canvas-container svelte-12qsw1d");
    			add_location(div9, file, 448, 6, 12531);
    			attr_dev(div10, "class", "env-container svelte-12qsw1d");
    			add_location(div10, file, 446, 4, 12409);
    			button0.disabled = button0_disabled_value = /*isRunning*/ ctx[10] || /*$gaussians*/ ctx[14].length === 1;
    			attr_dev(button0, "class", "svelte-12qsw1d");
    			add_location(button0, file, 479, 6, 13473);
    			attr_dev(span0, "class", "svelte-12qsw1d");
    			add_location(span0, file, 486, 6, 13711);
    			button1.disabled = button1_disabled_value = /*isRunning*/ ctx[10] || /*$gaussians*/ ctx[14].length === 4;
    			attr_dev(button1, "class", "svelte-12qsw1d");
    			add_location(button1, file, 487, 6, 13750);
    			attr_dev(div11, "class", "controls svelte-12qsw1d");
    			add_location(div11, file, 477, 4, 13417);
    			attr_dev(th0, "class", "svelte-12qsw1d");
    			add_location(th0, file, 493, 10, 13901);
    			attr_dev(th1, "class", "svelte-12qsw1d");
    			add_location(th1, file, 494, 10, 13927);
    			attr_dev(th2, "class", "svelte-12qsw1d");
    			add_location(th2, file, 495, 10, 13953);
    			attr_dev(tr, "class", "svelte-12qsw1d");
    			add_location(tr, file, 492, 8, 13886);
    			attr_dev(thead, "class", "svelte-12qsw1d");
    			add_location(thead, file, 491, 6, 13870);
    			attr_dev(tbody, "class", "svelte-12qsw1d");
    			add_location(tbody, file, 498, 6, 14006);
    			attr_dev(table, "class", "svelte-12qsw1d");
    			add_location(table, file, 490, 4, 13856);
    			attr_dev(p9, "class", "section-text svelte-12qsw1d");
    			add_location(p9, file, 509, 4, 14260);
    			attr_dev(button2, "class", "reset-button svelte-12qsw1d");
    			button2.disabled = /*isRunning*/ ctx[10];
    			add_location(button2, file, 514, 6, 14501);
    			attr_dev(button3, "class", "reset-button svelte-12qsw1d");
    			add_location(button3, file, 515, 6, 14600);
    			attr_dev(div12, "class", "buttonscontainer svelte-12qsw1d");
    			add_location(div12, file, 513, 4, 14464);
    			attr_dev(label0, "for", "off_policy");
    			attr_dev(label0, "class", "svelte-12qsw1d");
    			add_location(label0, file, 520, 8, 14823);
    			attr_dev(input0, "type", "range");
    			attr_dev(input0, "min", "0");
    			attr_dev(input0, "max", "3");
    			attr_dev(input0, "step", "0.1");
    			attr_dev(input0, "id", "off_policy");
    			input0.disabled = /*isRunning*/ ctx[10];
    			attr_dev(input0, "class", "svelte-12qsw1d");
    			add_location(input0, file, 521, 8, 14874);
    			attr_dev(span1, "class", "svelte-12qsw1d");
    			add_location(span1, file, 530, 8, 15079);
    			attr_dev(div13, "class", "slider svelte-12qsw1d");
    			add_location(div13, file, 519, 6, 14794);
    			attr_dev(label1, "for", "n_iterations");
    			attr_dev(label1, "class", "svelte-12qsw1d");
    			add_location(label1, file, 533, 8, 15159);
    			attr_dev(input1, "type", "range");
    			attr_dev(input1, "min", "100");
    			attr_dev(input1, "max", "10000");
    			attr_dev(input1, "step", "10");
    			attr_dev(input1, "id", "n_iterations");
    			input1.disabled = /*isRunning*/ ctx[10];
    			attr_dev(input1, "class", "svelte-12qsw1d");
    			add_location(input1, file, 534, 8, 15221);
    			attr_dev(span2, "class", "svelte-12qsw1d");
    			add_location(span2, file, 543, 8, 15435);
    			attr_dev(div14, "class", "slider svelte-12qsw1d");
    			add_location(div14, file, 532, 6, 15130);
    			attr_dev(label2, "for", "lr_model");
    			attr_dev(label2, "class", "svelte-12qsw1d");
    			add_location(label2, file, 546, 8, 15517);
    			attr_dev(input2, "type", "range");
    			attr_dev(input2, "min", "0.0001");
    			attr_dev(input2, "max", "0.1");
    			attr_dev(input2, "step", "0.0001");
    			attr_dev(input2, "id", "lr_model");
    			input2.disabled = /*isRunning*/ ctx[10];
    			attr_dev(input2, "class", "svelte-12qsw1d");
    			add_location(input2, file, 547, 8, 15582);
    			attr_dev(span3, "class", "svelte-12qsw1d");
    			add_location(span3, file, 556, 8, 15793);
    			attr_dev(div15, "class", "slider svelte-12qsw1d");
    			add_location(div15, file, 545, 6, 15488);
    			attr_dev(label3, "for", "lr_logz");
    			attr_dev(label3, "class", "svelte-12qsw1d");
    			add_location(label3, file, 559, 8, 15882);
    			attr_dev(input3, "type", "range");
    			attr_dev(input3, "min", "0.001");
    			attr_dev(input3, "max", "0.3");
    			attr_dev(input3, "step", "0.001");
    			attr_dev(input3, "id", "lr_logz");
    			input3.disabled = /*isRunning*/ ctx[10];
    			attr_dev(input3, "class", "svelte-12qsw1d");
    			add_location(input3, file, 560, 8, 15941);
    			attr_dev(span4, "class", "svelte-12qsw1d");
    			add_location(span4, file, 569, 8, 16148);
    			attr_dev(div16, "class", "slider svelte-12qsw1d");
    			add_location(div16, file, 558, 6, 15853);
    			attr_dev(label4, "for", "trajectory_length");
    			attr_dev(label4, "class", "svelte-12qsw1d");
    			add_location(label4, file, 572, 8, 16236);
    			attr_dev(input4, "type", "range");
    			attr_dev(input4, "min", "1");
    			attr_dev(input4, "max", "8");
    			attr_dev(input4, "step", "1");
    			attr_dev(input4, "id", "trajectory_lenght");
    			input4.disabled = /*isRunning*/ ctx[10];
    			attr_dev(input4, "class", "svelte-12qsw1d");
    			add_location(input4, file, 573, 8, 16304);
    			attr_dev(span5, "class", "svelte-12qsw1d");
    			add_location(span5, file, 582, 8, 16521);
    			attr_dev(div17, "class", "slider svelte-12qsw1d");
    			add_location(div17, file, 571, 6, 16207);
    			attr_dev(label5, "for", "hidden_layer");
    			attr_dev(label5, "class", "svelte-12qsw1d");
    			add_location(label5, file, 585, 8, 16608);
    			attr_dev(input5, "type", "range");
    			attr_dev(input5, "min", "1");
    			attr_dev(input5, "max", "8");
    			attr_dev(input5, "step", "1");
    			attr_dev(input5, "id", "hidden_layer");
    			input5.disabled = /*isRunning*/ ctx[10];
    			attr_dev(input5, "class", "svelte-12qsw1d");
    			add_location(input5, file, 586, 8, 16674);
    			attr_dev(span6, "class", "svelte-12qsw1d");
    			add_location(span6, file, 595, 8, 16881);
    			attr_dev(div18, "class", "slider svelte-12qsw1d");
    			add_location(div18, file, 584, 6, 16579);
    			attr_dev(label6, "for", "seed");
    			attr_dev(label6, "class", "svelte-12qsw1d");
    			add_location(label6, file, 598, 8, 16963);
    			attr_dev(input6, "type", "range");
    			attr_dev(input6, "min", "0");
    			attr_dev(input6, "max", "9999");
    			attr_dev(input6, "step", "1");
    			attr_dev(input6, "id", "seed");
    			input6.disabled = /*isRunning*/ ctx[10];
    			attr_dev(input6, "class", "svelte-12qsw1d");
    			add_location(input6, file, 599, 8, 17009);
    			attr_dev(span7, "class", "svelte-12qsw1d");
    			add_location(span7, file, 608, 8, 17203);
    			attr_dev(div19, "class", "slider svelte-12qsw1d");
    			add_location(div19, file, 597, 6, 16934);
    			attr_dev(label7, "for", "batch_size");
    			attr_dev(label7, "class", "svelte-12qsw1d");
    			add_location(label7, file, 611, 8, 17277);
    			attr_dev(input7, "type", "range");
    			attr_dev(input7, "min", "3");
    			attr_dev(input7, "max", "11");
    			attr_dev(input7, "step", "1");
    			attr_dev(input7, "id", "batch_size");
    			input7.disabled = /*isRunning*/ ctx[10];
    			attr_dev(input7, "class", "svelte-12qsw1d");
    			add_location(input7, file, 612, 8, 17337);
    			attr_dev(span8, "class", "svelte-12qsw1d");
    			add_location(span8, file, 621, 8, 17544);
    			attr_dev(div20, "class", "slider svelte-12qsw1d");
    			add_location(div20, file, 610, 6, 17248);
    			attr_dev(label8, "for", "vis_every");
    			attr_dev(label8, "class", "svelte-12qsw1d");
    			add_location(label8, file, 624, 8, 17622);
    			attr_dev(input8, "type", "range");
    			attr_dev(input8, "min", "10");
    			attr_dev(input8, "max", "500");
    			attr_dev(input8, "step", "10");
    			attr_dev(input8, "id", "vis_every");
    			input8.disabled = /*isRunning*/ ctx[10];
    			attr_dev(input8, "class", "svelte-12qsw1d");
    			add_location(input8, file, 625, 8, 17702);
    			attr_dev(span9, "class", "svelte-12qsw1d");
    			add_location(span9, file, 634, 8, 17907);
    			attr_dev(div21, "class", "slider svelte-12qsw1d");
    			add_location(div21, file, 623, 4, 17593);
    			attr_dev(div22, "class", "slider-container svelte-12qsw1d");
    			add_location(div22, file, 518, 4, 14757);
    			attr_dev(div23, "class", "visualization svelte-12qsw1d");
    			add_location(div23, file, 637, 4, 17966);
    			attr_dev(section4, "class", "section-light svelte-12qsw1d");
    			add_location(section4, file, 437, 2, 12031);
    			attr_dev(h25, "class", "section-title svelte-12qsw1d");
    			add_location(h25, file, 663, 4, 18403);
    			attr_dev(p10, "class", "section-text svelte-12qsw1d");
    			add_location(p10, file, 664, 4, 18446);
    			attr_dev(section5, "class", "section svelte-12qsw1d");
    			add_location(section5, file, 662, 2, 18373);
    			attr_dev(main, "class", "main-content svelte-12qsw1d");
    			add_location(main, file, 361, 0, 9166);
    		},
    		l: function claim(nodes) {
    			throw new Error_1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, main, anchor);
    			append_dev(main, div1);
    			append_dev(main, t1);
    			append_dev(main, header);
    			append_dev(header, div2);
    			append_dev(div2, h10);
    			append_dev(div2, t3);
    			append_dev(div2, p0);
    			append_dev(main, t5);
    			append_dev(main, section0);
    			append_dev(section0, h20);
    			append_dev(section0, t7);
    			append_dev(section0, p1);
    			append_dev(section0, t9);
    			append_dev(section0, h21);
    			append_dev(section0, t11);
    			append_dev(section0, p2);
    			append_dev(section0, t13);
    			append_dev(section0, ul);
    			append_dev(ul, li0);
    			append_dev(ul, t15);
    			append_dev(ul, li1);
    			append_dev(ul, t17);
    			append_dev(ul, li2);
    			append_dev(section0, t19);
    			append_dev(section0, div3);
    			append_dev(div3, img0);
    			append_dev(main, t20);
    			append_dev(main, section1);
    			append_dev(section1, h22);
    			append_dev(section1, t22);
    			append_dev(section1, p3);
    			append_dev(section1, t24);
    			append_dev(section1, div4);
    			append_dev(div4, img1);
    			append_dev(section1, t25);
    			append_dev(section1, h23);
    			append_dev(section1, t27);
    			append_dev(section1, p4);
    			append_dev(section1, t29);
    			append_dev(section1, div5);
    			append_dev(div5, img2);
    			append_dev(section1, t30);
    			append_dev(section1, p5);
    			append_dev(section1, t32);
    			append_dev(section1, div6);
    			append_dev(div6, img3);
    			append_dev(main, t33);
    			append_dev(main, section2);
    			append_dev(section2, h24);
    			append_dev(section2, t35);
    			append_dev(section2, p6);
    			append_dev(main, t37);
    			append_dev(main, section3);
    			append_dev(section3, div7);
    			append_dev(div7, h11);
    			append_dev(div7, t39);
    			append_dev(div7, p7);
    			append_dev(main, t41);
    			append_dev(main, section4);
    			append_dev(section4, p8);
    			append_dev(section4, t43);
    			append_dev(section4, div8);
    			append_dev(div8, img4);
    			append_dev(section4, t44);
    			append_dev(section4, div10);
    			append_dev(div10, img5);
    			append_dev(div10, t45);
    			append_dev(div10, div9);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				if (each_blocks_1[i]) {
    					each_blocks_1[i].m(div9, null);
    				}
    			}

    			append_dev(section4, t46);
    			append_dev(section4, div11);
    			append_dev(div11, t47);
    			append_dev(div11, button0);
    			append_dev(button0, t48);
    			append_dev(div11, t49);
    			append_dev(div11, span0);
    			append_dev(span0, t50);
    			append_dev(div11, t51);
    			append_dev(div11, button1);
    			append_dev(button1, t52);
    			append_dev(section4, t53);
    			append_dev(section4, table);
    			append_dev(table, thead);
    			append_dev(thead, tr);
    			append_dev(tr, th0);
    			append_dev(tr, t55);
    			append_dev(tr, th1);
    			append_dev(tr, t57);
    			append_dev(tr, th2);
    			append_dev(table, t59);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(tbody, null);
    				}
    			}

    			append_dev(section4, t60);
    			append_dev(section4, p9);
    			append_dev(section4, t62);
    			append_dev(section4, div12);
    			append_dev(div12, button2);
    			append_dev(button2, t63);
    			append_dev(div12, t64);
    			append_dev(div12, button3);
    			append_dev(button3, t65);
    			append_dev(section4, t66);
    			append_dev(section4, div22);
    			append_dev(div22, div13);
    			append_dev(div13, label0);
    			append_dev(div13, t68);
    			append_dev(div13, input0);
    			set_input_value(input0, /*off_policy_value*/ ctx[1]);
    			append_dev(div13, t69);
    			append_dev(div13, span1);
    			append_dev(span1, t70);
    			append_dev(div22, t71);
    			append_dev(div22, div14);
    			append_dev(div14, label1);
    			append_dev(div14, t73);
    			append_dev(div14, input1);
    			set_input_value(input1, /*n_iterations_value*/ ctx[2]);
    			append_dev(div14, t74);
    			append_dev(div14, span2);
    			append_dev(span2, t75);
    			append_dev(div22, t76);
    			append_dev(div22, div15);
    			append_dev(div15, label2);
    			append_dev(div15, t78);
    			append_dev(div15, input2);
    			set_input_value(input2, /*lr_model_value*/ ctx[3]);
    			append_dev(div15, t79);
    			append_dev(div15, span3);
    			append_dev(span3, t80);
    			append_dev(div22, t81);
    			append_dev(div22, div16);
    			append_dev(div16, label3);
    			append_dev(div16, t83);
    			append_dev(div16, input3);
    			set_input_value(input3, /*lr_logz_value*/ ctx[4]);
    			append_dev(div16, t84);
    			append_dev(div16, span4);
    			append_dev(span4, t85);
    			append_dev(div22, t86);
    			append_dev(div22, div17);
    			append_dev(div17, label4);
    			append_dev(div17, t88);
    			append_dev(div17, input4);
    			set_input_value(input4, /*trajectory_length_value*/ ctx[6]);
    			append_dev(div17, t89);
    			append_dev(div17, span5);
    			append_dev(span5, t90);
    			append_dev(div22, t91);
    			append_dev(div22, div18);
    			append_dev(div18, label5);
    			append_dev(div18, t93);
    			append_dev(div18, input5);
    			set_input_value(input5, /*hidden_layer_value*/ ctx[7]);
    			append_dev(div18, t94);
    			append_dev(div18, span6);
    			append_dev(span6, t95);
    			append_dev(div22, t96);
    			append_dev(div22, div19);
    			append_dev(div19, label6);
    			append_dev(div19, t98);
    			append_dev(div19, input6);
    			set_input_value(input6, /*seed_value*/ ctx[8]);
    			append_dev(div19, t99);
    			append_dev(div19, span7);
    			append_dev(span7, t100);
    			append_dev(div22, t101);
    			append_dev(div22, div20);
    			append_dev(div20, label7);
    			append_dev(div20, t103);
    			append_dev(div20, input7);
    			set_input_value(input7, /*batch_size_exponent*/ ctx[0]);
    			append_dev(div20, t104);
    			append_dev(div20, span8);
    			append_dev(span8, t105);
    			append_dev(div22, t106);
    			append_dev(div22, div21);
    			append_dev(div21, label8);
    			append_dev(div21, t108);
    			append_dev(div21, input8);
    			set_input_value(input8, /*visualize_every*/ ctx[5]);
    			append_dev(div21, t109);
    			append_dev(div21, span9);
    			append_dev(span9, t110);
    			append_dev(section4, t111);
    			append_dev(section4, div23);
    			if (if_block) if_block.m(div23, null);
    			append_dev(main, t112);
    			append_dev(main, section5);
    			append_dev(section5, h25);
    			append_dev(section5, t114);
    			append_dev(section5, p10);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "mouseover", /*mouseover_handler*/ ctx[28], false, false, false, false),
    					listen_dev(button0, "mouseout", /*clearHighlight*/ ctx[24], false, false, false, false),
    					listen_dev(button0, "click", /*removeGaussian*/ ctx[20], false, false, false, false),
    					listen_dev(button1, "click", /*addGaussian*/ ctx[19], false, false, false, false),
    					listen_dev(button2, "click", /*resetSliders*/ ctx[15], false, false, false, false),
    					listen_dev(
    						button3,
    						"click",
    						function () {
    							if (is_function(/*isRunning*/ ctx[10]
    							? /*stopVisualization*/ ctx[17]
    							: /*startVisualization*/ ctx[16])) (/*isRunning*/ ctx[10]
    							? /*stopVisualization*/ ctx[17]
    							: /*startVisualization*/ ctx[16]).apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(input0, "change", /*input0_change_input_handler*/ ctx[29]),
    					listen_dev(input0, "input", /*input0_change_input_handler*/ ctx[29]),
    					listen_dev(input1, "change", /*input1_change_input_handler*/ ctx[30]),
    					listen_dev(input1, "input", /*input1_change_input_handler*/ ctx[30]),
    					listen_dev(input2, "change", /*input2_change_input_handler*/ ctx[31]),
    					listen_dev(input2, "input", /*input2_change_input_handler*/ ctx[31]),
    					listen_dev(input3, "change", /*input3_change_input_handler*/ ctx[32]),
    					listen_dev(input3, "input", /*input3_change_input_handler*/ ctx[32]),
    					listen_dev(input4, "change", /*input4_change_input_handler*/ ctx[33]),
    					listen_dev(input4, "input", /*input4_change_input_handler*/ ctx[33]),
    					listen_dev(input5, "change", /*input5_change_input_handler*/ ctx[34]),
    					listen_dev(input5, "input", /*input5_change_input_handler*/ ctx[34]),
    					listen_dev(input6, "change", /*input6_change_input_handler*/ ctx[35]),
    					listen_dev(input6, "input", /*input6_change_input_handler*/ ctx[35]),
    					listen_dev(input7, "change", /*input7_change_input_handler*/ ctx[36]),
    					listen_dev(input7, "input", /*input7_change_input_handler*/ ctx[36]),
    					listen_dev(input8, "change", /*input8_change_input_handler*/ ctx[37]),
    					listen_dev(input8, "input", /*input8_change_input_handler*/ ctx[37])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty[0] & /*current_env_image*/ 512 && !src_url_equal(img4.src, img4_src_value = /*current_env_image*/ ctx[9])) {
    				attr_dev(img4, "src", img4_src_value);
    			}

    			if (dirty[0] & /*$gaussians, hoveredGaussian, startDragMean, isRunning, startDragVariance*/ 6312960) {
    				each_value_1 = /*$gaussians*/ ctx[14];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div9, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty[0] & /*isRunning, $gaussians*/ 17408 && button0_disabled_value !== (button0_disabled_value = /*isRunning*/ ctx[10] || /*$gaussians*/ ctx[14].length === 1)) {
    				prop_dev(button0, "disabled", button0_disabled_value);
    			}

    			if (dirty[0] & /*$gaussians*/ 16384 && t50_value !== (t50_value = /*$gaussians*/ ctx[14].length + "")) set_data_dev(t50, t50_value);

    			if (dirty[0] & /*isRunning, $gaussians*/ 17408 && button1_disabled_value !== (button1_disabled_value = /*isRunning*/ ctx[10] || /*$gaussians*/ ctx[14].length === 4)) {
    				prop_dev(button1, "disabled", button1_disabled_value);
    			}

    			if (dirty[0] & /*$gaussians*/ 16384) {
    				each_value = /*$gaussians*/ ctx[14];
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

    			if (dirty[0] & /*isRunning*/ 1024) {
    				prop_dev(button2, "disabled", /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*isRunning*/ 1024 && t65_value !== (t65_value = (/*isRunning*/ ctx[10] ? 'Stop' : 'Start') + "")) set_data_dev(t65, t65_value);

    			if (dirty[0] & /*isRunning*/ 1024) {
    				prop_dev(input0, "disabled", /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*off_policy_value*/ 2) {
    				set_input_value(input0, /*off_policy_value*/ ctx[1]);
    			}

    			if (dirty[0] & /*off_policy_value*/ 2) set_data_dev(t70, /*off_policy_value*/ ctx[1]);

    			if (dirty[0] & /*isRunning*/ 1024) {
    				prop_dev(input1, "disabled", /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*n_iterations_value*/ 4) {
    				set_input_value(input1, /*n_iterations_value*/ ctx[2]);
    			}

    			if (dirty[0] & /*n_iterations_value*/ 4) set_data_dev(t75, /*n_iterations_value*/ ctx[2]);

    			if (dirty[0] & /*isRunning*/ 1024) {
    				prop_dev(input2, "disabled", /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*lr_model_value*/ 8) {
    				set_input_value(input2, /*lr_model_value*/ ctx[3]);
    			}

    			if (dirty[0] & /*lr_model_value*/ 8 && t80_value !== (t80_value = /*lr_model_value*/ ctx[3].toFixed(4) + "")) set_data_dev(t80, t80_value);

    			if (dirty[0] & /*isRunning*/ 1024) {
    				prop_dev(input3, "disabled", /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*lr_logz_value*/ 16) {
    				set_input_value(input3, /*lr_logz_value*/ ctx[4]);
    			}

    			if (dirty[0] & /*lr_logz_value*/ 16 && t85_value !== (t85_value = /*lr_logz_value*/ ctx[4].toFixed(3) + "")) set_data_dev(t85, t85_value);

    			if (dirty[0] & /*isRunning*/ 1024) {
    				prop_dev(input4, "disabled", /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*trajectory_length_value*/ 64) {
    				set_input_value(input4, /*trajectory_length_value*/ ctx[6]);
    			}

    			if (dirty[0] & /*trajectory_length_value*/ 64) set_data_dev(t90, /*trajectory_length_value*/ ctx[6]);

    			if (dirty[0] & /*isRunning*/ 1024) {
    				prop_dev(input5, "disabled", /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*hidden_layer_value*/ 128) {
    				set_input_value(input5, /*hidden_layer_value*/ ctx[7]);
    			}

    			if (dirty[0] & /*hidden_layer_value*/ 128) set_data_dev(t95, /*hidden_layer_value*/ ctx[7]);

    			if (dirty[0] & /*isRunning*/ 1024) {
    				prop_dev(input6, "disabled", /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*seed_value*/ 256) {
    				set_input_value(input6, /*seed_value*/ ctx[8]);
    			}

    			if (dirty[0] & /*seed_value*/ 256) set_data_dev(t100, /*seed_value*/ ctx[8]);

    			if (dirty[0] & /*isRunning*/ 1024) {
    				prop_dev(input7, "disabled", /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*batch_size_exponent*/ 1) {
    				set_input_value(input7, /*batch_size_exponent*/ ctx[0]);
    			}

    			if (dirty[0] & /*batch_size_value*/ 8192) set_data_dev(t105, /*batch_size_value*/ ctx[13]);

    			if (dirty[0] & /*isRunning*/ 1024) {
    				prop_dev(input8, "disabled", /*isRunning*/ ctx[10]);
    			}

    			if (dirty[0] & /*visualize_every*/ 32) {
    				set_input_value(input8, /*visualize_every*/ ctx[5]);
    			}

    			if (dirty[0] & /*visualize_every*/ 32) set_data_dev(t110, /*visualize_every*/ ctx[5]);

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div23, null);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t0);
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

    function instance($$self, $$props, $$invalidate) {
    	let batch_size_value;
    	let $gaussians;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let rand = -1;
    	let off_policy_value = 0;
    	let n_iterations_value = 2000;
    	let lr_model_value = 0.001;
    	let lr_logz_value = 0.1;
    	let visualize_every = 50;
    	let trajectory_length_value = 2;
    	let hidden_layer_value = 2;
    	let hidden_dim_value = 2;
    	let seed_value = 7614;
    	let batch_size_exponent = 6;
    	let current_env_image = null;
    	let isRunning = false;
    	let currentImage = null;
    	let pollingTimer;

    	function getRand() {
    		fetch("http://0.0.0.0:8000/rand").then(d => d.text()).then(d => rand = d);
    	}

    	function resetSliders() {
    		$$invalidate(1, off_policy_value = 0);
    		$$invalidate(2, n_iterations_value = 2000);
    		$$invalidate(3, lr_model_value = 0.001);
    		$$invalidate(4, lr_logz_value = 0.1);
    		$$invalidate(5, visualize_every = 50);
    		$$invalidate(6, trajectory_length_value = 2);
    		$$invalidate(7, hidden_layer_value = 2);
    		hidden_dim_value = 2;
    		$$invalidate(8, seed_value = 7614);
    		$$invalidate(0, batch_size_exponent = 6);
    	}

    	async function startVisualization() {
    		try {
    			// Disable sliders and switch button state
    			$$invalidate(10, isRunning = true);

    			// Start visualization on backend
    			const response = await fetch('http://localhost:8000/start_visualization', {
    				method: 'POST',
    				headers: { 'Content-Type': 'application/json' },
    				body: JSON.stringify({
    					off_policy_value,
    					n_iterations_value,
    					lr_model_value,
    					lr_logz_value,
    					visualize_every,
    					trajectory_length_value,
    					hidden_layer_value,
    					hidden_dim_value,
    					seed_value,
    					batch_size_value
    				})
    			});

    			if (!response.ok) {
    				throw new Error('Failed to start visualization.');
    			}

    			// Start polling for visualizations
    			pollVisualization();
    		} catch(error) {
    			console.error(error);
    			$$invalidate(10, isRunning = false);
    		}
    	}

    	async function stopVisualization() {
    		try {
    			// Stop visualization on backend
    			const response = await fetch('http://localhost:8000/stop_visualization');

    			if (!response.ok) {
    				throw new Error('Failed to stop visualization.');
    			}

    			// Stop polling and reset button state
    			clearInterval(pollingTimer);

    			$$invalidate(10, isRunning = false);
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
    						$$invalidate(11, currentImage = `data:image/png;base64,${data.image}`);
    					}

    					if (data.completed) {
    						console.log("Visualization process completed.");
    						$$invalidate(10, isRunning = false); // Update the UI state to reflect the stopped process
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

    	/*
      async function get_env_state(value) {
      try {
        // Access the current value of 'gaussians' using subscribe
        gaussians.subscribe(value => {
          // Send the POST request with the current value of 'gaussians'
          fetch('http://localhost:8000/get_env_state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gaussians: value })  // Use the current value of 'gaussians'
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          })
          .then(data => {
            if (data.image) {
              current_env_image = `data:image/png;base64,${data.image}`;
            }
          })
          .catch(error => {
            console.error(error);
          });
        });
      } catch (error) {
        console.error(error);
      }
    } */
    	async function get_env_state() {
    		try {
    			// Access the current value of 'gaussians' using subscribe
    			const value = get_store_value(gaussians);

    			fetch('http://localhost:8000/get_env_state', {
    				method: 'POST',
    				headers: { 'Content-Type': 'application/json' },
    				body: JSON.stringify({ gaussians: value }), // Use the current value of 'gaussians'
    				
    			}).then(response => {
    				if (!response.ok) {
    					throw new Error(`HTTP error! status: ${response.status}`);
    				}

    				return response.json();
    			}).then(data => {
    				if (data.image) {
    					$$invalidate(9, current_env_image = `data:image/png;base64,${data.image}`);
    				}
    			}).catch(error => {
    				console.error(error);
    			});
    		} catch(error) {
    			console.error(error);
    		}
    	}

    	// Gaussian data store
    	const gaussians = writable([
    		{ mean: { x: -1, y: -1 }, variance: 0.5 },
    		{ mean: { x: 1, y: 1 }, variance: 0.5 }
    	]);

    	validate_store(gaussians, 'gaussians');
    	component_subscribe($$self, gaussians, value => $$invalidate(14, $gaussians = value));

    	// Coordinate range constraints
    	const range = { min: -3, max: 3 };

    	const varianceRange = { min: 0.1, max: 1.0 };
    	let selectedGaussian = null; // Tracks the currently selected Gaussian
    	let hoveredGaussian = null; // Tracks the Gaussian to be highlighted for deletion

    	// Utility functions
    	const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    	// Add a new Gaussian
    	const addGaussian = () => {
    		gaussians.update(gs => {
    			if (gs.length < 4) {
    				gs.push({ mean: { x: 0, y: 0 }, variance: 0.5 });
    			}

    			return gs;
    		});
    	};

    	// Remove the last Gaussian
    	const removeGaussian = () => {
    		gaussians.update(gs => {
    			if (gs.length > 1) {
    				gs.pop();
    			}

    			return gs;
    		});
    	};

    	// Mouse interaction handlers
    	let isDraggingMean = false;

    	let isDraggingVariance = false;
    	let initialMouse = { x: 0, y: 0 };

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
    		console.log("Mouse released, stopping drag...");
    		get_env_state();
    		isDraggingMean = false;
    		isDraggingVariance = false;
    		selectedGaussian = null;
    	};

    	const highlightGaussian = index => {
    		$$invalidate(12, hoveredGaussian = index);
    	};

    	const clearHighlight = () => {
    		$$invalidate(12, hoveredGaussian = null);
    	};

    	onMount(() => {
    		get_env_state();
    		window.addEventListener('mousemove', handleMouseMove);
    		window.addEventListener('mouseup', stopDrag);

    		return () => {
    			window.removeEventListener('mousemove', handleMouseMove);
    			window.removeEventListener('mouseup', stopDrag);
    		};
    	});

    	/*
      import Plotly from 'plotly.js-dist';

      let chartId = 'line-chart';

      onMount(() => {
        const data = [
          {
            x: [1, 2, 3, 4, 5],
            y: [10, 14, 19, 24, 30],
            type: 'scatter', // Line chart
            mode: 'lines+markers',
            marker: { color: 'blue' },
          },
        ];

        const layout = {
          title: 'Simple Line Chart',
          xaxis: { title: 'X-Axis Label' },
          yaxis: { title: 'Y-Axis Label' },
        };

        Plotly.newPlot(chartId, data, layout);
      });
     */
    	let Plotly;

    	let chartId = 'line-chart';

    	// Load Plotly from CDN
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

    	onMount(async () => {
    		await loadPlotly();

    		// Create your plot
    		const data = [
    			{
    				x: [1, 2, 3, 4, 5],
    				y: [10, 14, 19, 24, 30],
    				type: 'scatter', // Line chart
    				mode: 'lines+markers',
    				marker: { color: 'blue' }
    			}
    		];

    		const layout = {
    			title: 'Simple Line Chart',
    			xaxis: { title: 'X-Axis Label' },
    			yaxis: { title: 'Y-Axis Label' }
    		};

    		Plotly.newPlot(chartId, data, layout);
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
    		$$invalidate(6, trajectory_length_value);
    	}

    	function input5_change_input_handler() {
    		hidden_layer_value = to_number(this.value);
    		$$invalidate(7, hidden_layer_value);
    	}

    	function input6_change_input_handler() {
    		seed_value = to_number(this.value);
    		$$invalidate(8, seed_value);
    	}

    	function input7_change_input_handler() {
    		batch_size_exponent = to_number(this.value);
    		$$invalidate(0, batch_size_exponent);
    	}

    	function input8_change_input_handler() {
    		visualize_every = to_number(this.value);
    		$$invalidate(5, visualize_every);
    	}

    	$$self.$capture_state = () => ({
    		rand,
    		off_policy_value,
    		n_iterations_value,
    		lr_model_value,
    		lr_logz_value,
    		visualize_every,
    		trajectory_length_value,
    		hidden_layer_value,
    		hidden_dim_value,
    		seed_value,
    		batch_size_exponent,
    		current_env_image,
    		POLLING_INTERVAL,
    		isRunning,
    		currentImage,
    		pollingTimer,
    		getRand,
    		resetSliders,
    		startVisualization,
    		stopVisualization,
    		pollVisualization,
    		get_env_state,
    		onMount,
    		get: get_store_value,
    		writable,
    		gaussians,
    		range,
    		varianceRange,
    		selectedGaussian,
    		hoveredGaussian,
    		clamp,
    		addGaussian,
    		removeGaussian,
    		isDraggingMean,
    		isDraggingVariance,
    		initialMouse,
    		startDragMean,
    		startDragVariance,
    		handleMouseMove,
    		stopDrag,
    		highlightGaussian,
    		clearHighlight,
    		Plotly,
    		chartId,
    		loadPlotly,
    		batch_size_value,
    		$gaussians
    	});

    	$$self.$inject_state = $$props => {
    		if ('rand' in $$props) rand = $$props.rand;
    		if ('off_policy_value' in $$props) $$invalidate(1, off_policy_value = $$props.off_policy_value);
    		if ('n_iterations_value' in $$props) $$invalidate(2, n_iterations_value = $$props.n_iterations_value);
    		if ('lr_model_value' in $$props) $$invalidate(3, lr_model_value = $$props.lr_model_value);
    		if ('lr_logz_value' in $$props) $$invalidate(4, lr_logz_value = $$props.lr_logz_value);
    		if ('visualize_every' in $$props) $$invalidate(5, visualize_every = $$props.visualize_every);
    		if ('trajectory_length_value' in $$props) $$invalidate(6, trajectory_length_value = $$props.trajectory_length_value);
    		if ('hidden_layer_value' in $$props) $$invalidate(7, hidden_layer_value = $$props.hidden_layer_value);
    		if ('hidden_dim_value' in $$props) hidden_dim_value = $$props.hidden_dim_value;
    		if ('seed_value' in $$props) $$invalidate(8, seed_value = $$props.seed_value);
    		if ('batch_size_exponent' in $$props) $$invalidate(0, batch_size_exponent = $$props.batch_size_exponent);
    		if ('current_env_image' in $$props) $$invalidate(9, current_env_image = $$props.current_env_image);
    		if ('isRunning' in $$props) $$invalidate(10, isRunning = $$props.isRunning);
    		if ('currentImage' in $$props) $$invalidate(11, currentImage = $$props.currentImage);
    		if ('pollingTimer' in $$props) pollingTimer = $$props.pollingTimer;
    		if ('selectedGaussian' in $$props) selectedGaussian = $$props.selectedGaussian;
    		if ('hoveredGaussian' in $$props) $$invalidate(12, hoveredGaussian = $$props.hoveredGaussian);
    		if ('isDraggingMean' in $$props) isDraggingMean = $$props.isDraggingMean;
    		if ('isDraggingVariance' in $$props) isDraggingVariance = $$props.isDraggingVariance;
    		if ('initialMouse' in $$props) initialMouse = $$props.initialMouse;
    		if ('Plotly' in $$props) Plotly = $$props.Plotly;
    		if ('chartId' in $$props) $$invalidate(25, chartId = $$props.chartId);
    		if ('batch_size_value' in $$props) $$invalidate(13, batch_size_value = $$props.batch_size_value);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*batch_size_exponent*/ 1) {
    			$$invalidate(13, batch_size_value = 2 ** batch_size_exponent);
    		}
    	};

    	return [
    		batch_size_exponent,
    		off_policy_value,
    		n_iterations_value,
    		lr_model_value,
    		lr_logz_value,
    		visualize_every,
    		trajectory_length_value,
    		hidden_layer_value,
    		seed_value,
    		current_env_image,
    		isRunning,
    		currentImage,
    		hoveredGaussian,
    		batch_size_value,
    		$gaussians,
    		resetSliders,
    		startVisualization,
    		stopVisualization,
    		gaussians,
    		addGaussian,
    		removeGaussian,
    		startDragMean,
    		startDragVariance,
    		highlightGaussian,
    		clearHighlight,
    		chartId,
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
    		input7_change_input_handler,
    		input8_change_input_handler
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
