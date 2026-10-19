import { useEffect, useRef } from 'react';
import { HeadScene, type Hit } from '../head/HeadScene';
import type { Mark } from '../types';

interface Props {
  interactive?: boolean;
  marks?: Mark[];
  dots?: Mark[];
  skull?: boolean;
  fit?: number;
  className?: string;
  onTap?: (hit: Hit) => void;
  sceneRef?: React.MutableRefObject<HeadScene | null>;
}

export function HeadCanvas({ interactive = false, marks, dots, skull = false, fit, className, onTap, sceneRef }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const scene = useRef<HeadScene | null>(null);
  const tapRef = useRef(onTap);
  tapRef.current = onTap;

  useEffect(() => {
    const s = new HeadScene(el.current!, { interactive, fit });
    s.onTap = (hit) => tapRef.current?.(hit);
    scene.current = s;
    if (sceneRef) sceneRef.current = s;
    return () => {
      s.dispose();
      scene.current = null;
      if (sceneRef) sceneRef.current = null;
    };
  }, [interactive, fit, sceneRef]);

  useEffect(() => { if (marks) scene.current?.setMarks(marks); }, [marks]);
  useEffect(() => { if (dots) scene.current?.setDots(dots); }, [dots]);
  useEffect(() => { scene.current?.setSkull(skull); }, [skull]);

  return <div ref={el} className={className} />;
}
