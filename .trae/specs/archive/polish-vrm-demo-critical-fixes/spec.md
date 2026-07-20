# SignBridge VRM Demo 关键攻坚 - Product Requirement Document

## Overview
- **Summary**: 修复 VRM 3D 虚拟人初始 T-pose 姿态以及动画结束跳回 T-pose 的问题，让 Demo 演示效果自然。
- **Purpose**: 通过浏览器实测发现两个核心问题：1) VRM 模型加载后呈 T-pose（双臂平举）而非自然站立；2) 手语动画播放结束后模型跳回 T-pose。这两个问题严重影响演示的专业度。
- **Target Users**: TRAE 创造力大赛评委、SignBridge 项目体验者。

## Goals
- 修复 VRM 初始 T-pose：VRM 加载后立即设置自然中性姿态（双臂自然下垂，肘部微屈）
- 修复动画结束跳回 T-pose：动画播放完成后模型平滑回到自然中性姿态
- 验证核心手语词（"你好""谢谢""再见"）的动画质量

## Non-Goals (Out of Scope)
- 不修改相机取景（实测相机取景本身工作正常，之前是滚动到 canvas 外的误解）
- 不新增手语词汇
- 不修改 IK 求解器算法
- 不更换 VRM 模型
- 不修改 2D/skeleton 模式

## Background & Context
SignBridge 是一个手语翻译系统，核心展示是 3D VRM 虚拟人打手语。通过浏览器实测发现：
- 页面加载后，VRM 模型呈 T-pose（绑定姿态，双臂平举）。这是因为 VRM 加载后没有设置任何骨骼旋转，使用的是模型的绑定姿态
- 手语动画播放完毕后，`vrmAnimator.stop(0.3)` 让 AnimationMixer 停止当前 action 并 fade out 到绑定姿态（也是 T-pose），而非回到自然的中性姿态
- 这两个 T-pose 闪现严重影响演示效果

之前曾误判为相机取景问题，已回滚修改。

## Functional Requirements
- **FR-1**: VRM 模型加载完成后，立即设置自然的中性站立姿态（双臂下垂，肘部微屈）
- **FR-2**: 手语动画播放完毕后，模型在 0.3 秒内平滑回到中性姿态，无 T-pose 闪现
- **FR-3**: "你好"等核心手语词播放时，手部动作可见且手形基本正确
- **FR-4**: 多词连续播放时（如"你好谢谢再见"），词间过渡自然，无 T-pose 闪现

## Non-Functional Requirements
- **NFR-1**: 中性姿态设置在 VRM 加载完成 1 帧内完成
- **NFR-2**: 动画结束归位过渡平滑无跳变
- **NFR-3**: 现有测试通过（npm test）
- **NFR-4**: TypeScript 类型检查通过（npx tsc --noEmit）
- **NFR-5**: 不引入新依赖

## Constraints
- **Technical**: React + Three.js + @react-three/fiber + @pixiv/three-vrm 技术栈；必须使用 normalized bone API
- **Business**: 修复需确保 Demo 演示效果自然、专业
- **Dependencies**: 现有 VRM 模型（public/models/avatar.vrm），现有 ClipBuilder/AvatarDriver/VRMAnimator 架构

## Assumptions
- 当前 VRM 模型的绑定姿态是 T-pose（双臂平举 90°）
- 动画 clip 通过 normalized bone 的 AnimationMixer 驱动
- 静止状态（无 clip 播放）应呈现自然的中性姿态

## Acceptance Criteria

### AC-1: VRM 加载后初始姿态为自然站立
- **Given**: 用户打开语音转手语页面
- **When**: VRM 模型加载完成，页面初始化完毕
- **Then**: 虚拟人呈自然站立姿态，双臂自然下垂于身体两侧，肘部微屈，不呈 T-pose
- **Verification**: `human-judgment`

### AC-2: 动画结束平滑归位
- **Given**: 用户输入"你好"并点击播放
- **When**: 动画播放完毕
- **Then**: 模型在 0.3 秒内平滑过渡回自然站立姿态，无 T-pose 闪现
- **Verification**: `human-judgment`

### AC-3: 核心手语词动画质量
- **Given**: 用户分别输入"你好""谢谢""再见"播放
- **When**: 动画播放时
- **Then**: 每个词的动作均可辨识，手部不穿入身体
- **Verification**: `human-judgment`

### AC-4: 多词连续播放流畅
- **Given**: 用户输入"你好谢谢再见"等多词组合播放
- **When**: 词与词之间过渡时
- **Then**: 词间过渡自然，无 T-pose 闪现
- **Verification**: `human-judgment`

### AC-5: 现有测试通过
- **Given**: 代码修改完成
- **When**: 运行 npm test
- **Then**: 所有现有测试用例通过
- **Verification**: `programmatic`

### AC-6: TypeScript 类型检查通过
- **Given**: 代码修改完成
- **When**: 运行 npx tsc --noEmit
- **Then**: 无类型错误
- **Verification**: `programmatic`

## Open Questions
- 无（问题已通过浏览器验证明确定位）
