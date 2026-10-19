import { useEffect, useMemo, useRef, useState } from 'react';
import { HeadCanvas } from '../components/HeadCanvas';
import { Level } from '../components/ui';
import { BEFORE_PLACEHOLDER, MED_EFFECTS, MEDS, PAIN_SCALE, PAIN_TYPE, PAIN_TYPES, SYMPTOMS } from '../data';
import { dayKey, fmtDuration, fromLocalInput, hoursBetween, toLocalInput } from '../date';
import type { HeadScene, Hit, ViewName } from '../head/HeadScene';
import { MAX_MARKS } from '../head/shaders';
import { back, go } from '../router';
import { deleteEntry, getState, newId, saveEntry } from '../store';
import type { Headache, PainTypeId, Weather } from '../types';
import { fetchWeather } from '../weather';

const STEPS = ['哪里痛 · 什么样的痛', '有多痛 · 伴随症状', '用药 · 时间', '之前做了什么'];
const VIEWS: { id: ViewName; label: string }[] = [
  { id: 'front', label: '前' }, { id: 'left', label: '左' }, { id: 'right', label: '右' }, { id: 'back', label: '后' }, { id: 'top', label: '顶' },
];

function blank(day?: string): Headache {
  const now = new Date();
  const start = day && day !== dayKey(now) ? new Date(`${day}T12:00`) : now;
  return {
    id: newId(), kind: 'headache', day: dayKey(start), updatedAt: 0,
    start: start.toISOString(), end: null, marks: [], intensity: 5,
    symptoms: [], meds: [], medEffect: 'unknown', before: '', weather: null,
  };
}

function toggle<T>(list: T[], v: T) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function Wizard({ id, day }: { id?: string; day?: string }) {
  const existing = id ? (getState().entries[id] as Headache | undefined) : undefined;
  const [draft, setDraft] = useState<Headache>(() => (existing ? { ...existing } : blank(day)));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<Headache>) => setDraft((d) => ({ ...d, ...p }));
  const editing = !!existing;

  // 新记录一打开就去取天气，保存时如果开始时间没改就直接用
  const weatherFor = useRef<{ start: string; p: Promise<Weather | null> } | null>(null);
  useEffect(() => {
    if (!editing) weatherFor.current = { start: draft.start, p: fetchWeather(draft.start) };
  }, []);

  if (id && !existing) {
    return <div className="page"><p className="empty">这条记录不存在或已删除。</p><button className="btn" onClick={() => go('/', true)}>回首页</button></div>;
  }

  const save = async () => {
    setSaving(true);
    let weather = draft.weather;
    const startChanged = existing ? existing.start !== draft.start : false;
    if (!weather || startChanged) {
      if (!weatherFor.current || weatherFor.current.start !== draft.start) {
        weatherFor.current = { start: draft.start, p: fetchWeather(draft.start) };
      }
      weather = await Promise.race([weatherFor.current.p, new Promise<null>((r) => setTimeout(() => r(null), 6000))]) ?? (startChanged ? null : weather);
    }
    saveEntry({ ...draft, day: dayKey(new Date(draft.start)), weather });
    go('/', true);
  };

  return (
    <div className={`wizard step-${step}`}>
      {step === 0 && <StepWhere draft={draft} patch={patch} />}
      <div className="wz-top">
        <div className="wz-bar">
          <button className="icon-btn" onClick={() => (step ? setStep(step - 1) : back())} aria-label={step ? '上一步' : '关闭'}>{step ? '‹' : '✕'}</button>
          <div className="wz-title">
            <h1>{step + 1}/4 {STEPS[step]}</h1>
            {editing && <p>编辑记录</p>}
          </div>
        </div>
        <div className="steps">{STEPS.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
      </div>
      {step === 1 && <StepHowMuch draft={draft} patch={patch} />}
      {step === 2 && <StepMedsTime draft={draft} patch={patch} />}
      {step === 3 && <StepBefore draft={draft} patch={patch} onDelete={editing ? () => { deleteEntry(draft.id); go('/', true); } : undefined} />}
      {step > 0 && (
        <div className="wz-foot">
          {step < 3
            ? <button className="btn" onClick={() => setStep(step + 1)}>下一步</button>
            : <button className="btn" disabled={saving} onClick={save}>{saving ? '正在保存…' : editing ? '保存修改' : '完成'}</button>}
        </div>
      )}
      {step === 0 && (
        <div className="wz-foot over">
          <button className="btn" disabled={!draft.marks.length} onClick={() => setStep(1)}>
            {draft.marks.length ? '下一步' : '先在头上点出痛的位置'}
          </button>
        </div>
      )}
    </div>
  );
}

