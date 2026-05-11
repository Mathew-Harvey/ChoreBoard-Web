// Shared response types. Kept hand-maintained for v1; a future iteration could
// generate these from a Zod/OpenAPI schema in the API.

export type Role = 'owner' | 'parent';
export type MemberType = 'user' | 'kid';
export type InstanceStatus =
  | 'available'
  | 'claimed'
  | 'pending'
  | 'approved'
  | 'missed'
  | 'rejected';

export type ParentPrincipal = {
  kind: 'parent';
  userId: string;
  familyId: string;
  role: Role;
  name: string;
  email: string;
};

export type KidPrincipal = {
  kind: 'kid';
  kidId: string;
  familyId: string;
  name: string;
  color: string;
};

export type Principal = ParentPrincipal | KidPrincipal;

export type Family = {
  id: string;
  name: string;
  payoutDay: number;
  payoutTime: string;
  timezone: string;
};

export type Kid = { id: string; name: string; color: string; avatar?: string | null };
export type Parent = { id: string; name: string; role: Role; avatar?: string | null };

export type Cadence =
  | { kind: 'daily'; times: string[] }
  | { kind: 'weekly'; days: number[]; time: string }
  | { kind: 'every_n_days'; n: number; time: string }
  | { kind: 'every_n_weeks'; n: number; days: number[]; time: string }
  | { kind: 'monthly_dom'; day: number; time: string }
  | { kind: 'monthly_nth'; nth: number; weekday: number; time: string };

export type Chore = {
  id: string;
  familyId: string;
  name: string;
  description?: string | null;
  amountCents: number;
  cadenceJson: Cadence;
  active: boolean;
  photoRequired: boolean;
  sortOrder: number;
};

export type BoardInstance = {
  id: string;
  choreId: string;
  availableAt: string;
  dueAt: string | null;
  status: InstanceStatus;
  claimedByType: MemberType | null;
  claimedById: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  photoKey: string | null;
  choreName: string;
  amountCents: number;
  photoRequired: boolean;
  overdue: boolean;
};

export type BoardResponse = {
  now: string;
  family: Family;
  instances: BoardInstance[];
  kids: Kid[];
  parents: Parent[];
};

export type LeaderboardEntry = {
  memberType: MemberType;
  memberId: string;
  name: string;
  color?: string;
  avatar?: string | null;
  amountCents: number;
  choreCount: number;
};
export type LeaderboardResponse = {
  entries: LeaderboardEntry[];
  weekStart: string | null;
  payoutAt: string | null;
};

export type MemberStats = {
  stats: {
    lifetimeCents: number;
    lifetimeChores: number;
    xp: number;
    level: number;
    intoLevel: number;
    nextLevelAt: number;
    streak: number;
    bestStreak: number;
    badgeCount: number;
    weekCents: number;
    unpaidCents: number;
  };
  recent: Array<{ id: string; amountCents: number; earnedAt: string; choreName: string }>;
  badges: Array<{
    code: string;
    name: string;
    description: string;
    icon: string | null;
    awardedAt: string;
  }>;
};

export type Goal = {
  id: string;
  familyId: string;
  memberType: MemberType;
  memberId: string;
  name: string;
  targetCents: number;
  deadline: string | null;
  basis: 'weekly_plus_unpaid' | 'lifetime';
  createdAt: string;
  hitAt: string | null;
  progressCents: number;
  percent: number;
};

export type LedgerEntry = {
  id: string;
  amountCents: number;
  memberType: MemberType;
  memberId: string;
  status: 'unpaid' | 'paid';
  earnedAt: string;
  paidAt: string | null;
  weekId: string | null;
  choreName: string;
};
