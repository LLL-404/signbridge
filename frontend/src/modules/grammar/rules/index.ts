// 规则包注册中心
// 集中管理所有手语规则包，提供按 ID 查询能力

import type { GrammarRulePack } from '@/types/grammar';
import { zhCSLRulePack } from './zhCSL';

/** 已注册的规则包映射表 */
const rulePackRegistry = new Map<string, GrammarRulePack>();

/** 注册规则包 */
function registerRulePack(pack: GrammarRulePack): void {
  rulePackRegistry.set(pack.id, pack);
}

// 注册内置规则包
registerRulePack(zhCSLRulePack);

/**
 * 按 ID 获取规则包
 * @param id 规则包 ID（如 'zhCSL'）
 * @returns 规则包，未找到返回 undefined
 */
export function getRulePack(id: string): GrammarRulePack | undefined {
  return rulePackRegistry.get(id);
}

/**
 * 获取所有已注册的规则包
 */
export function getAllRulePacks(): GrammarRulePack[] {
  return Array.from(rulePackRegistry.values());
}

/**
 * 注册自定义规则包
 * 用于扩展支持其他手语（如国际手语 IS）
 */
export function registerCustomRulePack(pack: GrammarRulePack): void {
  registerRulePack(pack);
}

/** 默认规则包 ID */
export const DEFAULT_RULE_PACK_ID = 'zhCSL';

/** 导出内置规则包 */
export { zhCSLRulePack } from './zhCSL';
