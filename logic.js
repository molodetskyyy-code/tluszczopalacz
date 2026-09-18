(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FatBurnLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY_MS = 86400000;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function dateParts(key) {
    if (typeof key !== 'string' || !DATE_RE.test(key)) return null;
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) return null;
    return { year, month, day, date };
  }

  function isValidDateKey(key) {
    return !!dateParts(key);
  }

  function epochDay(key) {
    const parts = dateParts(key);
    if (!parts) throw new Error('Nieprawidłowa data: ' + key);
    return Math.floor(parts.date.getTime() / DAY_MS);
  }

  function keyFromEpochDay(day) {
    const date = new Date(day * DAY_MS);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  function addDays(key, amount) {
    return keyFromEpochDay(epochDay(key) + amount);
  }

  function diffDaysInclusive(from, to) {
    return epochDay(to) - epochDay(from) + 1;
  }

  function dayOfWeek(key) {
    return dateParts(key).date.getUTCDay();
  }

  function weekStartKey(key) {
    return addDays(key, -((dayOfWeek(key) + 6) % 7));
  }

  function weekEndKey(key) {
    return addDays(weekStartKey(key), 6);
  }

  function safeMinimum(profile) {
    return profile.gender === 'f' ? 1200 : 1500;
  }

  function bmrFor(profile, weight) {
    const base = 10 * weight + 6.25 * profile.height - 5 * profile.age;
    return Math.round(base + (profile.gender === 'm' ? 5 : -161));
  }

  function baseTdeeFor(profile, weight) {
    return Math.round(bmrFor(profile, weight) * profile.activityFactor);
  }

  function latestWeightOnOrBefore(profile, history, key) {
    let bestKey = '';
    let weight = profile.startWeight;
    Object.entries(history || {}).forEach(([entryKey, entry]) => {
      if (
        isValidDateKey(entryKey) && entryKey <= key && entryKey >= bestKey &&
        entry && isFiniteNumber(entry.weight) && entry.weight >= 30 && entry.weight <= 350
      ) {
        bestKey = entryKey;
        weight = entry.weight;
      }
    });
    return weight;
  }

  function weeklyDeficitForDate(profile) {
    return profile.weeklyDeficit;
  }

  function weekTarget(profile, key) {
    if (key < profile.planStartKey) return 0;
    const start = weekStartKey(key);
    const end = weekEndKey(key);
    if (end < profile.planStartKey) return 0;
    const activeStart = profile.planStartKey > start ? profile.planStartKey : start;
    const activeDays = diffDaysInclusive(activeStart, end);
    return Math.round(weeklyDeficitForDate(profile, key) / 7 * activeDays);
  }

  function actualDeficit(entry) {
    if (!entry) return 0;
    if (isFiniteNumber(entry.actualDeficit)) return entry.actualDeficit;
    const baseTdee = toNumber(entry.baseTdee, 0);
    const activeKcal = toNumber(entry.activeKcal ?? entry.burned, 0);
    const eaten = toNumber(entry.eaten ?? entry.kcal, 0);
    return Math.round(baseTdee + activeKcal - eaten);
  }

  function entriesBetween(history, from, to) {
    return Object.entries(history || {})
      .filter(([key, entry]) => isValidDateKey(key) && key >= from && key <= to && entry)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }

  function dayPlan(profile, history, key) {
    const entry = history && history[key];
    if (entry && [entry.bmr, entry.baseTdee, entry.plannedDeficit, entry.calorieLimit].every(isFiniteNumber)) {
      return {
        key,
        bmr: entry.bmr,
        baseTdee: entry.baseTdee,
        plannedDeficit: entry.plannedDeficit,
        requiredDailyDeficit: toNumber(entry.requiredDailyDeficit, entry.plannedDeficit),
        calorieLimit: entry.calorieLimit,
        needsActive: toNumber(entry.needsActive, 0),
        daysRemaining: Math.max(0, diffDaysInclusive(key, weekEndKey(key))),
        weekTarget: weekTarget(profile, key),
        frozen: true,
        inPlan: key >= profile.planStartKey
      };
    }

    const weight = latestWeightOnOrBefore(profile, history, key);
    const bmr = bmrFor(profile, weight);
    const baseTdee = baseTdeeFor(profile, weight);
    const inPlan = key >= profile.planStartKey;
    if (!inPlan) {
      return {
        key, bmr, baseTdee, plannedDeficit: 0, requiredDailyDeficit: 0,
        calorieLimit: baseTdee, needsActive: 0, daysRemaining: 0,
        weekTarget: 0, frozen: false, inPlan: false
      };
    }

    const start = weekStartKey(key);
    const planWeekStart = profile.planStartKey > start ? profile.planStartKey : start;
    const target = weekTarget(profile, key);
    const doneBefore = entriesBetween(history, planWeekStart, addDays(key, -1))
      .reduce((sum, pair) => sum + actualDeficit(pair[1]), 0);
    const remaining = Math.max(0, target - doneBefore);
    const daysRemaining = Math.max(1, diffDaysInclusive(key, weekEndKey(key)));
    const requiredDailyDeficit = Math.round(remaining / daysRemaining);
    const minimum = safeMinimum(profile);
    const rawLimit = baseTdee - requiredDailyDeficit;
    const calorieLimit = Math.max(minimum, rawLimit);
    const plannedFromFood = Math.max(0, baseTdee - calorieLimit);
    const needsActive = Math.max(0, requiredDailyDeficit - plannedFromFood);

    return {
      key, bmr, baseTdee, plannedDeficit: requiredDailyDeficit,
      requiredDailyDeficit, calorieLimit, needsActive, daysRemaining,
      weekTarget: target, frozen: false, inPlan: true
    };
  }

  function entryStats(profile, history, key) {
    const plan = dayPlan(profile, history, key);
    const entry = history && history[key] ? history[key] : null;
    const eaten = entry ? toNumber(entry.eaten ?? entry.kcal, 0) : 0;
    const activeKcal = entry ? toNumber(entry.activeKcal ?? entry.burned, 0) : 0;
    const deficit = entry ? actualDeficit(entry) : 0;
    const effectiveLimit = plan.calorieLimit + activeKcal;
    return {
      ...plan,
      entry,
      eaten,
      activeKcal,
      activity: entry && entry.activity ? entry.activity : '',
      deficit,
      effectiveLimit,
      left: effectiveLimit - eaten,
      estimatedFatGrams: entry ? Math.round(deficit / 7.7) : 0
    };
  }

  function weekProgress(profile, history, key) {
    const start = weekStartKey(key);
    const end = weekEndKey(key);
    const planWeekStart = profile.planStartKey > start ? profile.planStartKey : start;
    const target = weekTarget(profile, key);
    const done = target === 0 ? 0 : entriesBetween(history, planWeekStart, key)
      .reduce((sum, pair) => sum + actualDeficit(pair[1]), 0);
    const remaining = Math.max(0, target - done);
    const daysLeft = key > end ? 0 : Math.max(1, diffDaysInclusive(key, end));
    return {
      start, end, target, done, remaining, daysLeft,
      dailyRequired: daysLeft ? Math.round(remaining / daysLeft) : 0,
      percent: target > 0 ? Math.max(0, Math.min(1, done / target)) : 0
    };
  }

  function totalDeficit(profile, history, throughKey) {
    return entriesBetween(history, profile.planStartKey, throughKey)
      .reduce((sum, pair) => sum + actualDeficit(pair[1]), 0);
  }

  function validateProfile(profile) {
    const errors = [];
    if (!['m', 'f'].includes(profile.gender)) errors.push('Wybierz płeć.');
    if (!isFiniteNumber(profile.age) || profile.age < 13 || profile.age > 100) errors.push('Wiek musi mieścić się w zakresie 13–100 lat.');
    if (!isFiniteNumber(profile.height) || profile.height < 120 || profile.height > 230) errors.push('Wzrost musi mieścić się w zakresie 120–230 cm.');
    if (!isFiniteNumber(profile.startWeight) || profile.startWeight < 30 || profile.startWeight > 350) errors.push('Waga musi mieścić się w zakresie 30–350 kg.');
    if (!isFiniteNumber(profile.activityFactor) || profile.activityFactor < 1.2 || profile.activityFactor > 2) errors.push('Wybierz poprawny poziom aktywności codziennej.');
    if (!isFiniteNumber(profile.weeklyDeficit) || profile.weeklyDeficit < 0 || profile.weeklyDeficit > 7000) errors.push('Deficyt tygodniowy musi mieścić się w zakresie 0–7000 kcal.');
    if (!isValidDateKey(profile.planStartKey)) errors.push('Wybierz poprawną datę rozpoczęcia.');
    return errors;
  }

  function validateEntry(entry) {
    const errors = [];
    if (!isFiniteNumber(entry.eaten) || entry.eaten < 0 || entry.eaten > 15000) errors.push('Kalorie zjedzone muszą mieścić się w zakresie 0–15000.');
    if (!isFiniteNumber(entry.activeKcal) || entry.activeKcal < 0 || entry.activeKcal > 10000) errors.push('Aktywne kcal muszą mieścić się w zakresie 0–10000.');
    if (entry.weight !== null && (!isFiniteNumber(entry.weight) || entry.weight < 30 || entry.weight > 350)) errors.push('Waga musi mieścić się w zakresie 30–350 kg.');
    if (typeof entry.note !== 'string' || entry.note.length > 500) errors.push('Notatka może mieć maksymalnie 500 znaków.');
    return errors;
  }

  return {
    addDays,
    actualDeficit,
    baseTdeeFor,
    bmrFor,
    dateParts,
    dayOfWeek,
    dayPlan,
    diffDaysInclusive,
    entriesBetween,
    entryStats,
    isFiniteNumber,
    isValidDateKey,
    latestWeightOnOrBefore,
    safeMinimum,
    totalDeficit,
    validateEntry,
    validateProfile,
    weekEndKey,
    weekProgress,
    weekStartKey,
    weekTarget
  };
});
