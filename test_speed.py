"""SignBridge 测速测试"""
import time
from playwright.sync_api import sync_playwright

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--use-gl=swiftshader"])
        page = browser.new_page()

        print("=" * 50)
        print("SignBridge 手势识别测速")
        print("=" * 50)

        # 1. 页面加载测速
        t0 = time.time()
        page.goto("http://localhost:5173/sign-to-text", wait_until="domcontentloaded")
        dom_time = time.time() - t0
        print(f"\n1. DOM 加载: {dom_time:.3f}s")

        # 2. 模型加载测速（关键指标）
        t1 = time.time()
        page.wait_for_selector("text=启动识别", timeout=30000)
        model_time = time.time() - t1
        print(f"2. MediaPipe 模型加载: {model_time:.3f}s")
        print(f"   对比改进前 LSTM 80s 训练: 提速 {80/model_time:.1f}x")

        # 3. 识别速度测速（直接调用识别器）
        result = page.evaluate("""
            async () => {
                const { GestureRecognizer, FilesetResolver } = await import(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs'
                );
                const vision = await FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
                );

                // 测量模型二次加载（缓存）
                const t0 = performance.now();
                const recognizer = await GestureRecognizer.createFromModelPath(
                    vision,
                    'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'
                );
                const cachedLoad = performance.now() - t0;

                // 加载测试图片
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = '/test-images/open_palm.jpg';
                await new Promise((r, e) => { img.onload = r; img.onerror = e; });

                // 测量单帧识别速度（取5次平均）
                const times = [];
                for (let i = 0; i < 5; i++) {
                    const t = performance.now();
                    recognizer.recognize(img);
                    times.push(performance.now() - t);
                }
                const avg = times.reduce((a,b) => a+b, 0) / times.length;
                const min = Math.min(...times);
                const max = Math.max(...times);

                recognizer.close();
                return { cachedLoad, avg, min, max, fps: 1000/avg };
            }
        """)

        print(f"\n3. 模型二次加载（缓存）: {result['cachedLoad']:.0f}ms")
        print(f"4. 单帧识别速度（5次平均）:")
        print(f"   平均: {result['avg']:.1f}ms")
        print(f"   最快: {result['min']:.1f}ms")
        print(f"   最慢: {result['max']:.1f}ms")
        print(f"   理论帧率: {result['fps']:.0f} fps")

        # 4. 视频帧模式测速
        video_result = page.evaluate("""
            async () => {
                const { GestureRecognizer, FilesetResolver } = await import(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs'
                );
                const vision = await FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
                );
                const recognizer = await GestureRecognizer.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
                    },
                    runningMode: 'VIDEO',
                    numHands: 1,
                });

                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = '/test-images/open_palm.jpg';
                await new Promise((r, e) => { img.onload = r; img.onerror = e; });

                const canvas = document.createElement('canvas');
                canvas.width = 640; canvas.height = 480;
                canvas.getContext('2d').drawImage(img, 0, 0, 640, 480);

                const times = [];
                for (let i = 0; i < 10; i++) {
                    const t = performance.now();
                    recognizer.recognizeForVideo(canvas, performance.now());
                    times.push(performance.now() - t);
                }
                recognizer.close();
                const avg = times.reduce((a,b) => a+b, 0) / times.length;
                return { avg, min: Math.min(...times), max: Math.max(...times), fps: 1000/avg };
            }
        """)

        print(f"\n5. 视频帧模式识别速度（10次平均，模拟实时摄像头）:")
        print(f"   平均: {video_result['avg']:.1f}ms")
        print(f"   最快: {video_result['min']:.1f}ms")
        print(f"   最慢: {video_result['max']:.1f}ms")
        print(f"   理论帧率: {video_result['fps']:.0f} fps")

        page.screenshot(path="/workspace/test-speed.png", full_page=True)

        print("\n" + "=" * 50)
        print("测速总结")
        print("=" * 50)
        print(f"  页面 DOM 加载:    {dom_time:.3f}s")
        print(f"  模型首次加载:     {model_time:.3f}s (改进前 80s)")
        print(f"  模型缓存加载:     {result['cachedLoad']:.0f}ms")
        print(f"  单帧识别(图片):   {result['avg']:.1f}ms ({result['fps']:.0f} fps)")
        print(f"  单帧识别(视频):   {video_result['avg']:.1f}ms ({video_result['fps']:.0f} fps)")
        print(f"  截图: /workspace/test-speed.png")
        print("=" * 50)

        browser.close()

if __name__ == "__main__":
    test()
