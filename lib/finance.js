// RupeeRizz — Deterministic, explainable financial calculations.
// These are the SINGLE SOURCE OF TRUTH for money math. Used on server (API) and
// client (instant recalculation previews). The LLM must never compute these values.
// Pure JS only (no server/browser-only imports).

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
const round = (n) => Math.round(Number(n) || 0);

function monthsUntil(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return null;
  const months = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
  return months;
}

export function addMonths(date, m) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Math.max(0, Math.round(m)));
  return d;
}

// Reliable monthly income: user-entered reliable income OR, for irregular earners,
// a conservative estimate (lowest of the recent months). Never over-promises money.
export function reliableIncome(finance = {}) {
  if (finance.income_type === 'irregular' && Array.isArray(finance.recent_incomes) && finance.recent_incomes.length) {
    const vals = finance.recent_incomes.map(Number).filter((v) => Number.isFinite(v) && v >= 0);
    if (vals.length) {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return {
        value: round(min),
        method: `conservative_lowest_of_${vals.length}_months`,
        variabilityRatio: max > 0 ? min / max : 1,
        regular: false,
      };
    }
  }
  const val = round(finance.reliable_monthly_income ?? finance.monthly_income ?? 0);
  return { value: val, method: 'user_entered_reliable', variabilityRatio: 1, regular: true };
}

// monthly_surplus = income - essentials - compulsory EMI - business operating costs
// safe_monthly_saving = max(0, monthly_surplus)
export function computeSnapshot(finance = {}) {
  const inc = reliableIncome(finance);
  const essential = round(finance.essential_expenses);
  const nonEssential = round(finance.non_essential_expenses);
  const emi = round(finance.compulsory_emi);
  const opCosts = round(finance.business_operating_costs);
  const surplus = inc.value - essential - emi - opCosts;
  return {
    reliable_monthly_income: inc.value,
    income_method: inc.method,
    income_regular: inc.regular,
    income_variability_ratio: inc.variabilityRatio,
    essential_expenses: essential,
    non_essential_expenses: nonEssential,
    compulsory_emi: emi,
    business_operating_costs: opCosts,
    monthly_surplus: surplus,
    safe_monthly_saving: Math.max(0, surplus),
  };
}

// Emergency fund target starts at ONE month of essential expenses.
export function emergencyFundTarget(finance = {}) {
  return round(finance.essential_expenses);
}

export function requiredMonthly(goal = {}, today = new Date()) {
  const remaining = Math.max(0, round(goal.goal_amount) - round(goal.current_saved_amount));
  const m = monthsUntil(goal.target_date, today);
  if (m === null || m <= 0) return null;
  return round(remaining / m);
}

export function goalMetrics(goal = {}, safeContribution = 0, today = new Date()) {
  const amount = round(goal.goal_amount);
  const saved = round(goal.current_saved_amount);
  const remaining = Math.max(0, amount - saved);
  const progressPct = amount > 0 ? Math.min(100, (saved / amount) * 100) : 0;
  const req = requiredMonthly(goal, today);
  const safe = round(safeContribution);
  const estMonths = safe > 0 && remaining > 0 ? Math.ceil(remaining / safe) : (remaining === 0 ? 0 : null);
  const estDate = estMonths !== null ? addMonths(today, estMonths) : null;
  const gap = req !== null ? Math.max(0, req - safe) : null;
  const milestones = [25, 50, 75, 100].map((m) => ({
    pct: m,
    amount: round((amount * m) / 100),
    reached: progressPct >= m,
  }));
  return {
    amount, saved, remaining,
    progressPct: Math.round(progressPct),
    requiredMonthly: req,
    safeContribution: safe,
    estMonths,
    estDate: estDate ? estDate.toISOString().slice(0, 10) : null,
    gap,
    milestones,
  };
}

// Allocate safe monthly savings across emergency fund + goals per the RupeeRizz rules.
export function allocateSavings({ safe = 0, emergencyAmount = 0, emergencyTarget = 0, goals = [] } = {}) {
  const result = { emergency: 0, goals: {}, note: null };
  const s = round(safe);
  if (s <= 0) {
    result.note = 'no_safe_savings';
    return result;
  }
  const needEmergency = round(emergencyAmount) < round(emergencyTarget);
  let goalPool = s;
  if (needEmergency) {
    result.emergency = round(s * 0.6);
    goalPool = s - result.emergency; // 40% to goals
  }
  const active = (goals || []).filter((g) => round(g.current_saved_amount) < round(g.goal_amount));
  if (!active.length) {
    if (!needEmergency) result.note = 'no_active_goals';
    return result;
  }
  const sorted = [...active].sort((a, b) => (a.priority || 99) - (b.priority || 99));
  if (sorted.length === 1) {
    result.goals[sorted[0].id] = round(goalPool);
    return result;
  }
  // Multiple goals: 70% to priority one, 30% split by required monthly contribution.
  const first = sorted[0];
  result.goals[first.id] = round(goalPool * 0.7);
  const rest = sorted.slice(1);
  const totalReq = rest.reduce((acc, g) => acc + Math.max(1, requiredMonthly(g) || 1), 0);
  const restPool = goalPool * 0.3;
  rest.forEach((g) => {
    const w = Math.max(1, requiredMonthly(g) || 1);
    result.goals[g.id] = round(restPool * (w / totalReq));
  });
  return result;
}

