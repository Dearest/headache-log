import type { MedEffect, PainTypeId } from './types';

export interface PainType {
  id: PainTypeId;
  short: string;
  term: string;
  feel: string;
  visual: string;
  color: string;
  radius: number;
  warn?: boolean;
}

export const PAIN_TYPES: PainType[] = [
  { id: 'throb', short: '搏动性', term: '搏动性痛', feel: '跟着心跳一跳一跳，像里面有人敲鼓；低头、走动更痛', visual: '光斑按心跳节奏一胀一缩', color: '#ff3b2f', radius: 0.2 },
  { id: 'band', short: '紧箍样', term: '压迫性 / 紧箍样痛', feel: '像戴了顶小一号的帽子，或被橡皮筋勒了一圈', visual: '绕头一圈的光带，条纹向内收紧', color: '#ff6a3d', radius: 0.1 },
  { id: 'dull', short: '钝痛', term: '钝痛', feel: '闷闷的，说不清具体哪个点，像头里塞了团棉花', visual: '一大片边缘模糊的暗红，缓慢起伏', color: '#c0392b', radius: 0.42 },
  { id: 'distend', short: '胀痛', term: '胀痛', feel: '头像要被撑开，眼睛也跟着发胀', visual: '一圈圈波纹向外扩', color: '#ff5a4a', radius: 0.32 },
  { id: 'stab', short: '针刺样', term: '针刺样痛', feel: '一下一下像针扎，每次几秒就过去', visual: '小而亮的尖点，随机闪', color: '#ffd9c9', radius: 0.18 },
  { id: 'electric', short: '电击样', term: '电击样 / 放电样痛', feel: '像过电，沿着一条线窜过去', visual: '闪烁的细电弧', color: '#ffd84a', radius: 0.32 },
  { id: 'burn', short: '烧灼样', term: '烧灼样痛', feel: '某块地方火辣辣的', visual: '橙红色火焰般翻涌', color: '#ff8a1e', radius: 0.28 },
  { id: 'boring', short: '钻痛', term: '钻痛', feel: '眼球后面像有钻头往里钻，坐不住', visual: '向中心旋转的漩涡', color: '#e8304a', radius: 0.18 },
  { id: 'allodynia', short: '头皮触痛', term: '头皮触痛（痛觉超敏）', feel: '梳头、戴眼镜、枕枕头都会疼', visual: '表面一层细密颗粒', color: '#ff9c8a', radius: 0.32 },
  { id: 'thunderclap', short: '霹雳样', term: '霹雳样头痛', feel: '几秒内痛到顶点，像被锤子砸了一下', visual: '这是危险信号，请立即就医', color: '#ffffff', radius: 0.45, warn: true },
];

export const PAIN_TYPE: Record<PainTypeId, PainType> =
  Object.fromEntries(PAIN_TYPES.map((t) => [t.id, t])) as Record<PainTypeId, PainType>;

export const PAIN_SCALE = [
  { grade: '无痛', feel: '完全没感觉', impact: '无' },
  { grade: '轻度', feel: '隐约有点存在感，不留意就察觉不到', impact: '无' },
  { grade: '轻度', feel: '能感觉到，像帽子戴久了的那点不适', impact: '不影响任何事' },
  { grade: '轻度', feel: '明确在痛，偶尔会分神', impact: '能正常工作' },
  { grade: '中度', feel: '时不时把注意力拽走', impact: '效率下降，开始想吃药' },
  { grade: '中度', feel: '很难忽视，专注不了多久', impact: '只能做简单的事' },
  { grade: '中度', feel: '注意力基本被痛占满', impact: '很难正常工作，想停下来' },
  { grade: '重度', feel: '看屏幕、说话、思考都费劲', impact: '没法工作，想躺下' },
  { grade: '重度', feel: '怕光、怕吵，可能恶心', impact: '只能躺着' },
  { grade: '重度', feel: '坐立不安，忍不住呻吟', impact: '什么都做不了' },
  { grade: '极重度', feel: '能想象到的最痛', impact: '想去急诊' },
];

export const SYMPTOMS = ['恶心', '呕吐', '怕光', '怕吵', '怕气味', '视觉先兆', '头晕', '流泪 / 鼻塞', '脖子僵硬', '注意力难集中'];

export const MEDS = ['布洛芬', '对乙酰氨基酚', '洛索洛芬', '阿司匹林', '曲普坦类'];

export const MED_EFFECTS: { id: MedEffect; label: string }[] = [
  { id: 'unknown', label: '还不知道' },
  { id: 'good', label: '明显缓解' },
  { id: 'partial', label: '部分缓解' },
  { id: 'none', label: '没用' },
];

export const CHECKIN_PLACEHOLDER = '睡得怎么样？有没有熬夜？喝了咖啡 / 酒吗？吃饭规律吗？压力大不大？今天特别做了什么？';
export const BEFORE_PLACEHOLDER = '痛之前几个小时在干嘛？睡眠、饮食、咖啡、屏幕时间、情绪、天气……想到什么写什么';

export function intensityColor(level: number) {
  if (level <= 0) return '#2a2f37';
  if (level <= 3) return '#7a4a2a';
  if (level <= 6) return '#b5502f';
  if (level <= 8) return '#d93d2b';
  return '#ff2a2a';
}
