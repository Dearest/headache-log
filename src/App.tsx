import { Calendar } from './pages/Calendar';
import { Home } from './pages/Home';
import { PinGate } from './pages/PinGate';
import { Settings } from './pages/Settings';
import { Stats } from './pages/Stats';
import { Wizard } from './pages/Wizard';
import { useRoute } from './router';
import { useStore } from './store';

export function App() {
  const pin = useStore((s) => s.pin);
  const route = useRoute();
  if (!pin) return <PinGate />;
  switch (route.name) {
    case 'new': return <Wizard key={`new-${route.day ?? ''}`} day={route.day} />;
    case 'edit': return <Wizard key={route.id} id={route.id} />;
    case 'calendar': return <Calendar day={route.day} />;
    case 'stats': return <Stats />;
    case 'settings': return <Settings />;
    default: return <Home />;
  }
}
