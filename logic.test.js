'use strict';

const assert = require('node:assert/strict');
const L = require('./logic.js');

const profile = {
  schemaVersion: 3,
  gender: 'm',
  age: 30,
  height: 180,
  startWeight: 80,
  weeklyDeficit: 3500,
  planStartKey: '2026-09-14'
};

assert.equal(L.diffDaysInclusive('2026-03-29', '2026-03-30'), 2, 'daty muszą być odporne na zmianę czasu');
assert.equal(L.addDays('2026-03-29', 1), '2026-03-30');
assert.equal(L.weekStartKey('2026-09-20'), '2026-09-14', 'niedziela należy do tygodnia zaczynającego się w poniedziałek');
assert.equal(L.weekEndKey('2026-09-14'), '2026-09-20');

const fridayStart = { ...profile, planStartKey: '2026-09-18' };
assert.equal(L.weekTarget(fridayStart, '2026-09-18'), 1500, 'pierwszy tydzień od piątku ma 3/7 celu');
assert.equal(L.dayPlan(fridayStart, {}, '2026-09-18').plannedDeficit, 500);

const mondayUnder = {
  '2026-09-14': {
    schemaVersion: 3,
    eaten: 2100,
    activeKcal: 0,
    bmr: 2300,
    baseTdee: 2300,
    plannedDeficit: 500,
    calorieLimit: 1800,
    actualDeficit: 200
  }
};
assert.equal(L.dayPlan(profile, mondayUnder, '2026-09-15').plannedDeficit, 550, 'brakujące 300 kcal rozkłada się na 6 dni');

const mondayOver = {
  '2026-09-14': { ...mondayUnder['2026-09-14'], actualDeficit: 800 }
};
assert.equal(L.dayPlan(profile, mondayOver, '2026-09-15').plannedDeficit, 450, 'nadwyżka deficytu zmniejsza cele kolejnych dni');

assert.equal(L.dayPlan(profile, {}, '2026-09-14').plannedDeficit, 500);
assert.equal(L.dayPlan(profile, {}, '2026-09-16').plannedDeficit, 500, 'puste wcześniejsze dni są uznawane za wykonane zgodnie z planem');
assert.equal(L.dayPlan(profile, {}, '2026-09-20').plannedDeficit, 500, 'samo oglądanie przyszłości nie może zaostrzać celu');
assert.equal(L.dayPlan(profile, mondayUnder, '2026-09-16').plannedDeficit, 550, 'pusty wtorek zachowuje skorygowany po poniedziałku cel');

const goal7000 = { ...profile, weeklyDeficit: 7000 };
const wednesdayShortfall = {
  '2026-09-16': {
    schemaVersion: 3,
    eaten: 2000,
    activeKcal: 0,
    bmr: 2500,
    baseTdee: 2500,
    plannedDeficit: 1000,
    calorieLimit: 1500,
    actualDeficit: 500
  }
};
assert.equal(L.dayPlan(goal7000, {}, '2026-09-16').plannedDeficit, 1000, 'dwa puste dni odejmują po 1000 od celu 7000');
assert.equal(L.dayPlan(goal7000, wednesdayShortfall, '2026-09-17').plannedDeficit, 1125, 'brakujące 500 kcal ze środy rozkłada się na cztery dni');

const wednesdayBonus = {
  '2026-09-16': { ...wednesdayShortfall['2026-09-16'], eaten: 1000, actualDeficit: 1500 }
};
assert.equal(L.dayPlan(goal7000, wednesdayBonus, '2026-09-17').plannedDeficit, 875, 'bonus 500 kcal ze środy rozkłada się na cztery dni');

const emptyWednesdayProgress = L.weekProgress(goal7000, {}, '2026-09-16');
assert.equal(emptyWednesdayProgress.assumedDone, 2000);
assert.equal(emptyWednesdayProgress.remaining, 5000);
assert.equal(emptyWednesdayProgress.dailyRequired, 1000);

const savedWednesdayProgress = L.weekProgress(goal7000, wednesdayShortfall, '2026-09-16');
assert.equal(savedWednesdayProgress.remaining, 4500);
assert.equal(savedWednesdayProgress.daysLeft, 4);
assert.equal(savedWednesdayProgress.dailyRequired, 1125);

const withActivity = {
  schemaVersion: 3,
  baseTdee: 2300,
  eaten: 2200,
  activeKcal: 400
};
assert.equal(L.actualDeficit(withActivity), 500, 'aktywne kcal muszą powiększać faktyczny deficyt');
const activityStats = L.entryStats(profile, { '2026-09-14': { ...mondayUnder['2026-09-14'], activeKcal: 300 } }, '2026-09-14');
assert.equal(activityStats.effectiveLimit, 2100, 'aktywne kcal zwiększają dzienny limit jedzenia po wpisaniu aktywności');

const frozenMonday = {
  ...mondayUnder,
  '2026-09-15': {
    eaten: 1800,
    activeKcal: 200,
    weight: 70,
    bmr: 2130,
    baseTdee: 2130,
    plannedDeficit: 550,
    calorieLimit: 1580,
    actualDeficit: 530
  }
};
const historical = L.dayPlan({ ...profile, startWeight: 60 }, frozenMonday, '2026-09-14');
assert.equal(historical.calorieLimit, 1800, 'zmiana późniejszej wagi nie może zmienić zapisanego limitu');
assert.equal(historical.baseTdee, 2300, 'historyczne bazowe spalanie musi pozostać zamrożone');

const aggressive = { ...profile, gender: 'f', startWeight: 50, height: 160, weeklyDeficit: 7000 };
const safePlan = L.dayPlan(aggressive, {}, '2026-09-14');
assert.equal(safePlan.calorieLimit, 189, 'aplikacja nie stosuje minimalnego limitu kalorii');

const screenshotEntry = {
  schemaVersion: 3,
  bmr: 1968,
  baseTdee: 1968,
  plannedDeficit: 1000,
  requiredDailyDeficit: 1000,
  calorieLimit: 968,
  activeKcal: 1200,
  eaten: 2000,
  actualDeficit: 1168
};
const screenshotStats = L.entryStats(goal7000, { '2026-09-18': screenshotEntry }, '2026-09-18');
assert.equal(screenshotStats.effectiveLimit, 2168, 'limit = BMR + aktywne kcal - planowany deficyt');
assert.equal(screenshotStats.deficit, 1168, 'deficyt = BMR + aktywne kcal - zjedzone kcal');

const screenshotProfile = { ...goal7000, startWeight: 98.8, planStartKey: '2026-09-18' };
const screenshotHistory = { '2026-09-18': screenshotEntry };
const saturdayAfterScreenshot = L.dayPlan(screenshotProfile, screenshotHistory, '2026-09-19');
const sundayAfterScreenshot = L.dayPlan(screenshotProfile, screenshotHistory, '2026-09-20');
assert.equal(saturdayAfterScreenshot.plannedDeficit, 916);
assert.equal(sundayAfterScreenshot.plannedDeficit, 916, 'pusta sobota nie może ponownie zaostrzyć niedzieli');
assert.equal(saturdayAfterScreenshot.calorieLimit, 1052);
assert.equal(sundayAfterScreenshot.calorieLimit, 1052, 'przyszłe puste dni mają równy limit');

assert.deepEqual(L.validateProfile({ ...profile, age: -20 }).length > 0, true);
assert.deepEqual(L.validateEntry({ eaten: 2000, activeKcal: -1, weight: null, note: '' }).length > 0, true);

console.log('OK: wszystkie testy logiki zaliczone');
