// 3D 虚拟人 React 组件
import { useRef, useMemo, useEffect, Suspense, type CSSProperties } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { BonePose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';
import { Skeleton3D } from '@/modules/avatar/skeleton/Skeleton3D';

/** Avatar3D 渲染模式 */
export type AvatarMode = 'skeleton' | 'vrm';

/** Avatar3D 组件 Props */
export interface Avatar3DProps {
  /** 当前姿态 */
  pose?: BonePose;
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
  /** VRM 模式加载完成回调 */
  onVRMLoaded?: (vrm: unknown) => void;
}

/** 骨架模式内部渲染组件 */
function SkeletonAvatarModel({ pose }: { pose: BonePose }) {
  const groupRef = useRef<THREE.Group>(null);
  const skeleton = useMemo(() => new Skeleton3D(), []);
  const currentPoseRef = useRef<BonePose>(pose);

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
    currentPoseRef.current = pose;
  }, [pose]);

  useFrame((state) => {
    skeleton.applyPose(currentPoseRef.current);
    if (groupRef.current) {
      const t = state.clock.elapsedTime;
      groupRef.current.position.y = Math.sin(t * Math.PI * 2 * 0.5) * 0.005;
    }
  });

  return <group ref={groupRef} castShadow receiveShadow />;
}

/** VRM 模式组件（懒加载避免 SSR 问题） */
function VRMAvatarModel({
  pose,
  modelUrl,
  onLoaded,
}: {
  pose: BonePose;
  modelUrl?: string;
  onLoaded?: (vrm: unknown) => void;
}) {
  // 动态导入避免 tree-shaking 和 SSR 问题
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { VRMModel } = require('./VRMModel');
  if (!VRMModel) return null;
  return <VRMModel pose={pose} modelUrl={modelUrl} onLoaded={onLoaded} />;
}

/** 3D 虚拟人组件 */
export default function Avatar3D({
  pose,
  width = 400,
  height = 500,
  containerStyle,
  className,
  mode = 'skeleton',
  modelUrl = '/models/avatar.vrm',
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
        camera={{ position: [0, 0.3, 2.5], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
      >
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
