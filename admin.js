import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDKPpHKR1bPVqPNGx4jpvsaPJhcGVoTYlc",
    authDomain: "abuelito-b5c2f.firebaseapp.com",
    projectId: "abuelito-b5c2f",
    storageBucket: "abuelito-b5c2f.firebasestorage.app",
    messagingSenderId: "1053612058840",
    appId: "1:1053612058840:web:ce33518b733ceac6908fad"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ledgerDocRef = doc(db, "ledger", "state");

const monthNames = ["January", "February", "March", "April", "May", "June",
                     "July", "August", "September", "October", "November", "December"];
const monthAbbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let viewYear = new Date().getFullYear();


/* ============================================
   DATE HELPERS -- MONTHLY
   (same as script.js -- copied over since this
   is a separate file)
   ============================================ */
function getMonthKey(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    return year + '-' + (month < 10 ? '0' + month : month);
}

function howManyMonthsPassed(startKey, currentKey) {
    const startParts = startKey.split('-');
    const currentParts = currentKey.split('-');

    const startYear = Number(startParts[0]);
    const startMonthNum = Number(startParts[1]);
    const currentYear = Number(currentParts[0]);
    const currentMonthNum = Number(currentParts[1]);

    const yearsPassed = currentYear - startYear;
    return (yearsPassed * 12) + (currentMonthNum - startMonthNum);
}

function whoseTurnIsIt(names, monthsPassed) {
    let index = 0;

    for (let i = 0; i < monthsPassed; i++) {
        index = index + 1;

        if (index >= names.length) {
            index = 0;
        }
    }

    return names[index];
}

// turns "2026-08" into "August 2026"
function monthLabelFromKey(key) {
    const parts = key.split('-');
    const year = Number(parts[0]);
    const monthNum = Number(parts[1]);
    return `${monthNames[monthNum - 1]} ${year}`;
}


/* ============================================
   DATE HELPERS -- WEEKLY
   a "week key" is the Monday of that week,
   written as "YYYY-MM-DD"
   ============================================ */
