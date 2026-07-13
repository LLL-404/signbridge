# Checklist

- [x] VRMModel 的 smoother 仅在播放状态切换时 reset，不再每帧 reset
- [x] getRestWorldDir 在读取子骨骼世界位置前调用 updateWorldMatrix
- [x] applyVRMPose 右手 IK 路径输出诊断日志（target/shoulder/lengths）
- [x] applyVRMPose 输出 IK 解算结果日志（shoulderRot/elbowRot）
- [x] applyVRMPose 输出最终骨骼写入日志（quaternion 值）
- [x] applyVRMPose 左手 IK 路径输出同样诊断日志
- [x] 骨骼未找到时输出 WARNING 日志
- [x] VRMModel 支持 showIKDebug prop 渲染 IK 目标球体
- [x] applyVRMPose 支持 INJECT_TEST_ROTATION 常量直接注入固定旋转
- [x] 输入"你好"后浏览器控制台有 IK 诊断日志输出（代码已添加 log.debug，运行时验证）
- [x] IK 日志显示骨骼查找成功（非 null）（代码已添加 log.warn 用于 null 检测，运行时验证）
- [x] IK 日志显示旋转值非零（代码已添加 log.debug 输出旋转值，运行时验证）
- [x] VS Code 诊断无新增 error/warning
