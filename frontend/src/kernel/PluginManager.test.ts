/**
 * @file PluginManager.test.ts
 * @description 微内核插件管理器单元测试
 *
 * 测试覆盖：
 *   - 插件注册与激活
 *   - 重复注册防护
 *   - 激活幂等性
 *   - 依赖解析顺序
 *   - 停用与依赖检查
 *   - 路由与菜单项贡献
 *   - manifest 自动注册
 *
 * 测试隔离策略：
 *   PluginManager 类未导出（仅导出 pluginManager 单例），无法直接 new 实例。
 *   单例内部状态（factories / plugins / routes / menuItems）无法重置，
 *   故采用以下策略保证测试间隔离：
 *   1. 每个测试使用唯一插件名（t1-、t2- 前缀）避免注册冲突；
 *   2. beforeEach 停用所有已激活插件，保证 activePlugins 集合干净；
 *   3. 累积型 routes / menuItems 无法清除，使用唯一路径/ID + 过滤或包含断言验证。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ComponentType } from 'react';
import { pluginManager } from './PluginManager';
import type {
  Plugin,
  PluginManifest,
  PluginContext,
  KernelAPI,
  RouteConfig,
  MenuConfig,
} from './types';

/** 创建 mock 插件及方法 spy */
function makePlugin(manifest: PluginManifest) {
  const install = vi.fn(async (_api: KernelAPI) => {});
  const activate = vi.fn(async (_ctx: PluginContext) => {});
  const deactivate = vi.fn(() => {});
  const plugin: Plugin = { manifest, install, activate, deactivate };
  return { plugin, install, activate, deactivate };
}

/** lazy component 占位（满足 RouteConfig.component 签名） */
function lazyComponent(): RouteConfig['component'] {
  return () => Promise.resolve({ default: (() => null) as ComponentType<unknown> });
}

