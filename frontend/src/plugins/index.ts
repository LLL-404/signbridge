/**
 * @file plugins/index.ts
 * @description 插件注册中心 —— 将 4 个功能页面注册为内核插件
 *
 * 设计目标：
 *   - 让微内核架构名副其实：路由和菜单由插件贡献，而非静态硬编码
 *   - 每个插件声明自己的路由（懒加载组件）+ 菜单项 + 是否默认激活
 *   - App 启动时调用 registerPlugins() + activateDefaultPlugins()
 *   - Sidebar / routes 从 pluginManager 读取贡献项
 *
 * 插件清单：
 *   - voice-to-sign  语音转手语（默认激活）
 *   - sign-to-text   手语识别（默认激活）
 *   - dialogue       双向对话（默认激活）
 *   - learning       手语学习（默认激活）
 *
 * 扩展点：未来新增功能只需在此处新增一个插件定义，无需改 routes.tsx / Sidebar.tsx
 */

import type { ComponentType } from 'react';
import { pluginManager } from '@/kernel';
import type { Plugin, PluginFactory } from '@/kernel';

/**
 * 将 named export 包装为 React.lazy 兼容的 { default } 形式
 * 解决页面组件使用 `export function XxxPage` 而非 `export default` 的兼容问题
 */
function lazyPage<T extends ComponentType<unknown>>(
  loader: () => Promise<{ [K: string]: T }>,
  exportName: string,
): () => Promise<{ default: T }> {
  return async () => {
    const mod = await loader();
    return { default: mod[exportName] };
  };
}

/** 语音转手语插件 */
const voiceToSignPlugin: Plugin = {
  manifest: {
    name: 'voice-to-sign',
    version: '1.0.0',
    displayName: '语音转手语',
    routes: [
      {
        path: 'voice-to-sign',
        component: lazyPage(() => import('@/pages/VoiceToSignPage'), 'VoiceToSignPage'),
        label: '语音转手语',
        icon: '🗣️',
      },
    ],
    menuItems: [
      { id: 'voice-to-sign', label: '语音转手语', icon: '🗣️', route: '/voice-to-sign', order: 10 },
    ],
    activeByDefault: true,
  },
  async install() {
    /* 仅注册路由/菜单，由 manifest 声明，install 无额外操作 */
  },
  async activate() {
    /* 语音转手语页面无重资源需在激活期加载，React.lazy 已处理 */
  },
};

/** 手语识别插件 */
const signToTextPlugin: Plugin = {
  manifest: {
    name: 'sign-to-text',
    version: '1.0.0',
    displayName: '手语识别',
    routes: [
      {
        path: 'sign-to-text',
        component: lazyPage(() => import('@/pages/SignToTextPage'), 'SignToTextPage'),
        label: '手语识别',
        icon: '✋',
      },
    ],
    menuItems: [
      { id: 'sign-to-text', label: '手语识别', icon: '✋', route: '/sign-to-text', order: 20 },
    ],
    activeByDefault: true,
  },
  async install() {},
  async activate() {},
};

/** 双向对话插件 */
const dialoguePlugin: Plugin = {
  manifest: {
    name: 'dialogue',
    version: '1.0.0',
    displayName: '双向对话',
    routes: [
      {
        path: 'dialogue',
        component: lazyPage(() => import('@/pages/DialoguePage'), 'DialoguePage'),
        label: '双向对话',
        icon: '🔄',
      },
    ],
    menuItems: [{ id: 'dialogue', label: '双向对话', icon: '🔄', route: '/dialogue', order: 30 }],
    activeByDefault: true,
  },
  async install() {},
  async activate() {},
};

/** 手语学习插件 */
const learningPlugin: Plugin = {
  manifest: {
    name: 'learning',
    version: '1.0.0',
    displayName: '手语学习',
    routes: [
      {
        path: 'learning',
        component: lazyPage(() => import('@/pages/LearningPage'), 'LearningPage'),
        label: '手语学习',
        icon: '📚',
      },
    ],
    menuItems: [{ id: 'learning', label: '手语学习', icon: '📚', route: '/learning', order: 40 }],
    activeByDefault: true,
  },
  async install() {},
  async activate() {},
};

/** 所有内置插件清单 */
const BUILTIN_PLUGINS: Array<{ name: string; factory: PluginFactory }> = [
  { name: 'voice-to-sign', factory: () => voiceToSignPlugin },
  { name: 'sign-to-text', factory: () => signToTextPlugin },
  { name: 'dialogue', factory: () => dialoguePlugin },
  { name: 'learning', factory: () => learningPlugin },
];

/** 注册所有内置插件（不激活） */
export function registerPlugins(): void {
  for (const { name, factory } of BUILTIN_PLUGINS) {
    pluginManager.register(name, factory);
  }
}

/** 激活所有标记为 activeByDefault 的插件 */
export async function activateDefaultPlugins(): Promise<void> {
  // BUILTIN_PLUGINS 全部 activeByDefault，依次激活
  for (const { name } of BUILTIN_PLUGINS) {
    try {
      await pluginManager.activate(name);
    } catch (err) {
      // 单个插件激活失败不应阻塞其他插件
      console.error(`[plugins] 激活插件 "${name}" 失败:`, err);
    }
  }
}
