import { useState } from 'react';
import { verifyPin } from '../store';

export function PinGate() {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    setErr('');
    try {
      if (!(await verifyPin(pin))) setErr('PIN 不对');
    } catch {
      setErr('连不上服务器，检查一下网络');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="gate" onSubmit={submit}>
      <div className="gate-orb" />
      <h1>头痛日记</h1>
      <p>输入 PIN，手机和电脑共用同一份记录</p>
      <input inputMode="numeric" autoComplete="current-password" type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" autoFocus />
      {err && <p className="err">{err}</p>}
      <button className="btn" disabled={busy || !pin}>{busy ? '验证中…' : '进入'}</button>
    </form>
  );
}
