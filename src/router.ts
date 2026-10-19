import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'new'; day?: string }
  | { name: 'edit'; id: string }
  | { name: 'calendar'; day?: string }
  | { name: 'stats' }
  | { name: 'settings' };

function parse(hash: string): Route {
  const [, a, b] = hash.replace(/^#/, '').split('/');
  switch (a) {
    case 'new': return { name: 'new', day: b };
    case 'edit': return b ? { name: 'edit', id: b } : { name: 'home' };
    case 'calendar': return { name: 'calendar', day: b };
    case 'stats': return { name: 'stats' };
    case 'settings': return { name: 'settings' };
    default: return { name: 'home' };
  }
}

export function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return parse(hash);
}

export function go(path: string, replace = false) {
  const url = `#${path}`;
  if (replace) {
    history.replaceState(null, '', url);
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = path;
  }
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else go(fallback, true);
}
