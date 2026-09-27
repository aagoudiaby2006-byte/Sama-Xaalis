// Minimal typed stack navigator. Only the top route is rendered, so a screen reloads its data
// whenever it becomes visible again. Android hardware back pops the stack.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler } from 'react-native';

// No bottom tab bar: everything starts from Home, and every other screen has a back arrow (top left).
export type Route =
  | { name: 'home' }
  | { name: 'activity' }
  | { name: 'profile' }
  | { name: 'goalNew' }
  | { name: 'goalDetail'; goalId: string }
  | { name: 'mobileMoney' }
  | { name: 'withdraw'; goalId?: string }
  | { name: 'changePin' }
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'otpLogin'; phoneE164: string }
  | { name: 'recovery' };

interface NavValue {
  route: Route;
  depth: number;
  push: (r: Route) => void;
  replace: (r: Route) => void;
  pop: () => void;
  reset: (r: Route) => void;
}

const NavContext = createContext<NavValue | null>(null);

export function NavigationProvider({ initial, children }: { initial: Route; children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([initial]);

  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const value = useMemo<NavValue>(
    () => ({
      route: stack[stack.length - 1],
      depth: stack.length,
      push: (r) => setStack((s) => [...s, r]),
      replace: (r) => setStack((s) => [...s.slice(0, -1), r]),
      pop,
      reset: (r) => setStack([r]),
    }),
    [stack, pop],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const v = useContext(NavContext);
  if (!v) throw new Error('useNav outside NavigationProvider');
  return v;
}
