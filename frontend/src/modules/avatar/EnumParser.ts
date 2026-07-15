// 枚举解析工具：将字符串安全转换为手语相关枚举类型
// 统一 AvatarDriver 和 ClipBuilder 中重复的解析逻辑

import {
  HandShape,
  HandLocation,
  FacialExpression,
  HeadMovement,
  PalmOrientation,
} from '@/types/sign';
import { logger } from '@/modules/debug/logger';

const log = logger.module('EnumParser');

/**
 * 泛型枚举解析函数
 * @param enumObj 枚举对象
 * @param value 要解析的字符串值
 * @param fallback 无法识别时的默认值
 * @param enumName 枚举名称（用于日志）
 * @returns 解析后的枚举值或 fallback
 */
export function parseEnum<T extends Record<string, string>>(
  enumObj: T,
  value: string,
  fallback: T[keyof T],
  enumName?: string,
): T[keyof T] {
  const values = Object.values(enumObj);
  if (values.includes(value)) {
    return value as T[keyof T];
  }
  if (enumName) {
    log.debug('枚举解析失败，使用 fallback', { enumName, value, fallback });
  }
  return fallback;
}

/** 将字符串安全转换为 HandShape 枚举，无法识别时返回 OPEN_5 */
export function parseHandShape(s: string): HandShape {
  return parseEnum(HandShape, s, HandShape.OPEN_5, 'HandShape');
}

/** 将字符串安全转换为 HandLocation 枚举，无法识别时返回 NEUTRAL */
export function parseHandLocation(s: string): HandLocation {
  return parseEnum(HandLocation, s, HandLocation.NEUTRAL, 'HandLocation');
}

/** 将字符串安全转换为 FacialExpression 枚举，无法识别时返回 NEUTRAL */
export function parseFacialExpression(s: string): FacialExpression {
  return parseEnum(FacialExpression, s, FacialExpression.NEUTRAL, 'FacialExpression');
}

/** 将字符串安全转换为 HeadMovement 枚举，无法识别时返回 NONE */
export function parseHeadMovement(s: string): HeadMovement {
  return parseEnum(HeadMovement, s, HeadMovement.NONE, 'HeadMovement');
}

/** 将字符串安全转换为 PalmOrientation 枚举，无法识别时返回 INWARD */
export function parsePalmOrientation(s: string): PalmOrientation {
  return parseEnum(PalmOrientation, s, PalmOrientation.INWARD, 'PalmOrientation');
}
