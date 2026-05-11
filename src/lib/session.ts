import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
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
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => {
      qc.clear();
    },
  });
}
