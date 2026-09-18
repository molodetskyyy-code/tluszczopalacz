'use strict';

const L = window.FatBurnLogic;
const DB = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
  del(key) { localStorage.removeItem(key); }
};

const MONTHS = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAYS = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
const pad = value => String(value).padStart(2, '0');
const toLocalKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayKey = () => toLocalKey(new Date());
const s = id => document.getElementById(id);

let selectedKey = todayKey();
let modalKey = todayKey();
let now = new Date();
let calView = { y: now.getFullYear(), m: now.getMonth() + 1 };
let progressView = { y: now.getFullYear(), m: now.getMonth() + 1 };

function deriveWeeklyDeficit(raw) {
  if (Number.isFinite(Number(raw.weeklyDeficit))) return Math.max(0, Math.min(7000, Math.round(Number(raw.weeklyDeficit))));
  const goal = Number(raw.goalKg);
  const days = Number(raw.planDaysTotal);
  if (goal > 0 && days > 0) return Math.max(0, Math.min(7000, Math.round(goal * 7700 / days * 7)));
  return 3500;
}

function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Brak poprawnego profilu.');
  const normalized = {
    schemaVersion: 3,
    gender: raw.gender,
    age: Number(raw.age),
    height: Number(raw.height),
    startWeight: Number(raw.startWeight ?? raw.weight),
    weeklyDeficit: deriveWeeklyDeficit(raw),
    planStartKey: L.isValidDateKey(raw.planStartKey) ? raw.planStartKey : todayKey()
  };
  const errors = L.validateProfile(normalized);
  if (errors.length) throw new Error(errors[0]);
  return normalized;
}

function normalizeHistory(rawHistory, normalizedProfile, lenient = false) {
  if (rawHistory == null) return {};
  if (typeof rawHistory !== 'object' || Array.isArray(rawHistory)) throw new Error('Historia ma nieprawidłową strukturę.');
  const pairs = Object.entries(rawHistory);
  if (pairs.length > 5000) throw new Error('Historia zawiera zbyt wiele wpisów.');
  const output = {};

  pairs.sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, raw]) => {
    try {
      if (!L.isValidDateKey(key) || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Nieprawidłowy wpis historii.');
      const eatenValue = raw.eaten ?? raw.kcal;
      const activeValue = raw.activeKcal ?? raw.burned ?? 0;
      const entry = {
        schemaVersion: 3,
        eaten: Number(eatenValue),
        activeKcal: Number(activeValue),
        activity: typeof raw.activity === 'string' ? raw.activity.slice(0, 60) : '',
        weight: raw.weight == null || raw.weight === '' ? null : Number(raw.weight),
        note: typeof raw.note === 'string' ? raw.note.slice(0, 500) : '',
        savedAt: Number.isFinite(Number(raw.savedAt ?? raw.ts)) ? Number(raw.savedAt ?? raw.ts) : Date.now()
      };
      const entryErrors = L.validateEntry(entry);
      if (entryErrors.length) throw new Error(`${key}: ${entryErrors[0]}`);

      const hasSnapshot = Number(raw.schemaVersion) >= 3 && [raw.bmr, raw.baseTdee, raw.plannedDeficit, raw.calorieLimit].every(value => Number.isFinite(Number(value)));
      let plan;
      if (hasSnapshot) {
        plan = {
          bmr: Number(raw.bmr),
          baseTdee: Number(raw.baseTdee),
          plannedDeficit: Number(raw.plannedDeficit),
          requiredDailyDeficit: Number(raw.requiredDailyDeficit ?? raw.plannedDeficit),
          calorieLimit: Number(raw.calorieLimit),
          needsActive: Number(raw.needsActive ?? 0)
        };
      } else {
        const temporary = { ...output, [key]: { weight: entry.weight } };
        plan = L.dayPlan(normalizedProfile, temporary, key);
      }
      output[key] = {
        ...entry,
        bmr: Math.round(plan.bmr),
        baseTdee: Math.round(plan.baseTdee),
        plannedDeficit: Math.round(plan.plannedDeficit),
        requiredDailyDeficit: Math.round(plan.requiredDailyDeficit),
        calorieLimit: Math.round(plan.calorieLimit),
        needsActive: Math.max(0, Math.round(plan.needsActive)),
        actualDeficit: Math.round(plan.baseTdee + entry.activeKcal - entry.eaten)
      };
    } catch (error) {
      if (!lenient) throw error;
    }
  });
  return output;
}

