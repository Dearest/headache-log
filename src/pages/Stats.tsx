import { useMemo, useState } from 'react';
import { HeadCanvas } from '../components/HeadCanvas';
import { Header, TabBar } from '../components/ui';
import { PAIN_TYPES } from '../data';
import { addDays, hoursBetween, today } from '../date';
import { buildAiMarkdown } from '../exportAi';
import { checkins, headaches, useStore } from '../store';

const RANGES = [{ id: 30, label: '近 30 天' }, { id: 90, label: '近 90 天' }, { id: 0, label: '全部' }];
const HOUR_BLOCKS = ['0–4 点', '4–8 点', '8–12 点', '12–16 点', '16–20 点', '20–24 点'];

function Bars({ items }: { items: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">
      {items.map((i) => (
        <div key={i.label} className="bar">
          <span className="bar-l">{i.label}</span>
          <span className="bar-t"><i style={{ width: `${(i.value / max) * 100}%`, background: i.color }} /></span>
          <span className="bar-v">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Stats() {
  const entries = useStore((s) => s.entries);
  const all = useMemo(() => headaches(entries), [entries]);
  const ci = useMemo(() => checkins(entries), [entries]);
  const [range, setRange] = useState(30);
  const [copied, setCopied] = useState(false);

  const t = today();
  const earliest = useMemo(() => {
    const days = [...all.map((h) => h.day), ...Object.keys(ci)].sort();
    return days[0] ?? t;
  }, [all, ci, t]);
  const from = range ? addDays(t, -(range - 1)) : earliest;
  const list = useMemo(() => all.filter((h) => h.day >= from && h.day <= t), [all, from, t]);

  const totalDays = Math.round((Date.parse(t) - Date.parse(from)) / 86_400_000) + 1;
  const hDays = new Set(list.map((h) => h.day)).size;
  const ciDays = Object.keys(ci).filter((d) => d >= from && d <= t).length;
  const ended = list.filter((h) => h.end);
  const avgDur = ended.length ? ended.reduce((s, h) => s + hoursBetween(h.start, h.end!), 0) / ended.length : null;
  const avgInt = list.length ? list.reduce((s, h) => s + h.intensity, 0) / list.length : null;
  const medDays30 = new Set(all.filter((h) => h.meds.length && h.day > addDays(t, -30)).map((h) => h.day)).size;

  const marks = useMemo(() => list.flatMap((h) => h.marks), [list]);
  const regionCount = Object.entries(marks.reduce<Record<string, number>>((m, x) => ({ ...m, [x.region]: (m[x.region] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  const typeCount = PAIN_TYPES.map((p) => ({ label: p.short, value: marks.filter((m) => m.type === p.id).length, color: p.color })).filter((x) => x.value);
  const hours = HOUR_BLOCKS.map((label, i) => ({ label, value: list.filter((h) => Math.floor(new Date(h.start).getHours() / 4) === i).length }));

  const md = () => buildAiMarkdown(all, ci, from, t);
  const copy = async () => {
    await navigator.clipboard.writeText(md());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md()], { type: 'text/markdown' }));
    a.download = `头痛日记-${from}-${t}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page with-tabs">
      <Header title="统计" sub={`${from} ~ ${t}`} />
      <div className="seg">
        {RANGES.map((r) => <button key={r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>)}
      </div>

      {medDays30 >= 10 && (
        <div className="alert">近 30 天有 {medDays30} 天吃了止痛药。每月超过 10 天可能引起「药物过度使用性头痛」，建议和医生聊聊。</div>
      )}

      <div className="tiles">
        <div className="tile"><b>{list.length}</b><span>头痛次数</span></div>
        <div className="tile"><b>{hDays}</b><span>头痛天数 / {totalDays}</span></div>
        <div className="tile"><b>{avgInt === null ? '–' : avgInt.toFixed(1)}</b><span>平均程度</span></div>
        <div className="tile"><b>{avgDur === null ? '–' : avgDur < 1 ? `${Math.round(avgDur * 60)}′` : `${avgDur.toFixed(1)}h`}</b><span>平均持续</span></div>
        <div className="tile"><b>{Math.round((ciDays / totalDays) * 100)}%</b><span>打卡率</span></div>
        <div className="tile"><b>{medDays30}</b><span>近 30 天用药</span></div>
      </div>

      <section className="card">
        <h3>痛在哪里</h3>
        {marks.length ? (
          <>
            <HeadCanvas className="stats-head" dots={marks} fit={1.7} />
            <div className="legend">
              {typeCount.map((x) => <span key={x.label}><i style={{ background: x.color }} />{x.label}</span>)}
            </div>
            <Bars items={regionCount.map(([label, value]) => ({ label, value }))} />
          </>
        ) : <p className="empty">这段时间没有标注</p>}
      </section>

      {typeCount.length > 0 && (
        <section className="card">
          <h3>什么样的痛</h3>
          <Bars items={typeCount} />
        </section>
      )}

      {list.length > 0 && (
        <section className="card">
          <h3>几点开始痛</h3>
          <Bars items={hours} />
        </section>
      )}

      <section className="card">
        <h3>交给 AI 分析</h3>
        <p className="muted small">把这段时间的打卡和头痛记录整理成一份 Markdown，开头附好分析要求。复制后粘贴给 Claude 等 AI 就行。</p>
        <div className="btns">
          <button className="btn-sm ghost" onClick={download}>下载 .md</button>
          <button className="btn-sm" onClick={copy}>{copied ? '已复制 ✓' : '复制给 AI'}</button>
        </div>
      </section>

      <TabBar active="stats" />
    </div>
  );
}
