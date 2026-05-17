// Shared response types. Kept hand-maintained for v1; a future iteration could
// generate these from a Zod/OpenAPI schema in the API.

export type Role = 'owner' | 'parent';
export type MemberType = 'user' | 'kid';
/**
 * Member-stated gender used to pick a tier portrait set. `unspecified` ("rather
 * not say") is the default and renders an alternating m/f portrait so a
 * "rather not say" member still gets a personal-feeling avatar.
 */
export type StatedGender = 'male' | 'female' | 'unspecified';
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
  color: string;
  gender: StatedGender;
  /** ISO timestamp set when the OnboardWizard completed for this family. */
  familyOnboardingCompletedAt: string | null;
};

export type KidPrincipal = {
  kind: 'kid';
  kidId: string;
  familyId: string;
  name: string;
  color: string;
  gender: StatedGender;
};

export type Principal = ParentPrincipal | KidPrincipal;

export type EntitlementsPlan = 'free' | 'family';

export type Entitlements = {
  plan: EntitlementsPlan;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';
  limits: { kids: number | null; parents: number | null };
  remaining: { kids: number; parents: number };
  features: {
    push: boolean;
    fullHistory: boolean;
    allBadges: boolean;
    csvExport: boolean;
  };
};

export type Family = {
  id: string;
  name: string;
  payoutDay: number;
  payoutTime: string;
  timezone: string;
  /** ISO 3166-1 alpha-2 — drives the chore-suggestion price defaults. */
  country: string | null;
  /** ISO 4217 — falls back to the country's default currency on the API. */
  currency: string | null;
  onboardingCompletedAt: string | null;
  tvCelebrationSound: boolean;
  pairingReminderDismissedAt: string | null;
};

export type DevicePairing = {
  id: string;
  deviceLabel: string | null;
  issuedByUserId: string | null;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
  status: 'pending' | 'active' | 'revoked' | 'expired';
};

export type PairingIssuance = {
  pairing: { id: string; issuedAt: string; expiresAt: string };
  // Plaintext shown exactly once.
  code: string;
};

export type Kid = {
  id: string;
  name: string;
  color: string;
  avatar?: string | null;
  gender: StatedGender;
  /**
   * Whole-year age. Optional because legacy kids inserted before the
   * age-aware suggestions feature have null ages until a parent edits
   * them in Admin → Family.
   */
  age?: number | null;
};

/**
 * Returned by GET /api/chores/suggest. Each item has the catalog metadata
 * plus an `amountCents` already priced for the family's country / currency
 * and the youngest in-band kid. The wizard treats this as preview data —
 * the actual chore is created via POST /api/chores when the parent
 * confirms.
 */
export type ChoreSuggestion = {
  slug: string;
  name: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category:
    | 'self-care'
    | 'kitchen'
    | 'cleaning'
    | 'laundry'
    | 'pets'
    | 'yard'
    | 'meals'
    | 'family';
  minAge: number;
  maxAge: number;
  cadence: Cadence;
  amountCents: number;
  currency: string;
  priceForAge: number;
  source: string;
};

export type ChoreSuggestionsResponse = {
  suggestions: ChoreSuggestion[];
  country: string;
  currency: string;
  ages: number[];
};
export type Parent = {
  id: string;
  name: string;
  role: Role;
  color: string;
  avatar?: string | null;
  gender: StatedGender;
};

export type FamilyInvite = {
  id: string;
  token: string;
  url: string;
  expiresAt: string;
  createdAt: string;
  createdByUserId: string | null;
};

// Public projection returned by GET /api/auth/invites/:token — used by the
// join screen to render context before the new parent commits to creating
// an account. Does not leak family/kid contents.
export type PublicInvite = {
  familyName: string;
  invitedByName: string | null;
  expiresAt: string;
};

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
  gender: StatedGender;
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

// Milestones & rewards ----------------------------------------------------

