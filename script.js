"use strict";

/* ==========================================================
   設定
   ========================================================== */

const STORAGE_KEY = "hundredDaysChallenge";
const SCHEMA_VERSION = 3;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const AREA_PLACEHOLDERS = ["例：ダイニングテーブル", "例：リビングの床", "例：クローゼット"];
const FINAL_EASIER_CHOICES = ["物が減った", "探し物が減った", "片付けが早くなった", "戻しやすくなった", "まだよく分からない"];

let storageLoadFailed = false;

/* ==========================================================
   日付ユーティリティ（すべてローカル時間で扱う）
   ========================================================== */

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getToday() {
  return formatLocalDate(new Date());
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return formatLocalDate(parseDateKey(value)) === value;
}

/* 夏時間などの影響を受けないよう、日付を通し番号に変換して差を取る */
function toDayNumber(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function daysBetween(fromKey, toKey) {
  return toDayNumber(toKey) - toDayNumber(fromKey);
}

function addDays(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return formatLocalDate(date);
}

/* 終了日は「開始日の3か月後の前日」。月末をまたぐ日は、その月の最終日にそろえる */
function getChallengeEndDate(startKey) {
  const [year, month, day] = startKey.split("-").map(Number);
  const lastDayOfTarget = new Date(year, month - 1 + 4, 0).getDate();
  const end = new Date(year, month - 1 + 3, Math.min(day, lastDayOfTarget));
  end.setDate(end.getDate() - 1);
  return formatLocalDate(end);
}

function getChallengeDay(todayKey = getToday()) {
  const challenge = appData.challenge;
  if (!challenge) return null;
  return Math.max(1, daysBetween(challenge.startDate, todayKey) + 1);
}

function getChallengeTotalDays(challenge) {
  return daysBetween(challenge.startDate, challenge.endDate) + 1;
}

function isChallengeFinished(todayKey = getToday()) {
  return Boolean(appData.challenge && todayKey >= appData.challenge.endDate);
}

function formatJapaneseDate(dateKey, withWeekday = true) {
  const date = parseDateKey(dateKey);
  const text = `${date.getMonth() + 1}月${date.getDate()}日`;
  return withWeekday ? `${text}（${WEEKDAYS[date.getDay()]}）` : text;
}

function formatShortDate(dateKey) {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/* ==========================================================
   データの読み書き
   ========================================================== */

function createEmptyData() {
  return { schemaVersion: SCHEMA_VERSION, goal: null, startDate: null, challenge: null, seasons: [], records: {} };
}

function toText(value) {
  return typeof value === "string" ? value : "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/* 壊れたデータが入っていても、使える部分だけを取り出す。旧データのフィールドは消さない */
function normalizeData(raw) {
  const data = createEmptyData();
  if (!isPlainObject(raw)) return data;

  if (isPlainObject(raw.goal) && toText(raw.goal.title).trim()) {
    data.goal = { title: raw.goal.title.trim(), reason: toText(raw.goal.reason), feeling: toText(raw.goal.feeling) };
  }
  if (isValidDateKey(raw.startDate)) data.startDate = raw.startDate;
  if (isPlainObject(raw.coach)) data.coach = raw.coach;

  if (isPlainObject(raw.records)) {
    Object.keys(raw.records).forEach((dateKey) => {
      const record = normalizeRecord(raw.records[dateKey]);
      if (isValidDateKey(dateKey) && record) data.records[dateKey] = record;
    });
  }

  data.challenge = normalizeChallenge(raw.challenge);
  if (Array.isArray(raw.seasons)) data.seasons = raw.seasons.filter(isPlainObject);
  if (data.challenge && !data.startDate) data.startDate = data.challenge.startDate;
  return data;
}

function normalizeRecord(raw) {
  if (!isPlainObject(raw)) return null;
  const record = { ...raw };
  record.task = toText(raw.task).trim();
  record.question = toText(raw.question);
  record.answer = toText(raw.answer);

  if (isPlainObject(raw.dailyOptions) && isValidOption(raw.dailyOptions.A) && isValidOption(raw.dailyOptions.B)) {
    record.dailyOptions = { A: normalizeOption(raw.dailyOptions.A), B: normalizeOption(raw.dailyOptions.B) };
    record.selectedOption = raw.selectedOption === "A" || raw.selectedOption === "B" ? raw.selectedOption : null;
    record.resultStatus = record.selectedOption && RESULT_STATUSES.includes(raw.resultStatus) ? raw.resultStatus : null;
    record.miniActive = Boolean(raw.miniActive) && Boolean(record.selectedOption);
    record.usedMiniTask = Boolean(raw.usedMiniTask);
    record.responseData = {};
    if (isPlainObject(raw.responseData)) {
      Object.keys(raw.responseData).forEach((key) => {
        if (toText(raw.responseData[key])) record.responseData[key] = raw.responseData[key];
      });
    }
    record.bQueue = Array.isArray(raw.bQueue)
      ? raw.bQueue.filter((entry) => isPlainObject(entry) && getItemById(entry.id)).map((entry) => ({
        id: entry.id,
        size: ["normal", "smaller", "mini"].includes(entry.size) ? entry.size : "normal",
        miniLevel: Number.isFinite(entry.miniLevel) ? entry.miniLevel : 0,
        lead: toText(entry.lead)
      }))
      : [];
    record.bIndex = Number.isInteger(raw.bIndex) && raw.bIndex >= 0 && raw.bIndex < record.bQueue.length ? raw.bIndex : 0;
    record.bShown = Array.isArray(raw.bShown) ? raw.bShown.filter((id) => typeof id === "string") : [record.dailyOptions.B.itemId];
    record.completed = record.resultStatus === "done" || record.resultStatus === "partial";
  } else {
    delete record.dailyOptions;
    record.completed = Boolean(raw.completed) && record.task !== "";
  }
  return record;
}

function isValidOption(option) {
  return isPlainObject(option) && typeof option.headline === "string" && option.headline !== "" && typeof option.kind === "string";
}

function normalizeFollowUp(raw) {
  if (!isPlainObject(raw) || !toText(raw.key) || !toText(raw.label)) return null;
  return {
    key: raw.key,
    label: raw.label,
    type: raw.type === "choice" ? "choice" : "text",
    choices: Array.isArray(raw.choices) ? raw.choices.filter((choice) => typeof choice === "string") : [],
    requiredOnDone: Boolean(raw.requiredOnDone)
  };
}

function normalizeOption(raw) {
  const option = {
    ...raw,
    lead: toText(raw.lead),
    details: Array.isArray(raw.details) ? raw.details.filter((line) => typeof line === "string") : [],
    finish: toText(raw.finish),
    estimatedMinutes: Number.isFinite(raw.estimatedMinutes) ? raw.estimatedMinutes : 5,
    title: toText(raw.title) || (raw.slot === "B" ? TITLES.item.normal : TITLES.step),
    followUp: normalizeFollowUp(raw.followUp)
  };
  option.mini = isPlainObject(raw.mini) && toText(raw.mini.headline)
    ? {
      ...raw.mini,
      lead: toText(raw.mini.lead),
      details: Array.isArray(raw.mini.details) ? raw.mini.details.filter((line) => typeof line === "string") : [],
      finish: toText(raw.mini.finish),
      estimatedMinutes: Number.isFinite(raw.mini.estimatedMinutes) ? raw.mini.estimatedMinutes : 2,
      followUp: normalizeFollowUp(raw.mini.followUp)
    }
    : null;
  return option;
}

function normalizeChallenge(raw) {
  if (!isPlainObject(raw) || !isValidDateKey(raw.startDate) || !Array.isArray(raw.areas)) return null;

  const areas = raw.areas
    .filter((area) => isPlainObject(area) && toText(area.id) && toText(area.name).trim())
    .slice(0, MAX_AREAS)
    .map((area) => ({
      id: area.id,
      name: area.name.trim(),
      status: ["active", "done", "upcoming"].includes(area.status) ? area.status : "upcoming",
      startedDate: isValidDateKey(area.startedDate) ? area.startedDate : null,
      completedDate: isValidDateKey(area.completedDate) ? area.completedDate : null,
      lastReviewedDate: isValidDateKey(area.lastReviewedDate) ? area.lastReviewedDate : null
    }));
  if (!areas.length) return null;

  const challenge = {
    ...raw,
    type: CHALLENGE_TYPE,
    mode: "cleanup",
    startDate: raw.startDate,
    endDate: isValidDateKey(raw.endDate) && raw.endDate > raw.startDate ? raw.endDate : getChallengeEndDate(raw.startDate),
    primaryProblem: PROBLEMS.some((item) => item.value === raw.primaryProblem) ? raw.primaryProblem : "too_much",
    targetOutcome: OUTCOMES.some((item) => item.value === raw.targetOutcome) ? raw.targetOutcome : "clear_surfaces",
    targetOutcomeCustom: toText(raw.targetOutcomeCustom),
    areas,
    finalReview: isPlainObject(raw.finalReview) ? raw.finalReview : null,
    resting: Boolean(raw.resting)
  };

  const current = areas.find((area) => area.id === raw.currentAreaId && area.status !== "done")
    || areas.find((area) => area.status === "active")
    || areas.find((area) => area.status === "upcoming");
  challenge.currentAreaId = current ? current.id : null;
  areas.forEach((area) => {
    if (area.status === "done") return;
    area.status = area.id === challenge.currentAreaId ? "active" : "upcoming";
  });
  return challenge;
}

function loadData() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return createEmptyData();
  }
  if (!raw) return createEmptyData();

  try {
    return normalizeData(JSON.parse(raw));
  } catch (error) {
    storageLoadFailed = true;
    return createEmptyData();
  }
}

function isValidBackupData(raw) {
  if (!isPlainObject(raw) || !isPlainObject(raw.records)) return false;
  const challenge = normalizeChallenge(raw.challenge);
  if (!challenge || raw.startDate !== challenge.startDate) return false;

  return Object.keys(raw.records).every((dateKey) => {
    if (!isValidDateKey(dateKey)) return false;
    const record = normalizeRecord(raw.records[dateKey]);
    return Boolean(record);
  });
}

function saveData() {
  try {
    appData.schemaVersion = SCHEMA_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    return true;
  } catch (error) {
    showToast("保存できませんでした。ブラウザの設定を確認してください");
    return false;
  }
}

function clearData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    /* 削除できなくても画面上は初期状態に戻す */
  }
  appData = createEmptyData();
}

