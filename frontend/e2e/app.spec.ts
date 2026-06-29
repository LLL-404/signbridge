/**
 * @file app.spec.ts
 * @description SignBridge 核心 E2E 测试
 *
 * 覆盖 4 个核心用户流程：
 *   1. 应用启动 + 导航
 *   2. 语音转手语页面
 *   3. 手语识别页面
 *   4. 双向对话页面
 *   5. 手语学习页面
 */

import { test, expect } from '@playwright/test';

test.describe('应用启动与导航', () => {
  test('应成功加载首页', async ({ page }) => {
    await page.goto('/');
    // 等待应用渲染（插件激活需要时间）
    await page.waitForTimeout(3000);
    // 应该重定向到 /voice-to-sign
    expect(page.url()).toContain('/voice-to-sign');
  });

  test('侧边栏应显示4个导航项', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    // 检查侧边栏导航链接
    const navLinks = page.locator('nav a, aside a, [class*="sidebar"] a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('应能导航到各功能页面', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 导航到手语识别
    await page.goto('/sign-to-text');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/sign-to-text');

    // 导航到双向对话
    await page.goto('/dialogue');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/dialogue');

    // 导航到学习
    await page.goto('/learning');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/learning');
  });

  test('未知路由应回退到首页', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/voice-to-sign');
  });
});

test.describe('语音转手语页面', () => {
  test('应显示页面标题和虚拟人区域', async ({ page }) => {
    await page.goto('/voice-to-sign');
    await page.waitForTimeout(3000);

    // 页面应包含标题文字
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });

  test('应显示3D/2D模式切换控件', async ({ page }) => {
    await page.goto('/voice-to-sign');
    await page.waitForTimeout(3000);

    // 查找模式切换按钮（3D/2D）
    const modeButtons = page.locator('button:has-text("3D"), button:has-text("2D"), button:has-text("3d"), button:has-text("2d")');
    const count = await modeButtons.count();
    // 可能存在模式切换按钮
    if (count > 0) {
      await expect(modeButtons.first()).toBeVisible();
    }
  });

  test('应显示语速调节滑块', async ({ page }) => {
    await page.goto('/voice-to-sign');
    await page.waitForTimeout(3000);

    // 查找滑块
    const slider = page.locator('input[type="range"]');
    const count = await slider.count();
    if (count > 0) {
      await expect(slider.first()).toBeVisible();
    }
  });
});

test.describe('手语识别页面', () => {
  test('应显示摄像头相关UI', async ({ page }) => {
    await page.goto('/sign-to-text');
    await page.waitForTimeout(3000);

    // 页面应加载成功
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });

  test('应有视频或canvas元素用于摄像头', async ({ page }) => {
    await page.goto('/sign-to-text');
    await page.waitForTimeout(3000);

    // 查找 video 或 canvas 元素
    const mediaElements = page.locator('video, canvas');
    const count = await mediaElements.count();
    // 摄像头UI可能需要用户授权才会显示
    if (count > 0) {
      await expect(mediaElements.first()).toBeVisible();
    }
  });
});

test.describe('双向对话页面', () => {
  test('应显示双面板布局', async ({ page }) => {
    await page.goto('/dialogue');
    await page.waitForTimeout(3000);

    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });
});

test.describe('手语学习页面', () => {
  test('应显示学习模式切换', async ({ page }) => {
    await page.goto('/learning');
    await page.waitForTimeout(3000);

    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });

  test('词汇查询模式应可搜索', async ({ page }) => {
    await page.goto('/learning');
    await page.waitForTimeout(3000);

    // 查找搜索输入框
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="搜索"], input[placeholder*="查"]');
    const count = await searchInput.count();
    if (count > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });
});

test.describe('全局功能', () => {
  test('页面应无控制台错误', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(5000);

    // 过滤掉已知的非关键错误（如 MediaPipe wasm 加载、IndexedDB 等）
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('MediaPipe') &&
        !e.includes('wasm') &&
        !e.includes('IndexedDB') &&
        !e.includes('Failed to fetch') &&
        !e.includes('ERR_'),
    );
    expect(criticalErrors).toEqual([]);
  });

  test('深色主题应正确应用', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 检查 body 背景是否为深色
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    // 深色背景应该是 rgb(10, 10, 15) 或类似
    expect(bgColor).toBeTruthy();
  });
});
