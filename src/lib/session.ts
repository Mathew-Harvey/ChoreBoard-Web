import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { clearToken } from './sessionToken';
import type { Entitlements, Principal } from './types';

/**
 * Both `useSession` (returning the principal) and `useEntitlements`
 * (returning the family's plan/limits/feature flags) hit the same
 * `/auth/me` endpoint and share a single cache entry under the `session`
 * query key. TanStack Query's `select` lets each hook project the slice
 * its callers want, so we never pay for two round trips just to expose two
 * different shapes of the same response.
 *
 * Existing call-sites read `session.data?.kind` etc. — that contract is
 * preserved verbatim because `select` runs after the cache write.
 */
type AuthMeResponse = {
  principal: Principal | null;
  entitlements: Entitlements | null;
};

async function fetchAuthMe(): Promise<AuthMeResponse> {
  return api.get<AuthMeResponse>('/api/auth/me');
}

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: fetchAuthMe,
    staleTime: 30_000,
    select: (data) => data.principal,
  });
}

export function useEntitlements() {
  return useQuery({
    queryKey: ['session'],
    queryFn: fetchAuthMe,
    staleTime: 30_000,
    select: (data) => data.entitlements,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await api.post('/api/auth/logout');
      } finally {
        // Even if the server call fails, drop the native bearer so the
        // user is locally signed out. Otherwise a flaky network leaves
        // them in a "signed in but can't load data" state.
        await clearToken();
      }
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}
