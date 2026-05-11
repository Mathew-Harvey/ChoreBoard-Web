import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session';
import { useFamilyEvents } from './lib/useFamilyEvents';
import { AuthScreen } from './screens/AuthScreen';
import { KidPinScreen } from './screens/KidPinScreen';
import { Desktops } from './screens/Desktops';
import { AdminLayout } from './screens/admin/AdminLayout';
import { AdminChores } from './screens/admin/AdminChores';
import { AdminFamily } from './screens/admin/AdminFamily';
import { AdminLedger } from './screens/admin/AdminLedger';

export function App() {
  const session = useSession();
  const signedIn = !!session.data;
  useFamilyEvents(signedIn);

  if (session.isLoading) {
    return (
      <div className="grid h-full place-items-center text-slate-400">Loading…</div>
    );
  }

  if (!signedIn) {
    return (
      <Routes>
        <Route path="/kid" element={<KidPinScreen />} />
        <Route path="*" element={<AuthScreen />} />
      </Routes>
    );
  }

  const isParent = session.data!.kind === 'parent';

  return (
    <Routes>
      <Route path="/" element={<Desktops />} />
      <Route path="/desktop/:idx" element={<Desktops />} />
      {isParent && (
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="chores" replace />} />
          <Route path="chores" element={<AdminChores />} />
          <Route path="family" element={<AdminFamily />} />
          <Route path="ledger" element={<AdminLedger />} />
        </Route>
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
