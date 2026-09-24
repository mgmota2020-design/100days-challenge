"use strict";

/* ==========================================================
   設定・質問データ
   ========================================================== */

const STORAGE_KEY = "hundredDaysChallenge";
const CHALLENGE_LENGTH = 100;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const questions = [
  "今日、一歩進んだことは？",
  "今日やってよかったことは？",
  "今日やらなくてもよかったことは？",
  "明日の自分を少し楽にするなら？",
  "今日ちょっと嬉しかったことは？",
  "今日、自分のためにできたことは？",
  "100日後の自分に少し近づけた？",
  "今日気づいたことは？",
  "今日、一番大切にしたことは？",
  "今日の自分に一言かけるなら？",
  "今日、思ったより簡単だったことは？",
  "今日、手をつけられたことは？",
  "今日、誰かに助けられたことは？",
  "今日のやることを選んだ理由は？",
  "今日、少しでも楽しめた瞬間は？",
  "今日、うまくいったやり方は？",
  "次に同じことをするなら、何を変えてみる？",
  "今日の自分をほめるなら、どこ？",
  "今日、ゴールについて考えた時間はあった？",
  "今日、心が軽くなったことは？",
  "今日、無理をしなかったことは？",
  "今日、新しく知ったことは？",
  "明日やることを、ひとつ思い浮かべるなら？",
  "今日の自分に「ありがとう」と言うなら、何について？",
  "今日、集中できたのはどんなとき？",
  "今日、やってみたいと思えたことは？",
  "今日、誰かに伝えたいことは？",
  "今日、ゴールにつながりそうなものを見つけた？",
  "今日、いつもと少し違うことをした？",
  "今日、ほっとしたことは？",
  "1週間前の自分と比べて、変わったことは？",
  "今日の小さな「できた」は？",
  "今日、自分らしかった瞬間は？"
];

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

function getDaysUntilYearEnd(todayKey = getToday()) {
  const year = todayKey.slice(0, 4);
  return daysBetween(todayKey, `${year}-12-31`);
}

function getChallengeDay(todayKey = getToday()) {
  if (!appData.startDate) return null;
  return Math.max(1, daysBetween(appData.startDate, todayKey) + 1);
}

function formatJapaneseDate(dateKey, withWeekday = true) {
  const date = parseDateKey(dateKey);
  const text = `${date.getMonth() + 1}月${date.getDate()}日`;
  return withWeekday ? `${text}（${WEEKDAYS[date.getDay()]}）` : text;
}

function formatJapaneseFullDate(dateKey) {
  return `${dateKey.slice(0, 4)}年${formatJapaneseDate(dateKey, false)}`;
}

/* 同じ日なら何度開いても同じ質問になる */
function getQuestionForDate(dateKey) {
  const count = questions.length;
  return questions[((toDayNumber(dateKey) % count) + count) % count];
}

/* ==========================================================
   データの読み書き
   ========================================================== */

function createEmptyData() {
  return { goal: null, startDate: null, records: {} };
}

function toText(value) {
  return typeof value === "string" ? value : "";
}

/* 壊れたデータが入っていても、使える部分だけを取り出す */
function normalizeData(raw) {
  const data = createEmptyData();
  if (!raw || typeof raw !== "object") return data;

  if (raw.goal && typeof raw.goal === "object" && toText(raw.goal.title).trim()) {
    data.goal = {
      title: raw.goal.title.trim(),
      reason: toText(raw.goal.reason),
      feeling: toText(raw.goal.feeling)
    };
  }

  if (isValidDateKey(raw.startDate)) {
    data.startDate = raw.startDate;
  }

  if (raw.records && typeof raw.records === "object") {
    Object.keys(raw.records).forEach((dateKey) => {
      const record = raw.records[dateKey];
      if (!isValidDateKey(dateKey) || !record || typeof record !== "object") return;
      const task = toText(record.task).trim();
      data.records[dateKey] = {
        task,
        completed: Boolean(record.completed) && task !== "",
        question: toText(record.question) || getQuestionForDate(dateKey),
        answer: toText(record.answer)
      };
    });
  }

  return data;
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
    return createEmptyData();
  }
}

