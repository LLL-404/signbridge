# Tasks

## 阶段一：技术债务盘点

- [x] Task 1: 扫描并分类所有 spec 未完成项
  - [x] SubTask 1.1: 用 Grep 扫描 `.trae/specs/*/tasks.md` 和 `checklist.md` 中所有 `- [ ]` 条目
  - [x] SubTask 1.2: 将每条未完成项分类为「手动验证类」「真实未完成类」「已废弃类」之一
  - [x] SubTask 1.3: 统计每类数量，输出清单到报告草稿

- [x] Task 2: 静态代码债务扫描
  - [x] SubTask 2.1: 统计 `eslint-disable` 使用（已知 3 处），逐处评估可消除性
  - [x] SubTask 2.2: 统计 `console.*` 调用（已知 22 处），区分 logger 自身/测试/业务代码
  - [x] SubTask 2.3: 评估 `__diagnose_elbow.test.ts` 等诊断测试文件的保留价值
  - [x] SubTask 2.4: 检查 `package.json` 中依赖版本一致性（含已知的 vitest/coverage-v8 冲突）

## 阶段二：性能与体积分析

- [x] Task 3: 采集当前构建产物体积
  - [x] SubTask 3.1: 执行 `npm run build`，收集构建日志
  - [x] SubTask 3.2: 解析 `frontend/dist/assets/` 目录，按 chunk 列表（含 gzip 体积）
  - [x] SubTask 3.3: 对比 `loading-performance-optimization` spec 中的基线，标注变化

- [x] Task 4: 分析首屏加载关键路径
  - [x] SubTask 4.1: 从 `dist/index.html` 提取入口 chunk 与 preload 链
  - [x] SubTask 4.2: 沿 import 链追溯首屏必载的 chunk 清单
  - [x] SubTask 4.3: 记录已知的 TBT 根因（avatarStore 默认 3D）作为已知妥协

## 阶段三：架构与可维护性评估

- [x] Task 5: 模块依赖关系分析
  - [x] SubTask 5.1: 执行 `npx depcruise src --config --output-type dot` 生成依赖图（或用 Grep 分析 import）
  - [x] SubTask 5.2: 识别跨层依赖、循环依赖（若有）
  - [x] SubTask 5.3: 评估 4 个插件之间的解耦度（是否有隐式依赖）

- [x] Task 6: 目录职责边界评审
  - [x] SubTask 6.1: 列出 `kernel/`、`plugins/`、`modules/`、`components/`、`pages/`、`hooks/`、`stores/`、`types/` 各目录的文件清单
  - [x] SubTask 6.2: 检查是否有职责越界（如 `components/` 直接 `import modules/` 内部实现）
  - [x] SubTask 6.3: 识别代码复用机会（重复工具函数、相似组件结构）

- [x] Task 7: spec 组织方式评估
  - [x] SubTask 7.1: 统计 30+ spec 的完成率（已完成 / 部分完成 / 未开始）
  - [x] SubTask 7.2: 评估是否需要归档已完成的 spec
  - [x] SubTask 7.3: 评估 spec 命名规范是否一致

## 阶段四：报告撰写与交付

- [x] Task 8: 撰写健康度报告
  - [x] SubTask 8.1: 创建 `docs/audits/` 目录
  - [x] SubTask 8.2: 撰写 `docs/audits/2026-07-19-project-health-report.md`，包含 spec 中要求的 6 个章节
  - [x] SubTask 8.3: 报告中所有问题附带文件路径/行号/命令输出作为证据
  - [x] SubTask 8.4: 后续建议按 P0/P1/P2 分级

- [x] Task 9: 自检验收
  - [x] SubTask 9.1: `git status` 确认仅新增报告文件，无业务代码变更
  - [x] SubTask 9.2: 报告内容自检：每个论断有证据，无臆测

# Task Dependencies

- Task 1、2、3、5、6、7 相互独立，可并行执行
- Task 4 依赖 Task 3（需先有构建产物）
- Task 8 依赖 Task 1-7 全部完成
- Task 9 依赖 Task 8