function getWeekKey(date) {
    const d = new Date(date);
    const dayOfWeek = d.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    d.setDate(d.getDate() + diffToMonday);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function howManyWeeksPassed(startKey, currentKey) {
    const start = new Date(startKey);
    const current = new Date(currentKey);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysPassed = Math.round((current - start) / msPerDay);

    return Math.floor(daysPassed / 7);
}

function whoseWeekIsIt(names, weeksPassed) {
    let index = 0;

    for (let i = 0; i < weeksPassed; i++) {
        index = index + 1;

        if (index >= names.length) {
            index = 0;
        }
    }

    return names[index];
}

// turns "2026-08-17" into "week of Aug 17, 2026"
function weekLabelFromKey(key) {
    const d = new Date(key);
    const day = d.getDate();
    const monthIndex = d.getMonth();
    const year = d.getFullYear();

    return `week of ${monthAbbr[monthIndex]} ${day}, ${year}`;
}


/* ============================================
   SAVING + LOADING
   these are "async" now -- they take a moment
   to finish since they're reaching out to
   Firestore instead of reading this browser's
   storage instantly. Same document as script.js,
   so both pages share the same data.
   ============================================ */
async function loadState() {
    const snap = await getDoc(ledgerDocRef);

    if (snap.exists()) {
        const data = snap.data();

        // older saved data (from before weekly rotations existed) won't have
        // these fields at all -- fill them in so nothing crashes reading them
        if (!data.weeklyRotation) {
            data.weeklyRotation = [];
        }
        if (!data.weeklyRecords) {
            data.weeklyRecords = {};
        }

        return data;
    }

    return {
        rotation: [],
        startMonth: null,
        records: {},
        weeklyRotation: [],
        weeklyStartWeek: null,
        weeklyRecords: {}
    };
}

async function saveState(state) {
    await setDoc(ledgerDocRef, state);
}


/* ============================================
   PIN LOCK
   first time ever: shows a form to add names + set a PIN
   every time after: just asks for the PIN
   ============================================ */
async function renderPinGate() {
    const state = await loadState();
    const gate = document.querySelector('#pinGate');
    const creating = !state.pin;

    gate.innerHTML = `
        ${creating
            ? `<p>No rotation exists yet. Add the family names and set a PIN.</p>
               <label>Names (one per line, in rotation order)</label>
               <textarea id="namesInput" placeholder="Rosita&#10;Javier&#10;Ofelia"></textarea>`
            : `<p>Enter your admin PIN to manage the rotation.</p>`
        }
        <div class="pin-input-row">
            <input id="pinField" type="password" inputmode="numeric" maxlength="6" placeholder="PIN">
            <button type="button" id="togglePinBtn" class="toggle-pin-btn">Show</button>
        </div>
        <button id="pinSubmit">${creating ? 'Create rotation' : 'Unlock'}</button>
    `;

    document.querySelector('#togglePinBtn').addEventListener('click', function () {
        const pinField = document.querySelector('#pinField');

        if (pinField.type === 'password') {
            pinField.type = 'text';
            this.textContent = 'Hide';
        } else {
            pinField.type = 'password';
            this.textContent = 'Show';
        }
    });

    document.querySelector('#pinSubmit').addEventListener('click', async function () {
        const pinVal = document.querySelector('#pinField').value.trim();

        if (!pinVal) {
            return;
        }

        if (creating) {
            const raw = document.querySelector('#namesInput').value;

            // split into lines, trim each one, and drop any blank lines
            const names = raw.split('\n')
                .map(line => line.trim())
                .filter(line => line !== '');

            if (names.length < 2) {
                alert('Add at least two names.');
                return;
            }

            state.rotation = names;
            state.startMonth = new Date().getFullYear() + '-01'; // anchor to January, since each person owns fixed months every year
            state.pin = pinVal;
            await saveState(state);
            unlockAdmin();
        } else {
            if (pinVal === state.pin) {
                unlockAdmin();
            } else {
                alert("That PIN doesn't match.");
            }
        }
    });
}

function unlockAdmin() {
    document.querySelector('#pinSection').hidden = true;
    document.querySelector('#manageSection').hidden = false;
    document.querySelector('#weeklyManageSection').hidden = false;
    document.querySelector('#yearSection').hidden = false;
    document.querySelector('#historySection').hidden = false;
    document.querySelector('#resetSection').hidden = false;

    renderPayerList();
    renderWeeklyPayerList();
    renderYearGrid();
    renderHistory();
}


/* ============================================
   ROTATION LIST -- add / remove / reorder (MONTHLY)
   ============================================ */
async function renderPayerList() {
    const state = await loadState();
    const list = document.querySelector('#payerList');

    list.innerHTML = state.rotation.map((name, index) => `
        <div class="payer-row">
            <span>${index + 1}. ${name}</span>
            <div class="payer-actions">
                <button data-up="${index}">&uarr;</button>
                <button data-down="${index}">&darr;</button>
                <button class="remove-btn" data-remove="${index}">Remove</button>
            </div>
        </div>
    `).join('');

    // querySelectorAll gives back a list, so we use forEach on each group of buttons
    list.querySelectorAll('[data-up]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            moveUp(Number(btn.dataset.up));
        });
    });

    list.querySelectorAll('[data-down]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            moveDown(Number(btn.dataset.down));
        });
    });

    list.querySelectorAll('[data-remove]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            removePerson(Number(btn.dataset.remove));
        });
    });
}

async function moveUp(index) {
    if (index === 0) {
        return;
    }

    const state = await loadState();
    const temp = state.rotation[index - 1];
    state.rotation[index - 1] = state.rotation[index];
    state.rotation[index] = temp;

    await saveState(state);
    renderPayerList();
    renderYearGrid();
}