function getRecord(dateKey) {
  return appData.records[dateKey] || null;
}

/* ==========================================================
   状態・要素
   ========================================================== */

let appData = loadData();

const ui = {
  view: "today",
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  dialogDateKey: null,
  renderedToday: getToday(),
  toastTimer: null,
  isEditingPlan: false,
  onboarding: null
};

const el = {
  onboarding: document.getElementById("onboarding"),
  onboardingBody: document.getElementById("onboarding-body"),
  app: document.getElementById("app"),
  views: document.querySelectorAll("[data-view]"),
  navButtons: document.querySelectorAll(".nav-button"),

  todayDate: document.getElementById("today-date"),
  challengeRemaining: document.getElementById("challenge-remaining"),
  todayStamp: document.getElementById("today-stamp"),
  todayArea: document.getElementById("today-area"),
  todayBody: document.getElementById("today-body"),

  calendarMonth: document.getElementById("calendar-month"),
  calendarGrid: document.getElementById("calendar-grid"),
  currentMonthRow: document.getElementById("current-month-row"),

  planBody: document.getElementById("plan-body"),
  importDataFile: document.getElementById("import-data-file"),

  dayDialog: document.getElementById("day-dialog"),
  dayDialogTitle: document.getElementById("day-dialog-title"),
  dayDialogSub: document.getElementById("day-dialog-sub"),
  dayDialogBody: document.getElementById("day-dialog-body"),

  toast: document.getElementById("toast")
};

/* ==========================================================
   共通ヘルパー
   ========================================================== */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("is-visible");
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.toast.classList.remove("is-visible"), 2200);
}

function showFormError(form, message, focusTarget) {
  const errorElement = form.querySelector(".field-error");
  errorElement.textContent = message;
  errorElement.hidden = false;
  if (focusTarget) focusTarget.focus();
}

function clearFormError(form) {
  const errorElement = form.querySelector(".field-error");
  if (!errorElement) return;
  errorElement.textContent = "";
  errorElement.hidden = true;
}

function getLabel(list, value) {
  const found = list.find((item) => item.value === value);
  return found ? found.label : "";
}

function getOutcomeText(challenge) {
  if (challenge.targetOutcome === "other") return challenge.targetOutcomeCustom || "その他";
  return getLabel(OUTCOMES, challenge.targetOutcome);
}

function renderRadioCards(name, items, currentValue, idPrefix) {
  return items.map((item, index) => `
    <label class="status-option" for="${idPrefix}-${index}">
      <input type="radio" id="${idPrefix}-${index}" name="${name}" value="${escapeHtml(item.value)}"${item.value === currentValue ? " checked" : ""}>
      <span>${escapeHtml(item.label)}</span>
    </label>`).join("");
}

/* ==========================================================
   画面の切り替え
   ========================================================== */

function showApp() {
  el.onboarding.hidden = true;
  el.app.hidden = false;
}

function showView(viewName) {
  ui.view = viewName;
  el.views.forEach((view) => {
    view.hidden = view.dataset.view !== viewName;
  });
  renderNavigation();

  if (viewName === "today") renderToday();
  if (viewName === "calendar") renderCalendar();
  if (viewName === "plan") renderPlan();

  window.scrollTo(0, 0);
}

function renderNavigation() {
  el.navButtons.forEach((button) => {
    if (button.dataset.target === ui.view) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

/* ==========================================================
   初回オンボーディング（場所 → 困りごと → 3か月後の理想）
   ========================================================== */

function startOnboarding() {
  ui.onboarding = { step: "areas", areas: [""], firstIndex: 0, problem: "", outcome: "", outcomeCustom: "" };
  el.app.hidden = true;
  el.onboarding.hidden = false;
  renderOnboarding();
}

function showStorageLoadError() {
  el.app.hidden = true;
  el.onboarding.hidden = false;
  el.onboardingBody.innerHTML = `
    <p class="brand">3 MONTHS</p>
    <h1 class="onboarding-title">保存データを読み込めませんでした</h1>
    <p class="onboarding-lead">元の保存データは変更せず、そのまま残しています。</p>
    <div class="onboarding-actions">
      <button class="button button--secondary" type="button" data-action="import-data">データを読み込む</button>
    </div>`;
}

function exportData() {
  let saved;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    showToast("データを書き出せませんでした");
    return;
  }
  if (!saved) {
    showToast("書き出すデータがありません");
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    if (!isValidBackupData(parsed)) throw new Error("Invalid backup data");
    const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cleanup-coach-backup-${getToday()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("データを書き出しました");
  } catch (error) {
    showToast("データを書き出せませんでした");
  }
}

function chooseImportFile() {
  el.importDataFile.value = "";
  el.importDataFile.click();
}

function importDataFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    let imported;
    try {
      imported = JSON.parse(reader.result);
      if (!isValidBackupData(imported)) throw new Error("Invalid backup data");
    } catch (error) {
      showToast("このバックアップは読み込めませんでした");
      return;
    }

    const confirmed = window.confirm("現在のデータを、選択したバックアップに置き換えます");
    if (!confirmed) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      window.location.reload();
    } catch (error) {
      showToast("このバックアップは読み込めませんでした");
    }
  });
  reader.addEventListener("error", () => showToast("このバックアップは読み込めませんでした"));
  reader.readAsText(file);
}

