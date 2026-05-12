import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { clearToken } from './sessionToken';
import type { Principal } from './types';

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const r = await api.get<{ principal: Principal | null }>('/api/auth/me');
      return r.principal;
    },
    staleTime: 30_000,
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
