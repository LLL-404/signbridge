// 3D 虚拟人骨骼系统：使用 Three.js 创建骨骼和网格
import * as THREE from 'three';
import type { Vec3, BonePose, HandPose } from '@/types/avatar';
import { HandShape } from '@/types/sign';
import { FINGER_NAMES, FINGER_JOINTS } from './joints';

/** 角度转弧度 */
const deg = (d: number): number => (d * Math.PI) / 180;

/** 手指长度配置（每节长度，单位：Three.js 坐标） */
const FINGER_LENGTHS: Record<string, [number, number, number]> = {
  thumb: [0.05, 0.04, 0.03],   // 拇指略短：CMC+MCP+PIP+DIP 总长约 0.12
  index: [0.07, 0.06, 0.05],
  middle: [0.075, 0.065, 0.05],
  ring: [0.07, 0.06, 0.045],
  pinky: [0.06, 0.05, 0.04],
};

/** 手形 → 手指关节角度映射（弧度）
 *  每根手指3关节: [mcp, pip, dip]，顺序：拇指/食指/中指/无名指/小指
 *  拇指额外第一项为 CMC（腕掌关节）屈曲
 */
const HAND_SHAPE_ANGLES: Record<string, number[]> = {
  // CMC/MCP/PIP/DIP for thumb + MCP/PIP/DIP for other 4 fingers = 4+12 = 16 values
  [HandShape.OPEN_5]: [0, 0, 0, 0,  0,0,0, 0,0,0, 0,0,0, 0,0,0],
  [HandShape.FIST_A]:  [deg(20), deg(40), deg(30), deg(30),
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90),
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90)],
  [HandShape.INDEX_POINT]: [deg(20), deg(40), deg(30), deg(30),
    0,0,0,
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90), deg(90),deg(100),deg(90)],
  [HandShape.V_SHAPE]: [deg(20), deg(40), deg(30), deg(30),
    0,0,0, 0,0,0,
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90)],
  [HandShape.FLAT_B]: [0, deg(5), deg(5), deg(5),
    0,deg(5),deg(5), 0,deg(5),deg(5), 0,deg(5),deg(5), 0,deg(5),deg(5)],
  [HandShape.THUMB_UP]: [0, 0, 0, 0,
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90),
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90)],
  [HandShape.C_SHAPE]: [deg(15), deg(25), deg(20), deg(20),
    deg(30),deg(40),deg(30), deg(30),deg(40),deg(30),
    deg(30),deg(40),deg(30), deg(30),deg(40),deg(30)],
  [HandShape.O_SHAPE]: [deg(30), deg(45), deg(40), deg(40),
    deg(60),deg(70),deg(60), deg(60),deg(70),deg(60),
    deg(60),deg(70),deg(60), deg(60),deg(70),deg(60)],
  [HandShape.THREE]: [0, 0, 0, 0,
    0,0,0, 0,0,0,
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90)],
  [HandShape.HORNS]: [deg(20), deg(40), deg(30), deg(30),
    0,0,0,
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90), 0,0,0],
};

/** 3D 骨骼系统类 */
export class Skeleton3D {
  private group: THREE.Group;
  private bones: Map<string, THREE.Bone> = new Map();
  private skeletonRoot: THREE.Bone;

  constructor() {
    this.group = new THREE.Group();
    this.skeletonRoot = new THREE.Bone();
    this.skeletonRoot.name = 'root';
    this.group.add(this.skeletonRoot);
    this.build();
  }

  /** 构建完整骨骼和网格 */
  private build(): void {
    // 创建身体骨骼
    const spine = this.createBone('spine', this.skeletonRoot, { x: 0, y: 0.5, z: 0 });
    const chest = this.createBone('chest', spine, { x: 0, y: 0.3, z: 0 });
    const neck = this.createBone('neck', chest, { x: 0, y: 0.15, z: 0 });
    this.createBone('head', neck, { x: 0, y: 0.12, z: 0 });

    // 左臂（肩/肘/腕链）
    const leftShoulder = this.createBone('left_shoulder', chest, { x: -0.2, y: 0.1, z: 0 });
    const leftElbow = this.createBone('left_elbow', leftShoulder, { x: 0, y: -0.28, z: 0 });
    // 左手腕骨（位置=0，相对于手部容器，由 applyPose 直接设置世界坐标）
    this.createBone('left_wrist', leftElbow, { x: 0, y: 0, z: 0 });

    // 右臂
    const rightShoulder = this.createBone('right_shoulder', chest, { x: 0.2, y: 0.1, z: 0 });
    const rightElbow = this.createBone('right_elbow', rightShoulder, { x: 0, y: -0.28, z: 0 });
    this.createBone('right_wrist', rightElbow, { x: 0, y: 0, z: 0 });

    // 创建手指骨骼（双手）
    // 拇指有 4 节（CMC/MCP/PIP/DIP），其他四指 3 节（MCP/PIP/DIP）
    this.buildHandBones('left', this.getBone('left_wrist')!);
    this.buildHandBones('right', this.getBone('right_wrist')!);

    // 创建网格
    this.buildMeshes();
  }

