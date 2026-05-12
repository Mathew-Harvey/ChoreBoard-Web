import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { BoardResponse, MemberStats, MemberType } from './types';

export type Member = {
  type: MemberType;
  id: string;
  name: string;
  color?: string;
};

export type MemberRollup = {
  member: Member;
  stats: MemberStats['stats'];
  badges: MemberStats['badges'];
  recent: MemberStats['recent'];
};

/**
 * Shared per-member stats fetch. Every screen that needs streaks / level / xp
 * across the family reads from the same cache so we only hit
 * `/api/stats/member/:type/:id` once per member per ~2 minutes.
 *
 * Returns a flat array of rollups; consumers usually wrap with `byKey` below
 * for O(1) lookup.
 */
export function useFamilyMemberStats(board?: BoardResponse) {
  return useQuery<MemberRollup[]>({
    queryKey: [
      'family-member-stats',
      board?.kids.map((k) => k.id).join(',') ?? '',
      board?.parents.map((p) => p.id).join(',') ?? '',
    ],
    enabled: !!board,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    queryFn: async () => {
      if (!board) return [];
      const members: Member[] = [
        ...board.kids.map((k) => ({
          type: 'kid' as const,
          id: k.id,
          name: k.name,
          color: k.color,
        })),
        ...board.parents.map((p) => ({
          type: 'user' as const,
          id: p.id,
          name: p.name,
        })),
      ];
      const results = await Promise.all(
        members.map(async (m): Promise<MemberRollup | null> => {
          try {
            const r = await api.get<MemberStats>(
              `/api/stats/member/${m.type}/${m.id}`,
            );
            return {
              member: m,
              stats: r.stats,
              badges: r.badges,
              recent: r.recent,
            };
          } catch {
            return null;
          }
        }),
      );
      return results.filter((r): r is MemberRollup => r !== null);
    },
  });
}

/** Convenience lookup. Returns `undefined` for unknown member keys. */
export function rollupByKey(rollup: MemberRollup[] | undefined) {
  const m = new Map<string, MemberRollup>();
  if (!rollup) return { get: (_t: MemberType, _i: string) => undefined };
  for (const r of rollup) m.set(`${r.member.type}:${r.member.id}`, r);
  return {
    get: (type: MemberType, id: string) => m.get(`${type}:${id}`),
  };
}
