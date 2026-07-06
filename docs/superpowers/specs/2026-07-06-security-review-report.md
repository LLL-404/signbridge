# VRM 骨骼重建设计 — 安全最佳实践审查报告

**审查对象**：`docs/superpowers/specs/2026-07-06-vrm-humanoid-rebuild-design.md` 及其涉及/将影响的代码
**审查依据**：`javascript-typescript-react-web-frontend-security.md`
**审查日期**：2026-07-06

---

## 执行摘要

本次审查针对 VRM 骨骼重建设计文档及其涉及的现有代码基线。**该设计本身不引入新的安全风险**——它是一个纯前端骨骼/动画驱动重构，不涉及网络、认证、用户输入渲染等高风险面。但审查过程中发现**既有代码存在若干与设计无直接关联的安全配置问题**，应在重构期间一并修复。

整体安全态势良好：CSP 已配置、无 dangerouslySetInnerHTML、无 eval、无 localStorage 存储敏感数据、CI 使用 npm ci。主要改进点集中在 CSP 严格化、第三方资源 SRI、以及 PWA 缓存策略。

| 严重度 | 数量 |
|--------|------|
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 3 |

---

## Finding-1 [High] CSP 允许 `unsafe-inline` 脚本

- **规则 ID**：REACT-CSP-001
- **严重度**：High
- **位置**：`frontend/index.html:7`
- **证据**：
  ```
  script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';
  ```
- **影响**：`unsafe-inline` 削弱了 CSP 对 XSS 的防御——若应用中存在任何 XSS 注入点，攻击者注入的内联脚本可绕过 CSP 执行。当前 index.html 第 51-58 行的 splash 重定向脚本和第 68 行的模块引导脚本需要 inline，这是 unsafe-inline 存在的原因。
- **修复建议**：
  - 将内联脚本提取为外部 `.js` 文件（`/splash-redirect.js`），用 `script-src 'self'` 替代
  - 或对内联脚本使用 CSP nonce/hash：`script-src 'self' 'nonce-<random>' 'wasm-unsafe-eval'`
  - `wasm-unsafe-eval` 是 MediaPipe/tasks-vision 所必需，保留合理
- **与本次设计的关系**：设计文档不新增内联脚本，但重构期间建议顺带收紧 CSP

---

## Finding-2 [Medium] 第三方 CDN 资源未使用 SRI

- **规则 ID**：REACT-SRI-001
- **严重度**：Medium
- **位置**：
  - `frontend/index.html:32`（preconnect 到 cdn.jsdelivr.net）
  - `frontend/src/config.ts:34-43`（mediapipeWasmBaseUrl / mediapipeHandsCdnBase 指向 jsdelivr）
  - `frontend/src/config.ts:47-49`（gestureModelUrl 指向 storage.googleapis.com）
- **证据**：配置中引用了 jsdelivr 上的 `@mediapipe/tasks-vision` wasm 和 Google Storage 上的手势识别模型，运行时通过 fetch/动态加载，但未配置 SRI（Subresource Integrity）校验
- **影响**：若 CDN 被入侵或中间人篡改，可注入恶意 wasm/模型文件在用户浏览器执行
- **修复建议**：
  - WASM 和模型文件较大且版本固定，考虑自托管到 `public/wasm/` 和 `public/models/`
  - 若继续用 CDN，对静态资源（如 wasm）下载后做 hash 校验
  - 对 `<script src=...>` 显式加 `integrity` 属性
- **与本次设计的关系**：本次重构新增 VRM 模型加载（已自托管在 `/models/avatar.vrm`），符合 SRI 推荐做法

---

## Finding-3 [Medium] PWA Service Worker 缓存策略需复核

- **规则 ID**：REACT-SW-001
- **严重度**：Medium
- **位置**：`frontend/vite.config.ts:60-92`
- **证据**：
  ```
  globPatterns: ['**/*.{js,css,html,ico,png,svg,json,wasm}'],
  globIgnores: ['**/*.vrm'],
  navigateFallback: '/signbridge/index.html',
  ```
  - 预缓存包含 `*.json`（含 vocabulary.json 765 词数据）
  - 新增 `vrm-model-cache` 运行时缓存用 StaleWhileRevalidate
- **影响**：
  - vocabulary.json 被预缓存后，词库更新（如新增词条）需 SW 版本升级才能刷新，否则用户看到旧词库
  - StaleWhileRevalidate 对 26MB VRM 模型意味着首次加载后长期用缓存，模型更新延迟大
