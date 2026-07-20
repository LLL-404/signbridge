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
 * 分包策略（manualChunks）—— 配合微内核按需加载，按依赖体积与加载时机细分：
 *   - react-vendor:     React 核心，首屏必载，体积小
 *   - three-core:       Three.js 核心库（three/build），avatar 插件需要
 *   - three-examples:   Three.js 附加模块（GLTFLoader/FBXLoader 等，大文件）
 *   - three-vrm:        @pixiv/three-vrm，VRM 模型加载
 *   - react-three:      @react-three/fiber + @react-three/drei
 *   - tfjs-core:        @tensorflow/tfjs-core
 *   - tfjs-backend:     @tensorflow/tfjs-backend-webgl（识别模式需要）
 *   - tfjs-converter:   @tensorflow/tfjs-converter（模型格式转换）
 *   - tfjs-other:       其他 @tensorflow/* 子包
 *   - mediapipe-vendor: MediaPipe Hands，识别插件需要
 *   - state-vendor:     Zustand 状态管理
 *   业务模块不再手动分包，由 Vite 默认按路由自动拆分。
 *
 * 性能效果：首屏 gzip 从单体 622KB 降至 ~55KB，大依赖延迟到对应插件加载时才拉取。
 *
 * 参考：https://vitejs.dev/config/
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'node:path'

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/signbridge/' : '/',
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      // 开发环境不启用 PWA，避免 Service Worker 与 HMR 冲突
      devOptions: { enabled: false },
      manifest: {
        name: '手语桥 SignBridge',
        short_name: '手语桥',
        description: 'AI 驱动的双向手语翻译系统',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        scope: process.env.GITHUB_PAGES ? '/signbridge/' : '/',
        start_url: process.env.GITHUB_PAGES ? '/signbridge/' : '/',
        lang: 'zh-CN',
        // 图标：PNG（兼容性更好）+ SVG（矢量缩放）双轨配置
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="%230a0a0f"/><text x="96" y="130" font-size="100" text-anchor="middle" fill="%233b82f6">✋</text></svg>',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="%230a0a0f"/><text x="256" y="350" font-size="260" text-anchor="middle" fill="%233b82f6">✋</text></svg>',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // 预缓存资源类型：仅核心静态资源，png/svg/wasm 由 runtimeCaching 按需拉取
        // 移除 wasm：tfjs-backend-webgl 的 wasm 文件较大且仅在识别功能激活时需要
        globPatterns: ['**/*.{js,css,html,ico,woff2}'],
        globIgnores: ['**/data/vocabulary.json', '**/models/*.vrm', '**/pwa-*.png'],
        // 单文件预缓存上限 2MB，避免大文件拖慢首次访问
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: process.env.GITHUB_PAGES ? '/signbridge/index.html' : '/index.html',
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
          {
            // VRM 模型文件：大文件且不常变更，使用 CacheFirst 离线优先
            urlPattern: /\.(?:vrm)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'vrm-model-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 词汇 JSON：使用 NetworkFirst 保证数据新鲜度的同时支持离线降级
            urlPattern: /^.*\/data\/vocabulary\.json$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'vocabulary-cache',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 7 },
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
  // tfjs-node 是 Node.js 原生模块（含 C++ 绑定），仅训练脚本使用
  // 必须排除在浏览器构建之外：dev 服务器不预打包，生产构建不引入
  optimizeDeps: {
    exclude: ['@tensorflow/tfjs-node'],
    // 显式预构建重量级依赖，避免首次访问页面时触发 "new dependencies optimized, reloading"
    // three: VoiceToSignPage → AvatarDriver 同步链直接引入（7 个文件 import * as THREE）
    // @pixiv/three-vrm / @react-three/fiber / @react-three/drei: Avatar3D lazy 加载需要，预构建消除首次 3D 渲染卡顿
    include: [
      'three',
      '@pixiv/three-vrm',
      '@react-three/fiber',
      '@react-three/drei',
    ],
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // react-vendor: React 核心，首屏必载
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router')) {
            return 'react-vendor'
          }
          // 以下 three 相关分包：必须先匹配 @react-three 与 @pixiv/three-vrm，再匹配 three/build 与 three/examples，最后兜底 three
          if (id.includes('node_modules/@react-three/fiber') || id.includes('node_modules/@react-three/drei')) {
            return 'react-three'
          }
          if (id.includes('node_modules/@pixiv/three-vrm')) {
            return 'three-vrm'
          }
          if (id.includes('node_modules/three/build/')) {
            return 'three-core'
          }
          if (id.includes('node_modules/three/examples/jsm')) {
            return 'three-examples'
          }
          // 以下 tfjs 相关分包：必须先匹配具体子包，再用 @tensorflow 通配兜底
          if (id.includes('node_modules/@tensorflow/tfjs-core')) {
            return 'tfjs-core'
          }
          if (id.includes('node_modules/@tensorflow/tfjs-backend-webgl')) {
            return 'tfjs-backend'
          }
          if (id.includes('node_modules/@tensorflow/tfjs-converter')) {
            return 'tfjs-converter'
          }
          // meta-package 单独成 chunk，避免其 re-export 与子包运行时依赖形成循环
          // 路径末尾的 / 是关键：只匹配 @tensorflow/tfjs 自身，不误伤 tfjs-core / tfjs-backend-webgl 等子包
          if (id.includes('node_modules/@tensorflow/tfjs/')) {
            return 'tfjs-meta'
          }
          if (id.includes('node_modules/@tensorflow/')) {
            return 'tfjs-other'
          }
          if (id.includes('node_modules/@mediapipe')) {
            return 'mediapipe-vendor'
          }
          if (id.includes('node_modules/zustand')) {
            return 'state-vendor'
          }
          // 业务模块（avatar/recognition/grammar/data/learning）不再手动分包，由 Vite 默认按路由自动拆分
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
