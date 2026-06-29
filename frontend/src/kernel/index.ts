/**
 * 内核入口
 * 导出插件管理器、事件总线、类型
 */

export { pluginManager } from './PluginManager';
export { eventBus } from './EventBus';
export type {
  Plugin,
  PluginFactory,
  PluginManifest,
  PluginContext,
  KernelAPI,
  RouteConfig,
  MenuConfig,
} from './types';
