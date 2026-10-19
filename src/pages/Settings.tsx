import { useRef, useState } from 'react';
import { Header } from '../components/ui';
import { today } from '../date';
import { back } from '../router';
import { getState, importEntries, logout, sync, useStore } from '../store';
import type { Entry } from '../types';

const STATUS = { idle: '正常', syncing: '同步中…', offline: '离线（联网后自动补传）', error: '同步失败，稍后自动重试', bad_pin: 'PIN 不对，请重新登录' };

export function Settings() {
  const status = useStore((s) => s.status);
  const pending = useStore((s) => s.outbox.length);
  const lastSync = useStore((s) => s.lastSync);
  const count = useStore((s) => Object.values(s.entries).filter((e) => !e.deleted).length);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const exportJson = () => {
    const data = Object.values(getState().entries);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: data }, null, 2)], { type: 'application/json' }));
    a.download = `头痛日记备份-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as { entries?: Entry[] };
      if (!Array.isArray(data.entries)) throw new Error();
      importEntries(data.entries);
      setMsg(`已导入 ${data.entries.length} 条（较新的记录保留）`);
    } catch {
      setMsg('文件格式不对，导入失败');
    }
  };

  return (
    <div className="page">
      <Header title="设置" onBack={() => back()} />
      <section className="card">
        <h3>云端同步</h3>
        <div className="kv"><span>状态</span><b>{STATUS[status]}</b></div>
        <div className="kv"><span>待上传</span><b>{pending} 条</b></div>
        <div className="kv"><span>本机记录</span><b>{count} 条</b></div>
        <div className="kv"><span>上次同步</span><b>{lastSync ? new Date(lastSync).toLocaleTimeString() : '—'}</b></div>
        <div className="btns"><button className="btn-sm" onClick={() => sync()}>立即同步</button></div>
      </section>
      <section className="card">
        <h3>备份</h3>
        <p className="muted small">数据存在云端数据库里，可以按时间点恢复。想再多一份保险，可以导出 JSON 自己存着。</p>
        <div className="btns">
          <button className="btn-sm ghost" onClick={() => file.current?.click()}>导入备份</button>
          <button className="btn-sm" onClick={exportJson}>导出备份</button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        {msg && <p className="muted small">{msg}</p>}
      </section>
      <section className="card">
        <h3>这台设备</h3>
        <div className="btns"><button className="btn-sm ghost" onClick={() => { logout(); location.hash = '/'; }}>退出登录</button></div>
      </section>
      <p className="credits">
        3D 头部模型：Lee Perry-Smith 头部扫描，Infinite-Realities 制作，CC BY 3.0；头骨模型：Vladimir Petkovic / Adobe，CC0。
      </p>
    </div>
  );
}
