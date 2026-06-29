"""架构升级后测速对比"""
import time
from playwright.sync_api import sync_playwright

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--use-gl=swiftshader"])
        page = browser.new_page()

        # 收集所有网络请求，统计资源加载
        resources = []
        page.on("response", lambda res: resources.append({
            'url': res.url,
            'status': res.status,
            'size': res.headers.get('content-length', '?'),
        }))

        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_logs.append(f"[PAGEERROR] {err}"))

        print("=" * 55)
        print("架构升级后测速（插件化 + Worker + JSON 手势库）")
        print("=" * 55)

        # 1. 首屏加载测速
        t0 = time.time()
        page.goto("http://localhost:5173/", wait_until="domcontentloaded")
        dom_time = time.time() - t0
        print(f"\n1. 首屏 DOM 加载: {dom_time:.3f}s")

        # 等待 networkidle
        page.wait_for_load_state("networkidle")
        network_time = time.time() - t0
        print(f"   首屏网络完成: {network_time:.3f}s")

        # 2. 统计首屏加载的资源
        first_screen_resources = [r for r in resources if 'localhost' in r['url'] or 'cdn' in r['url']]
        total_size = 0
        for r in first_screen_resources:
            try:
                size = int(r['size']) if r['size'] != '?' else 0
                total_size += size
            except:
                pass
        print(f"   首屏资源数: {len(first_screen_resources)}")
        print(f"   首屏总大小: {total_size/1024:.0f}KB")

        # 3. 导航到识别页
        t1 = time.time()
        page.goto("http://localhost:5173/sign-to-text", wait_until="domcontentloaded")
        sign_dom_time = time.time() - t1
        print(f"\n2. 识别页 DOM 加载: {sign_dom_time:.3f}s")

        # 4. 等待模型加载（Worker 或降级）
        t2 = time.time()
        try:
            page.wait_for_selector("text=启动识别", timeout=30000)
            model_time = time.time() - t2
            print(f"3. 模型加载（Worker）: {model_time:.3f}s")
        except:
            model_time = time.time() - t2
            print(f"3. 模型加载超时: {model_time:.3f}s")

        # 5. 验证手势列表
        gesture_count = page.locator(".rounded-full").count()
        print(f"4. 支持手势数: {gesture_count} 种")

        # 6. 检查 Worker 是否启用
        worker_enabled = any('Worker' in log or 'worker' in log.lower() for log in console_logs)
        fallback = any('降级' in log for log in console_logs)
        if fallback:
            print(f"   ⚠️ Worker 不可用，已降级到主线程识别")
        elif worker_enabled:
            print(f"   ✅ Worker 识别器已启用")
        else:
            print(f"   ℹ️ Worker 状态未知（可能已静默启用）")

        # 7. 截图
        page.screenshot(path="/workspace/test-arch-upgrade.png", full_page=True)

        # 8. 识别速度测试（如果 Worker 启用）
        speed_result = page.evaluate("""
            async () => {
                // 测试 ImageBitmap 创建速度（Worker 模式的关键路径）
                const canvas = document.createElement('canvas');
                canvas.width = 640; canvas.height = 480;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, 640, 480);

                const times = [];
                for (let i = 0; i < 10; i++) {
                    const t = performance.now();
                    await createImageBitmap(canvas);
                    times.push(performance.now() - t);
                }
                const avg = times.reduce((a,b) => a+b, 0) / times.length;
                return { avg, min: Math.min(...times), max: Math.max(...times) };
            }
        """)
        print(f"\n5. ImageBitmap 创建速度（Worker 传输）:")
        print(f"   平均: {speed_result['avg']:.1f}ms")
        print(f"   最快: {speed_result['min']:.1f}ms")
        print(f"   最慢: {speed_result['max']:.1f}ms")

        # 9. 输出关键控制台日志
        print("\n6. 关键控制台日志:")
        for log in console_logs:
            if any(k in log for k in ['Worker', 'worker', '降级', 'error', 'PAGEERROR', 'ready']):
                print(f"   {log}")

        print("\n" + "=" * 55)
        print("架构升级总结")
        print("=" * 55)
        print(f"  首屏 DOM 加载:     {dom_time:.3f}s")
        print(f"  首屏网络完成:      {network_time:.3f}s")
        print(f"  首屏资源大小:      {total_size/1024:.0f}KB")
        print(f"  识别页 DOM 加载:   {sign_dom_time:.3f}s")
        print(f"  模型加载:          {model_time:.3f}s")
        print(f"  支持手势数:        {gesture_count} 种")
        print(f"  ImageBitmap 创建:  {speed_result['avg']:.1f}ms")
        print(f"  截图: /workspace/test-arch-upgrade.png")
        print("=" * 55)

        browser.close()

if __name__ == "__main__":
    test()
