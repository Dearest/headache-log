import { useMemo, useState } from 'react';
import { CheckInCard } from '../components/CheckInCard';
import { Header, HeadacheRow, TabBar } from '../components/ui';
import { intensityColor } from '../data';
import { dayKey, fmtDay, parseDay, today } from '../date';
import { go } from '../router';
import { checkins, headaches, useStore } from '../store';

export function Calendar({ day }: { day?: string }) {
  const entries = useStore((s) => s.entries);
  const list = useMemo(() => headaches(entries), [entries]);
  const ci = useMemo(() => checkins(entries), [entries]);
  const selected = day ?? today();
  const [month, setMonth] = useState(() => { const d = parseDay(selected); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const byDay = useMemo(() => {
    const m: Record<string, typeof list> = {};
    for (const h of list) (m[h.day] ||= []).push(h);
    return m;
  }, [list]);

  const cells: (string | null)[] = [];
  const first = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(dayKey(new Date(month.getFullYear(), month.getMonth(), d)));

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const t = today();
  const monthHeadaches = cells.filter((d) => d && byDay[d]).length;
  const monthCheckins = cells.filter((d) => d && ci[d]).length;
  const dayList = byDay[selected] ?? [];

  return (
    <div className="page with-tabs">
      <Header title="日历" sub={`${month.getFullYear()}年${month.getMonth() + 1}月 · 头痛 ${monthHeadaches} 天 · 打卡 ${monthCheckins} 天`} />
      <section className="card cal">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="上个月">‹</button>
          <b>{month.getFullYear()}年{month.getMonth() + 1}月</b>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="下个月">›</button>
        </div>
        <div className="cal-grid">
          {['一', '二', '三', '四', '五', '六', '日'].map((w) => <span key={w} className="cal-w">{w}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const hs = byDay[d];
            const max = hs ? Math.max(...hs.map((h) => h.intensity)) : 0;
            return (
              <button
                key={d}
                className={`cal-d ${d === selected ? 'sel' : ''} ${d === t ? 'today' : ''} ${d > t ? 'future' : ''}`}
                style={hs ? { background: intensityColor(max) } : undefined}
                onClick={() => go(`/calendar/${d}`, true)}
              >
                {parseDay(d).getDate()}
                {ci[d] && <i />}
              </button>
            );
          })}
        </div>
        <div className="cal-legend">
          <span><i style={{ background: intensityColor(2) }} />轻</span>
          <span><i style={{ background: intensityColor(5) }} />中</span>
          <span><i style={{ background: intensityColor(8) }} />重</span>
          <span><i className="dot" />已打卡</span>
        </div>
      </section>

      <h2 className="sec">{fmtDay(selected)}</h2>
      {selected <= t && <CheckInCard day={selected} title={selected === t ? '今日一句话打卡' : '这天的一句话打卡'} />}
      <section className="card">
        <div className="card-hd"><h3>这天的头痛</h3></div>
        {dayList.length ? dayList.map((h) => <HeadacheRow key={h.id} h={h} />) : <p className="empty">没有头痛记录</p>}
        {selected <= t && <button className="link block" onClick={() => go(`/new/${selected}`)}>＋ 补记这天的头痛</button>}
      </section>

      <TabBar active="calendar" />
    </div>
  );
}