export type MilestoneScope = 'family' | 'member';
export type MilestoneMetric = 'cents_earned' | 'chores_completed';
export type MilestonePeriod = 'week' | 'month' | 'lifetime';

export type MilestoneHit = {
  id: string;
  familyId: string;
  milestoneId: string;
  periodStart: string;
  hitAt: string;
  amount: number;
  claimedAt: string | null;
  claimedByUserId: string | null;
  claimNote: string | null;
};

export type Milestone = {
  id: string;
  familyId: string;
  name: string;
  reward: string;
  icon: string | null;
  scope: MilestoneScope;
  memberType: MemberType | null;
  memberId: string | null;
  metric: MilestoneMetric;
  period: MilestonePeriod;
  targetValue: number;
  repeats: boolean;
  active: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  // Computed fields from GET /milestones:
  periodStart: string;
  progress: number;
  percent: number;
  hitThisPeriod: boolean;
  currentHit: MilestoneHit | null;
  recentHits: MilestoneHit[];
  unclaimedHitCount: number;
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

// History dashboard --------------------------------------------------------
//
// Mirrors GET /api/stats/history. Single rich payload that powers the
// History desktop tab — totals + trend + member/chore leaderboards +
// weeks-gone-by table + status breakdown for an arbitrary date range or
// preset.

export type HistoryPreset =
  | 'this_week'
  | 'last_week'
  | 'last_4_weeks'
  | 'this_month'
  | 'last_3_months'
  | 'this_year'
  | 'all_time';

export type HistoryRange = {
  from: string;
  to: string;
  days: number;
  label: string;
  preset: HistoryPreset | 'custom';
};

export type HistoryDayBucket = {
  date: string; // YYYY-MM-DD in family TZ
  cents: number;
  chores: number;
};

export type HistoryMemberRow = {
  memberType: MemberType;
  memberId: string;
  name: string;
  color?: string;
  avatar?: string | null;
  cents: number;
  chores: number;
};

export type HistoryChoreRow = {
  choreId: string;
  name: string;
  cents: number;
  count: number;
};

export type HistoryWeekRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  closedAt: string | null;
  championMemberType: MemberType | null;
  championMemberId: string | null;
  championAmountCents: number | null;
  championName: string | null;
  championColor: string | null;
  totalCents: number;
  choreCount: number;
};

export type HistoryDayOfWeekRow = {
  dow: number; // 0=Sun … 6=Sat (family TZ)
  cents: number;
  chores: number;
};

export type HistoryBiggestSingle = {
  ledgerId: string;
  choreId: string;
  choreName: string;
  memberType: MemberType;
  memberId: string;
  memberName: string;
  memberColor: string | null;
  cents: number;
  earnedAt: string;
};

export type HistoryMostRepeated = {
  choreId: string;
  name: string;
  count: number;
  cents: number;
};

export type HistoryHighlights = {
  bestWeek: HistoryWeekRow | null;
  biggestSingle: HistoryBiggestSingle | null;
  mostRepeated: HistoryMostRepeated | null;
};

export type HistoryResponse = {
  range: HistoryRange;
  previousRange: { from: string; to: string } | null;
  totals: {
    cents: number;
    chores: number;
    activeMembers: number;
    avgPerChoreCents: number;
    avgPerDayCents: number;
    bestDay: { date: string; cents: number; chores: number } | null;
    previousCents: number | null;
    previousChores: number | null;
    deltaCents: number | null;
    deltaPct: number | null;
  };
  daily: HistoryDayBucket[];
  previousDaily: HistoryDayBucket[];
  byDayOfWeek: HistoryDayOfWeekRow[];
  byMember: HistoryMemberRow[];
  byChore: HistoryChoreRow[];
  weeks: HistoryWeekRow[];
  statusBreakdown: {
    approved: number;
    missed: number;
    rejected: number;
  };
  highlights: HistoryHighlights;
};
