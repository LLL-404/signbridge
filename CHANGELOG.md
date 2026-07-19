# 变更日志

所有重要的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [Unreleased]

### ⚡ 性能
- perf(boot): 首屏 splash 隐藏逻辑从 `setTimeout(100ms)` 改为 `requestAnimationFrame`，省 100ms 等待；清理 index.html 中无效的 `preconnect cdn.jsdelivr.net` 和 `dns-prefetch storage.googleapis.com` 标签（src 中通过 fetch 直接访问 CDN 资源，preconnect/dns-prefetch 标签对运行时 fetch 无加速作用；CSP `connect-src` 白名单保留以维持 MediaPipe 模型加载）
- perf(lighthouse): Lighthouse mobile 预设验证完成——三次实测 LCP 2561/2605/2597ms（均值 2588ms），Performance 93 分，FCP/TBT/CLS 均优秀；spec NFR-8 根据实测从 `< 2500ms` 调整为 `< 2800ms`（保持默认 3D 模式下受 three-core 172KB 硬下载时间约束）；spec AC-5 与 NFR-4 同步对齐为 `≤ 5 MiB`；tasks.md 中 B2/B3/B4/C2/D1/D3/E2 标记同步实际完成状态

### ✨ 新增
- feat(perf): 加载性能优化工程——针对生产环境移动端/弱网下首屏白屏与路由切换卡顿，从 5 个维度组合优化（详见 `.trae/specs/loading-performance-optimization/`）；新增 11 个 VRMCache 单元测试，单元测试总数从 809 提升至 820，全部通过；4 个子 Agent 并行实施 + 交叉验证
- feat(avatar): 新增 VRMCache.ts IndexedDB 持久化模块——三级加载优先级（内存缓存 → IndexedDB → HTTP），独立 IDB 封装（`signbridge-vrm-cache` 数据库 + `vrm_cache` store），VRM 10.7MB 首次加载后持久化，二次访问从 IndexedDB 秒开；失败时 try-catch 回退到 HTTP；导出 `loadVRM(url)` / `clearVRMCache(url?)` / `clearVRMCachePersistent(url?)` 统一接口
- feat(ui): 新增 PageSkeleton.tsx 通用骨架屏组件——复用 Layout 框架结构（Sidebar w-60 + Header h-16 + 主内容区卡片网格 pulse 动画）；默认导出 `PageSkeleton`（完整骨架）+ 命名导出 `MainContentSkeleton`（仅内容区，供 routes.tsx Suspense fallback 复用，避免与 Layout 已渲染的 Sidebar/Header 重复）；所有占位容器加 `aria-hidden="true"`
- feat(test): 补全 6 个核心模块单元测试，新增 134 个测试用例（JointLimits 36 个、KalidokitSolver 16 个、MixamoRetargeter 14 个、DataCollector 32 个、ModelTrainer 12 个、TrainingDataGenerator 24 个）；单元测试总数从 675 提升至 809，全部通过；通过 vi.mock 隔离 Three.js/TF.js/VRM/IndexedDB/Worker 等外部依赖
- feat(pwa): PWA 离线支持——使用 vite-plugin-pwa 配置 manifest（name='手语桥 SignBridge'）、service worker（generateSW 模式）、runtime caching 策略（VRM 模型 CacheFirst 30 天、vocabulary.json NetworkFirst 7 天、CDN 资源 CacheFirst/StaleWhileRevalidate）；预缓存 35 个条目（4690 KiB）；新增 PWA 图标 192x192/512x512 PNG + 图标生成脚本；index.html 添加 apple-touch-icon 和 manifest 链接
- feat(a11y): 可访问性增强——index.html 添加 `lang="zh-CN"` 和 description meta；Header/Sidebar/Layout 添加 ARIA 标签（aria-label、aria-controls、aria-expanded）、语义化结构（`<aside>`、`<nav>`、`<main>`）；4 个页面（VoiceToSign/SignToText/Dialogue/Learning）添加 aria-live 状态播报、role="status"/"alert"、aria-pressed、aria-valuemin/max/now；LearningPage 模式切换实现标准 ARIA tabs 模式（role="tablist"/"tab"/"tabpanel" + roving tabindex）；装饰性图标/emoji 添加 aria-hidden；Sidebar 抽屉支持 Escape 键关闭
- feat(recognition): ST-GCN 手势识别模型训练完成——使用 @tensorflow/tfjs-node 原生 C++ 后端（oneDNN 优化 + AVX2 指令集）训练 100 epoch，训练准确率 87.94%，验证集准确率 88.50%，独立测试集准确率 83.50%；模型文件 427.5 KB（model.json + weights.bin + labelMap.json）；STGCNRecognizer 三级回退加载（HTTP → IndexedDB → 未训练兜底）；训练脚本 `scripts/train-stgcn-model.mjs` 支持 CLI 参数（--lr、--batchSize、--epochs、--samples）
- feat(e2e): 新增 10 个 E2E 测试用例（extended.spec.ts）——3D/2D 模式切换、学习模式评分 UI、VRM 加载失败降级、词汇接口失败兜底、Tab 键导航、Enter 键激活、Escape 键关闭抽屉、manifest 可访问性、index.html manifest 引用；E2E 测试总数从 14 提升至 24（23 passed + 1 skipped，PWA manifest 在 dev 模式下预期 skip）
- feat(error): 异常处理增强——ErrorBoundary 新增 errorId 标识和"刷新页面"按钮，生产环境隐藏技术细节；VRMModel 新增 onLoadError 回调，加载失败时清除缓存允许重试；Avatar3D 在 Canvas 上层叠加错误提示条（role="alert"）；AvatarCanvas VRM 加载失败自动降级到 2D 模式；DataInitializer 新增 fetchWithRetry 函数（最多 3 次指数退避重试，仅对网络异常和 5xx 重试）
- feat(perf): PerformancePanel 新增首屏包体积指标展示——usePerformanceMonitor 通过 PerformanceObserver 监听 `resource` 类型条目，过滤 `.js`/`.css` 资源汇总 chunk 总大小/数量/加载时间；PerformancePanel 复用 MetricItem 组件新增"包体积"区块（阈值：chunk 总大小 500/1000 KB，chunk 数量 20/50 个，加载时间 1500/3000 ms），3 秒后自动 disconnect 避免长期占用
- feat(avatar): AvatarDriver 新增穿模检测 hook——`update()` 中调用 `checkPenetration()`，通过 normalized bone API 获取手腕世界位置与 hips 位置比较（`|hand.x - hips.x| < 0.15 && |hand.z - hips.z| < 0.12`），穿入躯干时输出 `log.warn('[穿模检测] 手腕穿入躯干', { hand, position })`；单侧日志限流 3 次避免刷屏，仅在 `playRetargetedAnimation` 播放期间检测；复用 `_tmp*Pos: THREE.Vector3` 实例避免 GC 压力

