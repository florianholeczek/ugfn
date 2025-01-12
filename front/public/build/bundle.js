
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
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
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
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
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

    /* src/App.svelte generated by Svelte v3.59.2 */

    const file = "src/App.svelte";

    function create_fragment(ctx) {
    	let main;
    	let div0;
    	let t0;
    	let header;
    	let div1;
    	let h10;
    	let t2;
    	let p0;
    	let t4;
    	let section0;
    	let h20;
    	let t6;
    	let p1;
    	let t8;
    	let h21;
    	let t10;
    	let p2;
    	let t12;
    	let ul;
    	let li0;
    	let t14;
    	let li1;
    	let t16;
    	let li2;
    	let t18;
    	let div2;
    	let img0;
    	let img0_src_value;
    	let t19;
    	let section1;
    	let h22;
    	let t21;
    	let p3;
    	let t23;
    	let div3;
    	let img1;
    	let img1_src_value;
    	let t24;
    	let h23;
    	let t26;
    	let p4;
    	let t28;
    	let div4;
    	let img2;
    	let img2_src_value;
    	let t29;
    	let p5;
    	let t31;
    	let div5;
    	let img3;
    	let img3_src_value;
    	let t32;
    	let section2;
    	let h24;
    	let t34;
    	let p6;
    	let t36;
    	let section3;
    	let div6;
    	let h11;
    	let t38;
    	let p7;
    	let t40;
    	let section4;
    	let p8;
    	let t42;
    	let div7;
    	let img4;
    	let img4_src_value;
    	let t43;
    	let p9;
    	let t45;
    	let div8;
    	let button0;
    	let t47;
    	let button1;
    	let t49;
    	let div13;
    	let div9;
    	let label0;
    	let t51;
    	let input0;
    	let t52;
    	let span0;
    	let t53;
    	let t54;
    	let div10;
    	let label1;
    	let t56;
    	let input1;
    	let t57;
    	let span1;
    	let t58;
    	let t59;
    	let div11;
    	let label2;
    	let t61;
    	let input2;
    	let t62;
    	let span2;
    	let t63_value = /*lr_model_value*/ ctx[2].toFixed(4) + "";
    	let t63;
    	let t64;
    	let div12;
    	let label3;
    	let t66;
    	let input3;
    	let t67;
    	let span3;
    	let t68_value = /*lr_logz_value*/ ctx[3].toFixed(3) + "";
    	let t68;
    	let t69;
    	let section5;
    	let h25;
    	let t71;
    	let p10;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			main = element("main");
    			div0 = element("div");
    			t0 = space();
    			header = element("header");
    			div1 = element("div");
    			h10 = element("h1");
    			h10.textContent = "Understanding GFlowNets";
    			t2 = space();
    			p0 = element("p");
    			p0.textContent = "Gaining intuition for Generative Flow Networks and how to train them";
    			t4 = space();
    			section0 = element("section");
    			h20 = element("h2");
    			h20.textContent = "What is a GFlowNet?";
    			t6 = space();
    			p1 = element("p");
    			p1.textContent = "Short Description: What can they do, how do they work, advantages";
    			t8 = space();
    			h21 = element("h2");
    			h21.textContent = "Toy Environment";
    			t10 = space();
    			p2 = element("p");
    			p2.textContent = "A 2-dimensional multivariate Gaussian environment with two modes. GFlowNet\n      takes steps in the x or y direction, and rewards are calculated based on the mixture of\n      Gaussians.";
    			t12 = space();
    			ul = element("ul");
    			li0 = element("li");
    			li0.textContent = "Variable sequence length is typically supported, but fixed here for simplicity.";
    			t14 = space();
    			li1 = element("li");
    			li1.textContent = "State does not depend on the order of steps.";
    			t16 = space();
    			li2 = element("li");
    			li2.textContent = "Added a counter to avoid circular paths in the graph.";
    			t18 = space();
    			div2 = element("div");
    			img0 = element("img");
    			t19 = space();
    			section1 = element("section");
    			h22 = element("h2");
    			h22.textContent = "Training";
    			t21 = space();
    			p3 = element("p");
    			p3.textContent = "Visualizing how GFlowNet samples from the underlying distribution.\n      -> Learns full distribution given enough compute\n      TODO: Add slider over training iterations to visualizations to add interactivity and see training progress";
    			t23 = space();
    			div3 = element("div");
    			img1 = element("img");
    			t24 = space();
    			h23 = element("h2");
    			h23.textContent = "Mode Collapse";
    			t26 = space();
    			p4 = element("p");
    			p4.textContent = "If there is little probability mass between modes, we see mode collapse.";
    			t28 = space();
    			div4 = element("div");
    			img2 = element("img");
    			t29 = space();
    			p5 = element("p");
    			p5.textContent = "Training off-policy mitigates this issue.\n      We added variance to each step -> more exploring";
    			t31 = space();
    			div5 = element("div");
    			img3 = element("img");
    			t32 = space();
    			section2 = element("section");
    			h24 = element("h2");
    			h24.textContent = "Flow";
    			t34 = space();
    			p6 = element("p");
    			p6.textContent = "Visualize flow between states. Probably interactive:\n      Hovering over env and displaying flow in 8 directions with arrows.\n      Probably need to discretize for this?";
    			t36 = space();
    			section3 = element("section");
    			div6 = element("div");
    			h11 = element("h1");
    			h11.textContent = "Playground";
    			t38 = space();
    			p7 = element("p");
    			p7.textContent = "Change the environment and train your own GFlowNet to get a feeling on how they work.";
    			t40 = space();
    			section4 = element("section");
    			p8 = element("p");
    			p8.textContent = "change env (up to 4 gaussians, change their mean and var by dragging and scaling on the image)";
    			t42 = space();
    			div7 = element("div");
    			img4 = element("img");
    			t43 = space();
    			p9 = element("p");
    			p9.textContent = "change training settings and start training (visualize training by sampling every n steps),\n      all interactivty deactivated while training, add stop button.";
    			t45 = space();
    			div8 = element("div");
    			button0 = element("button");
    			button0.textContent = "Reset";
    			t47 = space();
    			button1 = element("button");
    			button1.textContent = "Start training";
    			t49 = space();
    			div13 = element("div");
    			div9 = element("div");
    			label0 = element("label");
    			label0.textContent = "Off-policy";
    			t51 = space();
    			input0 = element("input");
    			t52 = space();
    			span0 = element("span");
    			t53 = text(/*off_policy_value*/ ctx[0]);
    			t54 = space();
    			div10 = element("div");
    			label1 = element("label");
    			label1.textContent = "Iterations to train";
    			t56 = space();
    			input1 = element("input");
    			t57 = space();
    			span1 = element("span");
    			t58 = text(/*n_iterations_value*/ ctx[1]);
    			t59 = space();
    			div11 = element("div");
    			label2 = element("label");
    			label2.textContent = "Learning rate of the model";
    			t61 = space();
    			input2 = element("input");
    			t62 = space();
    			span2 = element("span");
    			t63 = text(t63_value);
    			t64 = space();
    			div12 = element("div");
    			label3 = element("label");
    			label3.textContent = "Learning rate of LogZ";
    			t66 = space();
    			input3 = element("input");
    			t67 = space();
    			span3 = element("span");
    			t68 = text(t68_value);
    			t69 = space();
    			section5 = element("section");
    			h25 = element("h2");
    			h25.textContent = "Sources";
    			t71 = space();
    			p10 = element("p");
    			p10.textContent = "Add sources";
    			attr_dev(div0, "id", "plot-container");
    			set_style(div0, "width", "100%");
    			set_style(div0, "height", "100%");
    			attr_dev(div0, "class", "svelte-152vb7l");
    			add_location(div0, file, 55, 2, 1368);
    			attr_dev(h10, "class", "title svelte-152vb7l");
    			add_location(h10, file, 58, 6, 1495);
    			attr_dev(p0, "class", "subtitle svelte-152vb7l");
    			add_location(p0, file, 59, 6, 1548);
    			attr_dev(div1, "class", "container svelte-152vb7l");
    			add_location(div1, file, 57, 4, 1465);
    			attr_dev(header, "class", "header svelte-152vb7l");
    			add_location(header, file, 56, 2, 1437);
    			attr_dev(h20, "class", "section-title svelte-152vb7l");
    			add_location(h20, file, 64, 4, 1697);
    			attr_dev(p1, "class", "section-text svelte-152vb7l");
    			add_location(p1, file, 65, 4, 1752);
    			attr_dev(h21, "class", "section-title svelte-152vb7l");
    			add_location(h21, file, 69, 4, 1863);
    			attr_dev(p2, "class", "section-text svelte-152vb7l");
    			add_location(p2, file, 70, 4, 1914);
    			attr_dev(li0, "class", "svelte-152vb7l");
    			add_location(li0, file, 76, 6, 2175);
    			attr_dev(li1, "class", "svelte-152vb7l");
    			add_location(li1, file, 77, 6, 2270);
    			attr_dev(li2, "class", "svelte-152vb7l");
    			add_location(li2, file, 78, 6, 2330);
    			attr_dev(ul, "class", "bullet-list svelte-152vb7l");
    			add_location(ul, file, 75, 4, 2144);
    			if (!src_url_equal(img0.src, img0_src_value = "/images/env1.png")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "class", "image svelte-152vb7l");
    			attr_dev(img0, "alt", "Rendering of the environment");
    			add_location(img0, file, 81, 6, 2443);
    			attr_dev(div2, "class", "image-container svelte-152vb7l");
    			add_location(div2, file, 80, 4, 2407);
    			attr_dev(section0, "class", "section svelte-152vb7l");
    			add_location(section0, file, 63, 2, 1667);
    			attr_dev(h22, "class", "section-title svelte-152vb7l");
    			add_location(h22, file, 86, 4, 2592);
    			attr_dev(p3, "class", "section-text svelte-152vb7l");
    			add_location(p3, file, 87, 4, 2636);
    			if (!src_url_equal(img1.src, img1_src_value = "/images/run1.png")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "class", "image svelte-152vb7l");
    			attr_dev(img1, "alt", "GFN samples from the underlying distribution");
    			add_location(img1, file, 93, 6, 2951);
    			attr_dev(div3, "class", "image-container svelte-152vb7l");
    			add_location(div3, file, 92, 4, 2915);
    			attr_dev(h23, "class", "section-title svelte-152vb7l");
    			add_location(h23, file, 96, 4, 3061);
    			attr_dev(p4, "class", "section-text svelte-152vb7l");
    			add_location(p4, file, 97, 4, 3110);
    			if (!src_url_equal(img2.src, img2_src_value = "/images/run2.png")) attr_dev(img2, "src", img2_src_value);
    			attr_dev(img2, "class", "image svelte-152vb7l");
    			attr_dev(img2, "alt", "Low variance leads to sampling from one mode");
    			add_location(img2, file, 101, 6, 3263);
    			attr_dev(div4, "class", "image-container svelte-152vb7l");
    			add_location(div4, file, 100, 4, 3227);
    			attr_dev(p5, "class", "section-text svelte-152vb7l");
    			add_location(p5, file, 103, 4, 3372);
    			if (!src_url_equal(img3.src, img3_src_value = "/images/run3.png")) attr_dev(img3, "src", img3_src_value);
    			attr_dev(img3, "class", "image svelte-152vb7l");
    			attr_dev(img3, "alt", "Off-policy training helps");
    			add_location(img3, file, 108, 6, 3549);
    			attr_dev(div5, "class", "image-container svelte-152vb7l");
    			add_location(div5, file, 107, 4, 3513);
    			attr_dev(section1, "class", "section section-light svelte-152vb7l");
    			add_location(section1, file, 85, 2, 2548);
    			attr_dev(h24, "class", "section-title svelte-152vb7l");
    			add_location(h24, file, 113, 4, 3681);
    			attr_dev(p6, "class", "section-text svelte-152vb7l");
    			add_location(p6, file, 114, 4, 3721);
    			attr_dev(section2, "class", "section svelte-152vb7l");
    			add_location(section2, file, 112, 2, 3651);
    			attr_dev(h11, "class", "title svelte-152vb7l");
    			add_location(h11, file, 123, 6, 4010);
    			attr_dev(p7, "class", "subtitle svelte-152vb7l");
    			add_location(p7, file, 124, 6, 4050);
    			attr_dev(div6, "class", "container svelte-152vb7l");
    			add_location(div6, file, 122, 4, 3980);
    			attr_dev(section3, "class", "playground svelte-152vb7l");
    			add_location(section3, file, 121, 2, 3947);
    			attr_dev(p8, "class", "section-text svelte-152vb7l");
    			add_location(p8, file, 131, 4, 4239);
    			if (!src_url_equal(img4.src, img4_src_value = "/images/env1.png")) attr_dev(img4, "src", img4_src_value);
    			attr_dev(img4, "class", "image svelte-152vb7l");
    			attr_dev(img4, "alt", "Rendering of the environment");
    			add_location(img4, file, 135, 6, 4414);
    			attr_dev(div7, "class", "image-container svelte-152vb7l");
    			add_location(div7, file, 134, 4, 4378);
    			attr_dev(p9, "class", "section-text svelte-152vb7l");
    			add_location(p9, file, 138, 4, 4508);
    			attr_dev(button0, "class", "reset-button svelte-152vb7l");
    			add_location(button0, file, 143, 6, 4749);
    			attr_dev(button1, "class", "reset-button svelte-152vb7l");
    			add_location(button1, file, 144, 6, 4825);
    			attr_dev(div8, "class", "buttonscontainer svelte-152vb7l");
    			add_location(div8, file, 142, 4, 4712);
    			attr_dev(label0, "for", "off_policy");
    			attr_dev(label0, "class", "svelte-152vb7l");
    			add_location(label0, file, 148, 8, 4986);
    			attr_dev(input0, "type", "range");
    			attr_dev(input0, "min", "0");
    			attr_dev(input0, "max", "3");
    			attr_dev(input0, "step", "0.1");
    			attr_dev(input0, "id", "off_policy");
    			attr_dev(input0, "class", "svelte-152vb7l");
    			add_location(input0, file, 149, 8, 5037);
    			attr_dev(span0, "class", "svelte-152vb7l");
    			add_location(span0, file, 157, 8, 5211);
    			attr_dev(div9, "class", "slider svelte-152vb7l");
    			add_location(div9, file, 147, 6, 4957);
    			attr_dev(label1, "for", "n_iterations");
    			attr_dev(label1, "class", "svelte-152vb7l");
    			add_location(label1, file, 160, 8, 5291);
    			attr_dev(input1, "type", "range");
    			attr_dev(input1, "min", "100");
    			attr_dev(input1, "max", "10000");
    			attr_dev(input1, "step", "10");
    			attr_dev(input1, "id", "n_iterations");
    			attr_dev(input1, "class", "svelte-152vb7l");
    			add_location(input1, file, 161, 8, 5353);
    			attr_dev(span1, "class", "svelte-152vb7l");
    			add_location(span1, file, 169, 8, 5536);
    			attr_dev(div10, "class", "slider svelte-152vb7l");
    			add_location(div10, file, 159, 6, 5262);
    			attr_dev(label2, "for", "lr_model");
    			attr_dev(label2, "class", "svelte-152vb7l");
    			add_location(label2, file, 172, 8, 5618);
    			attr_dev(input2, "type", "range");
    			attr_dev(input2, "min", "0.0001");
    			attr_dev(input2, "max", "0.1");
    			attr_dev(input2, "step", "0.0001");
    			attr_dev(input2, "id", "lr_model");
    			attr_dev(input2, "class", "svelte-152vb7l");
    			add_location(input2, file, 173, 8, 5683);
    			attr_dev(span2, "class", "svelte-152vb7l");
    			add_location(span2, file, 181, 8, 5863);
    			attr_dev(div11, "class", "slider svelte-152vb7l");
    			add_location(div11, file, 171, 6, 5589);
    			attr_dev(label3, "for", "lr_logz");
    			attr_dev(label3, "class", "svelte-152vb7l");
    			add_location(label3, file, 184, 8, 5952);
    			attr_dev(input3, "type", "range");
    			attr_dev(input3, "min", "0.001");
    			attr_dev(input3, "max", "0.3");
    			attr_dev(input3, "step", "0.001");
    			attr_dev(input3, "id", "lr_logz");
    			attr_dev(input3, "class", "svelte-152vb7l");
    			add_location(input3, file, 185, 8, 6011);
    			attr_dev(span3, "class", "svelte-152vb7l");
    			add_location(span3, file, 193, 8, 6187);
    			attr_dev(div12, "class", "slider svelte-152vb7l");
    			add_location(div12, file, 183, 6, 5923);
    			attr_dev(div13, "class", "slider-container svelte-152vb7l");
    			add_location(div13, file, 146, 4, 4920);
    			attr_dev(section4, "class", "section-light svelte-152vb7l");
    			add_location(section4, file, 130, 2, 4203);
    			attr_dev(h25, "class", "section-title svelte-152vb7l");
    			add_location(h25, file, 208, 4, 6463);
    			attr_dev(p10, "class", "section-text svelte-152vb7l");
    			add_location(p10, file, 209, 4, 6506);
    			attr_dev(section5, "class", "section svelte-152vb7l");
    			add_location(section5, file, 207, 2, 6433);
    			attr_dev(main, "class", "main-content svelte-152vb7l");
    			add_location(main, file, 54, 0, 1338);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, div0);
    			append_dev(main, t0);
    			append_dev(main, header);
    			append_dev(header, div1);
    			append_dev(div1, h10);
    			append_dev(div1, t2);
    			append_dev(div1, p0);
    			append_dev(main, t4);
    			append_dev(main, section0);
    			append_dev(section0, h20);
    			append_dev(section0, t6);
    			append_dev(section0, p1);
    			append_dev(section0, t8);
    			append_dev(section0, h21);
    			append_dev(section0, t10);
    			append_dev(section0, p2);
    			append_dev(section0, t12);
    			append_dev(section0, ul);
    			append_dev(ul, li0);
    			append_dev(ul, t14);
    			append_dev(ul, li1);
    			append_dev(ul, t16);
    			append_dev(ul, li2);
    			append_dev(section0, t18);
    			append_dev(section0, div2);
    			append_dev(div2, img0);
    			append_dev(main, t19);
    			append_dev(main, section1);
    			append_dev(section1, h22);
    			append_dev(section1, t21);
    			append_dev(section1, p3);
    			append_dev(section1, t23);
    			append_dev(section1, div3);
    			append_dev(div3, img1);
    			append_dev(section1, t24);
    			append_dev(section1, h23);
    			append_dev(section1, t26);
    			append_dev(section1, p4);
    			append_dev(section1, t28);
    			append_dev(section1, div4);
    			append_dev(div4, img2);
    			append_dev(section1, t29);
    			append_dev(section1, p5);
    			append_dev(section1, t31);
    			append_dev(section1, div5);
    			append_dev(div5, img3);
    			append_dev(main, t32);
    			append_dev(main, section2);
    			append_dev(section2, h24);
    			append_dev(section2, t34);
    			append_dev(section2, p6);
    			append_dev(main, t36);
    			append_dev(main, section3);
    			append_dev(section3, div6);
    			append_dev(div6, h11);
    			append_dev(div6, t38);
    			append_dev(div6, p7);
    			append_dev(main, t40);
    			append_dev(main, section4);
    			append_dev(section4, p8);
    			append_dev(section4, t42);
    			append_dev(section4, div7);
    			append_dev(div7, img4);
    			append_dev(section4, t43);
    			append_dev(section4, p9);
    			append_dev(section4, t45);
    			append_dev(section4, div8);
    			append_dev(div8, button0);
    			append_dev(div8, t47);
    			append_dev(div8, button1);
    			append_dev(section4, t49);
    			append_dev(section4, div13);
    			append_dev(div13, div9);
    			append_dev(div9, label0);
    			append_dev(div9, t51);
    			append_dev(div9, input0);
    			set_input_value(input0, /*off_policy_value*/ ctx[0]);
    			append_dev(div9, t52);
    			append_dev(div9, span0);
    			append_dev(span0, t53);
    			append_dev(div13, t54);
    			append_dev(div13, div10);
    			append_dev(div10, label1);
    			append_dev(div10, t56);
    			append_dev(div10, input1);
    			set_input_value(input1, /*n_iterations_value*/ ctx[1]);
    			append_dev(div10, t57);
    			append_dev(div10, span1);
    			append_dev(span1, t58);
    			append_dev(div13, t59);
    			append_dev(div13, div11);
    			append_dev(div11, label2);
    			append_dev(div11, t61);
    			append_dev(div11, input2);
    			set_input_value(input2, /*lr_model_value*/ ctx[2]);
    			append_dev(div11, t62);
    			append_dev(div11, span2);
    			append_dev(span2, t63);
    			append_dev(div13, t64);
    			append_dev(div13, div12);
    			append_dev(div12, label3);
    			append_dev(div12, t66);
    			append_dev(div12, input3);
    			set_input_value(input3, /*lr_logz_value*/ ctx[3]);
    			append_dev(div12, t67);
    			append_dev(div12, span3);
    			append_dev(span3, t68);
    			append_dev(main, t69);
    			append_dev(main, section5);
    			append_dev(section5, h25);
    			append_dev(section5, t71);
    			append_dev(section5, p10);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*resetSliders*/ ctx[4], false, false, false, false),
    					listen_dev(button1, "click", /*startTraining*/ ctx[5], false, false, false, false),
    					listen_dev(input0, "change", /*input0_change_input_handler*/ ctx[6]),
    					listen_dev(input0, "input", /*input0_change_input_handler*/ ctx[6]),
    					listen_dev(input1, "change", /*input1_change_input_handler*/ ctx[7]),
    					listen_dev(input1, "input", /*input1_change_input_handler*/ ctx[7]),
    					listen_dev(input2, "change", /*input2_change_input_handler*/ ctx[8]),
    					listen_dev(input2, "input", /*input2_change_input_handler*/ ctx[8]),
    					listen_dev(input3, "change", /*input3_change_input_handler*/ ctx[9]),
    					listen_dev(input3, "input", /*input3_change_input_handler*/ ctx[9])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*off_policy_value*/ 1) {
    				set_input_value(input0, /*off_policy_value*/ ctx[0]);
    			}

    			if (dirty & /*off_policy_value*/ 1) set_data_dev(t53, /*off_policy_value*/ ctx[0]);

    			if (dirty & /*n_iterations_value*/ 2) {
    				set_input_value(input1, /*n_iterations_value*/ ctx[1]);
    			}

    			if (dirty & /*n_iterations_value*/ 2) set_data_dev(t58, /*n_iterations_value*/ ctx[1]);

    			if (dirty & /*lr_model_value*/ 4) {
    				set_input_value(input2, /*lr_model_value*/ ctx[2]);
    			}

    			if (dirty & /*lr_model_value*/ 4 && t63_value !== (t63_value = /*lr_model_value*/ ctx[2].toFixed(4) + "")) set_data_dev(t63, t63_value);

    			if (dirty & /*lr_logz_value*/ 8) {
    				set_input_value(input3, /*lr_logz_value*/ ctx[3]);
    			}

    			if (dirty & /*lr_logz_value*/ 8 && t68_value !== (t68_value = /*lr_logz_value*/ ctx[3].toFixed(3) + "")) set_data_dev(t68, t68_value);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
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

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let rand = -1;
    	let off_policy_value = 0;
    	let n_iterations_value = 2000;
    	let lr_model_value = 0.001;
    	let lr_logz_value = 0.1;
    	let training_running = false;
    	let resp = "???";

    	function getRand() {
    		fetch("http://0.0.0.0:8000/rand").then(d => d.text()).then(d => rand = d);
    	}

    	function resetSliders() {
    		$$invalidate(0, off_policy_value = 0);
    		$$invalidate(1, n_iterations_value = 2000);
    		$$invalidate(2, lr_model_value = 0.001);
    		$$invalidate(3, lr_logz_value = 0.1);
    	}

    	async function startTraining() {
    		training_running = true;
    		resp = "123";
    		await fetch("http://0.0.0.0:8000/train_params").then(d => d.text()).then(d => resp = d);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function input0_change_input_handler() {
    		off_policy_value = to_number(this.value);
    		$$invalidate(0, off_policy_value);
    	}

    	function input1_change_input_handler() {
    		n_iterations_value = to_number(this.value);
    		$$invalidate(1, n_iterations_value);
    	}

    	function input2_change_input_handler() {
    		lr_model_value = to_number(this.value);
    		$$invalidate(2, lr_model_value);
    	}

    	function input3_change_input_handler() {
    		lr_logz_value = to_number(this.value);
    		$$invalidate(3, lr_logz_value);
    	}

    	$$self.$capture_state = () => ({
    		rand,
    		off_policy_value,
    		n_iterations_value,
    		lr_model_value,
    		lr_logz_value,
    		training_running,
    		resp,
    		getRand,
    		resetSliders,
    		startTraining
    	});

    	$$self.$inject_state = $$props => {
    		if ('rand' in $$props) rand = $$props.rand;
    		if ('off_policy_value' in $$props) $$invalidate(0, off_policy_value = $$props.off_policy_value);
    		if ('n_iterations_value' in $$props) $$invalidate(1, n_iterations_value = $$props.n_iterations_value);
    		if ('lr_model_value' in $$props) $$invalidate(2, lr_model_value = $$props.lr_model_value);
    		if ('lr_logz_value' in $$props) $$invalidate(3, lr_logz_value = $$props.lr_logz_value);
    		if ('training_running' in $$props) training_running = $$props.training_running;
    		if ('resp' in $$props) resp = $$props.resp;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		off_policy_value,
    		n_iterations_value,
    		lr_model_value,
    		lr_logz_value,
    		resetSliders,
    		startTraining,
    		input0_change_input_handler,
    		input1_change_input_handler,
    		input2_change_input_handler,
    		input3_change_input_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

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
