// 3D 虚拟人 React 组件
import { useRef, useMemo, useEffect, Suspense, type CSSProperties, lazy } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { BonePose, VRMPose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';
import { Skeleton3D } from '@/modules/avatar/skeleton/Skeleton3D';
import { BoneSmoother } from '@/modules/avatar/Smoother';
import type { VRMAnimator } from '@/modules/avatar/VRMAnimator';

/** Avatar3D 渲染模式 */
export type AvatarMode = 'skeleton' | 'vrm';

/** Avatar3D 组件 Props */
export interface Avatar3DProps {
  /** 当前姿态（旧 BonePose，供 skeleton 模式与 VRM 回退路径） */
  pose?: BonePose;
  /** VRM 标准姿态（新骨骼轨道，提供时 VRM 模型优先使用） */
  vrmPose?: VRMPose;
  /** 画布宽度 */
  width?: number | string;
  /** 画布高度 */
  height?: number | string;
  /** 容器额外内联样式 */
  containerStyle?: CSSProperties;
  /** 自定义类名 */
  className?: string;
  /**
   * 渲染模式：
   *   'skeleton' — 骨架模式（代码生成几何体，轻量，无外部依赖）
   *   'vrm'      — VRM 模式（加载标准 VRM 模型，高保真，需 modelUrl）
   */
  mode?: AvatarMode;
  /** VRM 模型路径（mode='vrm' 时使用，public 目录下的相对路径） */
  modelUrl?: string;
  /** VRM 模式加载完成回调，同时传递 VRM 和 VRMAnimator 实例 */
  onVRMLoaded?: (vrm: VRM, animator: VRMAnimator) => void;
}

/** 根据容器宽高比动态调整相机，确保模型在不同设备上显示一致 */
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    // 竖屏（宽高比 < 1）时拉远相机，确保模型完整显示
    const baseDistance = 2.5;
    const distance = aspect < 1 ? baseDistance / aspect * 0.85 : baseDistance;
    camera.position.set(0, 0.3, distance);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

/** 骨架模式内部渲染组件 */
function SkeletonAvatarModel({ pose }: { pose: BonePose }) {
  const groupRef = useRef<THREE.Group>(null);
  const skeleton = useMemo(() => new Skeleton3D(), []);
  const currentPoseRef = useRef<BonePose>(pose);
  const smoother = useMemo(() => new BoneSmoother(1.5, 0.01), []);
  const lastPoseRef = useRef<BonePose>(NEUTRAL_POSE);
  const blendRef = useRef(0);

  useEffect(() => {
    if (groupRef.current) {
      const skelGroup = skeleton.getGroup();
      groupRef.current.add(skelGroup);
      skelGroup.position.y = -1.0;
      skeleton.applyPose(NEUTRAL_POSE);
    }
    return () => {
      if (groupRef.current) {
        groupRef.current.remove(skeleton.getGroup());
      }
    };
  }, [skeleton]);

  useEffect(() => {
    // pose 变化时重置平滑器，避免过渡延迟
    smoother.reset();
    currentPoseRef.current = pose;
  }, [pose, smoother]);

  useFrame((state) => {
    const targetPose = currentPoseRef.current;
    const timestamp = state.clock.elapsedTime * 1000;

    // 对关键关节做 One-Euro 滤波平滑
    const smoothedPose: BonePose = { ...targetPose };
    const jointsToSmooth = [
      'left_shoulder', 'left_elbow', 'left_wrist',
      'right_shoulder', 'right_elbow', 'right_wrist',
      'neck', 'head', 'spine', 'chest',
    ] as const;

    for (const joint of jointsToSmooth) {
      const j = targetPose[joint];
      const smoothedRot = smoother.smooth(joint, j.rotation, timestamp);
      smoothedPose[joint] = { ...j, rotation: smoothedRot };
    }

    // 渲染层 lerp 插值：从上一帧姿态平滑过渡到目标姿态
    blendRef.current = Math.min(1, blendRef.current + 0.15);
    const blend = blendRef.current;
    const lerpedPose = { ...smoothedPose };
    for (const joint of jointsToSmooth) {
      const target = smoothedPose[joint];
      const last = lastPoseRef.current[joint];
      lerpedPose[joint] = {
        position: target.position,
        rotation: {
          x: last.rotation.x + (target.rotation.x - last.rotation.x) * blend,
          y: last.rotation.y + (target.rotation.y - last.rotation.y) * blend,
          z: last.rotation.z + (target.rotation.z - last.rotation.z) * blend,
        },
      };
    }
    if (blend >= 1) {
      lastPoseRef.current = smoothedPose;
      blendRef.current = 0;
    }

    skeleton.applyPose(lerpedPose);
    if (groupRef.current) {
      const t = state.clock.elapsedTime;
      groupRef.current.position.y = Math.sin(t * Math.PI * 2 * 0.5) * 0.005;
    }
  });

  return <group ref={groupRef} castShadow receiveShadow />;
}

/** VRM 模式组件（懒加载避免 SSR 问题） */
const LazyVRMModel = lazy(() =>
  import('./VRMModel').then((mod) => ({ default: mod.VRMModel })),
);

function VRMAvatarModel({
  pose,
  vrmPose,
  modelUrl,
  onLoaded,
}: {
  pose: BonePose;
  vrmPose?: VRMPose;
  modelUrl?: string;
  onLoaded?: (vrm: VRM, animator: VRMAnimator) => void;
}) {
  return <LazyVRMModel pose={pose} vrmPose={vrmPose} modelUrl={modelUrl} onLoaded={onLoaded} />;
}

/** 3D 虚拟人组件 */
export default function Avatar3D({
  pose,
  vrmPose,
  width = 400,
  height = 500,
  containerStyle,
  className,
  mode = 'vrm',
  modelUrl = `${import.meta.env.BASE_URL}models/avatar.vrm`,
  onVRMLoaded,
}: Avatar3DProps) {
  const currentPose = pose ?? NEUTRAL_POSE;

  const mergedStyle: CSSProperties = { width, height, ...containerStyle };

  return (
    <div
      style={mergedStyle}
      className={`rounded-2xl overflow-hidden bg-gradient-to-b from-dark-900 to-dark-950 ${className ?? ''}`}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.3, 2.5], fov: 45, near: 0.1, far: 50 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false }}
      >
        {/* 响应式相机：根据宽高比自动调整 */}
        <ResponsiveCamera />

        {/* 雾效 */}
        <fog attach="fog" args={['#0a0a0f', 3, 8]} />

        {/* 灯光 */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[2, 3, 2]}
          intensity={0.8}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-near={0.5}
          shadow-camera-far={10}
          shadow-camera-left={-2}
          shadow-camera-right={2}
          shadow-camera-top={2}
          shadow-camera-bottom={-2}
        />
        <directionalLight position={[-2, 1, 1]} intensity={0.35} color={0xffd9a0} />
        <directionalLight position={[0, 2, -3]} intensity={0.4} color={0x88aaff} />

        {/* 舞台地面 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.0, 0]} receiveShadow>
          <circleGeometry args={[1.5, 64]} />
          <meshStandardMaterial color={0x1a1a2e} roughness={0.8} metalness={0.2} />
        </mesh>

        {/* 渲染模式 */}
        {mode === 'vrm' ? (
          <Suspense fallback={null}>
            <VRMAvatarModel
              pose={currentPose}
              vrmPose={vrmPose}
              modelUrl={modelUrl}
              onLoaded={onVRMLoaded}
            />
          </Suspense>
        ) : (
          <SkeletonAvatarModel pose={currentPose} />
        )}

        {/* 视角控制 */}
        <OrbitControls
          target={[0, 0.2, 0]}
          minDistance={1.5}
          maxDistance={5}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 1.8}
          enablePan={false}
        />
      </Canvas>
    </div>
  );
}
