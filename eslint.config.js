import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
export default ts.config({ ignores: ['dist/**','dist-server/**','node_modules/**','.data/**','artifacts/**','test-results/**','playwright-report/**'] }, js.configs.recommended, ...ts.configs.recommended, { files: ['desktop/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } }, { languageOptions: { globals: { ...globals.node, ...globals.browser } }, rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}] } });
