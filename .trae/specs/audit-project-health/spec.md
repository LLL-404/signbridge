# 项目健康度全面体检 Spec

## Why

SignBridge 已经历 30+ 次 spec 驱动迭代，进入大赛交付前的稳定期。在持续迭代中积累了若干遗留问题（peer dep 冲突、循环 chunk 警告、未完成的手动验证 checklist、3 处 eslint-disable、诊断测试文件等），且缺少一份系统性的健康度报告来回答："项目当前到底处于什么状态？哪些是真正需要处理的债务？哪些是可以接受的妥协？"。

本 spec 规划一次全面体检，覆盖**技术债务、性能与体积、架构与可维护性**三大维度，输出一份实事求是的健康度报告，作为后续优化的依据。**本次只做分析与诊断，不修改代码**——修复工作由后续独立 spec 承担。

## What Changes

### 一、技术债务盘点（只统计，不修复）

- 扫描 30+ spec 中所有未完成项（`- [ ]`），按"手动验证类 / 真实未完成类 / 已废弃类"三档分类
- 统计 `eslint-disable` 使用情况（已知 3 处 `react-hooks/exhaustive-deps`），评估每处是否可消除
- 统计 `console.*` 调用分布（已知 22 处），区分 logger 模块自身/测试文件/业务代码
- 评估 `__diagnose_elbow.test.ts` 等诊断测试文件的保留价值
- 复核 `resolve-build-legacy-issues` spec 中识别的两个问题（peer dep + 循环 chunk）的影响范围
- 检查 `.gitignore`、CI 配置、CHANGELOG 一致性

### 二、性能与体积分析（只测量，不优化）

- 跑一次 `npm run build`，记录各 chunk 体积分布（gzip 与原始）
- 对比 `loading-performance-optimization` spec 中的基线数据，验证优化是否仍生效
- 分析首屏加载关键路径（入口 chunk → react-vendor → state-vendor → 业务代码）
- 记录已知的 TBT 恶化根因（avatarStore 默认 3D 模式）作为已知妥协记录在案
- 评估 PWA 缓存策略的有效性（预缓存条目数、runtimeCaching 规则）
- 不跑 Lighthouse（耗时且需浏览器，留给后续独立验证 spec）

### 三、架构与可维护性评估（只评审，不重构）

- 绘制当前模块依赖关系图（基于 `depcruise` 或源码 import 分析）
- 评估微内核+插件化架构的实际落地情况：4 个插件是否真的解耦？插件间有无隐式依赖？
- 检查 `kernel/`、`plugins/`、`modules/`、`components/`、`pages/`、`hooks/`、`stores/`、`types/` 各目录的职责边界是否清晰
- 评估 30+ spec 的组织方式是否仍可维护（是否需要归档已完成的 spec）
- 识别代码复用机会（重复的工具函数、相似的组件结构）

## Impact

- **Affected specs**: 全部 30+ spec（本次体检会引用其完成状态）
- **Affected code**: 无（纯分析任务，不修改任何代码）
- **Affected docs**: 
  - 产出一份 `docs/audits/2026-07-19-project-health-report.md` 健康度报告
  - 不修改现有文档
- **风险**: 
  - 分析过程可能触发构建/测试命令，但不会修改项目状态
  - 报告中的"建议"条目可能催生后续多个修复 spec，需用户决策优先级

## ADDED Requirements

### Requirement: 项目健康度报告

项目 SHALL 产出一份 Markdown 格式的健康度报告，存放于 `docs/audits/2026-07-19-project-health-report.md`，包含三大维度的现状、风险、建议。

#### Scenario: 报告内容完整

- **WHEN** 读取 `docs/audits/2026-07-19-project-health-report.md`
- **THEN** 包含以下章节：
  1. 执行摘要（1 段话回答"项目当前状态"）
  2. 技术债务盘点（含数字统计与分类清单）
  3. 性能与体积分析（含 chunk 体积表格）
  4. 架构与可维护性评估（含模块依赖关系图）
  5. 已知妥协清单（明确列出可接受的技术妥协）
  6. 后续建议（按优先级 P0/P1/P2 分级）

#### Scenario: 报告实事求是

- **WHEN** 报告中描述某个问题
- **THEN** 附带具体的文件路径、行号或命令输出作为证据
- **AND** 不夸大、不淡化、不臆测未验证的问题

### Requirement: 不修改项目代码

体检过程 SHALL NOT 修改 `frontend/src/`、`vite.config.ts`、`package.json` 等任何项目源代码或配置文件。

#### Scenario: 体检后工作区无业务代码变更

- **WHEN** 体检完成后执行 `git status`
- **THEN** 仅出现新增的报告文件 `docs/audits/2026-07-19-project-health-report.md`
- **AND** 不出现任何 `frontend/src/` 或配置文件的修改

## MODIFIED Requirements

无

## REMOVED Requirements

无