async function moveDown(index) {
    const state = await loadState();

    if (index === state.rotation.length - 1) {
        return;
    }

    const temp = state.rotation[index + 1];
    state.rotation[index + 1] = state.rotation[index];
    state.rotation[index] = temp;

    await saveState(state);
    renderPayerList();
    renderYearGrid();
}

async function removePerson(index) {
    const state = await loadState();

    if (state.rotation.length <= 2) {
        alert('Keep at least two people in the rotation.');
        return;
    }

    if (!confirm('Remove this person from the rotation?')) {
        return;
    }

    state.rotation = state.rotation.filter((name, i) => i !== index);

    await saveState(state);
    renderPayerList();
    renderYearGrid();
}

function setupAddPayerButton() {
    const addPayerBtn = document.querySelector('#addPayerBtn');

    addPayerBtn.addEventListener('click', async function () {
        const input = document.querySelector('#newPayerName');
        const name = input.value.trim();

        if (name === '') {
            return;
        }

        const state = await loadState();
        state.rotation.push(name);
        await saveState(state);

        input.value = '';
        renderPayerList();
        renderYearGrid();
    });
}


/* ============================================
   ROTATION LIST -- add / remove / reorder (WEEKLY)
   same pattern as the monthly one above, just
   pointed at weeklyRotation instead of rotation
   ============================================ */