function renderOnboarding() {
  const state = ui.onboarding;
  const renderers = {
    areas: renderOnboardingAreas,
    first: renderOnboardingFirst,
    problem: renderOnboardingProblem,
    outcome: renderOnboardingOutcome
  };
  el.onboardingBody.innerHTML = renderers[state.step](state);
  window.scrollTo(0, 0);
  const focusTarget = el.onboardingBody.querySelector("h1");
  if (focusTarget) {
    focusTarget.setAttribute("tabindex", "-1");
    focusTarget.focus();
  }
}

function renderOnboardingHeader(stepNumber, titleHtml, leadText, showHistoryNote = false) {
  const hasHistory = Object.keys(appData.records).length > 0 || appData.seasons.length > 0;
  return `
    <p class="brand">3 MONTHS</p>
    <p class="onboarding-step">${stepNumber} / 3</p>
    <h1 class="onboarding-title">${titleHtml}</h1>
    ${leadText ? `<p class="onboarding-lead">${leadText}</p>` : ""}
    ${hasHistory && showHistoryNote ? '<p class="onboarding-note">これまでの記録は、カレンダーにそのまま残っています。</p>' : ""}`;
}

function renderOnboardingAreas(state) {
  const inputs = state.areas.map((value, index) => `
    <div class="field">
      <label class="field-label" for="ob-area-${index}">${index === 0 ? "気になる場所" : `気になる場所（${index + 1}つめ）`}</label>
      <input class="text-input" id="ob-area-${index}" name="area" type="text" maxlength="40" autocomplete="off"
        placeholder="${AREA_PLACEHOLDERS[index]}" value="${escapeHtml(value)}">
    </div>`).join("");

  return `
    ${renderOnboardingHeader(1, "<span>この3か月で、</span><span>どこを変えたい？</span>", "気になる場所を最大3つ。<br>1か所からでも始められます。", true)}
    <form class="onboarding-form" data-form="ob-areas" novalidate>
      ${inputs}
      ${state.areas.length < MAX_AREAS ? '<button class="button button--text add-area-button" type="button" data-action="ob-add-area">＋ もう1か所追加</button>' : ""}
      <p class="field-error" role="alert" hidden></p>
      <button class="button button--primary button--wide" type="submit">次へ</button>
    </form>`;
}

function renderOnboardingFirst(state) {
  const names = state.areas.filter(Boolean);
  const items = names.map((name, index) => ({ value: String(index), label: name }));
  return `
    ${renderOnboardingHeader(1, "<span>まず、</span><span>どこから始める？</span>", "ほかの場所は、あとから順番に進めます。")}
    <form class="onboarding-form" data-form="ob-first" novalidate>
      <fieldset class="status-group">
        <legend class="visually-hidden">最初に取り組む場所</legend>
        ${renderRadioCards("first", items, String(state.firstIndex), "ob-first")}
      </fieldset>
      <p class="field-error" role="alert" hidden></p>
      <div class="onboarding-actions">
        <button class="button button--text" type="button" data-action="ob-back" data-step="areas">戻る</button>
        <button class="button button--primary" type="submit">次へ</button>
      </div>
    </form>`;
}

function renderOnboardingProblem(state) {
  return `
    ${renderOnboardingHeader(2, "<span>片付けで、</span><span>一番困って</span><span>いることは？</span>", "")}
    <form class="onboarding-form" data-form="ob-problem" novalidate>
      <fieldset class="status-group">
        <legend class="visually-hidden">一番困っていること</legend>
        ${renderRadioCards("problem", PROBLEMS, state.problem, "ob-problem")}
      </fieldset>
      <p class="field-error" role="alert" hidden></p>
      <div class="onboarding-actions">
        <button class="button button--text" type="button" data-action="ob-back" data-step="${state.areas.filter(Boolean).length > 1 ? "first" : "areas"}">戻る</button>
        <button class="button button--primary" type="submit">次へ</button>
      </div>
    </form>`;
}

function renderOnboardingOutcome(state) {
  return `
    ${renderOnboardingHeader(3, "<span>3か月後、</span><span>どうなって</span><span>いたら嬉しい？</span>", "")}
    <form class="onboarding-form" data-form="ob-outcome" novalidate>
      <fieldset class="status-group">
        <legend class="visually-hidden">3か月後の理想</legend>
        ${renderRadioCards("outcome", OUTCOMES, state.outcome, "ob-outcome")}
      </fieldset>
      <div class="field" id="ob-outcome-custom-field"${state.outcome === "other" ? "" : " hidden"}>
        <label class="field-label" for="ob-outcome-custom">どうなっていたら嬉しい？</label>
        <input class="text-input" id="ob-outcome-custom" name="outcomeCustom" type="text" maxlength="60" autocomplete="off" value="${escapeHtml(state.outcomeCustom)}">
      </div>
      <p class="field-error" role="alert" hidden></p>
      <div class="onboarding-actions">
        <button class="button button--text" type="button" data-action="ob-back" data-step="problem">戻る</button>
        <button class="button button--primary" type="submit">この3か月をはじめる</button>
      </div>
    </form>`;
}

function readOnboardingAreas() {
  const inputs = el.onboardingBody.querySelectorAll('input[name="area"]');
  if (inputs.length) ui.onboarding.areas = [...inputs].map((input) => input.value.trim());
}

function addOnboardingArea() {
  readOnboardingAreas();
  if (ui.onboarding.areas.length >= MAX_AREAS) return;
  ui.onboarding.areas.push("");
  renderOnboarding();
  const inputs = el.onboardingBody.querySelectorAll('input[name="area"]');
  inputs[inputs.length - 1].focus();
}

function submitOnboardingAreas(form) {
  readOnboardingAreas();
  const names = ui.onboarding.areas.filter(Boolean);
  if (!names.length) {
    showFormError(form, "気になる場所を1つ入力してください", form.querySelector('input[name="area"]'));
    return;
  }
  ui.onboarding.areas = names;
  ui.onboarding.firstIndex = Math.min(ui.onboarding.firstIndex, names.length - 1);
  ui.onboarding.step = names.length > 1 ? "first" : "problem";
  renderOnboarding();
}

function submitOnboardingChoice(form, name, nextStep, message) {
  const checked = form.querySelector(`input[name="${name}"]:checked`);
  if (!checked) {
    showFormError(form, message, form.querySelector(`input[name="${name}"]`));
    return null;
  }
  ui.onboarding.step = nextStep;
  return checked.value;
}

function submitOnboardingFirst(form) {
  const value = submitOnboardingChoice(form, "first", "problem", "最初の場所をひとつ選んでください");
  if (value === null) return;
  ui.onboarding.firstIndex = Number(value);
  renderOnboarding();
}

function submitOnboardingProblem(form) {
  const value = submitOnboardingChoice(form, "problem", "outcome", "ひとつ選んでください");
  if (value === null) return;
  ui.onboarding.problem = value;
  renderOnboarding();
}

