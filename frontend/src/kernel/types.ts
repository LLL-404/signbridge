/**
 * 插件系统类型定义
 * 定义插件接口、清单、内核 API
 */

import type { ComponentType } from 'react';
import type { StateCreator } from 'zustand';

/** 路由配置 */
export interface RouteConfig {
  path: string;
  component: () => Promise<{ default: ComponentType<unknown> }>;
  label?: string;
  icon?: string;
}

/** 菜单项配置 */
export interface MenuConfig {
  id: string;
  label: string;
  icon?: string;
  route: string;
  order?: number;
}

/** 插件清单 */
export interface PluginManifest {
  /** 插件唯一标识 */
  name: string;
  /** 版本号 */
  version: string;
  /** 显示名称 */
  displayName?: string;
  /** 贡献的路由 */
  routes?: RouteConfig[];
  /** 贡献的菜单项 */
  menuItems?: MenuConfig[];
  /** 依赖的其他插件（激活前自动加载） */
  dependencies?: string[];
  /** 是否默认激活（首屏就需要） */
  activeByDefault?: boolean;
}

/** 内核暴露给插件的 API */
export interface KernelAPI {
  /** 注册 Zustand store */
  registerStore: <T>(name: string, store: StateCreator<T>) => void;
  /** 获取已注册的 store */
  getStore: <T>(name: string) => T | null;
  /** 注册路由 */
  registerRoute: (route: RouteConfig) => void;
  /** 注册菜单项 */
  registerMenuItem: (item: MenuConfig) => void;
  /** 事件总线：订阅 */
  on: (event: string, handler: EventHandler) => void;
  /** 事件总线：取消订阅 */
  off: (event: string, handler: EventHandler) => void;
  /** 事件总线：发布 */
  emit: (event: string, payload?: unknown) => void;
  /** 获取已激活的插件实例 */
  getPlugin: <T>(name: string) => T | null;
  /** 获取内核信息 */
  getInfo: () => { version: string; activePlugins: string[] };
}

/** 插件上下文（激活时传入） */
export interface PluginContext {
  api: KernelAPI;
  manifest: PluginManifest;
}

/** 事件处理器 */
export type EventHandler = (payload?: unknown) => void;

/** 插件接口 */
export interface Plugin {
  /** 插件清单 */
  manifest: PluginManifest;
  /** 安装：注册 store、路由、菜单等（不加载重资源） */
  install(api: KernelAPI): Promise<void>;
  /** 激活：加载资源、启动服务 */
  activate(context: PluginContext): Promise<void>;
  /** 停用：释放资源 */
  deactivate?(): void;
}

/** 插件工厂函数类型 */
export type PluginFactory = () => Plugin | Promise<Plugin>;
