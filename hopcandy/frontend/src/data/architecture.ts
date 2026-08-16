import { BrainCircuit, GitBranch, ShieldCheck, Sparkles, Wrench } from 'lucide-react';

export const architectureNodes = [
  { id: 'router', label: '路由器', icon: GitBranch, text: '只为极简单、确定可结构化的问题选择可选快速路径；其他问题进入完整智能体流程。', boundary: '不是两套彼此独立的系统。' },
  { id: 'planner', label: '规划器', icon: BrainCircuit, text: '拆解子问题、声明依赖关系，并在证据不足时结合反馈修订计划。', boundary: '4B 对复杂规划仍有明显能力上限。' },
  { id: 'executor', label: '执行器', icon: Wrench, text: '统一调度关键词检索、语义检索、混合检索、片段读取、机器事实与计算器。', boundary: '机器事实是执行器工具，也可被快速路径直接调用。' },
  { id: 'verifier', label: '验证器', icon: ShieldCheck, text: '判断证据是否充分，输出缺失证据并触发重新规划。', boundary: '规则与模型验证均可能产生边界误差。' },
  { id: 'replanner', label: '重新规划器', icon: BrainCircuit, text: '当验证器判断当前证据不足时，基于缺失证据或未完成 Hop 修订后续执行计划。', boundary: '输出修订后的执行步骤，并返回执行器继续收集证据。' },
  { id: 'synthesizer', label: '综合器', icon: Sparkles, text: '只基于已收集证据作答；证据不足时执行受控澄清或安全弃答。', boundary: '不以流式动画伪造真实 LangGraph 进度。' },
];

export const executorTools = ['关键词检索', '语义检索', '混合检索', '片段读取', '机器事实', '计算器'];