function submitOnboardingOutcome(form) {
  const checked = form.querySelector('input[name="outcome"]:checked');
  const custom = form.elements.outcomeCustom.value.trim();
  if (!checked) {
    showFormError(form, "ひとつ選んでください", form.querySelector('input[name="outcome"]'));
    return;
  }
  if (checked.value === "other" && !custom) {
    showFormError(form, "どうなっていたら嬉しいか、ひとことで書いてください", form.elements.outcomeCustom);
    return;
  }
  ui.onboarding.outcome = checked.value;
  ui.onboarding.outcomeCustom = checked.value === "other" ? custom : "";
  startChallenge(ui.onboarding);
}

function startChallenge(state) {
  const todayKey = getToday();
  const areas = state.areas.map((name, index) => ({
    id: `area-${index + 1}`,
    name,
    status: index === state.firstIndex ? "active" : "upcoming",
    startedDate: index === state.firstIndex ? todayKey : null,
    completedDate: null,
    lastReviewedDate: null
  }));

  appData.challenge = {
    type: CHALLENGE_TYPE,
    mode: "cleanup",
    startDate: todayKey,
    endDate: getChallengeEndDate(todayKey),
    primaryProblem: state.problem,
    targetOutcome: state.outcome,
    targetOutcomeCustom: state.outcomeCustom,
    currentAreaId: areas[state.firstIndex].id,
    areas,
    finalReview: null,
    resting: false
  };
  if (!appData.startDate) appData.startDate = todayKey;
  if (!saveData()) return;

  ui.onboarding = null;
  showApp();
  showView("today");
}

function handleOnboardingBack(step) {
  if (ui.onboarding.step === "areas") return;
  ui.onboarding.step = step;
  renderOnboarding();
}

/* ==========================================================
   今日
   ========================================================== */

function renderToday() {
  const todayKey = getToday();
  ui.renderedToday = todayKey;
  ensureTodayOptions(todayKey);
  renderTodayHeader(todayKey);
  renderTodayArea();

  if (isChallengeFinished(todayKey)) {
    el.todayBody.innerHTML = renderFinalView();
    return;
  }
  const record = getRecord(todayKey);
  if (!record || !isChallengeRecord(record)) {
    el.todayBody.innerHTML = "";
    return;
  }
  el.todayBody.innerHTML = record.selectedOption ? renderSelectedView(record) : renderChoiceView(record);
}

/* 今日の A/B は、その日の記録がないときに1回だけ作って保存する */
function ensureTodayOptions(todayKey) {
  const challenge = appData.challenge;
  if (!challenge || todayKey < challenge.startDate || isChallengeFinished(todayKey)) return;
  const existing = getRecord(todayKey);
  if (existing && isChallengeRecord(existing)) return;

  updateAreaState(appData, todayKey);
  const options = generateDailyOptions(appData, todayKey);
  const record = {
    task: "",
    completed: false,
    question: "",
    answer: "",
    dailyOptions: { A: options.A, B: options.B },
    selectedOption: null,
    resultStatus: null,
    miniActive: false,
    usedMiniTask: false,
    responseData: {},
    bQueue: options.bQueue,
    bIndex: options.bIndex,
    bShown: options.bShown,
    coachMeta: { source: COACH_SOURCE, seasonStartDate: challenge.startDate }
  };
  /* 旧バージョンで今日の記録がすでにある場合は、消さずに残しておく */
  if (existing) {
    record.legacyRecord = { ...existing };
  }
  appData.records[todayKey] = record;
  saveData();
}

function renderTodayHeader(todayKey) {
  const challenge = appData.challenge;
  const record = getRecord(todayKey);
  el.todayDate.textContent = formatJapaneseDate(todayKey);

  if (isChallengeFinished(todayKey)) {
    el.challengeRemaining.textContent = "3か月が終わりました";
    el.todayStamp.innerHTML = '<span class="stamp-label">3 MONTHS</span><span class="stamp-number stamp-number--small">COMPLETE</span>';
    el.todayStamp.setAttribute("aria-label", "3か月を終えました");
    el.todayStamp.classList.add("is-inked");
    return;
  }

  const day = getChallengeDay(todayKey) || 1;
  const remaining = daysBetween(todayKey, challenge.endDate);
  el.challengeRemaining.textContent = remaining > 0 ? `あと${remaining}日` : "今日が最終日";
  el.todayStamp.innerHTML = `<span class="stamp-label">DAY</span><span class="stamp-number">${day}</span>`;
  el.todayStamp.setAttribute("aria-label", `${day}日目`);
  el.todayStamp.classList.toggle("is-inked", Boolean(record && record.completed));
}

function renderTodayArea() {
  const challenge = appData.challenge;
  const current = getCurrentArea(challenge);
  if (isChallengeFinished()) {
    el.todayArea.hidden = true;
    return;
  }
  el.todayArea.hidden = false;
  el.todayArea.innerHTML = current
    ? `<p class="goal-label">今取り組んでいる場所</p><p class="goal-title">${escapeHtml(current.name)}</p>`
    : '<p class="goal-label">重点エリア</p><p class="goal-title">すべて一区切りしました</p>';
}

function renderOptionCard(record, slot) {
  const option = record.dailyOptions[slot];
  const canRotate = slot === "B" && (record.bQueue || []).length > 1;
  return `
    <div class="option-card">
      <button class="option-select" type="button" data-action="select-option" data-slot="${slot}"
        aria-label="${slot}を選ぶ：${escapeHtml(option.title)}。${escapeHtml(option.headline)}。目安${option.estimatedMinutes}分">
        <span class="option-slot" aria-hidden="true">${slot}</span>
        <span class="option-body">
          <span class="option-title">${escapeHtml(option.title)}</span>
          ${option.lead ? `<span class="option-lead">${escapeHtml(option.lead)}</span>` : ""}
          <span class="option-headline">${escapeHtml(option.headline)}</span>
          <span class="option-minutes">目安：${option.estimatedMinutes}分</span>
        </span>
      </button>
      ${canRotate ? '<div class="option-extra"><button class="button button--text button--small" type="button" data-action="rotate-item">別のモノにする</button></div>' : ""}
    </div>`;
}

function renderChoiceView(record) {
  return `
    <section class="choice" aria-labelledby="choice-heading">
      <h2 class="choice-heading" id="choice-heading">今日はどっちにする？</h2>
      <div class="option-list">
        ${renderOptionCard(record, "A")}
        ${renderOptionCard(record, "B")}
      </div>
    </section>`;
}

