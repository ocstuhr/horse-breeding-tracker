const form = document.getElementById("breeding-form");
const breedingYearInput = document.getElementById("breedingYearInput");
const sireInput = document.getElementById("sireInput");
const damInput = document.getElementById("damInput");
const breedingDate1Input = document.getElementById("breedingDate1Input");
const breedingDate2Input = document.getElementById("breedingDate2Input");
const breedingDate3Input = document.getElementById("breedingDate3Input");
const confirmedInFoalDateInput = document.getElementById("confirmedInFoalDateInput");
const statusSelect = document.getElementById("statusSelect");
const actualFoalingDateInput = document.getElementById("actualFoalingDateInput");
const stationNameInput = document.getElementById("stationNameInput");
const stationPhoneInput = document.getElementById("stationPhoneInput");
const collectionScheduleInput = document.getElementById("collectionScheduleInput");
const foalingDateDisplay = document.getElementById("foalingDateDisplay");
const shotDateInput = document.getElementById("shotDateInput");
const shotNameInput = document.getElementById("shotNameInput");
const notesInput = document.getElementById("notesInput");
const addShotButton = document.getElementById("addShotButton");
const shotList = document.getElementById("shotList");
const recordsList = document.getElementById("recordsList");
const clearDataButton = document.getElementById("clearDataButton");
const newRecordButton = document.getElementById("newRecordButton");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");
const registerButton = document.getElementById("registerButton");
const logoutButton = document.getElementById("logoutButton");
const authStatusText = document.getElementById("authStatusText");
const authForm = document.getElementById("authForm");
const authMessage = document.getElementById("authMessage");
const signinPanel = document.getElementById("signinPanel");
const goToMainButton = document.getElementById("goToMainButton");
const backToMainButton = document.getElementById("backToMainButton");
const mainView = document.getElementById("mainView");
const detailView = document.getElementById("detailView");
const formView = document.getElementById("formView");
const damYearsView = document.getElementById("damYearsView");
const damList = document.getElementById("damList");
const activeRecordContent = document.getElementById("activeRecordContent");
const damYearsList = document.getElementById("damYearsList");
const damYearsHeading = document.getElementById("damYearsHeading");
const formHeading = document.getElementById("formHeading");
const submitButton = document.getElementById("submitButton");
const backToDamsButton = document.getElementById("backToDamsButton");
const clearDataButtonTwo = document.getElementById("clearDataButtonTwo");

let currentShots = [];
let selectedRecordId = null;
let editingRecordId = null;
let selectedDamName = null;
let authUser = null;
let records = loadRecords();

function loadRecords() {
  const saved = localStorage.getItem("horse-breeding-tracker-records");
  return saved ? JSON.parse(saved) : [];
}

function saveLocalRecords() {
  localStorage.setItem("horse-breeding-tracker-records", JSON.stringify(records));
}

async function saveRecords() {
  saveLocalRecords();

  if (!authUser) {
    return;
  }

  try {
    await fetchJson("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(records),
    });
  } catch (error) {
    authMessage.textContent = `Could not sync online: ${error.message}`;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(options.headers || {}) },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function setAuthUi(user, message = "") {
  authUser = user;
  authMessage.textContent = message;
  authStatusText.textContent = user ? `Signed in as ${user.username}.` : "Create an account or sign in to save breeding records online.";
  logoutButton.hidden = !user;
  authForm.hidden = !!user;
  signinPanel.hidden = !!user;

  if (user) {
    showMainView();
  } else {
    showAuthView();
  }
}

function loadRecordsFromLocalStorage() {
  const saved = localStorage.getItem("horse-breeding-tracker-records");
  records = saved ? JSON.parse(saved) : [];
}

async function loadRecordsFromServer() {
  try {
    const payload = await fetchJson("/api/records");
    records = payload.records || [];
    saveLocalRecords();
    renderDamList();
    renderDamYearsView();
    renderActiveRecord();
  } catch (error) {
    loadRecordsFromLocalStorage();
    renderDamList();
    renderDamYearsView();
    renderActiveRecord();
    authMessage.textContent = `Could not load online records: ${error.message}`;
  }
}

async function initializeAuth() {
  loadRecordsFromLocalStorage();
  renderDamList();
  renderDamYearsView();
  renderActiveRecord();
  setAuthUi(null, "");
}