function saveData() {
  try {
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

function updateRecord(dateKey, changes) {
  const current = getRecord(dateKey) || {
    task: "",
    completed: false,
    question: getQuestionForDate(dateKey),
    answer: ""
  };
  const next = { ...current, ...changes };
  if (!next.task) next.completed = false;

  if (!next.task && !next.answer) {
    delete appData.records[dateKey];
  } else {
    appData.records[dateKey] = next;
  }
  return saveData();
}

/* ==========================================================
   状態・要素
   ========================================================== */

let appData = loadData();

const ui = {
  view: "today",
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  isEditingTodayTask: false,
  dialogDateKey: null,
  renderedToday: getToday(),
  toastTimer: null
};

const el = {
  onboarding: document.getElementById("onboarding"),
  app: document.getElementById("app"),
  views: document.querySelectorAll("[data-view]"),
  navButtons: document.querySelectorAll(".nav-button"),

  todayDate: document.getElementById("today-date"),
  yearRemaining: document.getElementById("year-remaining"),
  todayStamp: document.getElementById("today-stamp"),
  todayGoal: document.getElementById("today-goal"),
  todayTask: document.getElementById("today-task"),
  todayQuestion: document.getElementById("today-question"),

  calendarMonth: document.getElementById("calendar-month"),
  calendarGrid: document.getElementById("calendar-grid"),
  currentMonthRow: document.getElementById("current-month-row"),

  goalProgress: document.getElementById("goal-progress"),
  goalTitle: document.getElementById("goal-title"),
  goalReason: document.getElementById("goal-reason"),
  goalFeeling: document.getElementById("goal-feeling"),

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

function showFieldError(errorElement, input, message) {
  errorElement.textContent = message;
  errorElement.hidden = false;
  input.setAttribute("aria-invalid", "true");
  input.focus();
}

function clearFieldError(errorElement, input) {
  errorElement.textContent = "";
  errorElement.hidden = true;
  input.removeAttribute("aria-invalid");
}

/* ==========================================================
   画面の切り替え
   ========================================================== */

function showOnboarding() {
  el.app.hidden = true;
  el.onboarding.hidden = false;
  document.getElementById("onboarding-goal").value = "";
  document.getElementById("onboarding-goal").focus();
}

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
  if (viewName === "goal") renderGoal();

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
   今日
   ========================================================== */

function renderToday() {
  const todayKey = getToday();
  ui.renderedToday = todayKey;
  renderTodayHeader(todayKey);
  renderTodayGoal();
  renderTodayTask(todayKey);
  renderTodayQuestion(todayKey);
}

function renderTodayHeader(todayKey) {
  const challengeDay = getChallengeDay(todayKey);
  const remaining = getDaysUntilYearEnd(todayKey);
  const record = getRecord(todayKey);

  el.todayDate.textContent = formatJapaneseDate(todayKey);
  el.yearRemaining.textContent = remaining > 0 ? `今年はあと${remaining}日` : "今日が今年最後の日";

  if (challengeDay && challengeDay > CHALLENGE_LENGTH) {
    el.todayStamp.innerHTML =
      '<span class="stamp-label">100 DAYS</span><span class="stamp-number stamp-number--small">COMPLETE</span>';
    el.todayStamp.setAttribute("aria-label", `100日チャレンジ達成。今日は${challengeDay}日目`);
  } else {
    const day = challengeDay || 1;
    el.todayStamp.innerHTML = `<span class="stamp-label">DAY</span><span class="stamp-number">${day}</span>`;
    el.todayStamp.setAttribute("aria-label", `チャレンジ${day}日目`);
  }
  el.todayStamp.classList.toggle("is-inked", Boolean(record && record.completed));
}

function renderTodayGoal() {
  if (appData.goal) {
    el.todayGoal.innerHTML = `
      <p class="goal-label">今年中に叶えたいこと</p>
      <p class="goal-title">${escapeHtml(appData.goal.title)}</p>`;
  } else {
    el.todayGoal.innerHTML = `
      <div class="goal-empty">
        <p class="goal-title">今年中に叶えたいことを決めよう</p>
        <button class="button button--secondary" type="button" data-action="navigate" data-target="goal">ゴールを決める</button>
      </div>`;
  }
}

function renderTodayTask(todayKey) {
  const record = getRecord(todayKey);
  const hasTask = Boolean(record && record.task);

  el.todayTask.classList.toggle("is-done", hasTask && record.completed && !ui.isEditingTodayTask);

  if (!hasTask || ui.isEditingTodayTask) {
    const value = hasTask ? record.task : "";
    el.todayTask.innerHTML = `
      <form class="task-form" data-form="today-task" novalidate>
        <label class="task-heading" for="today-task-input">今日、何をひとつやる？</label>
        <input class="text-input" id="today-task-input" name="task" type="text" maxlength="100"
          autocomplete="off" placeholder="例：トップページの見出しを30分直す"
          value="${escapeHtml(value)}" aria-describedby="today-task-error">
        <p class="field-error" id="today-task-error" role="alert" hidden></p>
        <div class="button-row">
          <button class="button button--primary" type="submit">${hasTask ? "変更する" : "今日やることにする"}</button>
          ${hasTask ? '<button class="button button--text" type="button" data-action="cancel-edit-task">キャンセル</button>' : ""}
        </div>
      </form>`;
    return;
  }

  el.todayTask.innerHTML = `
    <p class="task-heading">今日やること</p>
    <p class="task-text">${escapeHtml(record.task)}</p>
    <div class="task-actions">
      <button class="check-button" type="button" data-action="toggle-complete" aria-pressed="${record.completed}">
        <span class="check-box" aria-hidden="true">✓</span>できた
      </button>
      <button class="button button--text" type="button" data-action="edit-task">編集</button>
    </div>
    ${record.completed ? '<p class="task-done-note">できました。おつかれさまでした。</p>' : ""}`;
}

function renderTodayQuestion(todayKey) {
  const record = getRecord(todayKey);
  const question = (record && record.question) || getQuestionForDate(todayKey);
  const answer = record ? record.answer : "";

  el.todayQuestion.innerHTML = `
    <form class="question-form" data-form="today-answer" novalidate>
      <p class="question-kicker">今日の1問</p>
      <label class="question-text" for="today-answer-input">${escapeHtml(question)}</label>
      <textarea class="text-area" id="today-answer-input" name="answer" rows="4" maxlength="1000"
        aria-describedby="today-answer-error">${escapeHtml(answer)}</textarea>
      <p class="field-error" id="today-answer-error" role="alert" hidden></p>
      <div class="button-row">
        <button class="button button--secondary" type="submit">記録する</button>
        ${answer ? '<span class="saved-note">記録済み</span>' : ""}
      </div>
    </form>`;
}

function saveTodayTask(form) {
  const input = form.elements.task;
  const errorElement = form.querySelector(".field-error");
  const task = input.value.trim();

  if (!task) {
    showFieldError(errorElement, input, "今日やることをひとつ決めてください");
    return;
  }
  clearFieldError(errorElement, input);

  const wasEditing = ui.isEditingTodayTask;
  const todayKey = getToday();
  if (!updateRecord(todayKey, { task })) return;

  ui.isEditingTodayTask = false;
  renderTodayTask(todayKey);
  renderTodayHeader(todayKey);
  el.todayTask.querySelector('[data-action="toggle-complete"]').focus();
  showToast(wasEditing ? "変更しました" : "今日やることを決めました");
}

function toggleTaskComplete() {
  const todayKey = getToday();
  const record = getRecord(todayKey);
  if (!record || !record.task) return;

  if (!updateRecord(todayKey, { completed: !record.completed })) return;

  renderTodayTask(todayKey);
  renderTodayHeader(todayKey);
  el.todayTask.querySelector('[data-action="toggle-complete"]').focus();
}

function startEditTodayTask() {
  ui.isEditingTodayTask = true;
  renderTodayTask(getToday());
  const input = document.getElementById("today-task-input");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function cancelEditTodayTask() {
  ui.isEditingTodayTask = false;
  renderTodayTask(getToday());
  el.todayTask.querySelector('[data-action="edit-task"]').focus();
}

function saveDailyAnswer(form) {
  const input = form.elements.answer;
  const errorElement = form.querySelector(".field-error");
  const answer = input.value.trim();
  const todayKey = getToday();
  const record = getRecord(todayKey);

  if (!answer) {
    showFieldError(errorElement, input, "ひとことでも大丈夫です。思ったことを書いてみてください");
    return;
  }
  clearFieldError(errorElement, input);

  const question = (record && record.question) || getQuestionForDate(todayKey);
  if (!updateRecord(todayKey, { answer, question })) return;

  renderTodayQuestion(todayKey);
  showToast("記録しました");
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

function renderCalendarDay(dateKey, day, todayKey) {
  const record = getRecord(dateKey);
  const classes = ["cal-day"];
  const states = [];
  const marks = [];

  if (dateKey === todayKey) {
    classes.push("is-today");
    states.push("今日");
  }
  if (dateKey > todayKey) classes.push("is-future");

  if (record && record.task) {
    if (record.completed) {
      classes.push("is-done");
      marks.push('<span class="mark-done">✓</span>');
      states.push("できた");
    } else {
      marks.push('<span class="mark-task"></span>');
      states.push("やることを決めた");
    }
  }
  if (record && record.answer) {
    marks.push('<span class="mark-answer"></span>');
    states.push("問いに答えた");
  }

  const label = [formatJapaneseDate(dateKey), ...states].join("、");

  return `
    <button class="${classes.join(" ")}" type="button" data-action="open-day" data-date="${dateKey}"
      aria-label="${escapeHtml(label)}"${dateKey === todayKey ? ' aria-current="date"' : ""}>
      <span class="cal-date">${day}</span>
      <span class="cal-marks" aria-hidden="true">${marks.join("")}</span>
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
   日付の詳細・編集
   ========================================================== */

function openDayDetail(dateKey) {
  const todayKey = getToday();
  const record = getRecord(dateKey);
  const isFuture = dateKey > todayKey;

  ui.dialogDateKey = dateKey;
  el.dayDialogTitle.textContent = formatJapaneseDate(dateKey);
  el.dayDialogSub.textContent = getDialogSubtitle(dateKey, todayKey);
  el.dayDialogBody.innerHTML = isFuture
    ? renderFutureDayBody(record)
    : renderDayForm(dateKey, record, dateKey === todayKey);

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
  if (appData.startDate && dateKey >= appData.startDate) {
    const day = daysBetween(appData.startDate, dateKey) + 1;
    parts.push(day <= CHALLENGE_LENGTH ? `DAY ${day}` : `${day}日目`);
  }
  return parts.join("　");
}

function renderFutureDayBody(record) {
  const recordHtml = record
    ? `
      ${record.task ? `<div><p class="readonly-label">やること</p><p class="readonly-value">${escapeHtml(record.task)}</p></div>` : ""}
      ${record.answer ? `<div><p class="readonly-label">回答</p><p class="readonly-value">${escapeHtml(record.answer)}</p></div>` : ""}`
    : "";

  return `
    <div class="readonly-block">
      <p class="readonly-note">この日はまだ先です。記録はその日になったら書けます。<br>今日のことに集中しましょう。</p>
      ${recordHtml}
      <div class="dialog-actions">
        <button class="button button--secondary" type="button" data-action="close-dialog">閉じる</button>
      </div>
    </div>`;
}

function renderDayForm(dateKey, record, isToday) {
  const task = record ? record.task : "";
  const completed = Boolean(record && record.completed);
  const answer = record ? record.answer : "";
  const question = (record && record.question) || getQuestionForDate(dateKey);

  return `
    <form class="day-form" data-form="day-record" novalidate>
      <div class="field">
        <label class="field-label" for="day-task">${isToday ? "今日やること" : "この日やること"}</label>
        <input class="text-input" id="day-task" name="task" type="text" maxlength="100" autocomplete="off"
          value="${escapeHtml(task)}" aria-describedby="day-error">
      </div>
      <div class="check-field">
        <input id="day-completed" name="completed" type="checkbox"${completed ? " checked" : ""}>
        <label for="day-completed">できた</label>
      </div>
      <p class="field-error" id="day-error" role="alert" hidden></p>
      <div class="field">
        <p class="readonly-label">${isToday ? "今日の問い" : "この日の問い"}</p>
        <label class="question-text" for="day-answer">${escapeHtml(question)}</label>
        <textarea class="text-area" id="day-answer" name="answer" rows="4" maxlength="1000">${escapeHtml(answer)}</textarea>
      </div>
      <div class="dialog-actions">
        <button class="button button--text" type="button" data-action="close-dialog">閉じる</button>
        <button class="button button--primary" type="submit">保存する</button>
      </div>
    </form>`;
}

function saveDayRecord(form) {
  const dateKey = ui.dialogDateKey;
  if (!dateKey || dateKey > getToday()) return;

  const taskInput = form.elements.task;
  const errorElement = form.querySelector("#day-error");
  const task = taskInput.value.trim();
  const completed = form.elements.completed.checked;
  const answer = form.elements.answer.value.trim();

  if (completed && !task) {
    showFieldError(errorElement, taskInput, "「できた」にするには、やることを入力してください");
    return;
  }
  clearFieldError(errorElement, taskInput);

  const record = getRecord(dateKey);
  const question = (record && record.question) || getQuestionForDate(dateKey);
  if (!updateRecord(dateKey, { task, completed, answer, question })) return;

  closeDayDetail();
  renderCalendar();
  if (dateKey === getToday()) ui.isEditingTodayTask = false;
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
   ゴール
   ========================================================== */

function renderGoal() {
  const goal = appData.goal || { title: "", reason: "", feeling: "" };
  el.goalTitle.value = goal.title;
  el.goalReason.value = goal.reason;
  el.goalFeeling.value = goal.feeling;
  clearFieldError(document.getElementById("goal-error"), el.goalTitle);
  renderProgress();
}

function renderProgress() {
  const todayKey = getToday();
  const challengeDay = getChallengeDay(todayKey) || 1;
  const records = Object.entries(appData.records);
  const doneCount = records.filter(([, record]) => record.completed).length;
  const writtenCount = records.length;

  const daysHtml = challengeDay > CHALLENGE_LENGTH
    ? "100 DAYS COMPLETE"
    : `${challengeDay} <small>/ ${CHALLENGE_LENGTH} DAYS</small>`;

  const cells = [];
  if (appData.startDate) {
    for (let i = 0; i < CHALLENGE_LENGTH; i += 1) {
      const dateKey = addDays(appData.startDate, i);
      const record = getRecord(dateKey);
      const classes = [];
      if (dateKey <= todayKey) classes.push("is-passed");
      if (record && record.completed) classes.push("is-done");
      if (dateKey === todayKey) classes.push("is-today");
      cells.push(`<span class="${classes.join(" ")}"></span>`);
    }
  }

  el.goalProgress.innerHTML = `
    <p class="progress-days">${daysHtml}</p>
    <dl class="progress-stats">
      <div><dt>できた日</dt><dd>${doneCount}日</dd></div>
      <div><dt>記録した日</dt><dd>${writtenCount}日</dd></div>
    </dl>
    ${cells.length ? `<div class="day-grid" aria-hidden="true">${cells.join("")}</div>` : ""}
    ${appData.startDate ? `<p class="progress-start">はじめた日　${formatJapaneseFullDate(appData.startDate)}</p>` : ""}`;
}

function saveGoal(form) {
  const errorElement = document.getElementById("goal-error");
  const title = el.goalTitle.value.trim();

  if (!title) {
    showFieldError(errorElement, el.goalTitle, "今年叶えたいことを入力してください");
    return;
  }
  clearFieldError(errorElement, el.goalTitle);

  appData.goal = {
    title,
    reason: el.goalReason.value.trim(),
    feeling: el.goalFeeling.value.trim()
  };
  if (!appData.startDate) appData.startDate = getToday();
  if (!saveData()) return;

  renderGoal();
  showToast("保存しました");
}

function resetAllData() {
  const confirmed = window.confirm("すべての記録を削除しますか？\nこの操作は元に戻せません。");
  if (!confirmed) return;

  clearData();
  ui.isEditingTodayTask = false;
  resetCalendarToCurrentMonth();
  showOnboarding();
}

/* ==========================================================
   初回設定
   ========================================================== */

function completeOnboarding(form) {
  const input = form.elements.goal;
  const errorElement = document.getElementById("onboarding-error");
  const title = input.value.trim();

  if (!title) {
    showFieldError(errorElement, input, "今年叶えたいことを入力してください");
    return;
  }
  clearFieldError(errorElement, input);

  appData.goal = { title, reason: "", feeling: "" };
  appData.startDate = appData.startDate || getToday();
  if (!saveData()) return;

  showApp();
  showView("today");
}

/* ==========================================================
   イベント
   ========================================================== */

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  switch (target.dataset.action) {
    case "navigate":
      if (target.dataset.target === "calendar" && ui.view !== "calendar") resetCalendarToCurrentMonth();
      showView(target.dataset.target);
      break;
    case "toggle-complete":
      toggleTaskComplete();
      break;
    case "edit-task":
      startEditTodayTask();
      break;
    case "cancel-edit-task":
      cancelEditTodayTask();
      break;
    case "prev-month":
      moveCalendarMonth(-1);
      break;
    case "next-month":
      moveCalendarMonth(1);
      break;
    case "current-month":
      resetCalendarToCurrentMonth();
      renderCalendar();
      break;
    case "open-day":
      openDayDetail(target.dataset.date);
      break;
    case "close-dialog":
      closeDayDetail();
      break;
    case "reset-data":
      resetAllData();
      break;
    default:
      break;
  }
}

function handleSubmit(event) {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();

  switch (form.dataset.form) {
    case "onboarding":
      completeOnboarding(form);
      break;
    case "today-task":
      saveTodayTask(form);
      break;
    case "today-answer":
      saveDailyAnswer(form);
      break;
    case "day-record":
      saveDayRecord(form);
      break;
    case "goal":
      saveGoal(form);
      break;
    default:
      break;
  }
}

/* 日付をまたいでアプリに戻ってきたときは、新しい日の画面にする */
function handleVisibilityChange() {
  if (document.visibilityState !== "visible" || el.app.hidden) return;
  if (getToday() === ui.renderedToday) return;

  ui.isEditingTodayTask = false;
  if (ui.view === "today") renderToday();
  if (ui.view === "calendar") renderCalendar();
  if (ui.view === "goal") renderProgress();
  ui.renderedToday = getToday();
}

function bindEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  /* ダイアログの外側を押したら閉じる */
  el.dayDialog.addEventListener("click", (event) => {
    if (event.target === el.dayDialog) closeDayDetail();
  });
  el.dayDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDayDetail();
  });
}

function init() {
  bindEvents();

  if (!appData.goal) {
    showOnboarding();
    return;
  }
  if (!appData.startDate) {
    appData.startDate = getToday();
    saveData();
  }
  showApp();
  showView("today");
}

init();