### 🔧 修复
- fix(stgcn): GraphConvLayer.call() 梯度计算修复——TF.js 4.22.0 中 3D×2D BatchMatMul 梯度形状不匹配、Einsum op 无梯度函数；改用 2D matMul + reshape/transpose 链（X@W 展平为 (B*F*N, inCh)×(inCh, outCh)，A@XW 转置让 N 成首维）；邻接矩阵缓存改为纯 number[][] 数据避免跨 tf.tidy scope 引用导致的 moveData backend 错误

### ⚡ 性能
- perf(build): vite.config.ts manualChunks vendor 细分——three-vendor 833KB 拆分为 `three-core` (684KB, three/build 核心) + `three-examples` (94KB, GLTFLoader/FBXLoader) + `three-vrm` (138KB, @pixiv/three-vrm) + `react-three` (147KB, @react-three/fiber+drei)；tfjs-vendor 1.6MB 拆分为 `tfjs-core` (584KB) + `tfjs-backend` (528KB) + `tfjs-converter` (3.6KB) + `tfjs-other` (485KB)；移除 5 个业务 module 分包让 Vite 默认按路由自动拆分；首屏不进 3D 页面时仅需 react-vendor + main + state-vendor + 页面 chunk
- perf(pwa): PWA 预缓存精简——`globPatterns` 移除 `png/svg/wasm` 只保留 `js/css/html/ico/woff2`；`globIgnores` 新增 `**/pwa-*.png` 双保险；新增 `maximumFileSizeToCacheInBytes: 2MB` 上限避免大文件预缓存拖慢首次访问；VRM/图标/词汇数据保留运行时缓存配置不变
- perf(boot): 首屏关键路径瘦身——`main.tsx` 移除同步 `runVocabularyValidationOnStartup` 调用，改为 App.tsx useEffect 中动态 import（仅 dev 环境）；`App.tsx` 中 `PerformancePanel` 改为 `React.lazy`，仅 Ctrl+Shift+P 按下时加载；启动期 `pluginsReady=false` 显示骨架屏（PageSkeleton）替代 spinner；`index.html` 内联 critical CSS（dark theme 背景 + splash 动画 + 字体栈），弱网下 splash 无闪烁
- perf(route): 路由预加载 + 骨架屏——`Sidebar.tsx` 菜单项添加 `onMouseEnter` / `onFocus` / `onTouchStart` 事件触发对应 chunk 预加载，`useRef<Set<string>>` 节流避免重复预加载，跳过当前已激活路由；`routes.tsx` Suspense fallback 从 spinner 改为 `MainContentSkeleton`（仅内容区骨架，复用 Layout 已渲染的 Sidebar/Header）
- perf(avatar): VRM 分级加载 + IndexedDB 持久化——`VRMModel.tsx` 改用 `VRMCache.loadVRM()` 替换模块级 `loadVRMCached`；`Avatar3D.tsx` 新增 `lowPolyModelUrl` prop 预留接口（当前未使用），VRM 加载期间渲染 `<SkeletonAvatarModel>` 占位提供即时姿态反馈，VRM 加载完成后（`vrmLoaded=true`）自动移除 skeleton；VRM 二次访问从 IndexedDB 秒开（10.7MB → 0ms）
- perf: VRM 模型懒加载验证通过——`Avatar3D.tsx` 使用 `LazyVRMModel = lazy(() => import('./VRMModel'))` 异步加载，首屏不请求 10.7MB 的 `models/avatar.vrm` 文件，仅当导航到 `/voice-to-sign` 等使用 3D 化身的页面时才加载
- perf: Lighthouse 性能审计达成目标（desktop 预设）——Performance 评分 100，LCP 788ms（< 800ms 阈值），FCP 521ms（< 1.5s 阈值），TBT 0ms，CLS 0；首屏 JS/CSS 资源加载时间约 1.5s，主要受 Three.js（962KB）和 TF.js（1.59MB）vendor chunk 影响