type StepProps = { draft: Headache; patch: (p: Partial<Headache>) => void };

function StepWhere({ draft, patch }: StepProps) {
  const [brush, setBrush] = useState<PainTypeId>(draft.marks.at(-1)?.type ?? 'throb');
  const [skull, setSkull] = useState(false);
  const [view, setView] = useState<ViewName | null>(null);
  const sceneRef = useRef<HeadScene | null>(null);
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const marksRef = useRef(draft.marks);
  marksRef.current = draft.marks;
  const t = PAIN_TYPE[brush];

  const onTap = (hit: Hit) => {
    if (marksRef.current.length >= MAX_MARKS) return;
    patch({ marks: [...marksRef.current, { ...hit, type: brushRef.current }] });
  };

  return (
    <div className="where">
      <HeadCanvas interactive className="where-canvas" marks={draft.marks} skull={skull} onTap={onTap} sceneRef={sceneRef} />
      <button className={`pill glass skull-btn ${skull ? 'on' : ''}`} onClick={() => setSkull(!skull)}>显示头骨</button>
      <div className="where-ui">
        <div className="views">
          {VIEWS.map((v) => (
            <button key={v.id} className={`glass ${view === v.id ? 'on' : ''}`} onClick={() => { setView(v.id); sceneRef.current?.setView(v.id); }}>{v.label}</button>
          ))}
        </div>
        <div className="brush glass">
          <div className="brush-lbl"><span>先选一种痛，再点头部</span><span>左右滑动 ›</span></div>
          <div className="types">
            {PAIN_TYPES.map((p) => (
              <button key={p.id} className={brush === p.id ? 'on' : ''} onClick={() => setBrush(p.id)}>
                <i style={{ background: p.color, boxShadow: `0 0 8px ${p.color}` }} />{p.short}
              </button>
            ))}
          </div>
          <div className={`brush-desc ${t.warn ? 'warn' : ''}`}>
            <b>{t.term}</b>：{t.feel}{t.warn ? ' —— ⚠️ 这是危险信号，请立即就医' : ''}
          </div>
        </div>
        {draft.marks.length > 0 && (
          <div className="marks">
            {draft.marks.map((m, i) => (
              <button key={i} className="mark" onClick={() => patch({ marks: draft.marks.filter((_, j) => j !== i) })}>
                <i style={{ background: PAIN_TYPE[m.type].color }} />{m.region} · {PAIN_TYPE[m.type].short} ✕
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StepHowMuch({ draft, patch }: StepProps) {
  const s = PAIN_SCALE[draft.intensity];
  return (
    <div className="wz-body">
      <section className="card">
        <h3>有多痛</h3>
        <div className="scale">
          {PAIN_SCALE.map((_, i) => (
            <button key={i} className={i === draft.intensity ? 'on' : ''} onClick={() => patch({ intensity: i })}>{i}</button>
          ))}
        </div>
        <input className="range" type="range" min={0} max={10} value={draft.intensity} onChange={(e) => patch({ intensity: +e.target.value })} />
        <div className="scale-desc">
          <div className="scale-head"><Level n={draft.intensity} /><b>{s.grade}</b></div>
          <p>{s.feel}</p>
          <p className="muted">对生活的影响：{s.impact}</p>
        </div>
      </section>
      <section className="card">
        <h3>伴随症状（可多选）</h3>
        <div className="chips">
          {SYMPTOMS.map((x) => (
            <button key={x} className={`chip ${draft.symptoms.includes(x) ? 'on' : ''}`} onClick={() => patch({ symptoms: toggle(draft.symptoms, x) })}>{x}</button>
          ))}
        </div>
      </section>
    </div>
  );
}

function StepMedsTime({ draft, patch }: StepProps) {
  const [custom, setCustom] = useState('');
  const allMeds = useMemo(() => [...MEDS, ...draft.meds.filter((m) => !MEDS.includes(m))], [draft.meds]);
  const addCustom = () => {
    const v = custom.trim();
    if (v && !draft.meds.includes(v)) patch({ meds: [...draft.meds, v] });
    setCustom('');
  };
  const ongoing = draft.end === null;
  return (
    <div className="wz-body">
      <section className="card">
        <h3>吃了什么药（没吃就跳过）</h3>
        <div className="chips">
          {allMeds.map((m) => (
            <button key={m} className={`chip ${draft.meds.includes(m) ? 'on' : ''}`} onClick={() => patch({ meds: toggle(draft.meds, m) })}>{m}</button>
          ))}
        </div>
        <div className="inline-add">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="其他药，比如：芬必得 300mg" onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
          <button className="btn-sm" disabled={!custom.trim()} onClick={addCustom}>添加</button>
        </div>
        {draft.meds.length > 0 && (
          <>
            <h4>效果怎么样</h4>
            <div className="seg">
              {MED_EFFECTS.map((e) => (
                <button key={e.id} className={draft.medEffect === e.id ? 'on' : ''} onClick={() => patch({ medEffect: e.id })}>{e.label}</button>
              ))}
            </div>
          </>
        )}
      </section>
      <section className="card">
        <h3>时间</h3>
        <label className="field">
          <span>开始</span>
          <input type="datetime-local" value={toLocalInput(draft.start)} onChange={(e) => e.target.value && patch({ start: fromLocalInput(e.target.value) })} />
        </label>
        <div className="seg">
          <button className={ongoing ? 'on' : ''} onClick={() => patch({ end: null })}>还在痛</button>
          <button className={!ongoing ? 'on' : ''} onClick={() => patch({ end: draft.end ?? new Date().toISOString() })}>已经好了</button>
        </div>
        {!ongoing && (
          <label className="field">
            <span>结束</span>
            <input type="datetime-local" value={toLocalInput(draft.end!)} onChange={(e) => e.target.value && patch({ end: fromLocalInput(e.target.value) })} />
          </label>
        )}
        <p className="muted small">
          {ongoing ? '好了以后在首页点「结束了」，会自动记下结束时间。' : `持续 ${fmtDuration(Math.max(0, hoursBetween(draft.start, draft.end!)))}`}
        </p>
        <p className="muted small">天气（气压、温度、湿度）会在保存时按开始时间自动记录，需要允许定位。</p>
      </section>
    </div>
  );
}

function StepBefore({ draft, patch, onDelete }: StepProps & { onDelete?: () => void }) {
  return (
    <div className="wz-body">
      <section className="card">
        <h3>痛之前做了什么</h3>
        <textarea rows={7} value={draft.before} onChange={(e) => patch({ before: e.target.value })} placeholder={BEFORE_PLACEHOLDER} />
        <p className="muted small">一句话就行，之后交给 AI 和你的每日打卡一起对比。</p>
      </section>
      {onDelete && (
        <button className="btn danger-ghost" onClick={() => { if (confirmDelete()) onDelete(); }}>删除这条记录</button>
      )}
    </div>
  );
}

function confirmDelete() {
  return window.confirm('确定删除这条头痛记录吗？');
}
