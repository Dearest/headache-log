import { MED_EFFECTS, PAIN_SCALE, PAIN_TYPE } from './data';
import { addDays, fmtDuration, fmtTime, hoursBetween, weekday } from './date';
import type { CheckIn, Headache } from './types';

const PROMPT = `我在长期记录自己的头痛，目的是找出诱因、减少发作。下面是一段时间内的数据：
- 「打卡」是我每天写的一句话（睡眠、咖啡、酒、饮食、压力等），不头痛的日子也有；
- 「头痛」是每次发作的记录：部位和疼痛类型、程度（0–10）、伴随症状、用药、当时天气、发作前做了什么。

请你帮我分析：
1. 诱因：对比「头痛当天及前一天」和「没有头痛的日子」的打卡内容，找出出现频率明显更高的因素。每个结论都列出支持它的日期，并说明把握有多大。
2. 规律：发作频率、常见时段和星期几、部位和疼痛类型有没有固定模式、和气压变化有没有关系。
3. 用药：止痛药用得多不多，有没有药物过度使用的风险（每月用药超过 10 天要特别指出）。
4. 建议：给我 3 条最值得先试的、可执行的规避方法。
5. 数据缺口：哪些信息记得不够，导致结论不可靠，下一步该多记什么。

请不要下医学诊断；如果数据里有需要就医的信号，直接告诉我。`;

export function buildAiMarkdown(list: Headache[], ci: Record<string, CheckIn>, from: string, to: string) {
  const hs = list.filter((h) => h.day >= from && h.day <= to).sort((a, b) => a.start.localeCompare(b.start));
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const headacheDays = new Set(hs.map((h) => h.day));
  const checkinDays = days.filter((d) => ci[d]).length;
  const medDays = new Set(hs.filter((h) => h.meds.length).map((h) => h.day)).size;

  const lines: string[] = [];
  lines.push(`# 头痛日记数据（${from} ~ ${to}）`, '', '## 请你帮我分析', '', PROMPT, '');
  lines.push('## 概况', '');
  lines.push(`- 共 ${days.length} 天，打卡 ${checkinDays} 天，头痛 ${headacheDays.size} 天（${hs.length} 次），用药 ${medDays} 天`);
  if (hs.length) lines.push(`- 平均程度 ${(hs.reduce((s, h) => s + h.intensity, 0) / hs.length).toFixed(1)} / 10`);
  lines.push('- 疼痛程度含义：' + [2, 4, 6, 8, 10].map((n) => `${n}=${PAIN_SCALE[n].impact}`).join('；'));
  lines.push('', '## 按日时间线', '');

  for (const d of days) {
    const dayHs = hs.filter((h) => h.day === d);
    if (!ci[d] && !dayHs.length) continue;
    lines.push(`### ${d} ${weekday(d)}${dayHs.length ? ' · 头痛' : ''}`);
    lines.push(`- 打卡：${ci[d]?.text.replace(/\n+/g, ' ') ?? '（未打卡）'}`);
    for (const h of dayHs) {
      const dur = h.end ? `${fmtTime(h.start)}–${fmtTime(h.end)}（${fmtDuration(hoursBetween(h.start, h.end))}）` : `${fmtTime(h.start)} 开始（未记录结束）`;
      lines.push(`- 头痛 ${dur}，程度 ${h.intensity}/10（${PAIN_SCALE[h.intensity].grade}）`);
      if (h.marks.length) lines.push(`  - 部位与类型：${h.marks.map((m) => `${m.region}·${PAIN_TYPE[m.type].term}`).join('；')}`);
      if (h.symptoms.length) lines.push(`  - 伴随症状：${h.symptoms.join('、')}`);
      if (h.meds.length) lines.push(`  - 用药：${h.meds.join('、')}（${MED_EFFECTS.find((e) => e.id === h.medEffect)?.label}）`);
      if (h.weather) {
        const w = h.weather;
        const delta = w.pressureDelta3h === null ? '' : `，3 小时变化 ${w.pressureDelta3h > 0 ? '+' : ''}${w.pressureDelta3h}`;
        lines.push(`  - 天气：气压 ${w.pressure} hPa${delta}；${w.temp}°C；湿度 ${w.humidity}%`);
      }
      if (h.before.trim()) lines.push(`  - 之前做了什么：${h.before.trim().replace(/\n+/g, ' ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
