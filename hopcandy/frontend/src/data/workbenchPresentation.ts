import type { HopCandyResponse } from '../types';
import { humanize } from '../lib/format';

export function warningMessage(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    FROZEN_REPLAY: '这是一次已冻结的实验回放，不会发起实时查询。',
    ABLATION_ONLY: '该结果仅用于模型规模消融对照，不代表独立发布结果。',
    DEVELOPMENT_BASELINE: '文本型 2-hop 当前是开发基线，仍存在已知检索与推理限制。',
    PARTIAL_GOLD_CHAIN: '本次运行只召回了部分金标证据链。',
    EVIDENCE_EXHAUSTED: '验证器持续判定证据不足，系统已执行安全弃答。',
  };
  return messages[code] ?? fallback;
}

export function warningLabel(code: string): string {
  const labels: Record<string, string> = {
    FROZEN_REPLAY: '冻结回放', ABLATION_ONLY: '模型规模消融', DEVELOPMENT_BASELINE: '开发基线', PARTIAL_GOLD_CHAIN: '部分金标链', EVIDENCE_EXHAUSTED: '安全弃答',
  };
  return labels[code] ?? code;
}

export function traceToolLabel(tool: string): string {
  return tool.split('+').map((item) => humanize(item)).join(' + ');
}

export function tracePrimaryLabel(event: HopCandyResponse['timeline'][number]): string {
  switch (event.node) {
    case 'router': return event.detail === 'multi_hop' ? '已选择多跳路径' : '已完成路径选择';
    case 'planner': return event.detail ? `已生成检索计划 · ${event.detail}` : '已生成检索计划';
    case 'executor': return event.tool ? `${traceToolLabel(event.tool)}已完成` : '检索已完成';
    case 'verifier': return event.detail === 'sufficient' ? '证据充分' : event.detail === 'insufficient' ? '证据仍不足' : '已完成证据验证';
    case 'replanner':
    case 'replan': return event.detail ? `已补充检索计划 · ${event.detail}` : '已补充检索计划';
    case 'synthesizer': return '已生成最终答案';
    default: return humanize(event.title);
  }
}
