// 3D 虚拟人骨骼系统：使用 Three.js 创建骨骼和网格
//
// 坐标约定（右手坐标系，Y 轴向上）：
//   root(hips) 位于 (0, 0.9, 0)（地面在 y=0）
//   每个 Bone 节点的原点就是对应的"关节点"
//   骨骼段（CylinderGeometry）作为该关节的子 mesh，
//   沿局部 -Y 方向偏移半个长度，使圆柱一端对齐关节、另一端对齐下一关节
//   旋转 bone 时就是绕关节旋转，圆柱跟随旋转，天然保证连接不断开
import * as THREE from 'three';
import type { Vec3, BonePose, HandPose } from '@/types/avatar';
import { HandShape } from '@/types/sign';
import { FINGER_NAMES, FINGER_JOINTS } from './joints';

/** 角度转弧度 */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * 骨骼段长度配置（单位：Three.js 世界坐标 = FK 层级累加）
 * 所有长度都按"关节到关节"测量，mesh 半长 = length/2
 *
 * 身高计算（地面 y=0 到头顶 y≈1.75）：
 *   ankleY/2 + lowerLeg + upperLeg = 0.06 + 0.44 + 0.46 = 0.96 (hips y ≈ 1.0)
 *   hips→spine→chest→neck→head 中心 = 1.0 + 0.20+0.24+0.10+0.10 = 1.64
 *   头顶 = 1.64 + 0.12*0.6 + 0.12 ≈ 1.83? 调整为更合理:
 *   我们要 hips 位于 y=1.0，整体身高约 1.75
 */
const LIMB = {
  // 躯干
  hipsToSpine: 0.20,
  spineToChest: 0.22,
  chestToNeck: 0.08,
  neckToHead: 0.10,
  headRadius: 0.11,
  // 手臂
  shoulderWidth: 0.18,    // shoulder 关节相对 chest 中心 X 偏移
  shoulderDrop: -0.02,    // shoulder 相对 chest 的 Y 偏移（正值=在 chest 上方）
  upperArm: 0.30,         // 上臂长（shoulder → elbow）
  forearm: 0.28,          // 前臂长（elbow → wrist）
  // 腿
  hipsWidth: 0.10,
  upperLeg: 0.46,         // 大腿长（hip → knee）
  lowerLeg: 0.48,         // 小腿长（knee → ankle），配合 ankleY 让脚底刚好接触地面 y=0
  ankleY: 0.06,           // 脚厚（从脚底到脚踝的高度）
};

/** 手指长度配置（每节长度，单位：Three.js 坐标） */
const FINGER_LENGTHS: Record<string, [number, number, number, number?]> = {
  thumb:  [0.035, 0.040, 0.030, 0.025], // CMC/MCP/PIP/DIP
  index:  [0.050, 0.060, 0.040],         // MCP/PIP/DIP
  middle: [0.055, 0.065, 0.045],
  ring:   [0.050, 0.060, 0.040],
  pinky:  [0.040, 0.050, 0.032],
};

/** 手形 → 手指关节角度映射（弧度） */
const HAND_SHAPE_ANGLES: Record<string, number[]> = {
  // 拇指 CMC/MCP/PIP/DIP(4) + 食/中/无名/小指 MCP/PIP/DIP(4*3=12) = 16 个角度
  [HandShape.OPEN_5]: [0,0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0],
  [HandShape.FIST_A]: [deg(20),deg(40),deg(30),deg(30),
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90),
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90)],
  [HandShape.INDEX_POINT]: [deg(20),deg(40),deg(30),deg(30),
    0,0,0,
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90), deg(90),deg(100),deg(90)],
  [HandShape.V_SHAPE]: [deg(20),deg(40),deg(30),deg(30),
    0,0,0, 0,0,0,
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90)],
  [HandShape.FLAT_B]: [0,deg(5),deg(5),deg(5),
    0,deg(5),deg(5), 0,deg(5),deg(5), 0,deg(5),deg(5), 0,deg(5),deg(5)],
  [HandShape.THUMB_UP]: [0,0,0,0,
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90),
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90)],
  [HandShape.C_SHAPE]: [deg(15),deg(25),deg(20),deg(20),
    deg(30),deg(40),deg(30), deg(30),deg(40),deg(30),
    deg(30),deg(40),deg(30), deg(30),deg(40),deg(30)],
  [HandShape.O_SHAPE]: [deg(30),deg(45),deg(40),deg(40),
    deg(60),deg(70),deg(60), deg(60),deg(70),deg(60),
    deg(60),deg(70),deg(60), deg(60),deg(70),deg(60)],
  [HandShape.THREE]: [0,0,0,0,
    0,0,0, 0,0,0,
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90)],
  [HandShape.HORNS]: [deg(20),deg(40),deg(30),deg(30),
    0,0,0,
    deg(90),deg(100),deg(90), deg(90),deg(100),deg(90), 0,0,0],
};

