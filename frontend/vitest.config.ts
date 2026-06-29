/**
 * @file vitest.config.ts
 * @description Vitest 测试框架配置
 *
 * 配置要点：
 *   - environment: jsdom —— 提供 DOM API（document/window），支持组件测试
 *   - globals: true —— 全局注入 describe/it/expect，无需手动 import
 *   - setupFiles: 测试启动脚本，可扩展 mock、polyfill
 *   - coverage: v8 引擎，阈值 50%（先建立基线，后续逐步提高）
 *
 * 参考：https://vitest.dev/config/
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/modules/**/*.ts'],
      exclude: ['src/modules/**/*.worker.ts', 'src/**/*.test.ts'],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
  },
});
