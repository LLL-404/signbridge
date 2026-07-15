/**
 * @file validateVocabulary.ts
 * @description 词汇数据校验工具 —— 确保所有 SignGloss 字段值使用合法枚举值
 *
 * 设计目的：
 *   - 在开发环境启动时自动校验 COMMON_VOCABULARY 中的所有词汇
 *   - 发现非法字段时通过 logger.warn 输出详细报告，不阻塞启动
 *   - 帮助开发者快速定位词汇数据中的枚举值不一致问题
 */

import type { SignGloss } from '@/types/sign';
import {
  HandShape,
  HandLocation,
  Movement,
  PalmOrientation,
  FacialExpression,
  HeadMovement,
} from '@/types/sign';
import { COMMON_VOCABULARY } from './CommonVocabulary';
import { logger } from '@/modules/debug/logger';

const log = logger.module('validateVocabulary');

/** 校验错误信息 */
export interface ValidationError {
  gloss_id: string;
  field: string;
  value: string;
  expected: string;
}

/** 单个词汇校验结果 */
export interface SignGlossValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** 全部词汇校验结果 */
export interface ValidationResult {
  valid: boolean;
  totalGlosses: number;
  totalErrors: number;
  errors: ValidationError[];
}

/** 获取枚举的所有合法字符串值 */
function enumValues<T extends object>(enumObj: T): string[] {
  return Object.values(enumObj) as string[];
}

// 预计算合法值集合，避免每次校验都重新计算
const VALID_HANDSHAPES = enumValues(HandShape);
const VALID_LOCATIONS = enumValues(HandLocation);
const VALID_MOVEMENTS = enumValues(Movement);
const VALID_PALM_ORIENTATIONS = enumValues(PalmOrientation);
const VALID_EXPRESSIONS = enumValues(FacialExpression);
const VALID_HEAD_MOVEMENTS = enumValues(HeadMovement);

/**
 * 校验单个 SignGloss 的所有字段是否使用合法枚举值
 * @param gloss 待校验的词汇
 * @returns 校验结果，包含所有非法字段的详细信息
 */
export function validateSignGloss(gloss: SignGloss): SignGlossValidationResult {
  const errors: ValidationError[] = [];

  // 校验函数：检查字段值是否在合法枚举值集合中
  const check = (field: string, value: string, validValues: string[], expected: string): void => {
    if (!validValues.includes(value)) {
      errors.push({ gloss_id: gloss.gloss_id, field, value, expected });
    }
  };

  // 校验 manual 字段
  const m = gloss.manual;
  check('manual.handshape_start', m.handshape_start, VALID_HANDSHAPES, 'one of HandShape enum');
  check('manual.handshape_end', m.handshape_end, VALID_HANDSHAPES, 'one of HandShape enum');
  check('manual.location_start', m.location_start, VALID_LOCATIONS, 'one of HandLocation enum');
  check('manual.location_end', m.location_end, VALID_LOCATIONS, 'one of HandLocation enum');
  check('manual.movement', m.movement, VALID_MOVEMENTS, 'one of Movement enum');
  check('manual.palm_orientation', m.palm_orientation, VALID_PALM_ORIENTATIONS, 'one of PalmOrientation enum');

  // 校验 non_manual 字段
  const nm = gloss.non_manual;
  check('non_manual.expression', nm.expression, VALID_EXPRESSIONS, 'one of FacialExpression enum');
  check('non_manual.head_movement', nm.head_movement, VALID_HEAD_MOVEMENTS, 'one of HeadMovement enum');

  return { valid: errors.length === 0, errors };
}

/**
 * 校验 COMMON_VOCABULARY 中的所有词汇
 * @returns 全部校验结果，包含所有非法字段的汇总报告
 */
export function validateAllVocabulary(): ValidationResult {
  const allErrors: ValidationError[] = [];

  for (const gloss of COMMON_VOCABULARY) {
    const result = validateSignGloss(gloss);
    if (!result.valid) {
      allErrors.push(...result.errors);
    }
  }

  return {
    valid: allErrors.length === 0,
    totalGlosses: COMMON_VOCABULARY.length,
    totalErrors: allErrors.length,
    errors: allErrors,
  };
}

/**
 * 在开发环境启动时调用，发现非法字段时通过 logger.warn 输出报告
 * 应在应用启动流程早期调用
 */
export function runVocabularyValidationOnStartup(): void {
  if (!import.meta.env.DEV) return;

  const result = validateAllVocabulary();
  if (result.valid) return;

  // 输出详细非法字段报告
  log.warn(`发现 ${result.totalErrors} 个非法字段（共 ${result.totalGlosses} 个词汇）`);
  for (const err of result.errors) {
    log.warn(`  [${err.gloss_id}] ${err.field} = '${err.value}'（期望: ${err.expected}）`);
  }
}