  /** 创建单个骨骼 */
  private createBone(name: string, parent: THREE.Bone, offset: Vec3): THREE.Bone {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(offset.x, offset.y, offset.z);
    parent.add(bone);
    this.bones.set(name, bone);
    return bone;
  }

  /** 构建手部手指骨骼
   * @param wristBone 手腕骨骼（父节点）
   */
  private buildHandBones(side: 'left' | 'right', wristBone: THREE.Bone): void {
    // 5 根手指的根部在手掌上的偏移（x=水平，y=沿手腕向下手掌方向，z=前后）
    const fingerRoots: Vec3[] = [
      // 拇指：偏向外侧（z 方向突出），位置较高
      { x: side === 'left' ? -0.03 : 0.03, y: -0.015, z: 0.025 },
      // 食指
      { x: side === 'left' ? -0.02 : 0.02, y: -0.055, z: 0.012 },
      // 中指（中间）
      { x: 0, y: -0.06, z: 0.01 },
      // 无名指
      { x: side === 'left' ? 0.015 : -0.015, y: -0.055, z: 0.012 },
      // 小指（最外侧，位置最低）
      { x: side === 'left' ? 0.03 : -0.03, y: -0.045, z: 0.015 },
    ];

    for (let fi = 0; fi < FINGER_NAMES.length; fi++) {
      const fingerName = FINGER_NAMES[fi];
      const lengths = FINGER_LENGTHS[fingerName];
      const rootOffset = fingerRoots[fi];
      let parentBone = wristBone;

      if (fingerName === 'thumb') {
        // 拇指：第 0 节是 CMC（腕掌关节），附加在手腕根部
        // CMC
        const cmcBone = new THREE.Bone();
        cmcBone.name = `${side}_thumb_cmc`;
        cmcBone.position.set(rootOffset.x, rootOffset.y, rootOffset.z);
        parentBone.add(cmcBone);
        this.bones.set(`${side}_thumb_cmc`, cmcBone);
        parentBone = cmcBone;

        // MCP/PIP/DIP（3 节）
        for (let ji = 0; ji < 3; ji++) {
          const jointName = FINGER_JOINTS[ji];
          const boneName = `${side}_thumb_${jointName}`;
          const bone = new THREE.Bone();
          bone.name = boneName;
          // 第一关节（mcp）从 CMC 根部偏移，后续沿 Y 轴向下
          bone.position.set(0, ji === 0 ? -lengths[0] : 0, ji === 0 ? 0 : -lengths[ji]);
          if (ji > 0) {
            // 后续节从上一节末端延伸（需在添加后计算，本实现简化：各节沿 Y 累积）
            // 实际：第 ji 节从第 ji-1 节末端生长，本骨骼系统中用 Y 偏移表示
            // 修正：所有节都从 parent 沿 Y 轴延伸，长度在 addMesh 中使用
            bone.position.set(0, -lengths[ji - 1], 0);
          }
          parentBone.add(bone);
          this.bones.set(boneName, bone);
          parentBone = bone;
        }
      } else {
        // 其他四指：3 节（MCP/PIP/DIP），从手掌根部延伸
        for (let ji = 0; ji < FINGER_JOINTS.length; ji++) {
          const jointName = FINGER_JOINTS[ji];
          const boneName = `${side}_${fingerName}_${jointName}`;
          const bone = new THREE.Bone();
          bone.name = boneName;
          // 第一关节（mcp）从手指根部偏移，后续沿 Y 轴向下
          if (ji === 0) {
            bone.position.set(rootOffset.x, rootOffset.y, rootOffset.z);
          } else {
            bone.position.set(0, -lengths[ji - 1], 0);
          }
          parentBone.add(bone);
          this.bones.set(boneName, bone);
          parentBone = bone;
        }
      }
    }
  }