function migrateStoredData() {
  const rawProfile = DB.get('profile');
  if (!rawProfile) return null;
  try {
    const normalizedProfile = normalizeProfile(rawProfile);
    const normalizedHistory = normalizeHistory(DB.get('history_all') || {}, normalizedProfile, true);
    DB.set('profile', normalizedProfile);
    DB.set('history_all', normalizedHistory);
    return normalizedProfile;
  } catch {
    return null;
  }
}

function profile() {
  const raw = DB.get('profile');
  if (!raw) return null;
  if (raw.schemaVersion !== 3) return migrateStoredData();
  try { return normalizeProfile(raw); } catch { return null; }
}

function hist() {
  const value = DB.get('history_all');
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function setHist(history) {
  DB.set('history_all', history);
}

function fmtDate(key) {
  const parts = L.dateParts(key);
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year} (${DAYS[L.dayOfWeek(key)]})`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function appendTextLine(parent, label, value) {
  const line = node('div', '', '');
  line.style.marginTop = '7px';
  line.append(document.createTextNode(label + ': '));
  const strong = node('b', '', value);
  strong.style.color = 'var(--txt)';
  line.append(strong);
  parent.append(line);
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  s('screen-' + name).classList.add('active');
  document.querySelectorAll('.navbtn').forEach(button => button.classList.remove('active'));
  const navButton = s('nav-' + name);
  if (navButton) navButton.classList.add('active');
  s('nav').style.display = name === 'setup' ? 'none' : 'flex';
  if (name === 'today') renderToday();
  if (name === 'calendar') renderCalendar();
  if (name === 'progress') renderProgress();
  if (name === 'profile') renderProfile();
  scrollTo(0, 0);
}

function saveProfile() {
  const current = profile();
  const candidate = {
    schemaVersion: 3,
    gender: s('s-gender').value,
    age: Number(s('s-age').value),
    height: Number(s('s-height').value),
    startWeight: Number(s('s-weight').value),
    weeklyDeficit: Number(s('s-weekly').value),
    planStartKey: s('s-date-from').value
  };
  const warning = s('setup-warning');
  const errors = L.validateProfile(candidate);
  if (errors.length) {
    warning.textContent = errors[0];
    warning.classList.remove('hide');
    return;
  }
  warning.classList.add('hide');
  DB.set('profile', candidate);
  if (!current) setHist({});
  selectedKey = todayKey();
  showScreen('today');
}

function editProfile() {
  const p = profile();
  if (!p) return;
  s('s-gender').value = p.gender;
  s('s-age').value = p.age;
  s('s-height').value = p.height;
  s('s-weight').value = p.startWeight;
  s('s-weekly').value = p.weeklyDeficit;
  s('s-date-from').value = p.planStartKey;
  s('setup-warning').classList.add('hide');
  showScreen('setup');
}

function renderToday() {
  const p = profile();
  if (!p) { showScreen('setup'); return; }
  const history = hist();
  const stats = L.entryStats(p, history, selectedKey);
  const week = L.weekProgress(p, history, selectedKey);
  s('top-date').textContent = fmtDate(selectedKey);

  const warning = s('today-warning');
  let warningText = '';
  if (selectedKey < p.planStartKey) warningText = `Plan zaczyna się ${p.planStartKey}.`;
  warning.textContent = warningText;
  warning.classList.toggle('hide', !warningText);

  const rawPercent = stats.entry && stats.effectiveLimit > 0 ? stats.eaten / stats.effectiveLimit : 0;
  const ringPercent = Math.max(0, Math.min(1, rawPercent));
  s('main-ring').style.strokeDashoffset = 452 - ringPercent * 452;
  s('dash-eaten').textContent = stats.entry ? Math.round(stats.eaten) : '0';
  s('dash-limit').textContent = `/ ${Math.round(stats.effectiveLimit)} kcal`;
  s('dash-pct').textContent = stats.entry ? `${Math.round(rawPercent * 100)}%` : '0%';
  s('dash-left').textContent = `${Math.round(stats.left)} kcal`;
  s('dash-deficit').textContent = stats.entry ? `${Math.round(stats.deficit)} kcal` : `plan ${Math.round(stats.plannedDeficit)} kcal`;
  s('dash-burned').textContent = stats.entry ? `${stats.activity ? stats.activity + ': ' : ''}+${Math.round(stats.activeKcal)} kcal` : '—';
  s('dash-fat').textContent = stats.entry ? `około ${Math.round(stats.estimatedFatGrams)} g` : '—';

  const pill = s('dash-pill');
  clear(pill);
  let pillClass = 'orange';
  let pillText = selectedKey > todayKey() ? 'PROGNOZA' : 'Wpisz kalorie';
  if (stats.entry) {
    const reached = stats.deficit >= stats.plannedDeficit;
    pillClass = reached ? 'green' : 'red';
    pillText = reached ? 'CEL DNIA WYKONANY ✓' : 'PONIŻEJ CELU DNIA';
  }
  pill.append(node('span', `pill ${pillClass}`, pillText));

  const weight = L.latestWeightOnOrBefore(p, history, selectedKey);
  const delta = weight - p.startWeight;
  s('m-limit').textContent = Math.round(stats.effectiveLimit);
  s('m-tdee').textContent = Math.round(stats.bmr);
  s('m-bmr').textContent = 'bazowe spalanie';
  s('m-weight').textContent = weight.toFixed(1);
  s('m-weight-delta').textContent = `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg`;
  s('m-days').textContent = stats.daysRemaining || '—';

  renderRecent(history, p);
  renderWeek(week);
}

function makeHistoryRow(key, entry, p) {
  const row = node('div', 'list-row');
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.addEventListener('click', () => openDayModal(key));
  row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openDayModal(key); });
  const left = node('div');
  const title = node('div', 'row-title', fmtDate(key));
  const parts = [entry.note || 'brak notatki'];
  if (entry.activity) parts.push(entry.activity);
  if (entry.activeKcal) parts.push(`🔥 ${entry.activeKcal} kcal`);
  if (entry.weight) parts.push(`${entry.weight} kg`);
  parts.push(`deficyt ${L.actualDeficit(entry)} kcal`);
  left.append(title, node('div', 'row-sub', parts.join(' · ')));
  row.append(left, node('div', 'row-kcal', `${entry.eaten} kcal`));
  return row;
}

function renderRecent(history, p) {
  const container = s('recent-list');
  clear(container);
  const entries = Object.entries(history).filter(([key]) => L.isValidDateKey(key)).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5);
  if (!entries.length) { container.append(node('p', 'subtle', 'Brak wpisów.')); return; }
  entries.forEach(([key, entry]) => container.append(makeHistoryRow(key, entry, p)));
}

function renderWeek(week) {
  s('w-avg').textContent = `${Math.round(week.target)} kcal`;
  s('w-def').textContent = `${Math.round(week.done)} kcal`;
  s('w-fat').textContent = `${Math.round(week.remaining)} kcal`;
  s('w-days').textContent = `${Math.round(week.dailyRequired)} kcal`;
}

function moveSelected(amount) {
  selectedKey = L.addDays(selectedKey, amount);
  const parts = L.dateParts(selectedKey);
  calView = { y: parts.year, m: parts.month };
  renderToday();
}

function renderCalendar() {
  const p = profile();
  if (!p) return;
  const history = hist();
  s('cal-title').textContent = `${MONTHS[calView.m - 1]} ${calView.y}`;
  const grid = s('calendar-grid');
  clear(grid);
  ['Pn','Wt','Śr','Cz','Pt','So','Nd'].forEach(label => grid.append(node('div', 'calh', label)));
  const firstKey = `${calView.y}-${pad(calView.m)}-01`;
  const blanks = (L.dayOfWeek(firstKey) + 6) % 7;
  for (let index = 0; index < blanks; index += 1) grid.append(node('div'));

  for (let day = 1; day <= daysInMonth(calView.y, calView.m); day += 1) {
    const key = `${calView.y}-${pad(calView.m)}-${pad(day)}`;
    const stats = L.entryStats(p, history, key);
    const hasEntry = !!stats.entry;
    let status = 'empty';
    if (hasEntry) {
      const ratio = stats.plannedDeficit > 0 ? stats.deficit / stats.plannedDeficit : (stats.deficit >= 0 ? 1 : 0);
      status = ratio >= 1 ? 'good' : ratio >= 0.8 ? 'warn' : 'bad';
    }
    const button = node('button', `day ${status}${key === todayKey() ? ' today' : ''}${key === selectedKey ? ' sel' : ''}${key < p.planStartKey ? ' outside' : ''}`);
    button.type = 'button';
    button.addEventListener('click', () => selectDay(key));
    button.append(node('div', 'n', String(day)));
    button.append(node('div', 's', hasEntry ? `${stats.eaten} kcal` : (key >= p.planStartKey ? `${stats.calorieLimit} kcal` : 'poza')));
    button.append(node('div', 'dot'));
    grid.append(button);
  }
  renderSelected();
  renderCalChart(history, p);
}

function selectDay(key) {
  selectedKey = key;
  renderCalendar();
}

function changeCal(amount) {
  calView.m += amount;
  if (calView.m < 1) { calView.m = 12; calView.y -= 1; }
  if (calView.m > 12) { calView.m = 1; calView.y += 1; }
  renderCalendar();
}

function renderSelected() {
  const p = profile();
  const history = hist();
  const stats = L.entryStats(p, history, selectedKey);
  const container = s('selected-card');
  clear(container);
  const heading = node('strong', '', fmtDate(selectedKey));
  heading.style.color = 'var(--txt)';
  container.append(heading);
  appendTextLine(container, 'Bazowy limit dnia', `${Math.round(stats.calorieLimit)} kcal`);
  appendTextLine(container, 'BMR', `${Math.round(stats.bmr)} kcal`);
  appendTextLine(container, 'Planowany deficyt', `${Math.round(stats.plannedDeficit)} kcal`);
  if (stats.entry) {
    appendTextLine(container, 'Zjedzone', `${Math.round(stats.eaten)} kcal`);
    appendTextLine(container, 'Aktywne', `${Math.round(stats.activeKcal)} kcal`);
    appendTextLine(container, 'Limit z aktywnością', `${Math.round(stats.effectiveLimit)} kcal`);
    appendTextLine(container, 'Faktyczny deficyt', `${Math.round(stats.deficit)} kcal`);
  } else {
    appendTextLine(container, 'Wpis', 'brak');
  }
  const button = node('button', 'btn fire', selectedKey > todayKey() ? 'To jest prognoza' : 'Edytuj / dodaj wpis');
  button.type = 'button';
  button.style.marginTop = '16px';
  button.disabled = selectedKey > todayKey();
  button.addEventListener('click', () => openDayModal(selectedKey));
  container.append(button);
}

function renderCalChart(history, p) {
  const chart = s('cal-chart');
  clear(chart);
  const monthEntries = [];
  for (let day = 1; day <= daysInMonth(calView.y, calView.m); day += 1) {
    const key = `${calView.y}-${pad(calView.m)}-${pad(day)}`;
    const entry = history[key];
    if (entry) monthEntries.push(entry.eaten);
  }
  const maximum = Math.max(3000, ...monthEntries);
  for (let day = 1; day <= daysInMonth(calView.y, calView.m); day += 1) {
    const key = `${calView.y}-${pad(calView.m)}-${pad(day)}`;
    const entry = history[key];
    const bar = node('div', 'bar');
    if (!entry) {
      bar.style.height = '3px';
      bar.style.background = 'var(--line)';
    } else {
      const stats = L.entryStats(p, history, key);
      bar.style.height = `${Math.max(3, Math.round(entry.eaten / maximum * 125))}px`;
      bar.style.background = stats.deficit >= stats.plannedDeficit ? 'var(--green)' : 'var(--red)';
      bar.title = `${key}: ${entry.eaten} kcal`;
    }
    chart.append(bar);
  }
}

function renderProgress() {
  const p = profile();
  if (!p) return;
  const history = hist();
  const key = todayKey();
  const week = L.weekProgress(p, history, key);
  const total = L.totalDeficit(p, history, key);
  s('p-fat').textContent = `${Math.max(0, Math.round(total / 7.7))} g`;
  s('p-goal').textContent = `${Math.round(week.target)} kcal`;
  s('p-def').textContent = `${Math.round(week.done)} kcal`;
  s('p-line').style.width = `${Math.round(week.percent * 100)}%`;
  const tomorrow = L.addDays(key, 1);
  s('p-tom').textContent = `${Math.round(L.dayPlan(p, history, tomorrow).calorieLimit)} kcal`;
  const assumed = week.assumedDone > 0 ? ` Za puste wcześniejsze dni przyjęto planowo ${Math.round(week.assumedDone)} kcal.` : '';
  s('p-desc').textContent = `Pozostało ${Math.round(week.remaining)} kcal do niedzieli. Średnio ${Math.round(week.dailyRequired)} kcal deficytu dziennie przez ${week.daysLeft} dni.${assumed}`;
  renderMonthSummary(p, history);
  renderWeightChart(history, p);
  renderAllList(history, p);
}

function renderMonthSummary(p, history) {
  const summary = L.monthSummary(p, history, progressView.y, progressView.m, todayKey());
  const format = value => Math.round(value).toLocaleString('pl-PL');
  s('pm-title').textContent = `${MONTHS[progressView.m - 1]} ${progressView.y}`;
  s('pm-def').textContent = `${format(summary.totalDeficit)} kcal`;
  s('pm-eaten').textContent = `${format(summary.totalEaten)} kcal`;
  s('pm-active').textContent = `${format(summary.totalActiveKcal)} kcal`;
  s('pm-days').textContent = String(summary.daysLogged);
  if (!summary.daysLogged) {
    s('pm-desc').textContent = 'Brak zapisanych dni w tym miesiącu.';
  } else {
    const fat = Math.abs(summary.estimatedFatKg).toFixed(2).replace('.', ',');
    const effect = summary.totalDeficit >= 0 ? `szacowana redukcja ${fat} kg tłuszczu` : `nadwyżka odpowiadająca około ${fat} kg tłuszczu`;
    s('pm-desc').textContent = `Średni realny deficyt: ${format(summary.averageDeficit)} kcal na wpisany dzień · ${effect}.`;
  }
  const current = new Date();
  const isCurrentMonth = progressView.y === current.getFullYear() && progressView.m === current.getMonth() + 1;
  s('pm-next').disabled = isCurrentMonth;
  s('pm-next').style.opacity = isCurrentMonth ? '.35' : '1';
}

function changeProgressMonth(amount) {
  const next = { y: progressView.y, m: progressView.m + amount };
  if (next.m < 1) { next.m = 12; next.y -= 1; }
  if (next.m > 12) { next.m = 1; next.y += 1; }
  const current = new Date();
  const currentIndex = current.getFullYear() * 12 + current.getMonth();
  const nextIndex = next.y * 12 + next.m - 1;
  if (nextIndex > currentIndex) return;
  progressView = next;
  const p = profile();
  if (p) renderMonthSummary(p, hist());
}

function renderWeightChart(history, p) {
  const chart = s('weight-chart');
  clear(chart);
  const entries = Object.entries(history).filter(([, entry]) => Number.isFinite(entry.weight)).sort((a, b) => a[0].localeCompare(b[0])).slice(-30);
  if (!entries.length) { chart.append(node('p', 'subtle', 'Brak danych wagi.')); return; }
  const weights = entries.map(([, entry]) => entry.weight);
  const minimum = Math.min(...weights) - 0.5;
  const maximum = Math.max(...weights) + 0.5;
  entries.forEach(([key, entry]) => {
    const bar = node('div', 'bar');
    bar.style.height = `${Math.max(4, Math.round((entry.weight - minimum) / (maximum - minimum) * 125))}px`;
    bar.style.background = 'var(--orange)';
    bar.title = `${key}: ${entry.weight} kg`;
    chart.append(bar);
  });
}

function renderAllList(history, p) {
  const container = s('all-list');
  clear(container);
  const entries = Object.entries(history).filter(([key]) => L.isValidDateKey(key)).sort((a, b) => b[0].localeCompare(a[0]));
  if (!entries.length) { container.append(node('p', 'subtle', 'Brak wpisów.')); return; }
  entries.forEach(([key, entry]) => container.append(makeHistoryRow(key, entry, p)));
}

function statBox(label, value) {
  const box = node('div', 'statbox');
  box.append(node('div', 'l', label), node('div', 'v', value));
  return box;
}

function renderProfile() {
  const p = profile();
  if (!p) return;
  const history = hist();
  const weight = L.latestWeightOnOrBefore(p, history, todayKey());
  const bmr = L.bmrFor(p, weight);
  const table = node('div', 'table');
  table.append(
    statBox('BMR', `${bmr} kcal`),
    statBox('Aktualna waga', `${weight.toFixed(1)} kg`),
    statBox('Cel tygodniowy', `${p.weeklyDeficit} kcal`),
    statBox('Plan od', p.planStartKey)
  );
  const container = s('profile-box');
  clear(container);
  container.append(table);
}

function openDayModal(key) {
  if (key > todayKey()) { alert('Przyszłe dni są prognozą. Wpis możesz dodać najwcześniej w danym dniu.'); return; }
  modalKey = key;
  const entry = hist()[key];
  s('modal-date').textContent = fmtDate(key);
  s('d-kcal').value = entry ? entry.eaten : '';
  s('d-activity').value = entry && entry.activity ? entry.activity : '';
  s('d-burned').value = entry && entry.activeKcal ? entry.activeKcal : '';
  s('d-weight').value = entry && entry.weight ? entry.weight : '';
  s('d-note').value = entry && entry.note ? entry.note : '';
  s('day-modal').classList.add('show');
}

function closeModal() {
  s('day-modal').classList.remove('show');
}

function saveDay() {
  const p = profile();
  if (!p) return;
  if (modalKey > todayKey()) { alert('Nie można zapisać przyszłego dnia.'); return; }
  if (modalKey < p.planStartKey) { alert('Ten dzień jest wcześniejszy niż początek planu.'); return; }
  const eatenRaw = s('d-kcal').value.trim();
  const activeRaw = s('d-burned').value.trim();
  const weightRaw = s('d-weight').value.trim();
  if (eatenRaw === '') { alert('Wpisz kalorie zjedzone.'); return; }
  const draft = {
    eaten: Number(eatenRaw),
    activeKcal: activeRaw === '' ? 0 : Number(activeRaw),
    weight: weightRaw === '' ? null : Number(weightRaw),
    note: s('d-note').value.trim(),
    activity: s('d-activity').value
  };
  const errors = L.validateEntry(draft);
  if (errors.length) { alert(errors[0]); return; }

  const history = hist();
  const existing = history[modalKey];
  let plan;
  if (existing && existing.schemaVersion >= 3 && [existing.bmr, existing.baseTdee, existing.plannedDeficit, existing.calorieLimit].every(Number.isFinite)) {
    plan = existing;
  } else {
    const temporary = { ...history, [modalKey]: { weight: draft.weight } };
    plan = L.dayPlan(p, temporary, modalKey);
  }
  history[modalKey] = {
    schemaVersion: 3,
    eaten: draft.eaten,
    activeKcal: draft.activeKcal,
    activity: draft.activity,
    weight: draft.weight,
    note: draft.note,
    savedAt: Date.now(),
    bmr: Math.round(plan.bmr),
    baseTdee: Math.round(plan.baseTdee),
    plannedDeficit: Math.round(plan.plannedDeficit),
    requiredDailyDeficit: Math.round(plan.requiredDailyDeficit ?? plan.plannedDeficit),
    calorieLimit: Math.round(plan.calorieLimit),
    needsActive: Math.max(0, Math.round(plan.needsActive || 0)),
    actualDeficit: Math.round(plan.baseTdee + draft.activeKcal - draft.eaten)
  };
  setHist(history);
  closeModal();
  refresh();
}

function deleteDay() {
  const history = hist();
  if (!history[modalKey]) { closeModal(); return; }
  if (!confirm(`Usunąć wpis z ${modalKey}?`)) return;
  delete history[modalKey];
  setHist(history);
  closeModal();
  refresh();
}

function refresh() {
  const active = [...document.querySelectorAll('.screen')].find(screen => screen.classList.contains('active'));
  showScreen(active ? active.id.replace('screen-', '') : 'today');
}

function exportBackup() {
  const payload = { schemaVersion: 3, profile: DB.get('profile'), history_all: hist(), exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = `tluszczopalacz-backup-${todayKey()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function importBackup(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Plik jest zbyt duży. Maksymalny rozmiar to 5 MB.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const normalizedProfile = normalizeProfile(data.profile);
      const normalizedHistory = normalizeHistory(data.history_all, normalizedProfile, false);
      DB.set('profile', normalizedProfile);
      setHist(normalizedHistory);
      selectedKey = todayKey();
      alert('Backup został poprawnie zaimportowany.');
      showScreen('today');
    } catch (error) {
      alert(`Nieprawidłowy backup: ${error.message}`);
    }
  };
  reader.onerror = () => alert('Nie udało się odczytać pliku.');
  reader.readAsText(file);
}

function resetData() {
  if (confirm('Usunąć profil i całą historię? Tej operacji nie można cofnąć.')) {
    DB.del('profile');
    DB.del('history_all');
    location.reload();
  }
}

function init() {
  s('s-date-from').value = todayKey();
  s('s-weekly').value = '3500';
  const p = migrateStoredData();
  if (p) showScreen('today');
  else showScreen('setup');
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
init();