function renderInstructionHtml(option) {
  return `
    ${option.lead ? `<p class="coach-lead">${escapeHtml(option.lead)}</p>` : ""}
    <p class="task-text">${escapeHtml(option.headline)}</p>
    ${option.details.length ? `<div class="coach-details">${option.details.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>` : ""}
    ${option.finish ? `<p class="coach-finish">${escapeHtml(option.finish)}</p>` : ""}
    <p class="coach-minutes">目安：${option.estimatedMinutes}分</p>`;
}

function renderSelectedView(record) {
  const option = getSelectedEffectiveOption(record);
  const base = record.dailyOptions[record.selectedOption];
  const locked = Boolean(record.resultStatus);
  let actions = "";
  if (!locked) {
    actions = `
      <div class="task-card-actions">
        ${record.miniActive
          ? '<button class="button button--text" type="button" data-action="restore-normal">通常版に戻す</button>'
          : '<button class="button button--text" type="button" data-action="use-mini-task">今日はちょっと無理</button>'}
        <button class="button button--text" type="button" data-action="reselect">選び直す</button>
      </div>`;
  }

  return `
    <div class="task-card${record.completed ? " is-done" : ""}">
      <div class="task-card-top">
        <p class="task-heading">今日やること</p>
        <p class="option-chip">${record.selectedOption}　${escapeHtml(base.title)}${record.miniActive ? "（小さい版）" : ""}</p>
      </div>
      ${renderInstructionHtml(option)}
      ${actions}
    </div>
    <div class="question-card">
      <form class="question-form" data-form="today-result" novalidate>
        <p class="question-kicker">終わったら教えて</p>
        ${renderResultFields(record, option, "today", "どうだった？")}
        <p class="field-error" role="alert" hidden></p>
        <div class="button-row">
          <button class="button button--primary" type="submit">今日の記録を保存</button>
        </div>
        ${record.resultStatus ? `<p class="coach-saved" role="status">${getSavedMessage(record.resultStatus)}</p>` : ""}
      </form>
    </div>`;
}

/* 結果の3択と、必要なときだけの追加の1問 */
function renderResultFields(record, option, idPrefix, legend) {
  const statusItems = RESULT_STATUSES.map((status) => ({ value: status, label: RESULT_LABELS[status] }));
  const followUp = option.followUp;
  let followUpHtml = "";

  if (followUp) {
    const visible = record.resultStatus && record.resultStatus !== "not_done";
    const input = followUp.type === "choice"
      ? `<fieldset class="chip-group">
          <legend class="field-label">${escapeHtml(followUp.label)}</legend>
          ${followUp.choices.map((choice, index) => `
            <label class="chip" for="${idPrefix}-fu-${index}">
              <input type="radio" id="${idPrefix}-fu-${index}" name="answerChoice" value="${escapeHtml(choice)}"${record.answer === choice ? " checked" : ""}>
              <span>${escapeHtml(choice)}</span>
            </label>`).join("")}
        </fieldset>`
      : `<label class="field-label" for="${idPrefix}-answer">${escapeHtml(followUp.label)}</label>
        <input class="text-input" id="${idPrefix}-answer" name="answer" type="text" maxlength="60" autocomplete="off" value="${escapeHtml(record.answer)}">`;
    followUpHtml = `<div class="field result-followup"${visible ? "" : " hidden"}>${input}</div>`;
  }

  return `
    <fieldset class="status-group">
      <legend class="question-text">${legend}</legend>
      ${renderRadioCards("status", statusItems, record.resultStatus, `${idPrefix}-status`)}
    </fieldset>
    ${followUpHtml}`;
}

function getSavedMessage(status) {
  return status === "not_done" ? "今日はここまでで大丈夫。次はもっと小さくします。" : "今日も一歩進みました";
}

function selectDailyOption(slot) {
  const todayKey = getToday();
  const record = getRecord(todayKey);
  if (!isChallengeRecord(record) || record.resultStatus) return;

  record.selectedOption = slot;
  record.miniActive = false;
  syncRecordText(record);
  if (!saveData()) return;
  renderToday();
  focusTaskText();
}

function reselectOption() {
  const record = getRecord(getToday());
  if (!isChallengeRecord(record) || record.resultStatus) return;
  record.selectedOption = null;
  record.miniActive = false;
  syncRecordText(record);
  if (!saveData()) return;
  renderToday();
  const heading = document.getElementById("choice-heading");
  heading.setAttribute("tabindex", "-1");
  heading.focus();
}

function rotateTodayItem() {
  const record = getRecord(getToday());
  if (!isChallengeRecord(record) || record.selectedOption) return;
  const next = rotateItemMenu(record);
  if (!next) return;
  record.dailyOptions.B = next.B;
  record.bIndex = next.bIndex;
  record.bShown = next.bShown;
  if (!saveData()) return;
  renderToday();
  const button = el.todayBody.querySelector('[data-action="rotate-item"]');
  if (button) button.focus();
  showToast(`${next.B.itemName}にしました`);
}

/* 「今日はちょっと無理」：選んだ指示を小さい版にする */
function createMiniTask() {
  const record = getRecord(getToday());
  if (!isChallengeRecord(record) || !record.selectedOption || record.resultStatus) return;
  if (!record.dailyOptions[record.selectedOption].mini) return;
  record.miniActive = true;
  record.usedMiniTask = true;
  syncRecordText(record);
  if (!saveData()) return;
  renderToday();
  focusTaskText();
  showToast("小さい版にしました");
}

function restoreNormalTask() {
  const record = getRecord(getToday());
  if (!isChallengeRecord(record) || record.resultStatus) return;
  record.miniActive = false;
  syncRecordText(record);
  if (!saveData()) return;
  renderToday();
  focusTaskText();
  showToast("通常版に戻しました");
}

function focusTaskText() {
  const text = el.todayBody.querySelector(".task-text");
  if (!text) return;
  text.setAttribute("tabindex", "-1");
  text.focus();
}

/* 旧UIやカレンダーとの互換のため、task / question も合わせて保存する */
function syncRecordText(record) {
  const option = getSelectedEffectiveOption(record);
  record.task = option ? optionToText(option) : "";
  record.question = option && option.followUp ? option.followUp.label : "";
  record.completed = record.resultStatus === "done" || record.resultStatus === "partial";
}

function readResultForm(form) {
  const checked = form.querySelector('input[name="status"]:checked');
  const choice = form.querySelector('input[name="answerChoice"]:checked');
  const text = form.elements.answer ? form.elements.answer.value.trim() : "";
  return { status: checked ? checked.value : "", answer: choice ? choice.value : text };
}

function validateResult(option, status, answer) {
  if (!status) return "どうだったか、ひとつ選んでください";
  if (status === "done" && option.followUp && option.followUp.requiredOnDone && !answer) return "決めた場所を書いてください";
  return "";
}

function saveDailyResult(dateKey, status, answer) {
  const record = getRecord(dateKey);
  const option = getSelectedEffectiveOption(record);
  const savedAnswer = status === "not_done" ? "" : answer;

  record.resultStatus = status;
  record.answer = savedAnswer;
  record.responseData = savedAnswer && option.followUp ? { [option.followUp.key]: savedAnswer } : {};
  syncRecordText(record);
  updateAreaState(appData, getToday());
  return saveData();
}

function submitResultForm(form, dateKey) {
  const record = getRecord(dateKey);
  if (!isChallengeRecord(record) || !record.selectedOption) return false;
  const option = getSelectedEffectiveOption(record);
  const { status, answer } = readResultForm(form);
  const message = validateResult(option, status, answer);
  if (message) {
    const target = status ? form.querySelector('.result-followup input') : form.querySelector('input[name="status"]');
    showFormError(form, message, target);
    return false;
  }
  clearFormError(form);
  return saveDailyResult(dateKey, status, answer);
}

function saveTodayResult(form) {
  const todayKey = getToday();
  if (!submitResultForm(form, todayKey)) return;
  renderTodayHeader(todayKey);
  renderTodayArea();
  el.todayBody.innerHTML = renderSelectedView(getRecord(todayKey));
  const saved = el.todayBody.querySelector(".coach-saved");
  if (saved) {
    saved.setAttribute("tabindex", "-1");
    saved.focus();
  }
}

function handleStatusChange(input) {
  const form = input.closest("form");
  const followUp = form && form.querySelector(".result-followup");
  if (followUp) followUp.hidden = input.value === "not_done";
}

/* ==========================================================
   3か月の終わり（最終振り返り・次の3か月）
   ========================================================== */

function renderFinalView() {
  const challenge = appData.challenge;
  if (challenge.resting) {
    return `
      <div class="task-card final-card">
        <p class="task-heading">おやすみ中</p>
        <p class="task-text">今はお休み中です。また始めたくなったら、いつでもどうぞ。</p>
        <div class="button-row final-actions">
          <button class="button button--primary" type="button" data-action="start-next-season">次の3か月を始める</button>
        </div>
      </div>`;
  }
  if (challenge.finalReview) {
    return `
      <div class="task-card final-card">
        <p class="task-heading">3か月のふり返り</p>
        <p class="task-text">3か月、おつかれさまでした。</p>
        <p class="coach-details">ふり返りを保存しました。次の3か月も、同じように小さく続けられます。</p>
        ${renderFinalSummary(challenge.finalReview)}
        <div class="button-row final-actions">
          <button class="button button--primary" type="button" data-action="start-next-season">次の3か月を始める</button>
          <button class="button button--text" type="button" data-action="rest-season">いったん休む</button>
        </div>
      </div>`;
  }

  const areaItems = challenge.areas.map((area) => ({ value: area.name, label: area.name }));
  return `
    <div class="task-card final-card">
      <p class="task-heading">3か月のふり返り</p>
      <p class="task-text">3か月、おつかれさまでした。</p>
      <p class="coach-details">答えられるところだけで大丈夫です。</p>
      <form class="final-form" data-form="final-review" novalidate>
        <fieldset class="chip-group">
          <legend class="field-label">一番変わった場所は？</legend>
          ${areaItems.map((item, index) => renderChip("bestArea", item.value, `final-area-${index}`)).join("")}
        </fieldset>
        <fieldset class="chip-group">
          <legend class="field-label">前よりラクになったことは？</legend>
          ${FINAL_EASIER_CHOICES.map((choice, index) => renderChip("easier", choice, `final-easier-${index}`)).join("")}
        </fieldset>
        <div class="field">
          <label class="field-label" for="final-keep">これからも続けたい仕組みは？</label>
          <input class="text-input" id="final-keep" name="keep" type="text" maxlength="80" autocomplete="off" placeholder="例：プリントは白いボックスに戻す">
        </div>
        <button class="button button--primary button--wide" type="submit">ふり返りを保存</button>
      </form>
    </div>`;
}

function renderChip(name, value, id) {
  return `
    <label class="chip" for="${id}">
      <input type="radio" id="${id}" name="${name}" value="${escapeHtml(value)}">
      <span>${escapeHtml(value)}</span>
    </label>`;
}

function renderFinalSummary(review) {
  const rows = [
    ["一番変わった場所", review.bestArea],
    ["ラクになったこと", review.easier],
    ["続けたい仕組み", review.keep]
  ].filter(([, value]) => value);
  if (!rows.length) return "";
  return `<dl class="plan-facts">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;
}

function saveFinalReview(form) {
  const pick = (name) => {
    const checked = form.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : "";
  };
  appData.challenge.finalReview = {
    bestArea: pick("bestArea"),
    easier: pick("easier"),
    keep: form.elements.keep.value.trim(),
    savedDate: getToday()
  };
  if (!saveData()) return;
  renderToday();
  showToast("ふり返りを保存しました");
}

function restSeason() {
  appData.challenge.resting = true;
  if (!saveData()) return;
  renderToday();
}

/* 今の3か月を seasons に残して、新しい3か月の設定へ */
function startNextSeason() {
  const challenge = appData.challenge;
  if (challenge) {
    appData.seasons.push({ ...challenge, archivedDate: getToday() });
    appData.challenge = null;
  }
  if (!saveData()) return;
  startOnboarding();
}

/* ==========================================================
   カレンダー
   ========================================================== */

function renderCalendar() {
  const { calendarYear: year, calendarMonth: month } = ui;
  const todayKey = getToday();
  const now = parseDateKey(todayKey);
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  el.calendarMonth.textContent = `${year}年${month + 1}月`;
  el.currentMonthRow.hidden = year === now.getFullYear() && month === now.getMonth();

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push('<span aria-hidden="true"></span>');
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatLocalDate(new Date(year, month, day));
    cells.push(renderCalendarDay(dateKey, day, todayKey));
  }
  el.calendarGrid.innerHTML = cells.join("");
}

function getDayState(record) {
  if (!record) return null;
  if (isChallengeRecord(record)) {
    if (record.resultStatus === "done") return { className: "is-done", mark: '<span class="mark-done">✓</span>', label: "できた" };
    if (record.resultStatus === "partial") return { className: "is-partial", mark: '<span class="mark-partial">✓</span>', label: "少しできた" };
    if (record.resultStatus === "not_done") return { className: "", mark: '<span class="mark-task"></span>', label: "今日はできなかった" };
    if (record.selectedOption) return { className: "", mark: '<span class="mark-task"></span>', label: "選んだ" };
    return null;
  }
  if (record.task && record.completed) return { className: "is-done", mark: '<span class="mark-done">✓</span>', label: "できた（以前の記録）" };
  if (record.task || record.answer) return { className: "", mark: '<span class="mark-task"></span>', label: "以前の記録" };
  return null;
}

function renderCalendarDay(dateKey, day, todayKey) {
  const classes = ["cal-day"];
  const states = [];
  let mark = "";

  if (dateKey === todayKey) {
    classes.push("is-today");
    states.push("今日");
  }
  if (dateKey > todayKey) classes.push("is-future");

  const state = getDayState(getRecord(dateKey));
  if (state) {
    if (state.className) classes.push(state.className);
    mark = state.mark;
    states.push(state.label);
  }

  const label = [formatJapaneseDate(dateKey), ...states].join("、");
  return `
    <button class="${classes.join(" ")}" type="button" data-action="open-day" data-date="${dateKey}"
      aria-label="${escapeHtml(label)}"${dateKey === todayKey ? ' aria-current="date"' : ""}>
      <span class="cal-date">${day}</span>
      <span class="cal-marks" aria-hidden="true">${mark}</span>
    </button>`;
}

function moveCalendarMonth(amount) {
  const date = new Date(ui.calendarYear, ui.calendarMonth + amount, 1);
  ui.calendarYear = date.getFullYear();
  ui.calendarMonth = date.getMonth();
  renderCalendar();
}

function resetCalendarToCurrentMonth() {
  const now = parseDateKey(getToday());
  ui.calendarYear = now.getFullYear();
  ui.calendarMonth = now.getMonth();
}

/* ==========================================================
   日付の詳細
   ========================================================== */

function openDayDetail(dateKey) {
  const todayKey = getToday();
  const record = getRecord(dateKey);

  ui.dialogDateKey = dateKey;
  el.dayDialogTitle.textContent = formatJapaneseDate(dateKey);
  el.dayDialogSub.textContent = getDialogSubtitle(dateKey, todayKey);

  if (dateKey > todayKey) {
    el.dayDialogBody.innerHTML = renderFutureDayBody();
  } else if (isChallengeRecord(record)) {
    el.dayDialogBody.innerHTML = renderChallengeDayBody(record, dateKey === todayKey);
  } else {
    el.dayDialogBody.innerHTML = renderLegacyDayBody(record);
  }

  if (typeof el.dayDialog.showModal === "function") {
    el.dayDialog.showModal();
  } else {
    el.dayDialog.setAttribute("open", "");
  }
  const firstField = el.dayDialogBody.querySelector("input, textarea, button");
  if (firstField) firstField.focus();
}

function getDialogSubtitle(dateKey, todayKey) {
  const parts = [];
  if (dateKey === todayKey) parts.push("今日");
  const challenge = appData.challenge;
  if (challenge && dateKey >= challenge.startDate && dateKey < challenge.endDate) {
    parts.push(`DAY ${daysBetween(challenge.startDate, dateKey) + 1}`);
  }
  return parts.join("　");
}

function renderCloseOnly() {
  return `
    <div class="dialog-actions">
      <button class="button button--secondary" type="button" data-action="close-dialog">閉じる</button>
    </div>`;
}

function renderFutureDayBody() {
  const message = appData.challenge
    ? "この日の片付けは、それまでの記録をもとに決まります。"
    : "この日はまだ先です。";
  return `
    <div class="readonly-block">
      <p class="readonly-note">${message}</p>
      ${renderCloseOnly()}
    </div>`;
}

function renderLegacyBlock(legacy) {
  if (!legacy || (!legacy.task && !legacy.answer)) return "";
  return `
    <div class="legacy-block">
      <p class="readonly-label">以前のバージョンの記録</p>
      ${legacy.task ? `<p class="readonly-value">${escapeHtml(legacy.task)}</p>` : ""}
      ${legacy.task ? `<p class="readonly-value">結果：${legacy.completed ? "できた" : "記録なし"}</p>` : ""}
      ${legacy.answer ? `<p class="readonly-value">回答：${escapeHtml(legacy.answer)}</p>` : ""}
    </div>`;
}

function renderLegacyDayBody(record) {
  if (!record || (!record.task && !record.answer)) {
    return `
      <div class="readonly-block">
        <p class="readonly-note">この日の記録はありません。</p>
        ${renderCloseOnly()}
      </div>`;
  }
  return `
    <div class="readonly-block">
      ${renderLegacyBlock(record)}
      <p class="readonly-note">以前のバージョンの記録は、見るだけになります。</p>
      ${renderCloseOnly()}
    </div>`;
}

/* A/B と選んだ指示は履歴として変更しない。結果と回答だけ直せる */
function renderChallengeDayBody(record, isToday) {
  if (!record.selectedOption) {
    return `
      <div class="readonly-block">
        <p class="readonly-note">${isToday ? "今日はまだ選んでいません。" : "この日は選ばれませんでした。"}</p>
        <div><p class="readonly-label">A　${escapeHtml(record.dailyOptions.A.title)}</p><p class="readonly-value">${escapeHtml(record.dailyOptions.A.headline)}</p></div>
        <div><p class="readonly-label">B　${escapeHtml(record.dailyOptions.B.title)}</p><p class="readonly-value">${escapeHtml(record.dailyOptions.B.headline)}</p></div>
        ${renderLegacyBlock(record.legacyRecord)}
        ${renderCloseOnly()}
      </div>`;
  }

  const option = getSelectedEffectiveOption(record);
  const base = record.dailyOptions[record.selectedOption];
  return `
    <form class="day-form" data-form="day-result" novalidate>
      <div class="coach-history">
        <p class="readonly-label">選んだもの</p>
        <p class="readonly-value">${record.selectedOption}　${escapeHtml(base.title)}${record.miniActive ? "（小さい版）" : ""}</p>
        <p class="readonly-label history-gap">${isToday ? "今日の指示" : "この日の指示"}</p>
        <p class="readonly-value">${escapeHtml(option.headline)}</p>
      </div>
      ${renderResultFields(record, option, "day", "結果")}
      <p class="field-error" role="alert" hidden></p>
      ${renderLegacyBlock(record.legacyRecord)}
      <div class="dialog-actions">
        <button class="button button--text" type="button" data-action="close-dialog">閉じる</button>
        <button class="button button--primary" type="submit">保存する</button>
      </div>
    </form>`;
}

function saveDayResult(form) {
  const dateKey = ui.dialogDateKey;
  if (!dateKey || dateKey > getToday()) return;
  if (!submitResultForm(form, dateKey)) return;
  closeDayDetail();
  renderCalendar();
  showToast("保存しました");
}

function closeDayDetail() {
  const openedDate = ui.dialogDateKey;
  ui.dialogDateKey = null;

  if (typeof el.dayDialog.close === "function" && el.dayDialog.open) {
    el.dayDialog.close();
  } else {
    el.dayDialog.removeAttribute("open");
  }
  if (openedDate) {
    const dayButton = el.calendarGrid.querySelector(`[data-date="${openedDate}"]`);
    if (dayButton) dayButton.focus();
  }
}

/* ==========================================================
   3か月画面
   ========================================================== */

function renderPlan() {
  const challenge = appData.challenge;
  if (!challenge) {
    el.planBody.innerHTML = "";
    return;
  }
  el.planBody.innerHTML = ui.isEditingPlan ? renderPlanEdit(challenge) : renderPlanSummary(challenge);
}

function renderPlanSummary(challenge) {
  const todayKey = getToday();
  const total = getChallengeTotalDays(challenge);
  const elapsed = Math.min(total, Math.max(0, daysBetween(challenge.startDate, todayKey) + 1));
  const remaining = Math.max(0, daysBetween(todayKey, challenge.endDate));
  const percent = Math.round((elapsed / total) * 100);

  const areaRows = challenge.areas.map((area) => {
    const mark = { done: "✓", active: "●", upcoming: "○" }[area.status];
    return `
      <li class="area-row area-row--${area.status}">
        <span class="area-mark" aria-hidden="true">${mark}</span>
        <span class="area-name">${escapeHtml(area.name)}</span>
        <span class="area-status">${AREA_STATUS_LABELS[area.status]}</span>
      </li>`;
  }).join("");

  return `
    <div class="progress">
      <p class="plan-label">期間</p>
      <p class="plan-period">${formatShortDate(challenge.startDate)} → ${formatShortDate(challenge.endDate)}</p>
      <div class="progress-bar" role="img" aria-label="3か月のうち${elapsed}日目"><span style="width:${percent}%"></span></div>
      <dl class="progress-stats">
        <div><dt>経過</dt><dd>${elapsed}日</dd></div>
        <div><dt>残り</dt><dd>${remaining}日</dd></div>
      </dl>
    </div>

    <section class="plan-section" aria-labelledby="plan-areas-title">
      <h2 class="plan-section-title" id="plan-areas-title">重点エリア</h2>
      <ul class="area-list">${areaRows}</ul>
    </section>

    <dl class="plan-facts">
      <div><dt>一番の困りごと</dt><dd>${escapeHtml(getLabel(PROBLEMS, challenge.primaryProblem))}</dd></div>
      <div><dt>3か月後</dt><dd>${escapeHtml(getOutcomeText(challenge))}</dd></div>
    </dl>

    <button class="button button--secondary button--wide" type="button" data-action="edit-plan">プランを編集する</button>`;
}

function renderPlanEdit(challenge) {
  const areaFields = [];
  for (let index = 0; index < MAX_AREAS; index += 1) {
    const area = challenge.areas[index];
    const locked = area && area.status !== "upcoming";
    areaFields.push(`
      <div class="field">
        <label class="field-label" for="plan-area-${index}">場所${index + 1}${area ? `（${AREA_STATUS_LABELS[area.status]}）` : ""}</label>
        <input class="text-input" id="plan-area-${index}" name="area-${index}" type="text" maxlength="40" autocomplete="off"
          value="${area ? escapeHtml(area.name) : ""}" placeholder="${area ? "" : "追加する場合は入力"}"
          ${locked ? 'data-required="true"' : ""}>
      </div>`);
  }

  const selectable = challenge.areas.filter((area) => area.status !== "done")
    .map((area) => ({ value: area.id, label: area.name }));

  return `
    <form class="goal-form" data-form="plan-edit" novalidate>
      <fieldset class="plan-fieldset">
        <legend class="plan-section-title">重点エリア</legend>
        ${areaFields.join("")}
      </fieldset>
      ${selectable.length > 1 ? `
        <fieldset class="status-group">
          <legend class="field-label">今取り組む場所</legend>
          ${renderRadioCards("currentArea", selectable, challenge.currentAreaId, "plan-current")}
        </fieldset>` : ""}
      <fieldset class="status-group">
        <legend class="field-label">一番の困りごと</legend>
        ${renderRadioCards("problem", PROBLEMS, challenge.primaryProblem, "plan-problem")}
      </fieldset>
      <fieldset class="status-group">
        <legend class="field-label">3か月後</legend>
        ${renderRadioCards("outcome", OUTCOMES, challenge.targetOutcome, "plan-outcome")}
      </fieldset>
      <div class="field" id="plan-outcome-custom-field"${challenge.targetOutcome === "other" ? "" : " hidden"}>
        <label class="field-label" for="plan-outcome-custom">どうなっていたら嬉しい？</label>
        <input class="text-input" id="plan-outcome-custom" name="outcomeCustom" type="text" maxlength="60" autocomplete="off" value="${escapeHtml(challenge.targetOutcomeCustom)}">
      </div>
      <p class="setting-note">開始日（${formatJapaneseDate(challenge.startDate, false)}）は変更できません。</p>
      <p class="field-error" role="alert" hidden></p>
      <div class="onboarding-actions">
        <button class="button button--text" type="button" data-action="cancel-plan">キャンセル</button>
        <button class="button button--primary" type="submit">保存する</button>
      </div>
    </form>`;
}

function savePlan(form) {
  const challenge = appData.challenge;
  const todayKey = getToday();
  const names = [];
  for (let index = 0; index < MAX_AREAS; index += 1) {
    names.push(form.elements[`area-${index}`].value.trim());
  }

  const lockedEmpty = challenge.areas.some((area, index) => area.status !== "upcoming" && !names[index]);
  if (lockedEmpty) {
    showFormError(form, "整え中・一区切りの場所は、名前を空にできません", form.querySelector("input[data-required]"));
    return;
  }
  const outcome = form.querySelector('input[name="outcome"]:checked');
  const custom = form.elements.outcomeCustom.value.trim();
  if (outcome && outcome.value === "other" && !custom) {
    showFormError(form, "どうなっていたら嬉しいか、ひとことで書いてください", form.elements.outcomeCustom);
    return;
  }

  const areas = [];
  names.forEach((name, index) => {
    const existing = challenge.areas[index];
    if (existing && name) areas.push({ ...existing, name });
    if (!existing && name) {
      areas.push({ id: getNewAreaId(challenge), name, status: "upcoming", startedDate: null, completedDate: null, lastReviewedDate: null });
    }
  });
  challenge.areas = areas;

  const chosen = form.querySelector('input[name="currentArea"]:checked');
  const nextCurrentId = chosen ? chosen.value : challenge.currentAreaId;
  setCurrentArea(challenge, nextCurrentId, todayKey);

  const problem = form.querySelector('input[name="problem"]:checked');
  if (problem) challenge.primaryProblem = problem.value;
  if (outcome) {
    challenge.targetOutcome = outcome.value;
    challenge.targetOutcomeCustom = outcome.value === "other" ? custom : "";
  }
  if (!saveData()) return;

  ui.isEditingPlan = false;
  renderPlan();
  showToast("保存しました");
}

function getNewAreaId(challenge) {
  let number = challenge.areas.length + 1;
  while (challenge.areas.some((area) => area.id === `area-${number}`)) number += 1;
  return `area-${number}`;
}

function setCurrentArea(challenge, areaId, todayKey) {
  let target = challenge.areas.find((area) => area.id === areaId && area.status !== "done");
  if (!target) target = challenge.areas.find((area) => area.status === "active") || challenge.areas.find((area) => area.status === "upcoming");
  challenge.areas.forEach((area) => {
    if (area.status === "done") return;
    if (target && area.id === target.id) {
      area.status = "active";
      if (!area.startedDate) area.startedDate = todayKey;
    } else {
      area.status = "upcoming";
    }
  });
  challenge.currentAreaId = target ? target.id : null;
}

function handleOutcomeChange(input) {
  const field = document.getElementById("ob-outcome-custom-field") || document.getElementById("plan-outcome-custom-field");
  if (field) field.hidden = input.value !== "other";
}

function resetAllData() {
  const confirmed = window.confirm("すべての記録を削除しますか？\nこの操作は元に戻せません。");
  if (!confirmed) return;
  clearData();
  ui.isEditingPlan = false;
  resetCalendarToCurrentMonth();
  startOnboarding();
}

/* ==========================================================
   イベント
   ========================================================== */

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const actions = {
    navigate: () => {
      if (target.dataset.target === "calendar" && ui.view !== "calendar") resetCalendarToCurrentMonth();
      if (target.dataset.target === "plan") ui.isEditingPlan = false;
      showView(target.dataset.target);
    },
    "select-option": () => selectDailyOption(target.dataset.slot),
    "rotate-item": rotateTodayItem,
    reselect: reselectOption,
    "use-mini-task": createMiniTask,
    "restore-normal": restoreNormalTask,
    "prev-month": () => moveCalendarMonth(-1),
    "next-month": () => moveCalendarMonth(1),
    "current-month": () => {
      resetCalendarToCurrentMonth();
      renderCalendar();
    },
    "open-day": () => openDayDetail(target.dataset.date),
    "close-dialog": closeDayDetail,
    "edit-plan": () => {
      ui.isEditingPlan = true;
      renderPlan();
      el.planBody.querySelector("input").focus();
    },
    "cancel-plan": () => {
      ui.isEditingPlan = false;
      renderPlan();
    },
    "reset-data": resetAllData,
    "export-data": exportData,
    "import-data": chooseImportFile,
    "ob-add-area": addOnboardingArea,
    "ob-back": () => handleOnboardingBack(target.dataset.step),
    "start-next-season": startNextSeason,
    "rest-season": restSeason
  };
  if (actions[target.dataset.action]) actions[target.dataset.action]();
}

function handleSubmit(event) {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();

  const handlers = {
    "ob-areas": submitOnboardingAreas,
    "ob-first": submitOnboardingFirst,
    "ob-problem": submitOnboardingProblem,
    "ob-outcome": submitOnboardingOutcome,
    "today-result": saveTodayResult,
    "day-result": saveDayResult,
    "plan-edit": savePlan,
    "final-review": saveFinalReview
  };
  if (handlers[form.dataset.form]) handlers[form.dataset.form](form);
}

function handleChange(event) {
  const target = event.target;
  if (target.name === "status") handleStatusChange(target);
  if (target.name === "outcome") handleOutcomeChange(target);
}

/* 日付をまたいでアプリに戻ってきたときは、新しい日の画面にする */
function handleVisibilityChange() {
  if (document.visibilityState !== "visible" || el.app.hidden) return;
  if (getToday() === ui.renderedToday) return;
  if (ui.view === "today") renderToday();
  if (ui.view === "calendar") renderCalendar();
  if (ui.view === "plan") renderPlan();
  ui.renderedToday = getToday();
}

function bindEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", handleChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  /* ダイアログの外側を押したら閉じる */
  el.dayDialog.addEventListener("click", (event) => {
    if (event.target === el.dayDialog) closeDayDetail();
  });
  el.dayDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDayDetail();
  });
  el.importDataFile.addEventListener("change", () => importDataFile(el.importDataFile.files[0]));
}

function init() {
  bindEvents();
  if (storageLoadFailed) {
    showStorageLoadError();
    return;
  }
  if (!appData.challenge) {
    startOnboarding();
    return;
  }
  showApp();
  showView("today");
}

init();
