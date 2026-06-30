import { useMemo, type CSSProperties } from 'react';
import { FacialExpression, HeadMovement } from '@/types/sign';
import type { BonePose } from '@/types/avatar';

/** 表情配置 */
const EXPRESSION_CONFIG: Record<FacialExpression, { icon: string; label: string; color: string }> = {
  [FacialExpression.NEUTRAL]: { icon: '', label: '', color: '' },
  [FacialExpression.HAPPY]: { icon: '😊', label: '开心', color: 'text-yellow-300' },
  [FacialExpression.SAD]: { icon: '😢', label: '悲伤', color: 'text-blue-300' },
  [FacialExpression.ANGRY]: { icon: '😠', label: '生气', color: 'text-red-300' },
  [FacialExpression.SURPRISED]: { icon: '😮', label: '惊讶', color: 'text-purple-300' },
  [FacialExpression.CONFUSED]: { icon: '😕', label: '困惑', color: 'text-orange-300' },
  [FacialExpression.QUESTION]: { icon: '🤨', label: '挑眉（疑问）', color: 'text-amber-300' },
  [FacialExpression.NEGATIVE]: { icon: '😒', label: '否定表情', color: 'text-rose-300' },
  [FacialExpression.EMPHASIS]: { icon: '😤', label: '强调表情', color: 'text-emerald-300' },
};

/** 头部动作配置 */
const HEAD_MOVEMENT_CONFIG: Record<HeadMovement, { icon: string; label: string; animClass: string }> = {
  [HeadMovement.NONE]: { icon: '', label: '', animClass: '' },
  [HeadMovement.NOD]: { icon: '↕️', label: '点头', animClass: 'animate-nod' },
  [HeadMovement.SLIGHT_NOD]: { icon: '↕', label: '微点头', animClass: 'animate-slight-nod' },
  [HeadMovement.SHAKE]: { icon: '↔️', label: '摇头', animClass: 'animate-shake' },
  [HeadMovement.TILT_LEFT]: { icon: '↪️', label: '左歪头', animClass: 'animate-tilt-left' },
  [HeadMovement.TILT_RIGHT]: { icon: '↩️', label: '右歪头', animClass: 'animate-tilt-right' },
};

/** NonManualMarkerOverlay Props */
export interface NonManualMarkerOverlayProps {
  /** 当前姿态（含 expression 和 head_movement） */
  pose: BonePose;
  /** 自定义类名 */
  className?: string;
  /** 自定义样式 */
  style?: CSSProperties;
}

/**
 * 非手动标记可视化覆盖层
 * 在虚拟人上方显示表情和头部动作提示标签
 */
export default function NonManualMarkerOverlay({ pose, className = '', style }: NonManualMarkerOverlayProps) {
  const exprConfig = useMemo(
    () => EXPRESSION_CONFIG[pose.expression] ?? EXPRESSION_CONFIG[FacialExpression.NEUTRAL],
    [pose.expression],
  );
  const headConfig = useMemo(
    () => HEAD_MOVEMENT_CONFIG[pose.head_movement] ?? HEAD_MOVEMENT_CONFIG[HeadMovement.NONE],
    [pose.head_movement],
  );

  const hasExpression = pose.expression !== FacialExpression.NEUTRAL;
  const hasHeadMovement = pose.head_movement !== HeadMovement.NONE;

  if (!hasExpression && !hasHeadMovement) {
    return null;
  }

  return (
    <div
      className={`absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none z-10 ${className}`}
      style={style}
    >
      {hasExpression && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 shadow-lg ${exprConfig.color}`}>
          <span className="text-base leading-none">{exprConfig.icon}</span>
          <span className="text-xs font-medium">{exprConfig.label}</span>
        </div>
      )}
      {hasHeadMovement && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 shadow-lg text-indigo-300 ${headConfig.animClass}`}>
          <span className="text-base leading-none">{headConfig.icon}</span>
          <span className="text-xs font-medium">{headConfig.label}</span>
        </div>
      )}
    </div>
  );
}
