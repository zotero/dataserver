import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import path from 'path';
import { fileURLToPath } from 'url';

let __dirname = path.dirname(fileURLToPath(import.meta.url));
let compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
});

export default [
	...compat.extends('@zotero'),
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				// Node
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				URL: 'readonly',
				fetch: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				AbortController: 'readonly',
				// Mocha
				describe: 'readonly',
				it: 'readonly',
				before: 'readonly',
				after: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
			},
		},
		rules: {
			// Mocha uses 'this' in describe/it blocks
			'no-invalid-this': 'off',
			// Tests often don't use consistent returns
			'consistent-return': 'off',
			// Allow process.env for config
			'no-process-env': 'off',
		},
	},
	{
		ignores: ['node_modules/**', 'config/**'],
	},
];
