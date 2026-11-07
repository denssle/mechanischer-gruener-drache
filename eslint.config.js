import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                project: './tsconfig.typecheck.json',
            },
        },
    },
    {
        files: ['**/*.test.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
    {
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
            // Die .catch()-Regel aus der CLAUDE.md: eine unbehandelte Rejection killt den ganzen
            // Prozess. Bewusst nur diese zwei typgeprüften Regeln, nicht das volle Set, damit Lint
            // der billigste Schritt im Gate bleibt und nur meldet, was wirklich gefährlich ist.
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
        }
    }
);
