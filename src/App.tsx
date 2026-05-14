import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from './lib/session';
import { useFamilyEvents } from './lib/useFamilyEvents';
import { useNativePush } from './lib/nativePush';
import { AuthScreen } from './screens/AuthScreen';
import { JoinFamilyScreen } from './screens/JoinFamilyScreen';
import { KidPinScreen } from './screens/KidPinScreen';
import { Desktops } from './screens/Desktops';
import { AdminLayout } from './screens/admin/AdminLayout';
import { AdminChores } from './screens/admin/AdminChores';
import { AdminFamily } from './screens/admin/AdminFamily';
import { AdminLedger } from './screens/admin/AdminLedger';
import { AdminMilestones } from './screens/admin/AdminMilestones';
import { AdminBilling } from './screens/admin/AdminBilling';
import { AdminDashPage } from './screens/AdminDashPage';
import { PrivacyPolicy } from './screens/legal/PrivacyPolicy';
import { TermsOfService } from './screens/legal/TermsOfService';

export function App() {
  const session = useSession();
  const signedIn = !!session.data;
  const isParent = session.data?.kind === 'parent';
  const navigate = useNavigate();
  const location = useLocation();
  // /admin/dash is a whitelisted-only usage dashboard that renders its own
  // auth states (loading / sign-in / denied / dashboard). It must work
  // whether or not there's a session, so it bypasses the normal auth gate
  // below — and it must NOT subscribe to family events / native push, both
  // of which assume a parent principal scoped to a real family.
  const onAdminDash = location.pathname === '/admin/dash';
  useFamilyEvents(signedIn && !onAdminDash);
  useNativePush({ enabled: signedIn && !onAdminDash, isParent, navigate });

  if (onAdminDash) {
    return <AdminDashPage />;
  }

  if (session.isLoading) {
    return (
      <div className="grid h-full place-items-center text-slate-400">Loading…</div>
    );
  }

  // /privacy and /terms are public — they need to render the same way for a
  // signed-out visitor reading them at signup time and for a signed-in family
  // reviewing them later. Declared before the auth gate below so the policy
  // pages always win.
  if (!signedIn) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/kid" element={<KidPinScreen />} />
        <Route path="/join/:token" element={<JoinFamilyScreen />} />
        <Route path="*" element={<AuthScreen />} />
      </Routes>
    );
  }

  return (
    <>
      <a href="#cb-main" className="skip-link">
        Skip to content
      </a>
      <Routes>
        <Route path="/" element={<Desktops />} />
        <Route path="/desktop/:idx" element={<Desktops />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/join/:token" element={<JoinFamilyScreen />} />
        {isParent && (
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="chores" replace />} />
            <Route path="chores" element={<AdminChores />} />
            <Route path="family" element={<AdminFamily />} />
            <Route path="ledger" element={<AdminLedger />} />
            <Route path="milestones" element={<AdminMilestones />} />
            <Route path="billing" element={<AdminBilling />} />
          </Route>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
