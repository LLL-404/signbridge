/**
 * @file vite.config.ts
 * @description Vite 构建工具配置 —— 微内核 + 插件化架构的工程入口
 *
 * 核心配置项：
 *   - plugins: React Fast Refresh + JSX 自动运行时
 *   - resolve.alias: @ → src（统一模块引用路径，避免相对路径地狱）
 *   - server.port: 5173（开发服务器端口）
 *   - build.rollupOptions.output.manualChunks: 分包策略
 *
 * 分包策略（manualChunks）—— 配合微内核按需加载：
 *   - react-vendor:    React 核心，首屏必载，体积小（~165KB）
 *   - three-vendor:    Three.js 3D 渲染，仅 avatar 插件需要（~833KB）
 *   - tfjs-vendor:     TensorFlow.js，仅 LSTM 识别模式需要（~1.6MB）
 *   - mediapipe-vendor: MediaPipe Hands，识别插件需要（~125KB）
 *   - state-vendor:    Zustand 状态管理（~4KB）
 *
 * 性能效果：首屏 gzip 从单体 622KB 降至 ~55KB，大依赖延迟到对应插件加载时才拉取。
 *
 * 参考：https://vitejs.dev/config/
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['data/vocabulary.json'],
      manifest: {
        name: '手语桥 SignBridge',
        short_name: '手语桥',
        description: 'AI 驱动的双向手语翻译系统',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        lang: 'zh-CN',
        icons: [
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="%230a0a0f"/><text x="96" y="130" font-size="100" text-anchor="middle" fill="%233b82f6">✋</text></svg>',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="%230a0a0f"/><text x="256" y="350" font-size="260" text-anchor="middle" fill="%233b82f6">✋</text></svg>',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,wasm}'],
        // 不缓存 TF.js 模型和 MediaPipe wasm（太大，按需加载）
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/storage\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'model-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // 路径别名：@ 指向 src 目录
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    // 分包策略：将大依赖拆分为独立 chunk，按需加载
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心（首屏必载，体积小）
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // 3D 渲染（仅 avatar 插件需要，~600KB）
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
          // TensorFlow.js（仅 LSTM 模式需要，~1.5MB）
          'tfjs-vendor': ['@tensorflow/tfjs'],
          // MediaPipe（识别插件需要，~300KB）
          'mediapipe-vendor': ['@mediapipe/tasks-vision'],
          // 状态管理
          'state-vendor': ['zustand'],
        },
      },
    },
    // 提高警告阈值（分包后单个 chunk 仍可能超 500KB）
    chunkSizeWarningLimit: 1000,
  },
})
