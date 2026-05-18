import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'

export default tseslint.config(
  // ===== 全局忽略 =====
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      'resources/**',
      'types/**',
      'ZTools/**',
      '.electron-vite/**',
      '**/*.mjs',
    ]
  },

  // ===== 基础规则（所有文件，无需类型信息） =====
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  ...pluginVue.configs['flat/recommended'],

  // ===== 公共规则（无需类型信息） =====
  {
    rules: {
      // ── 代码质量 ──
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/consistent-generic-constructors': ['error', 'constructor'],
      '@typescript-eslint/consistent-indexed-object-style': ['error', 'record'],
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-template-curly-in-string': 'error',
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true }
      ],
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],

      // ── 关掉与 TS 冲突的原生规则 ──
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-unused-expressions': 'off',
    }
  },

  // ===== 需要类型信息的规则（仅 src/ 下文件 + electron.vite.config） =====
  {
    files: ['src/**/*.ts', 'src/**/*.vue', 'electron.vite.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      }
    },
    rules: {
      // ── Promise 规范（杜绝忘记 await）── 全 error ──
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } }
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],

      // ── Promise 建议 ──
      '@typescript-eslint/promise-function-async': 'warn',
      '@typescript-eslint/require-await': 'warn',

      // ── 类型安全 ──
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-readonly': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-confusing-void-expression': [
        'warn',
        { ignoreArrowShorthand: true }
      ],
    }
  },

  // ===== Vue 文件 =====
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      }
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      // 关闭与现有代码风格冲突的格式化规则
      'vue/max-attributes-per-line': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-indent': 'off',
      'vue/html-self-closing': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/attributes-order': 'off',
      'vue/no-v-html': 'off',
      'vue/require-default-prop': 'off',
      'vue/no-v-text-v-html-on-component': 'off',
    }
  },

  // ===== 配置文件 =====
  {
    files: ['electron.vite.config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    }
  },

  // ===== 插件文件（允许 require()、空接口方法、无 await 的 async） =====
  {
    files: ['src/main/plugins/**/*.ts', 'src/main/plugin-host.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
    }
  },

  // ===== 日志文件（允许 console） =====
  {
    files: ['src/renderer/src/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    }
  },

  // ===== IPC handlers（handle() 签名要求返回 Promise，允许 async 无 await） =====
  {
    files: ['src/main/ipc-handlers.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    }
  }
)
