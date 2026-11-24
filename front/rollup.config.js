import { spawn } from 'child_process';
import svelte from 'rollup-plugin-svelte';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import livereload from 'rollup-plugin-livereload';
import css from 'rollup-plugin-css-only';
import { cpSync } from 'fs';

// katex.min.css references fonts/ relative to the bundled CSS; copy them next to it.
function copyKatexFonts() {
	return {
		name: 'copy-katex-fonts',
		writeBundle() {
			cpSync('node_modules/katex/dist/fonts', 'public/build/fonts', { recursive: true });
		}
	};
}

const production = !process.env.ROLLUP_WATCH;

function serve() {
	let server;

	function toExit() {
		if (server) server.kill(0);
	}

	return {
		writeBundle() {
			if (server) return;
			server = spawn('npm', ['run', 'start', '--', '--dev'], {
				stdio: ['ignore', 'inherit', 'inherit'],
				shell: true
			});

			process.on('SIGTERM', toExit);
			process.on('exit', toExit);
		}
	};
}

// Two bundles: the article (index.html) and the talk slides (present.html).
// Only the first starts the dev server and livereload.
const makeConfig = (input, file, cssFile, main) => ({
	input,
	output: {
		sourcemap: true,
		format: 'iife',
		name: 'app',
		file
	},
	plugins: [
		svelte({
			compilerOptions: {
				// enable run-time checks when not in production
				dev: !production
			}
		}),
		// we'll extract any component CSS out into
		// a separate file - better for performance
		css({ output: cssFile }),
		main && copyKatexFonts(),

		// If you have external dependencies installed from
		// npm, you'll most likely need these plugins. In
		// some cases you'll need additional configuration -
		// consult the documentation for details:
		// https://github.com/rollup/plugins/tree/master/packages/commonjs
		resolve({
			browser: true,
			dedupe: ['svelte'],
			exportConditions: ['svelte']
		}),
		commonjs(),

		// In dev mode, call `npm run start` once
		// the bundle has been generated
		!production && main && serve(),

		// Watch the `public` directory and refresh the
		// browser on changes when not in production
		!production && main && livereload('public'),

		// If we're building for production (npm run build
		// instead of npm run dev), minify
		production && terser()
	],
	watch: {
		clearScreen: false
	}
});

export default [
	makeConfig('src/main.js', 'public/build/bundle.js', 'bundle.css', true),
	makeConfig('src/present/main.js', 'public/build/present.js', 'present.css', false)
];
