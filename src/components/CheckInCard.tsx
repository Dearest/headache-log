import { useEffect, useState } from 'react';
import { CHECKIN_PLACEHOLDER } from '../data';
import { checkinId, saveEntry, useStore } from '../store';
import type { CheckIn } from '../types';

export function CheckInCard({ day, title, footer }: { day: string; title: string; footer?: React.ReactNode }) {
  const existing = useStore((s) => s.entries[checkinId(day)]) as CheckIn | undefined;
  const live = existing && !existing.deleted ? existing : undefined;
  const [text, setText] = useState(live?.text ?? '');
  const [editing, setEditing] = useState(!live);

  useEffect(() => {
    setText(live?.text ?? '');
    setEditing(!live);
  }, [day, live?.updatedAt]);

  const save = () => {
    const t = text.trim();
    if (!t) return;
    saveEntry({ id: checkinId(day), kind: 'checkin', day, text: t, updatedAt: 0 });
    setEditing(false);
  };

  return (
    <section className="card">
      <div className="card-hd"><h3>{title}</h3>{live && !editing && <button className="link" onClick={() => setEditing(true)}>修改</button>}</div>
      {editing ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={CHECKIN_PLACEHOLDER} rows={3} />
          <div className="card-ft">
            <span className="muted">{footer}</span>
            <div className="btns">
              {live && <button className="btn-sm ghost" onClick={() => { setText(live.text); setEditing(false); }}>取消</button>}
              <button className="btn-sm" disabled={!text.trim()} onClick={save}>保存</button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="checkin-text">{live!.text}</p>
          {footer && <div className="card-ft"><span className="muted">{footer}</span></div>}
        </>
      )}
    </section>
  );
}
