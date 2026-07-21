# Checklist

## @deprecated 残留清理
- [x] C1: `frontend/src` 中 Grep 搜索 `slerpRotation` 无匹配结果
- [x] C2: `Smoother.ts` 中 `BoneSmoother` 类定义不包含 `@deprecated`
- [x] C3: `Smoother.ts` 中 `BoneSmoother` 注释说明保留用途
- [x] C4: `types/avatar.ts` 中 `BonePose` 接口定义不包含 `@deprecated`
- [x] C5: `types/avatar.ts` 中 `BonePose` 注释说明保留用途

## config.ts 注释同步
- [x] C6: `config.ts` 顶部注释包含全部 8 个环境变量（VITE_APP_NAME、VITE_MEDIAPIPE_WASM_BASE_URL、VITE_MEDIAPIPE_HANDS_CDN_BASE、VITE_GESTURE_MODEL_URL、VITE_POSE_MODEL_URL、VITE_HAND_MODEL_URL、VITE_GESTURE_LIBRARY_URL、VITE_VOCABULARY_URL）

## 覆盖率阈值
- [x] C7: `npm run test:coverage` 退出码 0
- [x] C8: `vitest.config.ts` thresholds 不低于 50%（不降级）
- [x] C9: `vitest.config.ts` thresholds 不超过实际覆盖率（留至少 5% 缓冲）

## 全量验证
- [x] C10: `npx tsc --noEmit -p tsconfig.app.json` 0 errors
- [x] C11: `npm run lint` 0 errors 0 warnings
- [x] C12: `npm run test` 全部通过
- [x] C13: `npm run build` 构建成功

## 提交
- [ ] C14: `CHANGELOG.md` [Unreleased] 有新增条目
- [ ] C15: git commit + push 成功
- [ ] C16: CI 流水线全绿