  /** 创建网格几何体并附加到骨骼 */
  private buildMeshes(): void {
    // 头部（肤色）
    this.addMesh(this.getBone('head')!, new THREE.SphereGeometry(0.095, 32, 32), 0xe8d5b7, { x: 0, y: 0.1, z: 0 });

    // 躯干（主色蓝）
    this.addMesh(this.getBone('chest')!, new THREE.CylinderGeometry(0.12, 0.1, 0.5, 16), 0x4a90d9, { x: 0, y: 0.1, z: 0 });

    // 颈部（主色蓝）
    this.addMesh(this.getBone('neck')!, new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), 0x4a90d9, { x: 0, y: 0.05, z: 0 });

    // 左臂
    this.addMesh(this.getBone('left_shoulder')!, new THREE.CylinderGeometry(0.035, 0.03, 0.28, 8), 0x5a9ee0, { x: 0, y: -0.12, z: 0 });
    this.addMesh(this.getBone('left_elbow')!, new THREE.CylinderGeometry(0.03, 0.025, 0.28, 8), 0x5a9ee0, { x: 0, y: -0.12, z: 0 });
    this.addMesh(this.getBone('left_wrist')!, new THREE.BoxGeometry(0.07, 0.05, 0.02), 0xe8d5b7, { x: 0, y: -0.025, z: 0 });

    // 右臂
    this.addMesh(this.getBone('right_shoulder')!, new THREE.CylinderGeometry(0.035, 0.03, 0.28, 8), 0x5a9ee0, { x: 0, y: -0.12, z: 0 });
    this.addMesh(this.getBone('right_elbow')!, new THREE.CylinderGeometry(0.03, 0.025, 0.28, 8), 0x5a9ee0, { x: 0, y: -0.12, z: 0 });
    this.addMesh(this.getBone('right_wrist')!, new THREE.BoxGeometry(0.07, 0.05, 0.02), 0xe8d5b7, { x: 0, y: -0.025, z: 0 });

