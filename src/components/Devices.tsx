import { useEffect, useState } from 'react';
import { fmtDuration } from '../date';
import { apiHeaders, deviceId } from '../store';

interface Device {
  id: string; ua: string; label: string; standalone: number; country: string; city: string;
  first_seen: number; last_seen: number; sessions: number; active_ms: number;
}
interface Session { device_id: string; started_at: number; last_at: number }

function inferName(ua: string, standalone: number) {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? '安卓手机' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows 电脑' : '未知设备';
  const app = standalone ? '主屏 App'
    : /MicroMessenger/.test(ua) ? '微信' : /EdgA?\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '浏览器';
  return `${os} · ${app}`;
}

function ago(ts: number) {
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 2) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  if (m < 48 * 60) return `${Math.round(m / 60)} 小时前`;
  return `${Math.round(m / 1440)} 天前`;
}

function when(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function Devices() {
  const [data, setData] = useState<{ devices: Device[]; sessions: Session[] } | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);

  const load = () => fetch('/api/devices', { headers: apiHeaders() })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then(setData, () => setError(true));
  useEffect(() => { load(); }, []);

  const saveLabel = async () => {
    if (!editing) return;
    await fetch(`/api/devices/${editing.id}`, { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify({ label: editing.label.trim() }) });
    setEditing(null);
    load();
  };

  if (error) return <p className="muted small">设备列表需要联网才能查看</p>;
  if (!data) return <p className="muted small">加载中…</p>;

  const week = Date.now() - 7 * 86_400_000;
  return (
    <div className="devices">
      {data.devices.map((d) => {
        const sessions = data.sessions.filter((s) => s.device_id === d.id);
        const recent = sessions.filter((s) => s.started_at > week).length;
        const place = [d.city, d.country].filter(Boolean).join(', ');
        return (
          <div key={d.id} className="device">
            <button className="device-hd" onClick={() => setOpen(open === d.id ? null : d.id)}>
              <div className="device-main">
                <div className="device-name">
                  {d.label || inferName(d.ua, d.standalone)}
                  {d.id === deviceId && <span className="tag">本机</span>}
                </div>
                <div className="device-sub">
                  {d.label ? `${inferName(d.ua, d.standalone)} · ` : ''}{place || '位置未知'} · 最近 {ago(d.last_seen)}
                </div>
                <div className="device-stats">
                  <span>打开 <b>{d.sessions}</b> 次</span>
                  <span>近 7 天 <b>{recent}</b> 次</span>
                  <span>累计 <b>{d.active_ms < 60_000 ? '不到 1 分钟' : `约 ${fmtDuration(d.active_ms / 3_600_000)}`}</b></span>
                </div>
              </div>
              <span className="chev">{open === d.id ? '⌄' : '›'}</span>
            </button>
            {open === d.id && (
              <div className="device-detail">
                <p className="muted small">首次打开：{when(d.first_seen)}</p>
                {editing?.id === d.id ? (
                  <div className="inline-add">
                    <input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="比如：我的 iPhone / 小王的手机" autoFocus />
                    <button className="btn-sm" onClick={saveLabel}>保存</button>
                  </div>
                ) : (
                  <button className="link" onClick={() => setEditing({ id: d.id, label: d.label })}>{d.label ? '修改备注' : '加个备注'}</button>
                )}
                <h4>近 30 天的打开记录</h4>
                {sessions.length ? sessions.slice(0, 30).map((s) => (
                  <div key={s.started_at} className="kv">
                    <span>{when(s.started_at)}</span>
                    <b>{s.last_at - s.started_at < 60_000 ? '不到 1 分钟' : fmtDuration((s.last_at - s.started_at) / 3_600_000)}</b>
                  </div>
                )) : <p className="muted small">没有记录</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