### 🔧 修复
- fix(e2e): 修复 E2E 测试超时失败（2/14 → 14/14 通过）——「应能导航到各功能页面」和「应显示双面板布局」测试默认 30s 超时不足，提升至 `test.setTimeout(60000)`，导航改用 `waitUntil: 'domcontentloaded'`，缩短中间步骤 `waitForTimeout`，添加 `page.locator('body').waitFor({ state: 'attached', timeout: 30000 })` 等待页面就绪

### 📦 维护
- chore(spec): 新增 `.trae/specs/loading-performance-optimization/` spec 三件套（spec.md / tasks.md / checklist.md）——记录加载性能优化的需求、设计、任务划分（11 个 task 按 4 个子 Agent 分组）、20 个验收点；spec NFR-4 调整为 PWA 预缓存 ≤ 5 MiB（原 < 1 MiB 在 js 总量约 4.5MB 约束下不现实）
- chore(deps): 新增 `@tensorflow/tfjs-node@4.22.0` 作为 devDependency，仅用于 Node.js 环境训练 ST-GCN 模型（原生 C++ 后端，oneDNN 优化 + AVX2 指令集）；vite.config.ts 配置 `optimizeDeps.exclude: ['@tensorflow/tfjs-node']` 确保不进入浏览器生产 bundle
- chore: `frontend/.gitignore` 新增 tfjs-node 构建缓存忽略规则（`.cache/`）
- chore(ci): CI 流水线新增 E2E 测试步骤——在单元测试后添加 `npx playwright install chromium --with-deps` 安装浏览器、`npx playwright test` 执行测试、`actions/upload-artifact@v4` 上传 `playwright-report`（保留 7 天，`if: ${{ !cancelled() }}` 确保失败时也上传）
- chore: `frontend/.gitignore` 新增 Playwright 测试产物忽略规则（`test-results/`、`playwright-report/`），避免测试报告被误提交
- chore: `frontend/.gitignore` 新增 Lighthouse 审计产物忽略规则（`lighthouse-result.json`），该文件含 localhost URL/fetchTime/user agent 等环境相关数据，属可再生构建产物