async function renderWeeklyPayerList() {
    const state = await loadState();
    const list = document.querySelector('#weeklyPayerList');
    const weeklyRotation = state.weeklyRotation || [];

    if (weeklyRotation.length === 0) {
        list.innerHTML = '<p>No one in the weekly rotation yet -- add names below.</p>';
        return;
    }

    list.innerHTML = weeklyRotation.map((name, index) => `
        <div class="payer-row">
            <span>${index + 1}. ${name}</span>
            <div class="payer-actions">
                <button data-weekly-up="${index}">&uarr;</button>
                <button data-weekly-down="${index}">&darr;</button>
                <button class="remove-btn" data-weekly-remove="${index}">Remove</button>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('[data-weekly-up]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            moveWeeklyUp(Number(btn.dataset.weeklyUp));
        });
    });

    list.querySelectorAll('[data-weekly-down]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            moveWeeklyDown(Number(btn.dataset.weeklyDown));
        });
    });

    list.querySelectorAll('[data-weekly-remove]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            removeWeeklyPerson(Number(btn.dataset.weeklyRemove));
        });
    });
}

async function moveWeeklyUp(index) {
    if (index === 0) {
        return;
    }

    const state = await loadState();
    const temp = state.weeklyRotation[index - 1];
    state.weeklyRotation[index - 1] = state.weeklyRotation[index];
    state.weeklyRotation[index] = temp;

    await saveState(state);
    renderWeeklyPayerList();
    renderHistory();
}

async function moveWeeklyDown(index) {
    const state = await loadState();

    if (index === state.weeklyRotation.length - 1) {
        return;
    }

    const temp = state.weeklyRotation[index + 1];
    state.weeklyRotation[index + 1] = state.weeklyRotation[index];
    state.weeklyRotation[index] = temp;

    await saveState(state);
    renderWeeklyPayerList();
    renderHistory();
}

async function removeWeeklyPerson(index) {
    const state = await loadState();

    if (state.weeklyRotation.length <= 2) {
        alert('Keep at least two people in the weekly rotation.');
        return;
    }

    if (!confirm('Remove this person from the weekly rotation?')) {
        return;
    }

    state.weeklyRotation = state.weeklyRotation.filter((name, i) => i !== index);

    await saveState(state);
    renderWeeklyPayerList();
    renderHistory();
}

// adds one or more names at once -- supports typing one name and
// clicking Add (or pressing Enter), OR pasting several names
// separated by line breaks, same as the initial setup form does
async function addWeeklyNames() {
    const input = document.querySelector('#newWeeklyPayerName');
    const raw = input.value;

    const names = raw.split('\n')
        .map(line => line.trim())
        .filter(line => line !== '');

    if (names.length === 0) {
        return;
    }

    const state = await loadState();
    const startingFromEmpty = !state.weeklyRotation || state.weeklyRotation.length === 0;

    if (!state.weeklyRotation) {
        state.weeklyRotation = [];
    }

    for (const name of names) {
        state.weeklyRotation.push(name);
    }

    // first names ever added anchor the rotation to the current week,
    // the same way the monthly one anchors to January on setup
    if (startingFromEmpty) {
        state.weeklyStartWeek = getWeekKey(new Date());
    }

    await saveState(state);

    input.value = '';
    renderWeeklyPayerList();
    renderHistory();
}

function setupAddWeeklyPayerButton() {
    const addBtn = document.querySelector('#addWeeklyPayerBtn');
    const input = document.querySelector('#newWeeklyPayerName');

    addBtn.addEventListener('click', function () {
        addWeeklyNames();
    });

    // pressing Enter in the field also adds it, no need to click the button
    input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            addWeeklyNames();
        }
    });
}


/* ============================================
   YEAR OVERVIEW -- click a month to edit it
   ============================================ */
async function renderYearGrid() {
    const state = await loadState();
    const currentKey = getMonthKey(new Date());

    document.querySelector('#yearLabel').textContent = viewYear;

    const months = [];

    for (let i = 0; i < 12; i++) {
        const monthNum = i + 1;
        const key = viewYear + '-' + (monthNum < 10 ? '0' + monthNum : monthNum);
        const record = state.records[key];

        const name = record
            ? record.name
            : whoseTurnIsIt(state.rotation, howManyMonthsPassed(state.startMonth, key));

        months.push({
            key: key,
            label: monthAbbr[i],
            name: name,
            paid: record ? record.paid : false,
            isCurrent: key === currentKey
        });
    }

    const grid = document.querySelector('#yearGrid');

    grid.innerHTML = months.map(m => `
        <div class="month-cell clickable ${m.isCurrent ? 'is-current' : ''}" data-key="${m.key}">
            <p class="m-label">${m.label}</p>
            <p class="m-name">${m.name}</p>
            <p class="${m.paid ? 'paid-tag' : 'unpaid-tag'}">${m.paid ? 'paid' : 'unpaid'}</p>
        </div>
    `).join('');

    grid.querySelectorAll('[data-key]').forEach(function (cell) {
        cell.addEventListener('click', function () {
            openEditPanel('month', cell.dataset.key);
        });
    });
}

function setupYearNavButtons() {
    document.querySelector('#yearPrev').addEventListener('click', function () {
        viewYear = viewYear - 1;
        renderYearGrid();
    });

    document.querySelector('#yearNext').addEventListener('click', function () {
        viewYear = viewYear + 1;
        renderYearGrid();
    });
}


/* ============================================
   EDIT PANEL -- works for BOTH a month and a
   week, depending on which "type" is passed in
   ============================================ */
async function openEditPanel(type, key) {
    const state = await loadState();
    const isWeek = type === 'week';

    const names = isWeek ? state.weeklyRotation : state.rotation;
    const records = isWeek ? state.weeklyRecords : state.records;
    const record = records[key];

    const currentName = record
        ? record.name
        : (isWeek
            ? whoseWeekIsIt(names, howManyWeeksPassed(state.weeklyStartWeek, key))
            : whoseTurnIsIt(names, howManyMonthsPassed(state.startMonth, key)));

    const isPaid = record ? record.paid : false;
    const currentAmount = (!isWeek && record && record.amount) ? record.amount : '';
    const label = isWeek ? weekLabelFromKey(key) : monthLabelFromKey(key);

    const optionsHtml = names.map(name => `
        <option value="${name}" ${name === currentName ? 'selected' : ''}>${name}</option>
    `).join('');

    const panel = document.querySelector('#editPanel');
    panel.hidden = false;

    panel.innerHTML = `
        <label>Editing ${label}</label>
        <select id="editName">${optionsHtml}</select>
        <div class="checkbox-row">
            <input type="checkbox" id="editPaid" ${isPaid ? 'checked' : ''}>
            <label for="editPaid" style="margin:0;">Marked as paid</label>
        </div>
        ${isWeek ? '' : `
            <label>Amount</label>
            <input id="editAmount" type="text" inputmode="decimal" placeholder="amount" value="${currentAmount}">
        `}
        <div class="row">
            <button id="editCancel">Cancel</button>
            <button id="editSave">Save</button>
        </div>
    `;

    document.querySelector('#editCancel').addEventListener('click', function () {
        panel.hidden = true;
    });

    document.querySelector('#editSave').addEventListener('click', async function () {
        const chosenName = document.querySelector('#editName').value;
        const chosenPaid = document.querySelector('#editPaid').checked;

        const freshState = await loadState();
        const freshRecords = isWeek ? freshState.weeklyRecords : freshState.records;
        const existing = freshRecords[key];

        const newRecord = {
            name: chosenName,
            paid: chosenPaid,
            paidAt: chosenPaid ? (existing && existing.paidAt ? existing.paidAt : new Date().toISOString()) : null
        };

        if (!isWeek) {
            newRecord.amount = document.querySelector('#editAmount').value;
        }

        freshRecords[key] = newRecord;

        await saveState(freshState);
        panel.hidden = true;
        renderYearGrid();
        renderHistory();
    });
}


/* ============================================
   HISTORY -- shows BOTH monthly and weekly
   payments together, sorted by actual date,
   each with its own edit link
   ============================================ */
async function renderHistory() {
    const state = await loadState();
    const currentMonthKey = getMonthKey(new Date());
    const currentWeekKey = getWeekKey(new Date());

    const list = document.querySelector('#historyList');

    const monthlyEntries = Object.keys(state.records)
        .filter(key => key !== currentMonthKey)
        .map(key => ({
            type: 'month',
            key: key,
            sortDate: new Date(key + '-01'),
            label: `${monthLabelFromKey(key)} (monthly)`,
            record: state.records[key]
        }));

    const weeklyEntries = Object.keys(state.weeklyRecords || {})
        .filter(key => key !== currentWeekKey)
        .map(key => ({
            type: 'week',
            key: key,
            sortDate: new Date(key),
            label: `${weekLabelFromKey(key)} (weekly)`,
            record: state.weeklyRecords[key]
        }));

    const allEntries = monthlyEntries.concat(weeklyEntries)
        .sort((a, b) => b.sortDate - a.sortDate);

    if (allEntries.length === 0) {
        list.innerHTML = '<p>No past months or weeks yet.</p>';
        return;
    }

    list.innerHTML = allEntries.map(entry => {
        const record = entry.record;
        const statusClass = record.paid ? 'paid-tag' : 'unpaid-tag';
        const statusText = record.paid ? 'PAID' : 'unpaid';
        const amountText = record.amount ? ` — $${record.amount}` : '';

        return `
            <div class="history-row">
                <span>${record.name} — ${entry.label}${amountText}</span>
                <span class="${statusClass}">${statusText}</span>
                <button class="edit-link" data-edittype="${entry.type}" data-editkey="${entry.key}">edit</button>
            </div>
        `;
    }).join('');

    list.querySelectorAll('[data-editkey]').forEach(function (link) {
        link.addEventListener('click', function () {
            openEditPanel(link.dataset.edittype, link.dataset.editkey);
        });
    });
}


/* ============================================
   START OVER -- wipes everything saved
   ============================================ */
function setupResetButton() {
    const resetBtn = document.querySelector('#resetAllBtn');

    resetBtn.addEventListener('click', async function () {
        const sure = confirm('This erases the rotation, PIN, and all saved months. Are you sure?');

        if (sure) {
            await deleteDoc(ledgerDocRef);
            location.reload();
        }
    });
}


/* ============================================
   RUN EVERYTHING
   ============================================ */
renderPinGate();
setupAddPayerButton();
setupAddWeeklyPayerButton();
setupYearNavButtons();
setupResetButton();