- **修复建议**：
  - vocabulary.json 改为 NetworkFirst（优先网络，失败回退缓存），保证词库及时更新
  - VRM 模型 StaleWhileRevalidate 可接受（模型变更少），但应在 SW 版本升级时主动清理旧 `vrm-model-cache`
  - 在 `workbox.cleanupOutdatedCaches: true` 启用旧缓存自动清理
- **与本次设计的关系**：设计文档第 7.2 节提到 MotionDataStore 兼容迁移，缓存策略应同步考虑

---

## Finding-4 [Medium] IndexedDB 用户自定义手势数据未做 schema 校验

- **规则 ID**：REACT-POSTMSG-001（同类：跨信任边界数据未校验）
- **严重度**：Medium
- **位置**：
  - `frontend/src/modules/recognition/WorkerUtils.ts:259`（indexedDB.open 读取自定义手势）
  - `frontend/src/modules/recognition/RuleRecognizer.ts:85`（同类读取）
- **证据**：
  ```typescript
  const req = indexedDB.open('signbridge-custom-gestures', 1);
  // 读取后直接作为 GestureDefinition[] 使用，未见 schema 校验
  ```
- **影响**：IndexedDB 数据可被浏览器扩展或 XSS 篡改，未校验直接消费可能导致类型错误或注入异常字段
- **修复建议**：
  - 读取后用 zod 或手动 schema 校验（字段类型、范围、必需字段）
  - 校验失败回退到默认手势库
- **与本次设计的关系**：设计文档未涉及手势识别模块，但重构期间可顺带加固

---

## Finding-5 [Low] Source Map 发布策略未明确

- **规则 ID**：REACT-CONFIG-001（衍生）
- **严重度**：Low
- **位置**：`frontend/vite.config.ts`（未见 source map 显式禁用配置）
- **证据**：Vite 默认生产构建可能生成 source map
- **影响**：公开的 source map 会暴露源码结构和内部路径
- **修复建议**：
  - 生产构建显式 `build.sourcemap: false`，或仅在错误上报场景下生成并上传到私有服务
- **与本次设计的关系**：无直接关联

---

## Finding-6 [Low] 缺少 `X-Frame-Options` 头

- **规则 ID**：REACT-HEADERS-001
- **严重度**：Low
- **位置**：`frontend/index.html`（CSP 已设 `frame-src 'none'`，但无 X-Frame-Options 兜底）
- **证据**：CSP `frame-src 'none'` 已防止被嵌入，但旧浏览器不解析 CSP frame-src
- **影响**：对不支持 CSP 的旧浏览器无点击劫持防护
- **修复建议**：
  - 加 `<meta http-equiv="X-Frame-Options" content="DENY">` 作为兜底
- **与本次设计的关系**：无

---

## Finding-7 [Low] GitHub Pages 静态托管无法设置部分 HTTP 头

- **规则 ID**：REACT-HEADERS-001
- **严重度**：Low
- **位置**：部署目标 GitHub Pages
- **证据**：GitHub Pages 仅支持有限的自定义头（通过 `<meta>` 设置），无法设置真正的 HTTP `Content-Security-Policy` 响应头
- **影响**：`<meta>` 形式的 CSP 对某些浏览器策略处理略不同，且无法设置 `Strict-Transport-Security` 等
- **修复建议**：
  - 接受 GitHub Pages 限制，`<meta>` CSP 已是当前最佳实践
  - 若未来迁移到支持完整 HTTP 头的平台（Vercel/Netlify），改为响应头形式
- **与本次设计的关系**：无

---

## 设计文档专项安全评估

针对 `2026-07-06-vrm-humanoid-rebuild-design.md` 本身：

| 维度 | 评估 |
|------|------|
| 是否引入新的网络请求 | 否 ✅ 纯前端骨骼驱动重构 |
| 是否引入新的用户输入渲染 | 否 ✅ 不涉及 dangerouslySetInnerHTML |
| 是否引入新的存储 | 否 ✅ 沿用现有 IndexedDB/内存结构 |
| 是否引入第三方依赖 | 否 ✅ 不新增 npm 包 |
| 是否涉及认证/授权 | 否 ✅ 无认证逻辑 |
| 数据来源信任边界 | vocabulary.json 为同源静态资源 ✅ |

**结论**：设计文档本身安全风险为零。建议在重构实施期间顺带处理 Finding-1（CSP 收紧）和 Finding-3（PWA 缓存策略），两者与渲染层改动同属前端基线优化。

---

## 优先级建议

1. **Finding-1**（CSP unsafe-inline）— 重构期间顺带修复
2. **Finding-3**（PWA 缓存）— 重构期间顺带修复
3. **Finding-2**（SRI）— 后续优化
4. **Finding-4**（IndexedDB 校验）— 后续优化
5. **Finding-5/6/7**（Low）— 机会性改进