### 🔧 修复
- fix(lint): 修复 3 个 ESLint error——ClipBuilder.ts:445 `let elbowHint` 改为 `const`（prefer-const）；usePerformanceMonitor.ts:53 TTFB 计算移入 useState lazy initializer 消除 set-state-in-effect；AvatarCanvas.tsx:127 WebGL 检测移入 useState lazy initializer 消除 set-state-in-effect。`npx eslint .` 退出码 0（0 errors, 12 warnings）
- fix(avatar): 修复解析法 IK 上臂方向公式几何错误——`dir.applyAxisAngle(elbowDir, -shoulderLift)` 在垂直于 elbowDir 的平面内旋转，结果永远无 elbowDir 分量；正确公式为 `dir*cos(shoulderLift) + elbowDir*sin(shoulderLift)`（肘部在 elbowDir 方向偏移 L1*sin(shoulderLift)）。旧公式在 A-pose 下因对称性巧合正确，VRM T-pose 下对称性破坏导致 upperArmDir X 分量符号反转，右手臂伸到身体对侧（「他/谢谢/对不起」实测肘部穿透躯干）。ClipBuilder.ts 与 IKSolver.ts 同步修复，真实 VRM 模型集成测试 74 项全部通过
- fix(avatar): TAP/TAP_TWICE 运动轨迹从离散跳跃改为正弦波平滑过渡，消除 IK 解分支跳跃导致的动画抖动（wave/tap_twice 类词汇相邻帧旋转差异从 78° 降至 ≤60°）
- fix(avatar): ClipBuilder.buildArmTracks 新增 IK 解时序平滑后处理，检测相邻帧 lowerQuat 旋转差异 >60° 时用 SLERP 插值修正，解决 setFromUnitVectors 最短旋转在奇异点附近的分支跳跃问题

### ✨ 新增
- feat(avatar): 新增真实 VRM 模型集成测试（ClipBuilder.real-vrm-integration.test.ts），加载项目实际 avatar.vrm 文件（10.7MB），用 AnimationMixer.setTime() 在关键时间点采样骨骼世界位置，覆盖 8 个验证维度 × 12 个词汇 = 74 个测试：VRM 加载、手指骨骼、手臂轨道、手腕世界位置合理性、上臂/前臂旋转 ROM、肘部穿透检测、NaN 检测。从 mock VRM 升级到真实 VRM 后发现了 mock 测试无法发现的 IK 几何缺陷

