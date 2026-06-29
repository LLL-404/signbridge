/**
 * 插件管理器
 * 负责插件的注册、加载、激活、停用
 * 核心职责：按需懒加载插件，管理插件生命周期
 */

import type { StateCreator } from 'zustand';
import type {
  Plugin,
  PluginFactory,
  PluginManifest,
  PluginContext,
  KernelAPI,
  RouteConfig,
  MenuConfig,
  EventHandler,
} from './types';
import { eventBus } from './EventBus';

/** 内核版本 */
const KERNEL_VERSION = '1.0.0';

class PluginManager {
  /** 已注册的插件工厂（未实例化） */
  private factories = new Map<string, PluginFactory>();
  /** 已实例化的插件 */
  private plugins = new Map<string, Plugin>();
  /** 已激活的插件 */
  private activePlugins = new Set<string>();
  /** 已注册的 store */
  private stores = new Map<string, unknown>();
  /** 已注册的路由 */
  private routes: RouteConfig[] = [];
  /** 已注册的菜单项 */
  private menuItems: MenuConfig[] = [];
  /** 激活中的插件（防止重复激活） */
  private activating = new Set<string>();

  /** 内核 API（暴露给插件） */
  private api: KernelAPI = {
    registerStore: <T>(name: string, store: StateCreator<T>) => {
      this.stores.set(name, store);
    },
    getStore: <T>(name: string): T | null => {
      return (this.stores.get(name) as T) ?? null;
    },
    registerRoute: (route: RouteConfig) => {
      this.routes.push(route);
    },
    registerMenuItem: (item: MenuConfig) => {
      this.menuItems.push(item);
    },
    on: (event: string, handler: EventHandler) => eventBus.on(event, handler),
    off: (event: string, handler: EventHandler) => eventBus.off(event, handler),
    emit: (event: string, payload?: unknown) => eventBus.emit(event, payload),
    getPlugin: <T>(name: string): T | null => {
      return (this.plugins.get(name) as unknown as T) ?? null;
    },
    getInfo: () => ({
      version: KERNEL_VERSION,
      activePlugins: Array.from(this.activePlugins),
    }),
  };

  /** 注册插件工厂（不实例化） */
  register(name: string, factory: PluginFactory): void {
    if (this.factories.has(name)) {
      console.warn(`[PluginManager] 插件 "${name}" 已注册，跳过`);
      return;
    }
    this.factories.set(name, factory);
  }

  /** 安装并激活插件（含依赖） */
  async activate(name: string): Promise<void> {
    if (this.activePlugins.has(name)) return;
    if (this.activating.has(name)) {
      // 等待正在进行的激活
      while (this.activating.has(name)) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return;
    }

    this.activating.add(name);

    try {
      // 实例化插件（如果尚未实例化）
      let plugin = this.plugins.get(name);
      if (!plugin) {
        const factory = this.factories.get(name);
        if (!factory) {
          throw new Error(`插件 "${name}" 未注册`);
        }
        plugin = await factory();
        this.plugins.set(name, plugin);
      }

      // 先激活依赖
      const deps = plugin.manifest.dependencies ?? [];
      for (const dep of deps) {
        await this.activate(dep);
      }

      // 安装（注册 store/路由/菜单）
      await plugin.install(this.api);

      // 自动注册 manifest 中声明的路由和菜单项
      // 这样插件只需在 manifest 声明，无需在 install() 中手动调用 api.register*
      for (const route of plugin.manifest.routes ?? []) {
        this.routes.push(route);
      }
      for (const item of plugin.manifest.menuItems ?? []) {
        this.menuItems.push(item);
      }

      // 激活
      const context: PluginContext = {
        api: this.api,
        manifest: plugin.manifest,
      };
      await plugin.activate(context);

      this.activePlugins.add(name);
      eventBus.emit('plugin:activated', { name });
    } catch (err) {
      console.error(`[PluginManager] 激活插件 "${name}" 失败:`, err);
      throw err;
    } finally {
      this.activating.delete(name);
    }
  }

  /** 停用插件 */
  async deactivate(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin || !this.activePlugins.has(name)) return;

    // 检查是否有其他插件依赖它
    for (const [otherName, other] of this.plugins) {
      if (otherName === name) continue;
      if (this.activePlugins.has(otherName)) {
        const deps = other.manifest.dependencies ?? [];
        if (deps.includes(name)) {
          console.warn(`[PluginManager] 无法停用 "${name}"，被 "${otherName}" 依赖`);
          return;
        }
      }
    }

    await plugin.deactivate?.();
    this.activePlugins.delete(name);
    eventBus.emit('plugin:deactivated', { name });
  }

  /** 获取已注册的路由 */
  getRoutes(): RouteConfig[] {
    return [...this.routes];
  }

  /** 获取已注册的菜单项（按 order 排序） */
  getMenuItems(): MenuConfig[] {
    return [...this.menuItems].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  /** 获取已激活的插件列表 */
  getActivePlugins(): string[] {
    return Array.from(this.activePlugins);
  }

  /** 获取插件清单 */
  getManifest(name: string): PluginManifest | null {
    return this.plugins.get(name)?.manifest ?? null;
  }
}

/** 全局插件管理器单例 */
export const pluginManager = new PluginManager();
