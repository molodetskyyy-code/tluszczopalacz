'use strict';

const assert = require('node:assert/strict');
const L = require('./logic.js');

const profile = {
  schemaVersion: 2,
  gender: 'm',
  age: 30,
  height: 180,
  startWeight: 80,
  activityFactor: 1.2,
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
    eaten: 2100,
    activeKcal: 0,
    bmr: 1780,
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

const withActivity = {
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
    bmr: 1775,
    baseTdee: 2130,
    plannedDeficit: 550,
    calorieLimit: 1580,
    actualDeficit: 530
  }
};
const historical = L.dayPlan({ ...profile, startWeight: 60 }, frozenMonday, '2026-09-14');
assert.equal(historical.calorieLimit, 1800, 'zmiana późniejszej wagi nie może zmienić zapisanego limitu');
assert.equal(historical.baseTdee, 2300, 'historyczne TDEE musi pozostać zamrożone');

const aggressive = { ...profile, gender: 'f', startWeight: 50, height: 160, weeklyDeficit: 7000 };
const safePlan = L.dayPlan(aggressive, {}, '2026-09-14');
assert.equal(safePlan.calorieLimit, 1200, 'limit nie może spaść poniżej minimum');
assert.ok(safePlan.needsActive > 0, 'brakujący deficyt powinien być pokazany jako potrzebna aktywność');

assert.deepEqual(L.validateProfile({ ...profile, age: -20 }).length > 0, true);
assert.deepEqual(L.validateEntry({ eaten: 2000, activeKcal: -1, weight: null, note: '' }).length > 0, true);

console.log('OK: wszystkie testy logiki zaliczone');