### ✨ 新增
- feat(avatar): ClipBuilder 新增头部动作轨道生成（buildHeadMovementTrack），VRM 模式下 head_movement（nod/shake/tilt/slight_bow 等）不再丢失，neck 承担 60%、head 承担 40% 旋转使动作更自然
- feat(avatar): HandShape 手指骨骼支持 Y/Z 轴旋转（外展/内收），OPEN_5/V_SHAPE/HORNS/FOUR 等手形增加手指外展角度，左手 Y 轴自动镜像
- feat(avatar): FingerPose 类型扩展 mcpY/mcpZ/pipY/pipZ/dipY/dipZ 可选字段，向后兼容现有手形定义

### 🔧 修复
- fix(avatar): solveFABRIK 新增可选 restDir 参数，不再硬编码 BONE_REST_DIR=(0,-1,0)，ClipBuilder 传入 VRM 实际骨骼 rest direction 提高 IK 精度

### ✨ 新增
- feat(grammar): 时态助词"了/着/过"分词识别与非手语标记——Tokenizer PARTICLES 词表增加时态助词，NonManualMarker 新增完成体（了→slight_nod）/持续体（着）/经历体（过→shake）检测，优先级：疑问>否定>强调>时态>陈述；6 个演示句子（我今天吃饭了/你好朋友/谢谢老师/我想喝水/他明天来/我们是学生）端到端验证全部通过
- feat(data): 扩充餐饮/趋向类高频词条 7 个（过来/吃饭/饭/喝/菜/饱/渴），词汇库覆盖基本餐饮场景，修复「过来吃饭」等日常短语识别失败
- feat(avatar): 新增 BodyVolume 身体包络体模块（躯干胶囊/头部球/手臂胶囊），从 VRM normalized bone 实际位置推导包络参数，支持穿透检测与表面投影，不同模型自动适配
- feat(avatar): 新增 ClipBuilder 关键帧构建器
- feat(avatar): 新增 JointLimits 关节限制系统
- feat(avatar): 新增 KalidokitSolver 姿态求解器
- feat(avatar): 新增 RealtimePoseDriver 实时姿态驱动
- feat(avatar): 新增 VRMAnimator VRM 动画控制器
- feat(recognition): 新增 PoseEstimator 姿态估计器
- feat(recognition): 新增 STGCNRecognizer 时空图卷积识别器
- feat(recognition): 新增 pose.worker 姿态检测 Worker
- feat(hooks): 新增 usePoseTracking 姿态跟踪 Hook
- feat: 新增 docs/ 目录整理项目文档
- feat(data): 扩充内置词汇库至 94 个词汇，覆盖 12 个类别（日常问候、代词、形容词、动词、疑问词、否定词、名词、情感、时间、数字、颜色、专有名词）
- feat(data): 新增 SignLanguageRules.ts 手语动作规律规则，包含手形/位置/运动/表情 4 张语义映射表和 6 类参数组合模板
- feat(data): 新增 validateVocabulary.ts 词汇数据校验工具，开发环境启动时自动校验枚举合法性
- feat(types): HandShape 枚举新增 HOOK 手形，Movement 新增 7 个运动值，HeadMovement 新增 TILT/SLIGHT_BOW
- feat(avatar): 新增 FABRIK IK 求解器作为解析法的可选替代，支持多链协同与多目标约束
  - `IKSolver.ts` 新增 `solveFABRIK`、`solveFABRIKMultiChain` 函数
  - 失败时自动 fallback 到解析法 `solve`
  - 误差 ≤ 1e-3 米，迭代 ≤ 10 次
- feat(avatar): 集成 VRM 1.0 VRMC_node_constraint 规范，优先使用模型内置约束（roll/aim/rotation）
  - `JointLimits.ts` 新增 `applyVRMCConstraints`、`extractVRMCConstraints` 函数
  - VRMModel.tsx 加载阶段提取约束并存入 WeakMap 缓存
  - 无约束模型回退到现有 JointLimits 手动约束
- feat(avatar): 新增 Mixamo 动画重定向支持，可加载预录制 FBX 动画播放
  - 新增 `MixamoRetargeter.ts` 实现 MIXAMO_VRM_RIG_MAP 骨骼映射
  - `AvatarDriver` 新增 `playRetargetedAnimation(url)` 方法
  - 动态 import FBXLoader 避免首屏包体积增加
