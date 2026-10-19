import { useMemo } from 'react';
import { CheckInCard } from '../components/CheckInCard';
import { Header, HeadacheRow, Level, SyncDot, TabBar, summarize } from '../components/ui';
import { addDays, fmtDay, fmtDuration, hoursBetween, today } from '../date';
import { go } from '../router';
import { checkins, headaches, saveEntry, useStore } from '../store';

export function Home() {
  const entries = useStore((s) => s.entries);
  const list = useMemo(() => headaches(entries), [entries]);
  const ci = useMemo(() => checkins(entries), [entries]);
  const day = today();
  const ongoing = list.filter((h) => h.end === null && hoursBetween(h.start, new Date().toISOString()) < 72);

  let streak = 0;
  for (let d = ci[day] ? day : addDays(day, -1); ci[d]; d = addDays(d, -1)) streak++;

  const monthKey = day.slice(0, 7);
  const thisMonth = list.filter((h) => h.day.startsWith(monthKey)).length;

  return (
    <div className="page with-tabs">
      <Header title="头痛日记" sub={fmtDay(day)} right={<SyncDot />} />

      {ongoing.map((h) => (
        <section key={h.id} className="card ongoing">
          <div className="card-hd"><h3><span className="pulse" />正在头痛</h3><Level n={h.intensity} /></div>
          <p>{summarize(h).regions} · 已持续 {fmtDuration(hoursBetween(h.start, new Date().toISOString()))}</p>
          <div className="btns">
            <button className="btn-sm ghost" onClick={() => go(`/edit/${h.id}`)}>补充 / 修改</button>
            <button className="btn-sm" onClick={() => saveEntry({ ...h, end: new Date().toISOString() })}>结束了</button>
          </div>
        </section>
      ))}

      <button className="cta" onClick={() => go('/new')}>
        <span className="cta-glow" />
        <b>我头痛了</b>
        <small>标位置 · 选类型 · 记下之前做了什么</small>
      </button>

      <CheckInCard day={day} title="今日一句话打卡" footer={streak ? `已连续打卡 ${streak} 天` : '每天一句，不头痛的日子也要记'} />

      <section className="card">
        <div className="card-hd">
          <h3>最近的头痛</h3>
          <span className="muted">本月 {thisMonth} 次</span>
        </div>
        {list.length ? list.slice(0, 5).map((h) => <HeadacheRow key={h.id} h={h} />) : <p className="empty">还没有记录。头痛的时候点上面的按钮。</p>}
        {list.length > 5 && <button className="link block" onClick={() => go('/calendar', true)}>在日历里看全部 ›</button>}
      </section>

      <TabBar active="home" />
    </div>
  );
}
