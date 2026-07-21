# CodeRabbit 审查整改 Spec

## Why

用户要求用 CodeRabbit 分析项目并整改。由于 CodeRabbit CLI 在 Windows（mingw64）环境无法安装（install.sh 报 `Unsupported OS: mingw64_nt`，无 PowerShell 版本，npm 包是占位包），用户同意改用 TRAE 子代理按 CodeRabbit 审查维度（安全/正确性/性能/可维护性）扫描项目，输出问题清单后整改。

两个并行审查子代理完成扫描，共发现 **0 Critical + 14 Major + 14 Minor** 级问题。去重合并后，需整改的核心问题为 10 项。本 spec 聚焦 **P0 + P1** 级问题（直接影响首屏性能、正确性、稳定性），P2 级问题留作后续迭代。

## What Changes

### P0 — 首屏性能瓶颈（直接影响 VoiceToSignPage 60fps 渲染）

- **修复 `useAvatarPlayer.ts` 每帧 setState**：rAF 循环中每帧调用 `setPose(driver.getCurrentPose())` 触发 60fps React 重渲染。改为通过 ref 传递 pose，或仅在 `motionPlayer.isPlaying` 时 setState，并对 `AvatarCanvas` 加 `React.memo`
- **修复 3 处 `eslint-disable react-hooks/exhaustive-deps`**：`useRecognizer.ts:191, 224` 和 `PracticeFlow.tsx:125` 抑制了依赖检查，闭包可能捕获陈旧 state。用 ref 同步最新值并显式加入依赖

### P1 — 正确性与稳定性

- **修复 `useVRMModel.ts:203` 类型断言绕过私有字段**：`(vrmAdapterRef.current as unknown as { vrm: VRM | null }).vrm = vrm` 破坏封装。在 `VRMAdapter` 暴露 `setVRM(vrm)` 公开方法
- **修复 `SignToTextPage.tsx` 帧循环过度 setState**：每帧 4 次 setState，用 ref 缓存上次值仅在变化时 setState
- **修复 `VRMCache.ts` dbPromise rejected 后无法恢复**：IndexedDB 连接失败后 `dbPromise` 保持 rejected 状态，后续全部缓存读写失败。在 catch 中自动重置为 null 允许重试
- **修复 `ClipBuilder.ts` 模块级可变状态**：`currentVRMConstraints`/`vrmcHitCount`/`vrmcFallbackCount` 三个模块级可变变量存在并发污染风险。封装为 `ClipBuildContext` 对象在函数间显式传递
- **修复 `loadGestureLibrary` 静默失败**：`WorkerUtils.ts:261-281` IDB 失败时 `resolve([])` 无日志。加 `log.warn` 后再 resolve
- **修复 `DataCollectionPanel.tsx` setTimeout 未清理**：多处 `setTimeout` 未在卸载时 `clearTimeout`，用 `timersRef` 统一管理

### 不在本 spec 范围（留作后续）

- ClipBuilder.ts 文件拆分（1183 行）— 改动面大，单独 spec
- AvatarDriver.playSequence 并行化 — P2，非关键路径
- 魔法数字抽取 — P2，渐进改进
- LOCATION_POSITIONS 重复定义统一 — P2，需确认语义

## Impact

- **Affected specs**:
  - `loading-performance-optimization`（首轮优化成果，P0 修复应进一步改善首屏渲染）
  - `fix-startup-regression`（启动回归修复，P0 不冲突）
- **Affected code**:
  - [useAvatarPlayer.ts](file:///d:/G/github/signbridge/frontend/src/hooks/useAvatarPlayer.ts)（P0: ref 传递 pose）
  - [useRecognizer.ts](file:///d:/G/github/signbridge/frontend/src/hooks/useRecognizer.ts)（P0: 修复 eslint-disable）
  - [PracticeFlow.tsx](file:///d:/G/github/signbridge/frontend/src/components/learning/PracticeFlow.tsx)（P0: 修复 eslint-disable）
  - [AvatarCanvas.tsx](file:///d:/G/github/signbridge/frontend/src/components/avatar/AvatarCanvas.tsx)（P0: React.memo）
  - [useVRMModel.ts](file:///d:/G/github/signbridge/frontend/src/hooks/useVRMModel.ts)（P1: 移除类型断言）
  - [VRMAdapter.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/VRMAdapter.ts)（P1: 暴露 setVRM 方法）
  - [SignToTextPage.tsx](file:///d:/G/github/signbridge/frontend/src/pages/SignToTextPage.tsx)（P1: 优化 setState）
  - [VRMCache.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/VRMCache.ts)（P1: dbPromise 重置）
  - [ClipBuilder.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts)（P1: 模块级状态封装）
  - [WorkerUtils.ts](file:///d:/G/github/signbridge/frontend/src/modules/recognition/WorkerUtils.ts)（P1: 加日志）
  - [DataCollectionPanel.tsx](file:///d:/G/github/signbridge/frontend/src/components/learning/DataCollectionPanel.tsx)（P1: setTimeout 清理）
- **风险**:
  - P0 修改 useAvatarPlayer 可能影响动画播放流畅度 → 需浏览器实测
  - P1 修改 ClipBuilder 模块级状态需确保不影响现有测试 → 需全量测试通过
  - P1 修改 VRMAdapter 需同步更新所有调用方 → 需 tsc 验证

## ADDED Requirements

无（本次为审查整改，不新增功能）

## MODIFIED Requirements

### Requirement: 首屏渲染性能不退化

VoiceToSignPage 首屏渲染 SHALL 不因每帧 setState 导致不必要的 React 重渲染。

#### Scenario: rAF 循环不触发 60fps React 重渲染

- **WHEN** `useAvatarPlayer` 的 rAF 循环运行时
- **THEN** pose 数据通过 ref 传递给 AvatarCanvas，不触发 React setState（或仅在播放状态变化时 setState）
- **AND** AvatarCanvas 被 `React.memo` 包裹，仅 mode/vrmLoadFailed 变化时重渲染

### Requirement: React Hooks 依赖项正确

所有 `useEffect` 的依赖数组 SHALL 完整，不依赖 `eslint-disable` 抑制警告。

#### Scenario: 无 eslint-disable react-hooks/exhaustive-deps

- **WHEN** 执行 `npm run lint`
- **THEN** `useRecognizer.ts`、`PracticeFlow.tsx` 中不再有 `eslint-disable-next-line react-hooks/exhaustive-deps`

### Requirement: 类型安全不被绕过

代码 SHALL 不使用 `as unknown as` 绕过类的私有字段封装。

#### Scenario: VRMAdapter 私有字段通过公开方法访问

- **WHEN** `useVRMModel.ts` 需要设置 VRMAdapter 的 vrm 字段
- **THEN** 调用 `VRMAdapter.setVRM(vrm)` 公开方法，而非 `as unknown as` 类型断言

### Requirement: IndexedDB 连接失败可恢复

`VRMCache` 的 IndexedDB 连接 SHALL 在失败后可自动重试，不永久保持 rejected 状态。

#### Scenario: IDB 连接失败后下次调用重新初始化

- **WHEN** IndexedDB 连接因 quota/隐私模式失败
- **THEN** `dbPromise` 被重置为 null，下次 `loadVRM` 调用时重新初始化连接

## REMOVED Requirements

无