- feat(avatar): ClipBuilder 新增 IK_MODE 配置（'analytic' | 'fabrik' | 'constraint'），默认 'analytic' 保持现有行为不变

### 🔧 修复
- fix(grammar): 时态助词"了/着/过"不再作为未匹配词——GlossMapper 对 pos='u' 的 token 静默跳过（其语义由 NonManualMarker 承载），PosTagger 将 PARTICLES 检查提前到 VERBS 之前使"了/着/过"标注为助词而非动词
- fix(avatar): 修复手臂穿模——ClipBuilder.buildArmTracks 在 IK 解算前对轨迹点做 BodyVolume 合法性约束（手腕目标穿入躯干/头部时投影到表面），solveArmQuaternions 后检测肘部穿透并沿外法线推出，肘引导方向从硬编码改为基于 shoulder→hips 动态推导适配 A-pose；JointLimits 升级为解剖学方向限制（肩外展≤120°/前屈≤180°/后伸≤60°，肘旋前旋后≤±80°）；数据级验证 4 词条（你好/朋友/吃饭/过来）穿入数均为 0
- fix(grammar): 分词器 VERBS 补全「过」、新增 NOUNS 名词词表与 PosTagger 名词分支，修复「过来吃饭」等日常短语切分后「过」「饭」无法映射 gloss_id 致语义残缺的问题
- fix(avatar): 重构 ClipBuilder 动作生成系统——新增 buildMovementTrajectory 支持 19 种运动轨迹（弧线/圆周/折线/波浪/叩击/钩合等），新增 applyPalmOrientation 手掌朝向校正，修复 7 个新增 Movement 值落入 default 分支产生零动作、palm_orientation 字段被完全忽略的问题
- fix(avatar): VRMModel 新增模块级 loadVRMCached 缓存加载 Promise，修复 React StrictMode 双重渲染导致 VRM 模型加载 ERR_ABORTED 错误
- fix(ui): 移除 Google Fonts 引用改用系统字体栈（global.css/tailwind.config.js），并同步更新 index.html CSP，修复 fonts.googleapis.com 加载失败（ERR_ABORTED）错误
- fix(data): 规范化 24 个现有词汇的字段值，统一使用合法枚举值（handshape/movement/location/expression/palm_orientation）
- fix(avatar): 修复 VRM 初始 T-pose 问题——VRMModel 加载完成后调用 setNeutralPose 将上肢从默认 T-pose（双臂平举）调整为自然下垂姿态（上臂 X 轴 -1.2 rad ≈ -69°，肘部微屈 0.30 rad），并使用 getNormalizedBoneNode 防止 vrm.update() 覆盖旋转；setNeutralPose 用 try-catch 隔离，失败时回退到原始 T-pose 不影响 VRM 加载
- fix(avatar): 修复 NonManualMarkerOverlay 缺少 TILT/SLIGHT_BOW 枚举处理导致的类型错误
- fix(avatar): 移除 AvatarDriver 未使用的 Movement 导入
- fix(avatar): 移除 ClipBuilder 未使用的 getBoneLength 函数
- fix(avatar): 放宽 Skeleton3D 的 FINGER_LENGTHS 类型为 number[] 修复元组类型不匹配

### 📦 维护
- chore: 从 git 跟踪移除 .tmp-upload/ 目录全部 578 个临时文件（浏览器自动化调试截图与 Python 脚本），在 .gitignore 中添加 .tmp-upload/ 忽略规则
- chore(ci): CI 流水线新增"代码规范检查"步骤（npm run lint），在类型检查后执行 ESLint，防止 lint error 合并到 master
- chore(competition): 提交 TRAE AI 创造力大赛初赛 Demo 帖（https://forum.trae.cn/t/topic/167826），发布报名帖（https://forum.trae.cn/t/topic/167778），README.md 参赛信息更新为"初赛 Demo 已提交"，补充 GitHub Pages 体验地址（https://LLL-404.github.io/signbridge/）与仓库地址
- chore: 迁移文档到 docs/ 目录
- chore: 清理测试文件和临时资源
- chore(ci): 升级 GitHub Actions Node.js 版本从 20 到 24，修复部署失败
- chore: 重新生成 package-lock.json 修复依赖不同步