async function handleLogin() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    authMessage.textContent = "Please enter both a username and password.";
    return;
  }

  try {
    const payload = await fetchJson("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setAuthUi(payload.user, "Signed in successfully.");
    await loadRecordsFromServer();
    showMainView();
  } catch (error) {
    authMessage.textContent = error.message;
  }
}

async function handleRegister() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    authMessage.textContent = "Please enter both a username and password.";
    return;
  }

  try {
    const payload = await fetchJson("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setAuthUi(payload.user, "Account created successfully.");
    await loadRecordsFromServer();
    showMainView();
  } catch (error) {
    authMessage.textContent = error.message;
  }
}

async function handleLogout() {
  try {
    await fetchJson("/api/logout", { method: "POST" });
  } catch (error) {
    // Ignore logout failures and still clear the UI.
  }

  setAuthUi(null, "Signed out.");
  loadRecordsFromLocalStorage();
  renderDamList();
  renderDamYearsView();
  renderActiveRecord();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function calculateExpectedFoalingDate(dateValue) {
  if (!dateValue) return null;

  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + 340);
  return date.toISOString().slice(0, 10);
}

function getLatestBreedingDate() {
  return [breedingDate3Input.value, breedingDate2Input.value, breedingDate1Input.value].find(Boolean) || "";
}

function updateFoalingDateDisplay() {
  const baseDate = getLatestBreedingDate();
  if (!baseDate) {
    foalingDateDisplay.textContent = "—";
    return;
  }

  const expectedDate = calculateExpectedFoalingDate(baseDate);
  foalingDateDisplay.textContent = expectedDate ? formatDate(expectedDate) : "—";
}

