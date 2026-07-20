/**
 * @file plugins/index.ts
 * @description 插件注册中心 —— 将功能页面注册为内核插件
 * 路由和菜单由插件贡献，App 启动时调用 registerPlugins() + activateDefaultPlugins()
 * 扩展点：新增功能只需新增一个 createPagePlugin 调用
 */

import type { ComponentType } from 'react';
import { pluginManager } from '@/kernel';
import type { Plugin, PluginFactory } from '@/kernel';
import { logger } from '@/modules/debug/logger';

const log = logger.module('Plugins');

/**
 * 页面插件工厂：封装路由 + 菜单 + 空实现的标准结构
 * install/activate 留空：路由和菜单由 manifest 声明，内核自动注册
 */
function createPagePlugin<T extends ComponentType<unknown>>(opts: {
  name: string;
  label: string;
  icon: string;
  order: number;
  loader: () => Promise<{ [K: string]: T }>;
  exportName: string;
}): Plugin {
  // 将 named export 包装为 React.lazy 兼容的 { default } 形式
  const component = async () => {
    const mod = await opts.loader();
    return { default: mod[opts.exportName] };
  };
  return {
    manifest: {
      name: opts.name,
      version: '1.0.0',
      displayName: opts.label,
      routes: [{ path: opts.name, component, label: opts.label, icon: opts.icon }],
      menuItems: [{ id: opts.name, label: opts.label, icon: opts.icon, route: `/${opts.name}`, order: opts.order }],
      activeByDefault: true,
    },
    async install() {},
    async activate() {},
  };
}

/** 所有内置页面插件 */
const pagePlugins: Plugin[] = [
  createPagePlugin({ name: 'voice-to-sign', label: '语音转手语', icon: '🗣️', order: 10,
    loader: () => import('@/pages/VoiceToSignPage'), exportName: 'VoiceToSignPage' }),
  createPagePlugin({ name: 'sign-to-text', label: '手语识别', icon: '✋', order: 20,
    loader: () => import('@/pages/SignToTextPage'), exportName: 'SignToTextPage' }),
  createPagePlugin({ name: 'dialogue', label: '双向对话', icon: '🔄', order: 30,
    loader: () => import('@/pages/DialoguePage'), exportName: 'DialoguePage' }),
  createPagePlugin({ name: 'learning', label: '手语学习', icon: '📚', order: 40,
    loader: () => import('@/pages/LearningPage'), exportName: 'LearningPage' }),
];

const BUILTIN_PLUGINS: Array<{ name: string; factory: PluginFactory }> = pagePlugins.map((p) => ({
  name: p.manifest.name,
  factory: () => p,
}));

/** 注册所有内置插件（不激活） */
export function registerPlugins(): void {
  for (const { name, factory } of BUILTIN_PLUGINS) {
    pluginManager.register(name, factory);
  }
}

/** 激活所有标记为 activeByDefault 的插件 */
export async function activateDefaultPlugins(): Promise<void> {
  for (const { name } of BUILTIN_PLUGINS) {
    try {
      await pluginManager.activate(name);
    } catch (err) {
      // 单个插件激活失败不应阻塞其他插件
      log.error(`激活插件 "${name}" 失败`, err);
    }
  }
}