describe('PluginManager', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // 屏蔽 console 噪音（PluginManager 内部会 warn/error）
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 清理：停用所有已激活插件（循环处理依赖拒绝情况）
    // deactivate 在存在依赖者时会被拒绝，需多轮循环先停用依赖者再停用被依赖者
    let active = pluginManager.getActivePlugins();
    let guard = 0;
    while (active.length > 0 && guard < 20) {
      for (const name of active) {
        await pluginManager.deactivate(name);
      }
      active = pluginManager.getActivePlugins();
      guard++;
    }
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // -------------------------------------------------------------------
  // 1. register + activate
  // -------------------------------------------------------------------
  it('register + activate: 注册插件工厂 → activate → 插件进入 activePlugins', async () => {
    const { plugin } = makePlugin({ name: 't1-basic', version: '1.0.0' });
    pluginManager.register('t1-basic', () => plugin);

    // 激活前不在列表中
    expect(pluginManager.getActivePlugins()).not.toContain('t1-basic');

    await pluginManager.activate('t1-basic');

    // 激活后进入列表
    expect(pluginManager.getActivePlugins()).toContain('t1-basic');
  });

  // -------------------------------------------------------------------
  // 2. 重复注册
  // -------------------------------------------------------------------
  it('重复注册: 同名插件注册两次 → 第二次跳过（warn）', async () => {
    const { plugin: p1 } = makePlugin({ name: 't2-dup', version: '1.0.0' });
    const { plugin: p2 } = makePlugin({ name: 't2-dup', version: '2.0.0' });

    pluginManager.register('t2-dup', () => p1);
    pluginManager.register('t2-dup', () => p2); // 应跳过并 warn

    // 验证 warn 被触发
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('t2-dup'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('已注册'));

    // 验证第一次注册的工厂被保留（版本 1.0.0），而非被第二次覆盖
    await pluginManager.activate('t2-dup');
    expect(pluginManager.getManifest('t2-dup')?.version).toBe('1.0.0');
  });

  // -------------------------------------------------------------------
  // 3. activate 幂等
  // -------------------------------------------------------------------
  it('activate 幂等: 已激活插件再次 activate → 无副作用', async () => {
    const { plugin, install, activate } = makePlugin({ name: 't3-idem', version: '1.0.0' });
    pluginManager.register('t3-idem', () => plugin);

    await pluginManager.activate('t3-idem');
    expect(install).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledTimes(1);

    // 重复激活 —— 不应再次调用 install / activate
    await pluginManager.activate('t3-idem');
    await pluginManager.activate('t3-idem');

    expect(install).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------
  // 4. 依赖管理
  // -------------------------------------------------------------------
  it('依赖管理: 插件A依赖插件B → activate(A) 会先 activate(B)', async () => {
    const { plugin: pB, activate: actB } = makePlugin({ name: 't4-dep-b', version: '1.0.0' });
    const { plugin: pA, activate: actA } = makePlugin({
      name: 't4-dep-a',
      version: '1.0.0',
      dependencies: ['t4-dep-b'],
    });
    pluginManager.register('t4-dep-b', () => pB);
    pluginManager.register('t4-dep-a', () => pA);

    await pluginManager.activate('t4-dep-a');

    // A 和 B 都应被激活
    expect(pluginManager.getActivePlugins()).toContain('t4-dep-a');
    expect(pluginManager.getActivePlugins()).toContain('t4-dep-b');

    // B 的 activate 应先于 A 的 activate 被调用
    expect(actB.mock.invocationCallOrder[0]).toBeLessThan(actA.mock.invocationCallOrder[0]);
  });

  // -------------------------------------------------------------------
  // 5. 停用被依赖的插件
  // -------------------------------------------------------------------
  it('停用被依赖的插件: A依赖B，A激活时 deactivate(B) → 应被拒绝', async () => {
    const { plugin: pB } = makePlugin({ name: 't5-dep-b', version: '1.0.0' });
    const { plugin: pA } = makePlugin({
      name: 't5-dep-a',
      version: '1.0.0',
      dependencies: ['t5-dep-b'],
    });
    pluginManager.register('t5-dep-b', () => pB);
    pluginManager.register('t5-dep-a', () => pA);

    await pluginManager.activate('t5-dep-a');

    // 尝试停用 B —— 应被拒绝（A 依赖它）
    await pluginManager.deactivate('t5-dep-b');

    // B 仍处于激活状态
    expect(pluginManager.getActivePlugins()).toContain('t5-dep-b');
    expect(pluginManager.getActivePlugins()).toContain('t5-dep-a');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('t5-dep-b'));
  });

  // -------------------------------------------------------------------
  // 6. getRoutes
  // -------------------------------------------------------------------
  it('getRoutes: activate 后 getRoutes() 返回 manifest 中声明的路由', async () => {
    const route: RouteConfig = { path: '/t6-route', component: lazyComponent() };
    const { plugin } = makePlugin({ name: 't6-routes', version: '1.0.0', routes: [route] });
    pluginManager.register('t6-routes', () => plugin);

    // 激活前不存在该路由
    expect(pluginManager.getRoutes().filter((r) => r.path === '/t6-route')).toHaveLength(0);

    await pluginManager.activate('t6-routes');

    // 激活后路由被注册
    expect(pluginManager.getRoutes()).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/t6-route' })]),
    );
  });

  // -------------------------------------------------------------------
  // 7. getMenuItems（按 order 排序）
  // -------------------------------------------------------------------
  it('getMenuItems: activate 后 getMenuItems() 按 order 排序', async () => {
    // 故意乱序声明
    const items: MenuConfig[] = [
      { id: 't7-item-3', label: 'C', route: '/t7-c', order: 30 },
      { id: 't7-item-1', label: 'A', route: '/t7-a', order: 10 },
      { id: 't7-item-2', label: 'B', route: '/t7-b', order: 20 },
    ];
    const { plugin } = makePlugin({ name: 't7-menu', version: '1.0.0', menuItems: items });
    pluginManager.register('t7-menu', () => plugin);

    await pluginManager.activate('t7-menu');

    // 过滤出本测试的菜单项，验证按 order 升序排列
    const ourItems = pluginManager.getMenuItems().filter((m) => m.id.startsWith('t7-'));
    expect(ourItems.map((m) => m.id)).toEqual(['t7-item-1', 't7-item-2', 't7-item-3']);
  });

  // -------------------------------------------------------------------
  // 8. getManifest
  // -------------------------------------------------------------------
  it('getManifest: 已实例化插件返回 manifest，未实例化返回 null', async () => {
    const { plugin } = makePlugin({
      name: 't8-manifest',
      version: '1.0.0',
      displayName: 'T8',
    });
    pluginManager.register('t8-manifest', () => plugin);

    // 已注册但未实例化 → null
    expect(pluginManager.getManifest('t8-manifest')).toBeNull();
    // 从未注册 → null
    expect(pluginManager.getManifest('t8-ghost')).toBeNull();

    await pluginManager.activate('t8-manifest');

    // 已实例化 → 返回 manifest
    expect(pluginManager.getManifest('t8-manifest')).toEqual(
      expect.objectContaining({ name: 't8-manifest', version: '1.0.0', displayName: 'T8' }),
    );
  });

  // -------------------------------------------------------------------
  // 9. getActivePlugins
  // -------------------------------------------------------------------
  it('getActivePlugins: 返回已激活列表', async () => {
    const { plugin: p1 } = makePlugin({ name: 't9-a', version: '1.0.0' });
    const { plugin: p2 } = makePlugin({ name: 't9-b', version: '1.0.0' });
    pluginManager.register('t9-a', () => p1);
    pluginManager.register('t9-b', () => p2);

    // beforeEach 已清理，激活前不在列表中
    expect(pluginManager.getActivePlugins()).not.toContain('t9-a');
    expect(pluginManager.getActivePlugins()).not.toContain('t9-b');

    await pluginManager.activate('t9-a');
    await pluginManager.activate('t9-b');

    const active = pluginManager.getActivePlugins();
    expect(active).toContain('t9-a');
    expect(active).toContain('t9-b');
  });

  // -------------------------------------------------------------------
  // 10. 未注册插件 activate
  // -------------------------------------------------------------------
  it('未注册插件 activate: 抛出错误', async () => {
    await expect(pluginManager.activate('t10-ghost')).rejects.toThrow('t10-ghost');
  });

  // -------------------------------------------------------------------
  // 11. 自动注册 manifest routes/menuItems（无需 install 手动调用）
  // -------------------------------------------------------------------
  it('自动注册 manifest routes/menuItems: manifest 中声明的 routes 和 menuItems 被自动注册', async () => {
    const route: RouteConfig = { path: '/t11-auto', component: lazyComponent() };
    const menuItem: MenuConfig = {
      id: 't11-menu',
      label: 'T11',
      route: '/t11-auto',
      order: 42,
    };
    const { plugin, install } = makePlugin({
      name: 't11-auto',
      version: '1.0.0',
      routes: [route],
      menuItems: [menuItem],
    });
    pluginManager.register('t11-auto', () => plugin);

    // makePlugin 的 install 为空函数（vi.fn(async () => {})），
    // 不调用 api.registerRoute / api.registerMenuItem。
    // 若自动注册未生效，getRoutes / getMenuItems 中不会出现 manifest 声明项。
    await pluginManager.activate('t11-auto');

    expect(install).toHaveBeenCalledTimes(1);

    // manifest 中的 routes 应被自动注册
    expect(pluginManager.getRoutes()).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/t11-auto' })]),
    );
    // manifest 中的 menuItems 应被自动注册
    expect(pluginManager.getMenuItems()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 't11-menu' })]),
    );
  });
});
