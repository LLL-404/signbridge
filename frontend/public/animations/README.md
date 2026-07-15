# Mixamo 动画素材目录

本目录用于存放从 Mixamo (https://www.mixamo.com/) 导出的 FBX 动画文件，作为手语动作捕捉素材。

## 使用方式
1. 在 Mixamo 网站选择角色（推荐 X Bot 或 Y Bot，使用默认 T-pose）
2. 选择动画（如 Waving、Pointing 等），下载为 FBX for Unity（含骨骼动画）
3. 命名为 `<word>.fbx`（如 `hello.fbx`），放到本目录
4. 在前端调用 `avatarDriver.playRetargetedAnimation('/animations/hello.fbx')` 播放

## 骨骼映射
参见 `src/modules/avatar/MixamoRetargeter.ts` 的 MIXAMO_VRM_RIG_MAP。
Mixamo 的 mixamorigX 骨骼会自动重映射到 VRM normalized bone。