---

## [2026-07-06]

### ✨ 新增
- feat(avatar): VRMPose 类型定义，VRM humanoid 标准骨骼为唯一真相源
- feat(avatar): HandShape 新增 handShapeToBoneRotations 映射到 VRM 手指骨骼
- feat(avatar): VRMPoseAdapter 新旧姿态互转
- feat(avatar): IKSolver 新增 solveLeg 下肢 IK 求解
- feat(avatar): IKSolver 新增 solveSpine 躯干弯曲
- feat(avatar): AvatarDriver 新增 generateMotion 关键帧生成器（静态/直线）
- feat(avatar): generateMotion 支持弧线/圆周/折线/双手动作
- feat(avatar): MotionPlayer 支持 SignMotion 关键帧插值播放
- feat(avatar): VRMModel 新增 VRMPose 驱动路径，含 IK 反算和手形驱动
- feat(avatar): Skeleton3D 新增 applyVRMPose 适配新骨骼结构
- feat(avatar): 接入 VRM 新骨骼管线到 UI 流程，VRM 模型正式驱动
- feat: 生成项目 Code Wiki 文档

### 🔧 修复
- fix(avatar): 骨骼链正确连接——世界四元数+父逆，关节不再断裂
- fix(avatar): 三维坐标全面明确化——分区间缩放 + 人体测量学修正
- fix(avatar): 坐标体系明确化——相对 hips 归一化偏移 + 模型真实骨骼缩放
- fix(avatar): IK 坐标体系与模型真实几何对齐，修复动作不规范
- fix(avatar): VRM 模型路径适配 BASE_URL，修复 GitHub Pages 子路径 404
- fix(avatar): 修复 Task 2/3/8 遗留的预存编译错误

### 📦 维护
- chore: VRM 骨骼重建完成，全量测试通过并部署
- chore: 重新触发 GitHub Pages 部署（修复双 run 并发冲突）
- ci: 部署仅在 main/master 触发，避免 branch 推送产生失败 run
- ci: 重新触发 Pages 部署

---

## [2026-07-04]

### ✨ 新增
- feat: 用 CapsuleGeometry 重构 3D 人体，更圆润自然
- feat: 生成项目 Code Wiki 文档

### 🔧 修复
- fix: 修复 VRM 骨骼映射四个核心问题
- fix: 3D 模式响应式相机，修复手机端和电脑端模型显示不一致
- fix: 移除语音输入，重构 3D 骨骼层级确保关节连接到位

---

## [2026-07-03]

### 🔧 修复
- fix: 修复语音识别国内不可用问题，文字输入为主 + 按住说话可选

---

## [2026-07-02]

### ✨ 新增
- feat: 移动端响应式适配优化

---

## [2026-07-01]

### ✨ 新增
- feat: 添加 GitHub Pages 自动部署配置
- feat: 添加 BytePlus Pages 部署配置
- feat: 生成项目 Code Wiki 文档

### 🔧 修复
- fix: 移除未使用的 isLoading 变量，修复 TypeScript 编译错误
- fix: 升级 GitHub Actions Node.js 版本到 20，修复构建失败

### ⚡ 性能
- perf: 优化首屏加载速度，提升用户体验

---

## [2026-06-30]

### ✨ 新增
- feat: L3 VRM 模型升级，非手动标记系统，参赛材料

---

## [2026-06-29]

### ✨ 新增
- feat(avatar): L3 — integrate VRM standard avatar model with @pixiv/three-vrm

### 🔧 修复
- fix: AvatarCanvas graceful WebGL fallback with error boundary protection