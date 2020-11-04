module.exports = {
	root: true,
	env: {
		node: true,
		commonjs: true,
	},
	extends: [
		'eslint:recommended',
		'plugin:vue/vue3-essential',
		'@vue/typescript/recommended',
		'@vue/prettier',
		'@vue/prettier/@typescript-eslint',
		'plugin:import/typescript',
	],
	parserOptions: {
		ecmaVersion: 2020,
	},
	plugins: ['simple-import-sort', 'unused-imports'],
	rules: {
		'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
		'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/no-use-before-define': 'off',
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'simple-import-sort/sort': 'error',
		'unused-imports/no-unused-imports-ts': 'error',
	},
}
