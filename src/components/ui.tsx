import { go } from '../router';
import { PAIN_TYPE, intensityColor } from '../data';
import { fmtDuration, fmtShort, hoursBetween } from '../date';
import type { Headache } from '../types';
import { useStore } from '../store';

export function TabBar({ active }: { active: 'home' | 'calendar' | 'stats' }) {
  const tabs = [
    { id: 'home', label: '首页', path: '/', icon: <path d="M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-5H9v5H5a1 1 0 01-1-1z" /> },
    { id: 'calendar', label: '日历', path: '/calendar', icon: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></> },
    { id: 'stats', label: '统计', path: '/stats', icon: <path d="M5 19V11M12 19V5M19 19v-5" /> },
  ] as const;
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <button key={t.id} className={active === t.id ? 'on' : ''} onClick={() => go(t.path, true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function Level({ n }: { n: number }) {
  return <span className="level" style={{ background: intensityColor(n) }}>{n}</span>;
}

export function summarize(h: Headache) {
  const regions = [...new Set(h.marks.map((m) => m.region))];
  const types = [...new Set(h.marks.map((m) => PAIN_TYPE[m.type].short))];
  return {
    regions: regions.length > 2 ? `${regions.slice(0, 2).join('、')} 等 ${regions.length} 处` : regions.join('、') || '未标注部位',
    types: types.join(' · '),
  };
}

export function HeadacheRow({ h }: { h: Headache }) {
  const s = summarize(h);
  return (
    <button className="row" onClick={() => go(`/edit/${h.id}`)}>
      <Level n={h.intensity} />
      <div className="row-main">
        <div className="row-title">{s.regions}</div>
        <div className="row-sub">{fmtShort(h.start)}{h.end ? ` · ${fmtDuration(hoursBetween(h.start, h.end))}` : ' · 进行中'}{s.types ? ` · ${s.types}` : ''}</div>
      </div>
      <span className="chev">›</span>
    </button>
  );
}

export function SyncDot() {
  const status = useStore((s) => s.status);
  const pending = useStore((s) => s.outbox.length);
  const label = status === 'syncing' ? '同步中' : status === 'offline' ? '离线' : status === 'error' ? '同步失败' : status === 'bad_pin' ? 'PIN 失效' : pending ? `${pending} 条待同步` : '已同步';
  const tone = status === 'error' || status === 'bad_pin' ? 'bad' : status === 'offline' || pending ? 'warn' : 'ok';
  return <button className={`sync ${tone}`} onClick={() => go('/settings')}><i />{label}</button>;
}

export function Header({ title, sub, right, onBack }: { title: string; sub?: string; right?: React.ReactNode; onBack?: () => void }) {
  return (
    <header className="hdr">
      {onBack && <button className="icon-btn" onClick={onBack} aria-label="返回">‹</button>}
      <div className="hdr-text"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      <div className="hdr-right">{right}</div>
    </header>
  );
}