// Financial Readiness Score (0-100). Self-improvement only — never loan approval.
export function readinessScore({ snapshot, emergencyAmount = 0, emergencyTarget = 0 } = {}) {
  const income = snapshot.reliable_monthly_income || 0;
  const surplus = snapshot.monthly_surplus || 0;
  const emi = snapshot.compulsory_emi || 0;
  const nonEss = snapshot.non_essential_expenses || 0;

  // 1. Income / cash-flow regularity (20)
  const f1 = snapshot.income_regular ? 20 : round(20 * clamp(snapshot.income_variability_ratio ?? 0.5, 0, 1));
  const f1note = snapshot.income_regular
    ? 'Income looks regular each month.'
    : 'Income varies month to month; we used a conservative estimate.';

  // 2. Positive monthly surplus (25) — 20%+ of income => full marks
  let f2 = 0;
  if (income > 0 && surplus > 0) f2 = round(25 * clamp((surplus / income) / 0.2, 0, 1));
  else if (surplus > 0) f2 = 13;
  const f2note = surplus > 0 ? 'You have money left after essentials each month.' : 'No surplus after essentials yet.';

  // 3. Emergency savings buffer (20)
  const f3 = emergencyTarget > 0 ? round(20 * clamp(emergencyAmount / emergencyTarget, 0, 1)) : (emergencyAmount > 0 ? 20 : 0);
  const f3note = emergencyAmount >= emergencyTarget && emergencyTarget > 0
    ? 'Emergency buffer target reached.'
    : 'Building your one-month emergency buffer.';

  // 4. Existing EMI burden (20) — 0% => 20, >=40% => 0
  const emiRatio = income > 0 ? emi / income : 0;
  const f4 = round(20 * clamp(1 - emiRatio / 0.4, 0, 1));
  const f4note = emi > 0 ? `EMIs are ${Math.round(emiRatio * 100)}% of reliable income.` : 'No EMI burden right now.';

  // 5. Expense stability / non-essential control (15) — <=10% => 15, >=50% => 0
  const neRatio = income > 0 ? nonEss / income : 0;
  const f5 = round(15 * clamp(1 - (neRatio - 0.1) / (0.5 - 0.1), 0, 1));
  const f5note = `Non-essential spending is ${Math.round(neRatio * 100)}% of reliable income.`;

  const score = clamp(f1 + f2 + f3 + f4 + f5, 0, 100);
  const band = score < 40 ? 'build' : score < 70 ? 'improving' : 'prepared';
  return {
    score,
    band,
    breakdown: [
      { key: 'income_regularity', label: 'Income / cash-flow regularity', points: f1, max: 20, note: f1note },
      { key: 'positive_surplus', label: 'Positive monthly surplus', points: f2, max: 25, note: f2note },
      { key: 'emergency_buffer', label: 'Emergency savings buffer', points: f3, max: 20, note: f3note },
      { key: 'emi_burden', label: 'Existing EMI burden', points: f4, max: 20, note: f4note },
      { key: 'expense_stability', label: 'Expense stability', points: f5, max: 15, note: f5note },
    ],
  };
}

// Borrowing safety guard — never a credit score, only a kind readiness signal.
export function borrowGuard({ snapshot, emergencyAmount = 0, emergencyTarget = 0, estimatedNewEmi = 0 } = {}) {
  const income = snapshot.reliable_monthly_income || 0;
  const reasons = [];
  if ((snapshot.monthly_surplus || 0) <= 0) reasons.push('surplus_non_positive');
  if (round(emergencyAmount) < round(emergencyTarget)) reasons.push('emergency_below_target');
  const totalEmi = (snapshot.compulsory_emi || 0) + (Number(estimatedNewEmi) || 0);
  const emiRatio = income > 0 ? totalEmi / income : 1;
  if (emiRatio > 0.3) reasons.push('emi_over_30pct');
  return { canBorrow: reasons.length === 0, reasons, emiRatio: Math.round(emiRatio * 100) / 100 };
}

export const scoreBandLabel = (band) => ({
  build: '0\u201339: Build the basics',
  improving: '40\u201369: Improving',
  prepared: '70\u2013100: More prepared',
}[band] || '');
