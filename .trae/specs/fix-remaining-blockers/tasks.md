# Tasks

## 阶段一：关闭 fix-pages-mediapipe-loading spec

- [x] Task 1: 更新 fix-pages-mediapipe-loading spec 文档状态
  - [x] SubTask 1.1: 读取 `fix-pages-mediapipe-loading/tasks.md`，将 Task 2-6 标记为 `[x]`（代码实际已完成）
  - [x] SubTask 1.2: 读取 `fix-pages-mediapipe-loading/checklist.md`，将已完成的检查点标记为 `[x]`
  - [x] SubTask 1.3: Task 7（端到端验证）保留 `[ ]`，添加注释说明需在 GitHub Pages 上手动验证

## 阶段二：修复 ESLint warnings

- [x] Task 2: 排除 coverage 目录
  - [x] SubTask 2.1: 修改 `frontend/eslint.config.js`，在 ignores 中添加 `coverage/**`
  - [x] SubTask 2.2: 验证 `npm run lint` 不再输出 coverage 目录的 3 个 warnings

- [x] Task 3: 修复 ref value in cleanup warnings（2 处）
  - [x] SubTask 3.1: 修改 `frontend/src/components/avatar/Avatar3D.tsx:81`，在 useEffect 内将 `groupRef.current` 复制到局部变量，cleanup 中使用局部变量
  - [x] SubTask 3.2: 修改 `frontend/src/hooks/useAvatarPlayer.ts:80`，同上方法处理 `driverRef.current`

- [x] Task 4: 修复 missing dependency warnings（3 处）
  - [x] SubTask 4.1: 修改 `frontend/src/components/learning/DataCollectionPanel.tsx:58`，将 `stopTracking` 加入 useEffect 依赖或用 ref 包装
  - [x] SubTask 4.2: 修改 `frontend/src/hooks/useAvatarPipeline.ts:100,109`，将 `player` 加入 useCallback 依赖或用 ref 包装

- [x] Task 5: 修复 DemoMode steps useMemo warning
  - [x] SubTask 5.1: 修改 `frontend/src/components/learning/DemoMode.tsx:43`，用 `useMemo` 包裹 `steps` 逻辑表达式

- [x] Task 6: 修复测试文件 no-explicit-any warning
  - [x] SubTask 6.1: 修改 `frontend/src/modules/avatar/ClipBuilder.real-vrm-integration.test.ts:55`，将 `any` 替换为具体类型或 `unknown`

## 阶段三：升级 GitHub Actions

- [x] Task 7: 升级 CI actions 版本
  - [x] SubTask 7.1: 修改 `.github/workflows/ci.yml`，将 `actions/checkout@v4` 改为 `@v5`
  - [x] SubTask 7.2: 将 `actions/setup-node@v4` 改为 `@v5`
  - [x] SubTask 7.3: 将 `actions/upload-artifact@v4` 改为 `@v5`
  - [x] SubTask 7.4: 检查 `.github/workflows/deploy-pages.yml` 同步升级（`configure-pages` 升级到 `@v6`，`upload-pages-artifact` 升级到 `@v5`，`deploy-pages` 升级到 `@v5`）

## 阶段四：全量验证与提交

- [x] Task 8: 全量验证
  - [x] SubTask 8.1: `npx tsc --noEmit -p tsconfig.app.json` 类型检查通过（0 errors）
  - [x] SubTask 8.2: `npm run lint` 0 errors 0 warnings
  - [x] SubTask 8.3: `npm run test` 单元测试全部通过（820/820）
  - [x] SubTask 8.4: `npm run build` 构建成功

- [x] Task 9: 更新 CHANGELOG 并提交
  - [x] SubTask 9.1: 在 `CHANGELOG.md` [Unreleased] 记录所有变更
  - [x] SubTask 9.2: git commit + push
  - [ ] SubTask 9.3: 监控 CI 流水线状态，确认无 Node.js deprecated 警告且全绿

# Task Dependencies

- Task 1（spec 文档更新）独立，可与 Task 2-7 并行
- Task 2-6（lint 修复）相互独立，可并行
- Task 7（CI 升级）独立，可与 Task 2-6 并行
- Task 8（验证）依赖 Task 2-7 完成
- Task 9（提交）依赖 Task 8 通过