function renderShots() {
  shotList.innerHTML = "";

  if (currentShots.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No shots added yet.";
    shotList.appendChild(empty);
    return;
  }

  currentShots.forEach((shot) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${shot.name}</strong><span>${formatDate(shot.date)}</span>`;
    shotList.appendChild(item);
  });
}

function renderDamList() {
  if (records.length === 0) {
    damList.innerHTML = '<div class="empty-state">No dams yet. Create a new record to begin.</div>';
    return;
  }

  const uniqueDams = [...new Set(records.map((record) => record.dam).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  damList.innerHTML = "";

  uniqueDams.forEach((damName) => {
    const wrapper = document.createElement("div");
    wrapper.className = "record-card";

    const card = document.createElement("button");
    card.type = "button";
    card.className = "record-card-button";
    card.innerHTML = `<h3>${damName}</h3>`;
    card.addEventListener("click", () => openDamYearsView(damName));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "secondary delete-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteRecordByDam(damName);
    });

    wrapper.appendChild(card);
    wrapper.appendChild(deleteButton);
    damList.appendChild(wrapper);
  });
}

function renderDamYearsView() {
  if (!selectedDamName) {
    damYearsList.innerHTML = '<div class="empty-state">Select a dam to view breeding years.</div>';
    return;
  }

  const damRecords = records.filter((record) => record.dam === selectedDamName);
  if (damRecords.length === 0) {
    damYearsList.innerHTML = '<div class="empty-state">No breeding records found for this dam.</div>';
    return;
  }

  const years = [...new Set(damRecords.map((record) => record.breedingYear || "No year entered"))].sort((a, b) => {
    if (a === "No year entered") return 1;
    if (b === "No year entered") return -1;
    return Number(a) - Number(b);
  });

  damYearsList.innerHTML = "";
  years.forEach((year) => {
    const record = damRecords.find((item) => (item.breedingYear || "No year entered") === year);
    if (!record) return;

    const wrapper = document.createElement("div");
    wrapper.className = "record-card";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "record-card-button";
    button.innerHTML = `<h3>${year}</h3>`;
    button.addEventListener("click", () => openRecordDetail(record.id));

    wrapper.appendChild(button);
    damYearsList.appendChild(wrapper);
  });
}

function renderActiveRecord() {
  if (!selectedRecordId) {
    activeRecordContent.innerHTML = '<div class="empty-state">Select a dam to view details.</div>';
    return;
  }

  const record = records.find((item) => item.id === selectedRecordId);
  if (!record) {
    selectedRecordId = null;
    renderActiveRecord();
    return;
  }

  activeRecordContent.innerHTML = `
    <article class="record-card">
      <h3>${record.sire} × ${record.dam}</h3>
      <div class="record-meta">
        <span>Breeding year: ${record.breedingYear || "—"}</span>
        <span>Breeding dates: ${[record.breedingDate1, record.breedingDate2, record.breedingDate3].filter(Boolean).map((date) => formatDate(date)).join(" • ") || "—"}</span>
        <span>Confirmed in foal: ${formatDate(record.confirmedInFoalDate)}</span>
        <span>Station: ${record.stationName || "—"}</span>
        <span>Station: ${record.stationName || "—"}</span>
        <span>Status: ${record.status || "Open"}</span>
        <span>Expected foaling: ${formatDate(record.expectedFoalingDate)}</span>
        <span>Actual foaling: ${formatDate(record.actualFoalingDate)}</span>
      </div>
      <div class="shot-section">
        <h4>Shot record</h4>
        <ul class="shot-list">
          ${record.shots.length > 0 ? record.shots.map((shot) => `<li><strong>${shot.name}</strong><span>${formatDate(shot.date)}</span></li>`).join("") : '<li class="empty-state">No shots recorded.</li>'}
        </ul>
      </div>
      <div class="shot-section">
        <h4>Notes</h4>
        <p>${record.notes ? record.notes.replace(/\n/g, "<br>") : "No notes added."}</p>
      </div>
    </article>
  `;
}

function resetFormForNewRecord() {
  form.reset();
  currentShots = [];
  editingRecordId = null;
  formHeading.textContent = "Add breeding record";
  submitButton.textContent = "Save breeding record";
  renderShots();
  updateFoalingDateDisplay();
}

function populateForm(record) {
  breedingYearInput.value = record.breedingYear || "";
  sireInput.value = record.sire || "";
  damInput.value = record.dam || "";
  breedingDate1Input.value = record.breedingDate1 || "";
  breedingDate2Input.value = record.breedingDate2 || "";
  breedingDate3Input.value = record.breedingDate3 || "";
  confirmedInFoalDateInput.value = record.confirmedInFoalDate || "";
  actualFoalingDateInput.value = record.actualFoalingDate || "";
  stationNameInput.value = record.stationName || "";
  stationPhoneInput.value = record.stationPhone || "";
  collectionScheduleInput.value = record.collectionSchedule || "";
  notesInput.value = record.notes || "";
  statusSelect.value = record.status || "Open";
  currentShots = [...(record.shots || [])];
  renderShots();
  updateFoalingDateDisplay();
}

function showAuthView() {
  signinPanel.hidden = false;
  mainView.hidden = true;
  detailView.hidden = true;
  formView.hidden = true;
  damYearsView.hidden = true;
}

function showMainView() {
  if (!authUser) {
    showAuthView();
    return;
  }

  signinPanel.hidden = true;
  mainView.hidden = false;
  detailView.hidden = true;
  formView.hidden = true;
  damYearsView.hidden = true;
}

function forceLandingView() {
  authUser = null;
  showAuthView();
}

function showFormView() {
  mainView.hidden = true;
  detailView.hidden = true;
  formView.hidden = false;
  damYearsView.hidden = true;
}

function showDamYearsView() {
  mainView.hidden = true;
  detailView.hidden = true;
  formView.hidden = true;
  damYearsView.hidden = false;
}

function openDamYearsView(damName) {
  selectedDamName = damName;
  damYearsHeading.textContent = `${damName} breeding years`;
  renderDamYearsView();
  showDamYearsView();
}

function openRecordDetail(recordId) {
  selectedRecordId = recordId;
  const record = records.find((item) => item.id === recordId);
  if (!record) return;

  populateForm(record);
  editingRecordId = record.id;
  formHeading.textContent = `Edit ${record.dam}`;
  submitButton.textContent = "Update record";
  showFormView();
}

function deleteRecord(recordId) {
  const confirmed = window.confirm("Delete this dam record?");
  if (!confirmed) return;

  records = records.filter((record) => record.id !== recordId);
  if (selectedRecordId === recordId) {
    selectedRecordId = null;
  }
  saveRecords();
  renderDamList();
  renderDamYearsView();
  renderActiveRecord();
}

function deleteRecordByDam(damName) {
  const confirmed = window.confirm(`Delete all records for ${damName}?`);
  if (!confirmed) return;

  records = records.filter((record) => record.dam !== damName);
  if (selectedDamName === damName) {
    selectedDamName = null;
  }
  if (selectedRecordId) {
    const selectedStillExists = records.some((record) => record.id === selectedRecordId);
    if (!selectedStillExists) {
      selectedRecordId = null;
    }
  }
  saveRecords();
  renderDamList();
  renderDamYearsView();
  renderActiveRecord();
}

breedingDate1Input.addEventListener("change", updateFoalingDateDisplay);
breedingDate2Input.addEventListener("change", updateFoalingDateDisplay);
breedingDate3Input.addEventListener("change", updateFoalingDateDisplay);
confirmedInFoalDateInput.addEventListener("change", updateFoalingDateDisplay);

addShotButton.addEventListener("click", () => {
  const shotDate = shotDateInput.value;
  const shotName = shotNameInput.value.trim();

  if (!shotDate || !shotName) {
    alert("Please enter both a shot date and a shot name.");
    return;
  }

  currentShots.push({ date: shotDate, name: shotName });
  shotDateInput.value = "";
  shotNameInput.value = "";
  renderShots();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const breedingYear = breedingYearInput.value.trim();
  const sire = sireInput.value.trim();
  const dam = damInput.value.trim();
  const breedingDate1 = breedingDate1Input.value;
  const breedingDate2 = breedingDate2Input.value;
  const breedingDate3 = breedingDate3Input.value;
  const confirmedInFoalDate = confirmedInFoalDateInput.value;
  const status = statusSelect.value;

  if (!sire || !dam || (!breedingDate1 && !breedingDate2 && !breedingDate3)) {
    alert("Please complete sire, dam, and at least one breeding date before saving.");
    return;
  }

  const recordData = {
    id: editingRecordId || (crypto.randomUUID ? crypto.randomUUID() : `record-${Date.now()}`),
    breedingYear,
    sire,
    dam,
    breedingDate1,
    breedingDate2,
    breedingDate3,
    confirmedInFoalDate,
    status,
    stationName: stationNameInput.value.trim(),
    stationPhone: stationPhoneInput.value.trim(),
    collectionSchedule: collectionScheduleInput.value,
    notes: notesInput.value.trim(),
    actualFoalingDate: actualFoalingDateInput.value,
    expectedFoalingDate: calculateExpectedFoalingDate([breedingDate3, breedingDate2, breedingDate1].find(Boolean) || ""),
    shots: currentShots,
  };

  if (editingRecordId) {
    records = records.map((record) => (record.id === editingRecordId ? recordData : record));
    selectedRecordId = editingRecordId;
  } else {
    records = [recordData, ...records];
  }

  saveRecords();
  renderDamList();
  renderActiveRecord();
  showMainView();
  resetFormForNewRecord();
});

function clearAllRecords() {
  if (!records.length) return;

  const confirmed = window.confirm("Remove all breeding records?");
  if (!confirmed) return;

  records = [];
  selectedRecordId = null;
  selectedDamName = null;
  saveRecords();
  renderDamList();
  renderDamYearsView();
  renderActiveRecord();
}

clearDataButton.addEventListener("click", clearAllRecords);
clearDataButtonTwo.addEventListener("click", clearAllRecords);
loginButton.addEventListener("click", handleLogin);
registerButton.addEventListener("click", handleRegister);
logoutButton.addEventListener("click", handleLogout);

newRecordButton.addEventListener("click", () => {
  showFormView();
  resetFormForNewRecord();
});

goToMainButton.addEventListener("click", () => {
  showMainView();
  resetFormForNewRecord();
});

backToMainButton.addEventListener("click", () => {
  showMainView();
  resetFormForNewRecord();
});

backToDamsButton.addEventListener("click", () => {
  showMainView();
  resetFormForNewRecord();
});

updateFoalingDateDisplay();
renderShots();
renderDamList();
renderDamYearsView();
renderActiveRecord();
forceLandingView();
resetFormForNewRecord();
void initializeAuth();