    // 手指网格（双手）
    for (const side of ['left', 'right'] as const) {
      for (const finger of FINGER_NAMES) {
        const lengths = FINGER_LENGTHS[finger];
        // 拇指有 4 节（包括 CMC），其他四指 3 节
        const jointCount = finger === 'thumb' ? 3 : 3; // CMC 不单独渲染掌骨
        for (let ji = 0; ji < jointCount; ji++) {
          const jointName = FINGER_JOINTS[ji];
          const boneName = `${side}_${finger}_${jointName}`;
          const bone = this.getBone(boneName);
          if (bone) {
            const len = lengths[ji] * 0.8;
            this.addMesh(bone, new THREE.CylinderGeometry(0.011, 0.009, len, 6), 0xe8d5b7, { x: 0, y: -len / 2, z: 0 });
          }
        }
        // 拇指 CMC 单独渲染掌骨
        if (finger === 'thumb') {
          const cmcBone = this.getBone(`${side}_thumb_cmc`);
          if (cmcBone) {
            this.addMesh(cmcBone, new THREE.CylinderGeometry(0.015, 0.012, lengths[0] * 0.7, 6), 0xe8d5b7, { x: 0, y: -lengths[0] * 0.35, z: 0 });
          }
        }
      }
    }
  }

  /** 添加网格到骨骼 */
  private addMesh(
    bone: THREE.Bone,
    geometry: THREE.BufferGeometry,
    color: number,
    offset: Vec3,
    roughness: number = 0.6,
    metalness: number = 0.1,
  ): void {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(offset.x, offset.y, offset.z);
    mesh.castShadow = true;
    bone.add(mesh);
  }

  /** 获取 Three.js Group */
  getGroup(): THREE.Group {
    return this.group;
  }

  /** 获取骨骼根节点 */
  getRoot(): THREE.Bone {
    return this.skeletonRoot;
  }

  /** 按名称获取骨骼 */
  getBone(name: string): THREE.Bone | null {
    return this.bones.get(name) ?? null;
  }

  /** 获取所有骨骼 */
  getAllBones(): Map<string, THREE.Bone> {
    return this.bones;
  }

  /** 设置骨骼旋转（欧拉角，弧度） */
  setBoneRotation(name: string, rotation: Vec3): void {
    const bone = this.bones.get(name);
    if (bone) {
      bone.rotation.set(rotation.x, rotation.y, rotation.z);
    }
  }

  /** 设置骨骼位置（世界坐标变换） */
  setBonePosition(name: string, position: Vec3): void {
    const bone = this.bones.get(name);
    if (bone) {
      bone.position.set(position.x, position.y, position.z);
    }
  }

  /** 应用完整姿态（P0 修复：同时更新位置和旋转） */
  applyPose(pose: BonePose): void {
    // 身体旋转
    this.setBoneRotation('spine', pose.spine.rotation);
    this.setBoneRotation('chest', pose.chest.rotation);
    this.setBoneRotation('neck', pose.neck.rotation);
    this.setBoneRotation('head', pose.head.rotation);

    // 手臂旋转（来自 IK 反算后的正确肩肘角）
    this.setBoneRotation('left_shoulder', pose.left_shoulder.rotation);
    this.setBoneRotation('left_elbow', pose.left_elbow.rotation);
    this.setBoneRotation('right_shoulder', pose.right_shoulder.rotation);
    this.setBoneRotation('right_elbow', pose.right_elbow.rotation);

    // P0 修复：手腕位置由 AvatarDriver 通过 IK 设置，直接应用世界坐标
    // wrist 骨骼的 parent 是 elbow，elbow 有旋转，通过 inverse(world_elbow) 映射到局部坐标
    this.applyWristPosition('left', pose.left_wrist.position);
    this.applyWristPosition('right', pose.right_wrist.position);

    // 手部姿态
    this.applyHandPose('left', pose.left_hand);
    this.applyHandPose('right', pose.right_hand);

    // 触发世界矩阵更新，使子骨骼位置同步
    this.skeletonRoot.updateMatrixWorld(true);
  }

  /**
   * 将手腕世界坐标映射到 wrist 骨骼的局部位置
   * wrist.parent = elbow，elbow 有旋转，因此需要解算局部偏移
   * 公式：local_wrist = world_wrist * inverse(world_elbow)
   */
  private applyWristPosition(side: 'left' | 'right', wristWorld: Vec3): void {
    const wristBone = this.bones.get(`${side}_wrist`);
    const elbowBone = this.bones.get(`${side}_elbow`);
    if (!wristBone || !elbowBone) return;

    // 获取肘部世界变换矩阵
    elbowBone.updateMatrixWorld(false);
    const elbowMatrix = new THREE.Matrix4();
    elbowMatrix.copy(elbowBone.matrixWorld);
    elbowMatrix.invert();

    // 手腕世界坐标转局部坐标（相对于肘部）
    const wristVec = new THREE.Vector3(wristWorld.x, wristWorld.y, wristWorld.z);
    const localPos = wristVec.applyMatrix4(elbowMatrix);
    wristBone.position.set(localPos.x, localPos.y, localPos.z);
  }

  /** 应用手部姿态（手形 → 手指关节角度）
   *  拇指有 CMC/MCP/PIP/DIP（4 节），其他四指有 MCP/PIP/DIP（3 节）
   */
  applyHandPose(side: 'left' | 'right', hand: HandPose): void {
    const angles = HAND_SHAPE_ANGLES[hand.shape] ?? HAND_SHAPE_ANGLES[HandShape.OPEN_5];
    let idx = 0;

    // 拇指：CMC/MCP/PIP/DIP（4 节，索引 0-3）
    for (const joint of ['cmc', 'mcp', 'pip', 'dip'] as const) {
      const boneName = `${side}_thumb_${joint}`;
      // 屈曲绕 X 轴，对掌(adduction/abduction)绕 Z 轴
      // 拇指 CMC 主要做屈曲，MCP/PIP/DIP 屈曲
      const xAngle = angles[idx] ?? 0;
      const zAngle = joint === 'cmc' ? (side === 'left' ? -deg(15) : deg(15)) : 0;
      this.setBoneRotation(boneName, { x: xAngle, y: 0, z: zAngle });
      idx++;
    }

    // 食指/中指/无名指/小指（4×3=12 节，索引 4-15）
    for (const finger of ['index', 'middle', 'ring', 'pinky']) {
      for (const joint of FINGER_JOINTS) {
        const boneName = `${side}_${finger}_${joint}`;
        const angle = angles[idx] ?? 0;
        this.setBoneRotation(boneName, { x: angle, y: 0, z: 0 });
        idx++;
      }
    }

    // 手腕旋转（来自 pose）
    this.setBoneRotation(`${side}_wrist`, hand.wrist.rotation);
  }

  /** 重置到中性姿态 */
  resetToNeutral(): void {
    for (const bone of this.bones.values()) {
      bone.rotation.set(0, 0, 0);
      // 重置手腕位置（相对于肘部）
      if (bone.name.endsWith('_wrist')) {
        bone.position.set(0, 0, 0);
      }
    }
    // 手指自然微弯
    for (const side of ['left', 'right'] as const) {
      this.applyHandPose(side, {
        shape: HandShape.OPEN_5,
        location: 'neutral' as never,
        palm_orientation: 'inward',
        wrist: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        fingers: [
          { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
          { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
          { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
          { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
          { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        ],
      });
    }
    this.skeletonRoot.updateMatrixWorld(true);
  }
}