/** 颜色配置 */
const COLOR = {
  skin: 0xe8d5b7,
  cloth: 0x4a90d9,
  clothDark: 0x3a78c0,
  joint: 0x2563eb,
  palm: 0xe0c8a8,
};

/** 3D 骨骼系统类 */
export class Skeleton3D {
  private group: THREE.Group;
  private bones: Map<string, THREE.Bone> = new Map();
  private skeletonRoot: THREE.Bone;

  constructor() {
    this.group = new THREE.Group();
    // root 对应 hips（髋关节中心）。初始中性姿态：hips 在 y=1.0，人物站立在 y=0 地面，
    // 整体身高约 1.75（到头顶）。所有子骨骼通过 local position 层级累加自动确定世界坐标。
    this.skeletonRoot = new THREE.Bone();
    this.skeletonRoot.name = 'root';
    this.skeletonRoot.position.set(0, 1.0, 0);
    this.group.add(this.skeletonRoot);
    this.build();
  }

  /** 构建完整骨骼和网格 */
  private build(): void {
    // === 躯干链（沿 +Y 向上生长，bone 位置 = 下一关节相对本关节的偏移） ===
    // hips(root) → spine → chest → neck → head
    // 注意：createBone 的 offset 是"下一关节相对本关节的位置"
    const spine = this.createBone('spine', this.skeletonRoot, { x: 0, y: LIMB.hipsToSpine, z: 0 });
    const chest = this.createBone('chest', spine, { x: 0, y: LIMB.spineToChest, z: 0 });
    const neck = this.createBone('neck', chest, { x: 0, y: LIMB.chestToNeck, z: 0 });
    const head = this.createBone('head', neck, { x: 0, y: LIMB.neckToHead, z: 0 });
    void head;

    // === 左臂链 ===
    // shoulder 关节在 chest 的侧上方
    const lShoulder = this.createBone('left_shoulder', chest, {
      x: -LIMB.shoulderWidth, y: LIMB.shoulderDrop, z: 0,
    });
    const lElbow = this.createBone('left_elbow', lShoulder, { x: 0, y: -LIMB.upperArm, z: 0 });
    const lWrist = this.createBone('left_wrist', lElbow, { x: 0, y: -LIMB.forearm, z: 0 });

    // === 右臂链 ===
    const rShoulder = this.createBone('right_shoulder', chest, {
      x: LIMB.shoulderWidth, y: LIMB.shoulderDrop, z: 0,
    });
    const rElbow = this.createBone('right_elbow', rShoulder, { x: 0, y: -LIMB.upperArm, z: 0 });
    const rWrist = this.createBone('right_wrist', rElbow, { x: 0, y: -LIMB.forearm, z: 0 });

    // === 左腿链 ===
    const lHip = this.createBone('left_hip', this.skeletonRoot, {
      x: -LIMB.hipsWidth, y: 0, z: 0,
    });
    const lKnee = this.createBone('left_knee', lHip, { x: 0, y: -LIMB.upperLeg, z: 0 });
    this.createBone('left_ankle', lKnee, { x: 0, y: -LIMB.lowerLeg, z: 0 });

    // === 右腿链 ===
    const rHip = this.createBone('right_hip', this.skeletonRoot, {
      x: LIMB.hipsWidth, y: 0, z: 0,
    });
    const rKnee = this.createBone('right_knee', rHip, { x: 0, y: -LIMB.upperLeg, z: 0 });
    this.createBone('right_ankle', rKnee, { x: 0, y: -LIMB.lowerLeg, z: 0 });

    // === 手部骨骼 ===
    this.buildHandBones('left', lWrist);
    this.buildHandBones('right', rWrist);

    // === 网格 ===
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

  /** 构建手部手指骨骼 */
  private buildHandBones(side: 'left' | 'right', wristBone: THREE.Bone): void {
    // 手掌作为 wrist 的一个子 mesh（不单独建 bone），手指根部相对 wrist 的偏移
    const fingerRoots: Vec3[] = [
      { x: side === 'left' ? -0.028 : 0.028, y: -0.005, z: 0.020 }, // 拇指（偏前）
      { x: side === 'left' ? -0.025 : 0.025, y: -0.040, z: 0.010 }, // 食指
      { x: 0, y: -0.045, z: 0.008 },                                // 中指
      { x: side === 'left' ? 0.020 : -0.020, y: -0.040, z: 0.010 }, // 无名指
      { x: side === 'left' ? 0.035 : -0.035, y: -0.032, z: 0.012 }, // 小指
    ];

    for (let fi = 0; fi < FINGER_NAMES.length; fi++) {
      const fingerName = FINGER_NAMES[fi];
      const lengths = FINGER_LENGTHS[fingerName];
      const rootOffset = fingerRoots[fi];
      let parentBone = wristBone;

      if (fingerName === 'thumb') {
        // 拇指：CMC 根部在 wrist 的 rootOffset，之后 MCP/PIP/DIP 依次沿 -Y 方向
        const cmcLen = lengths[0];
        const cmc = new THREE.Bone();
        cmc.name = `${side}_thumb_cmc`;
        cmc.position.set(rootOffset.x, rootOffset.y, rootOffset.z);
        parentBone.add(cmc);
        this.bones.set(`${side}_thumb_cmc`, cmc);

        const mcpLen = lengths[1];
        const mcp = new THREE.Bone();
        mcp.name = `${side}_thumb_mcp`;
        // MCP 相对 CMC 沿 CMC 局部 -Y 方向（CMC 会做对掌旋转，所以子节用本地坐标）
        mcp.position.set(0, -cmcLen, 0);
        cmc.add(mcp);
        this.bones.set(`${side}_thumb_mcp`, mcp);

        const pipLen = lengths[2];
        const pip = new THREE.Bone();
        pip.name = `${side}_thumb_pip`;
        pip.position.set(0, -mcpLen, 0);
        mcp.add(pip);
        this.bones.set(`${side}_thumb_pip`, pip);

        const dipLen = lengths[3] ?? 0;
        const dip = new THREE.Bone();
        dip.name = `${side}_thumb_dip`;
        dip.position.set(0, -pipLen, 0);
        pip.add(dip);
        this.bones.set(`${side}_thumb_dip`, dip);
        void dipLen;
      } else {
        // 其他四指：MCP 根部在 rootOffset，之后 PIP/DIP 沿 -Y
        for (let ji = 0; ji < FINGER_JOINTS.length; ji++) {
          const jointName = FINGER_JOINTS[ji];
          const boneName = `${side}_${fingerName}_${jointName}`;
          const bone = new THREE.Bone();
          bone.name = boneName;
          if (ji === 0) {
            bone.position.set(rootOffset.x, rootOffset.y, rootOffset.z);
          } else {
            const prevLen = lengths[ji - 1] ?? 0.04;
            bone.position.set(0, -prevLen, 0);
          }
          parentBone.add(bone);
          this.bones.set(boneName, bone);
          parentBone = bone;
        }
      }
    }
  }

  /** 创建网格几何体并附加到骨骼
   *  关键约定：每个"关节 bone"上挂一段"从本关节出发到下一关节"的骨骼段 mesh，
   *  mesh position.y = -length/2，使圆柱一端在关节点、另一端延伸到下一关节位置
   */
  private buildMeshes(): void {
    // 头部
    this.addMeshOffset('head', new THREE.SphereGeometry(LIMB.headRadius, 32, 32),
      COLOR.skin, { x: 0, y: LIMB.headRadius * 0.6, z: 0 });

    // 颈部段（chest→neck）：挂在 chest 下，沿 +Y 伸到 neck
    this.addLimbMesh('chest', new THREE.CylinderGeometry(0.032, 0.038, LIMB.chestToNeck, 8),
      COLOR.cloth, { x: 0, y: LIMB.chestToNeck / 2, z: 0 });

    // 躯干段（spine→chest）：挂在 spine 下，沿 +Y 伸到 chest
    this.addLimbMesh('spine', new THREE.CylinderGeometry(0.11, 0.13, LIMB.spineToChest, 16),
      COLOR.cloth, { x: 0, y: LIMB.spineToChest / 2, z: 0 });

    // 腰-胸段（hips→spine）：挂在 root(hips) 下
    this.addLimbMesh('root', new THREE.CylinderGeometry(0.13, 0.14, LIMB.hipsToSpine, 16),
      COLOR.clothDark, { x: 0, y: LIMB.hipsToSpine / 2, z: 0 });

    // 上臂段（shoulder→elbow）：圆柱从 shoulder 沿 -Y 到 elbow
    this.addLimbMesh('left_shoulder', new THREE.CylinderGeometry(0.032, 0.028, LIMB.upperArm, 8),
      COLOR.cloth, { x: 0, y: -LIMB.upperArm / 2, z: 0 });
    this.addLimbMesh('right_shoulder', new THREE.CylinderGeometry(0.032, 0.028, LIMB.upperArm, 8),
      COLOR.cloth, { x: 0, y: -LIMB.upperArm / 2, z: 0 });

    // 前臂段（elbow→wrist）：从 elbow 沿 -Y 到 wrist
    this.addLimbMesh('left_elbow', new THREE.CylinderGeometry(0.028, 0.024, LIMB.forearm, 8),
      COLOR.skin, { x: 0, y: -LIMB.forearm / 2, z: 0 });
    this.addLimbMesh('right_elbow', new THREE.CylinderGeometry(0.028, 0.024, LIMB.forearm, 8),
      COLOR.skin, { x: 0, y: -LIMB.forearm / 2, z: 0 });

    // 手掌：作为 wrist 的子 box
    this.addMeshOffset('left_wrist', new THREE.BoxGeometry(0.07, 0.08, 0.025),
      COLOR.palm, { x: 0, y: -0.04, z: 0 });
    this.addMeshOffset('right_wrist', new THREE.BoxGeometry(0.07, 0.08, 0.025),
      COLOR.palm, { x: 0, y: -0.04, z: 0 });

    // 大腿段（hip→knee）
    this.addLimbMesh('left_hip', new THREE.CylinderGeometry(0.045, 0.038, LIMB.upperLeg, 10),
      COLOR.clothDark, { x: 0, y: -LIMB.upperLeg / 2, z: 0 });
    this.addLimbMesh('right_hip', new THREE.CylinderGeometry(0.045, 0.038, LIMB.upperLeg, 10),
      COLOR.clothDark, { x: 0, y: -LIMB.upperLeg / 2, z: 0 });

    // 小腿段（knee→ankle）
    this.addLimbMesh('left_knee', new THREE.CylinderGeometry(0.038, 0.032, LIMB.lowerLeg, 10),
      COLOR.clothDark, { x: 0, y: -LIMB.lowerLeg / 2, z: 0 });
    this.addLimbMesh('right_knee', new THREE.CylinderGeometry(0.038, 0.032, LIMB.lowerLeg, 10),
      COLOR.clothDark, { x: 0, y: -LIMB.lowerLeg / 2, z: 0 });

    // 脚（脚踝处的小 box）
    this.addMeshOffset('left_ankle', new THREE.BoxGeometry(0.08, LIMB.ankleY, 0.14),
      0x2c2c3a, { x: 0, y: -LIMB.ankleY / 2, z: 0.035 });
    this.addMeshOffset('right_ankle', new THREE.BoxGeometry(0.08, LIMB.ankleY, 0.14),
      0x2c2c3a, { x: 0, y: -LIMB.ankleY / 2, z: 0.035 });

    // 手指段
    for (const side of ['left', 'right'] as const) {
      for (const finger of FINGER_NAMES) {
        const lengths = FINGER_LENGTHS[finger];
        if (finger === 'thumb') {
          // CMC 段
          const cmcLen = lengths[0];
          this.addLimbMesh(`${side}_thumb_cmc`, new THREE.CylinderGeometry(0.013, 0.011, cmcLen, 6),
            COLOR.skin, { x: 0, y: -cmcLen / 2, z: 0 });
          // MCP 段
          const mcpLen = lengths[1];
          this.addLimbMesh(`${side}_thumb_mcp`, new THREE.CylinderGeometry(0.012, 0.010, mcpLen, 6),
            COLOR.skin, { x: 0, y: -mcpLen / 2, z: 0 });
          // PIP 段
          const pipLen = lengths[2];
          this.addLimbMesh(`${side}_thumb_pip`, new THREE.CylinderGeometry(0.011, 0.009, pipLen, 6),
            COLOR.skin, { x: 0, y: -pipLen / 2, z: 0 });
          // DIP 段（指尖）
          const dipLen = lengths[3] ?? 0.02;
          this.addLimbMesh(`${side}_thumb_dip`, new THREE.CylinderGeometry(0.010, 0.008, dipLen, 6),
            COLOR.skin, { x: 0, y: -dipLen / 2, z: 0 });
        } else {
          for (let ji = 0; ji < FINGER_JOINTS.length; ji++) {
            const jointName = FINGER_JOINTS[ji];
            const boneName = `${side}_${finger}_${jointName}`;
            // 第 0 节（MCP）从 MCP 关节伸到 PIP 关节，长度 = lengths[0]
            // 第 1 节（PIP）从 PIP 伸到 DIP，长度 = lengths[1]
            // 第 2 节（DIP）指尖段，长度 = lengths[2]
            const len = lengths[ji] ?? 0.03;
            const rTop = 0.011 - ji * 0.002;
            const rBot = 0.009 - ji * 0.002;
            this.addLimbMesh(boneName, new THREE.CylinderGeometry(rTop, rBot, len, 6),
              COLOR.skin, { x: 0, y: -len / 2, z: 0 });
          }
        }
      }
    }

    // 关节球（可选视觉提示：在几个关键关节位置放小球）
    const jointBall = (name: string, r: number) => {
      const b = this.bones.get(name);
      if (!b) return;
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 12, 12),
        new THREE.MeshStandardMaterial({ color: COLOR.joint, roughness: 0.5, metalness: 0.1 }),
      );
      m.castShadow = true;
      b.add(m);
    };
    jointBall('left_shoulder', 0.022);
    jointBall('right_shoulder', 0.022);
    jointBall('left_elbow', 0.020);
    jointBall('right_elbow', 0.020);
    jointBall('left_wrist', 0.018);
    jointBall('right_wrist', 0.018);
    jointBall('left_knee', 0.022);
    jointBall('right_knee', 0.022);
    jointBall('left_hip', 0.025);
    jointBall('right_hip', 0.025);
  }

  /** 挂载"骨骼段圆柱"网格（castShadow 默认开启） */
  private addLimbMesh(
    boneName: string,
    geometry: THREE.BufferGeometry,
    color: number,
    offset: Vec3,
  ): void {
    this.addMeshOffset(boneName, geometry, color, offset, 0.6, 0.1);
  }

  /** 添加网格到指定骨骼 */
  private addMeshOffset(
    boneName: string,
    geometry: THREE.BufferGeometry,
    color: number,
    offset: Vec3,
    roughness: number = 0.6,
    metalness: number = 0.1,
  ): void {
    const bone = this.bones.get(boneName);
    if (!bone) return;
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(offset.x, offset.y, offset.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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

  /** 设置骨骼本地旋转（欧拉角，弧度） */
  setBoneRotation(name: string, rotation: Vec3): void {
    const bone = this.bones.get(name);
    if (bone) {
      bone.rotation.set(rotation.x, rotation.y, rotation.z);
    }
  }

  /** 应用完整姿态
   *  采用纯 FK（前向运动学）：只设骨骼本地旋转，不覆写位置，
   *  这样骨骼层级自动保证关节永远连接
   */
  applyPose(pose: BonePose): void {
    // 根位置（hips）：直接使用 pose.root.position，不再额外偏移
    const root = this.skeletonRoot;
    root.position.set(pose.root.position.x, pose.root.position.y, pose.root.position.z);
    root.rotation.set(pose.root.rotation.x, pose.root.rotation.y, pose.root.rotation.z);

    // 躯干
    this.setBoneRotation('spine', pose.spine.rotation);
    this.setBoneRotation('chest', pose.chest.rotation);
    this.setBoneRotation('neck', pose.neck.rotation);
    this.setBoneRotation('head', pose.head.rotation);

    // 手臂（肩/肘/wrist 旋转全部来自 IK，不覆写位置）
    this.setBoneRotation('left_shoulder', pose.left_shoulder.rotation);
    this.setBoneRotation('left_elbow', pose.left_elbow.rotation);
    this.setBoneRotation('left_wrist', pose.left_wrist.rotation);
    this.setBoneRotation('right_shoulder', pose.right_shoulder.rotation);
    this.setBoneRotation('right_elbow', pose.right_elbow.rotation);
    this.setBoneRotation('right_wrist', pose.right_wrist.rotation);

    // 腿（髋/膝/踝）暂设为 0，保持站姿
    this.setBoneRotation('left_hip', { x: 0, y: 0, z: 0 });
    this.setBoneRotation('left_knee', { x: 0, y: 0, z: 0 });
    this.setBoneRotation('left_ankle', { x: 0, y: 0, z: 0 });
    this.setBoneRotation('right_hip', { x: 0, y: 0, z: 0 });
    this.setBoneRotation('right_knee', { x: 0, y: 0, z: 0 });
    this.setBoneRotation('right_ankle', { x: 0, y: 0, z: 0 });

    // 手部姿态
    this.applyHandPose('left', pose.left_hand);
    this.applyHandPose('right', pose.right_hand);

    // 触发世界矩阵更新
    this.skeletonRoot.updateMatrixWorld(true);
  }

  /** 应用手部姿态 */
  applyHandPose(side: 'left' | 'right', hand: HandPose): void {
    const angles = HAND_SHAPE_ANGLES[hand.shape] ?? HAND_SHAPE_ANGLES[HandShape.OPEN_5];
    let idx = 0;

    // 拇指：CMC/MCP/PIP/DIP（4 节）
    for (const joint of ['cmc', 'mcp', 'pip', 'dip'] as const) {
      const boneName = `${side}_thumb_${joint}`;
      const xAngle = angles[idx] ?? 0;
      const zAngle = joint === 'cmc' ? (side === 'left' ? -deg(25) : deg(25)) : 0;
      this.setBoneRotation(boneName, { x: xAngle, y: 0, z: zAngle });
      idx++;
    }

    // 其他四指
    for (const finger of ['index', 'middle', 'ring', 'pinky']) {
      for (const joint of FINGER_JOINTS) {
        const boneName = `${side}_${finger}_${joint}`;
        const angle = angles[idx] ?? 0;
        // MCP 加一点外展（spread）让手指自然张开
        let zAngle = 0;
        if (joint === 'mcp') {
          if (finger === 'index') zAngle = side === 'left' ? deg(5) : -deg(5);
          if (finger === 'ring') zAngle = side === 'left' ? -deg(3) : deg(3);
          if (finger === 'pinky') zAngle = side === 'left' ? -deg(8) : deg(8);
        }
        this.setBoneRotation(boneName, { x: angle, y: 0, z: zAngle });
        idx++;
      }
    }

    // 手腕旋转（从 hand.wrist.rotation 取）
    this.setBoneRotation(`${side}_wrist`, hand.wrist.rotation);
  }

  /** 重置到中性姿态 */
  resetToNeutral(): void {
    for (const bone of this.bones.values()) {
      bone.rotation.set(0, 0, 0);
    }
    this.skeletonRoot.rotation.set(0, 0, 0);
    this.skeletonRoot.position.set(0, 1.0, 0);
    this.skeletonRoot.updateMatrixWorld(true);
  }
}
