// RupeeRizz — deterministic behavioral insight engine.
// All money math lives here; the UI only renders and simulates the results.

const DISCRETIONARY = new Set(['Food & Drinks', 'Shopping', 'Travel', 'Other']);
const round = (n) => Math.round(Number(n) || 0);
const money = (n) => Math.max(0, round(n));

export function normalizeReceipts(receipts = []) {
  return (receipts || []).map((r) => ({
    id: r.id,
    merchant: r.merchant || 'Unknown merchant',
    category: r.category || 'Other',
    amount: money(r.total),
    date: r.receipt_date || r.created_at || null,
    verified: r.user_verified !== false,
  })).filter((r) => r.amount >= 0);
}

export function spendingDNA(receipts = [], snapshot = {}) {
  const rows = normalizeReceipts(receipts).filter((r) => r.verified);
  const categoryMap = {};
  const merchantMap = {};
  const weekend = { total: 0, count: 0 };
  const weekday = { total: 0, count: 0 };
  const hours = Array.from({ length: 24 }, () => 0);

  rows.forEach((r) => {
    categoryMap[r.category] = (categoryMap[r.category] || 0) + r.amount;
    merchantMap[r.merchant] = (merchantMap[r.merchant] || 0) + r.amount;
    const d = r.date ? new Date(r.date) : null;
    if (d && !Number.isNaN(d.getTime())) {
      const day = d.getDay();
      if (day === 0 || day === 6) { weekend.total += r.amount; weekend.count += 1; }
      else { weekday.total += r.amount; weekday.count += 1; }
      if (r.date.includes('T')) hours[d.getHours()] += r.amount;
    }
  });

  const categories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
  const merchants = Object.entries(merchantMap).sort((a, b) => b[1] - a[1]);
  const topCategory = categories[0] ? { name: categories[0][0], amount: round(categories[0][1]) } : null;
  const topMerchant = merchants[0] ? { name: merchants[0][0], amount: round(merchants[0][1]) } : null;
  const weekendAvg = weekend.count ? weekend.total / weekend.count : 0;
  const weekdayAvg = weekday.count ? weekday.total / weekday.count : 0;
  const weekendLift = weekdayAvg > 0 ? Math.max(0, Math.round(((weekendAvg - weekdayAvg) / weekdayAvg) * 100)) : 0;
  const peakHour = hours.some(Boolean) ? hours.reduce((best, value, idx) => value > hours[best] ? idx : best, 0) : null;

  const discretionary = categories.filter(([name]) => DISCRETIONARY.has(name));
  const discretionaryAmount = discretionary.reduce((sum, [, amount]) => sum + amount, 0);
  const recoverable = round(discretionaryAmount * 0.2);
  const savings = money(snapshot.safe_monthly_saving);
  const monthlySavingRate = savings > 0 ? savings / Math.max(1, money(snapshot.reliable_monthly_income)) : 0;

  let opportunity = topCategory;
  if (!opportunity && savings > 0) opportunity = { name: 'Flexible spending', amount: savings };
  const intervention = opportunity ? Math.max(80, round(opportunity.amount * 0.2)) : 0;

  const pattern = topCategory
    ? `${topCategory.name} is your biggest observed spending category.`
    : 'Add a few verified receipts to unlock a stronger spending pattern.';

  return {
    receiptCount: rows.length,
    categories,
    merchants,
    topCategory,
    topMerchant,
    weekendLift,
    weekendAvg: round(weekendAvg),
    weekdayAvg: round(weekdayAvg),
    peakHour,
    recoverable,
    intervention,
    pattern,
    monthlySavingRate: Math.round(monthlySavingRate * 100),
    hasEnoughData: rows.length >= 3,
  };
}

export function simulateScenario({ snapshot = {}, goal = null, categorySpend = 0, simulatedSpend = 0 } = {}) {
  const currentSavings = money(snapshot.safe_monthly_saving);
  const currentSpend = money(categorySpend);
  const newSpend = Math.max(0, money(simulatedSpend));
  const recovered = Math.max(0, currentSpend - newSpend);
  const projectedMonthlySavings = currentSavings + recovered;
  const annualImpact = recovered * 12;
  let currentMonths = null;
  let projectedMonths = null;
  let daysEarlier = 0;

  if (goal) {
    const remaining = Math.max(0, money(goal.goal_amount) - money(goal.current_saved_amount));
    if (remaining > 0 && currentSavings > 0) currentMonths = Math.ceil(remaining / currentSavings);
    if (remaining > 0 && projectedMonthlySavings > 0) projectedMonths = Math.ceil(remaining / projectedMonthlySavings);
    if (currentMonths !== null && projectedMonths !== null) daysEarlier = Math.max(0, (currentMonths - projectedMonths) * 30);
  }

  return { currentSavings, currentSpend, newSpend, recovered, projectedMonthlySavings, annualImpact, currentMonths, projectedMonths, daysEarlier };
}

export function opportunityCost(amount, snapshot = {}, goal = null) {
  const spend = money(amount);
  const monthlySavings = money(snapshot.safe_monthly_saving);
  const savingsImpactPct = monthlySavings > 0 ? Math.min(100, Math.round((spend / monthlySavings) * 100)) : 0;
  const dailyGoalRate = monthlySavings > 0 ? monthlySavings / 30 : 0;
  const days = dailyGoalRate > 0 ? Math.max(0, Math.ceil(spend / dailyGoalRate)) : 0;
  const remaining = goal ? Math.max(0, money(goal.goal_amount) - money(goal.current_saved_amount)) : 0;
  const goalPct = remaining > 0 ? Math.min(100, Math.round((spend / remaining) * 100)) : 0;
  return { spend, savingsImpactPct, days, goalPct };
}

export function buildExperiment(dna, snapshot = {}, goal = null) {
  const category = dna.topCategory?.name || 'flexible spending';
  const baseline = dna.topCategory?.amount || money(snapshot.non_essential_expenses);
  const target = Math.max(0, baseline - Math.max(80, round(baseline * 0.2)));
  const predicted = Math.max(80, baseline - target);
  const action = category === 'flexible spending'
    ? 'Pick one flexible purchase each day to skip for 7 days.'
    : `Keep ${category} spending below ${money(target)} over the next 7 days.`;
  return {
    category, baseline: money(baseline), target: money(target), predictedSavings: money(predicted), action,
    goalName: goal?.goal_name || null,
  };
}

export function evaluateExperiment(experiment, actualSpend) {
  const actual = money(experiment.baseline - money(actualSpend));
  const worked = actual >= Math.max(1, Math.round(experiment.predictedSavings * 0.6));
  return { actualSavings: actual, worked };
}
