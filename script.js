import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                     "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthAbbr = ["ene", "feb", "mar", "abr", "may", "jun",
                    "jul", "ago", "sep", "oct", "nov", "dic"];


/* ============================================
   DATE HELPERS -- MONTHLY
   ============================================ */
function getMonthKey(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JS counts months from 0

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

// steps forward one name at a time, one step per month that has passed
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

function formatMonthLabel(date) {
    const monthIndex = date.getMonth();
    const year = date.getFullYear();
    return `${monthNames[monthIndex]} de ${year}`;
}

// turns "2026-07" into "julio de 2026" -- for past months where we
// only have the key saved, not an actual Date object
function monthLabelFromKey(key) {
    const parts = key.split('-');
    const year = Number(parts[0]);
    const monthNum = Number(parts[1]);
    return `${monthNames[monthNum - 1]} de ${year}`;
}


/* ============================================
   DATE HELPERS -- WEEKLY
   a "week key" is the Monday of that week,
   written as "YYYY-MM-DD" -- e.g. "2026-08-17"
   ============================================ */
function getWeekKey(date) {
    const d = new Date(date);
    const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday

    // shift back to that week's Monday
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

// same stepping logic as whoseTurnIsIt, just a separate copy so
// it's clear which one is for months and which is for weeks
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

// turns a week key like "2026-08-17" into "semana del 17 de agosto de 2026"
function weekLabelFromKey(key) {
    const d = new Date(key);
    const day = d.getDate();
    const monthIndex = d.getMonth();
    const year = d.getFullYear();

    return `semana del ${day} de ${monthNames[monthIndex]} de ${year}`;
}


/* ============================================
   SAVING + LOADING
   these are "async" -- meaning they take a
   moment to finish, since they're reaching out
   to Firestore over the internet instead of
   reading instantly from this browser
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
        rotation: ["Rosita", "Javier", "Ofelia", "Maricela", "Lilia", "Fausto"],
        startMonth: "2026-01",
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
   BUILDING EACH PART OF THE PAGE -- MONTHLY
   ============================================ */
function renderCurrentCard(record, monthLabel) {
    document.querySelector('#currentName').textContent = record.name;
    document.querySelector('#currentMonth').textContent = monthLabel;
    document.querySelector('#amountInput').value = record.amount || '';

    const payBtn = document.querySelector('#payBtn');
    const confirmBadge = document.querySelector('#confirmBadge');

    if (record.paid) {
        payBtn.disabled = true;
        payBtn.textContent = 'Ya está pagado';
        confirmBadge.hidden = false;
        confirmBadge.textContent = '✓ marcado como pagado';
    } else {
        payBtn.disabled = false;
        payBtn.textContent = 'Marcar como pagado';
        confirmBadge.hidden = true;
    }
}

// builds the 12 month boxes: a for loop collects the data for each month,
// then .map() + a template literal turns that data into HTML
function renderYearGrid(state, year, currentKey) {
    const months = [];

    for (let i = 0; i < 12; i++) {
        const monthNum = i + 1;
        const key = year + '-' + (monthNum < 10 ? '0' + monthNum : monthNum);
        const record = state.records[key];

        const name = record
            ? record.name
            : whoseTurnIsIt(state.rotation, howManyMonthsPassed(state.startMonth, key));

        months.push({
            label: monthAbbr[i],
            name: name,
            paid: record ? record.paid : false,
            isCurrent: key === currentKey
        });
    }

    const grid = document.querySelector('#yearGrid');

    grid.innerHTML = months.map(m => `
        <div class="month-cell ${m.isCurrent ? 'is-current' : ''}">
            <p class="m-label">${m.label}</p>
            <p class="m-name">${m.name}</p>
            <p class="${m.paid ? 'paid-tag' : 'unpaid-tag'}">${m.paid ? 'pagado' : 'pendiente'}</p>
        </div>
    `).join('');
}

// map() with an index this time, since we need "1. Rosita", "2. Javier"...
function renderRotationList(state) {
    const list = document.querySelector('#rotationList');

    list.innerHTML = state.rotation.map((name, index) => `
        <p>${index + 1}. ${name}</p>
    `).join('');
}


/* ============================================
   BUILDING EACH PART OF THE PAGE -- WEEKLY
   ============================================ */
function renderWeeklyCard(record, weekLabel) {
    document.querySelector('#weeklyName').textContent = record.name;
    document.querySelector('#weeklyWeekLabel').textContent = weekLabel;

    const payBtn = document.querySelector('#weeklyPayBtn');
    const confirmBadge = document.querySelector('#weeklyConfirmBadge');

    if (record.paid) {
        payBtn.disabled = true;
        payBtn.textContent = 'Ya está pagado';
        confirmBadge.hidden = false;
        confirmBadge.textContent = '✓ marcado como pagado';
    } else {
        payBtn.disabled = false;
        payBtn.textContent = 'Marcar como pagado';
        confirmBadge.hidden = true;
    }
}


/* ============================================
   HISTORY -- shows BOTH monthly and weekly
   payments together, sorted by actual date,
   newest first, each one labeled by type
   ============================================ */
function renderHistory(state, currentMonthKey, currentWeekKey) {
    const list = document.querySelector('#historyList');

    const monthlyEntries = Object.keys(state.records)
        .filter(key => key !== currentMonthKey)
        .map(key => ({
            sortDate: new Date(key + '-01'),
            label: `${monthLabelFromKey(key)} (mensual)`,
            record: state.records[key]
        }));

    const weeklyEntries = Object.keys(state.weeklyRecords || {})
        .filter(key => key !== currentWeekKey)
        .map(key => ({
            sortDate: new Date(key),
            label: `${weekLabelFromKey(key)} (semanal)`,
            record: state.weeklyRecords[key]
        }));

    const allEntries = monthlyEntries.concat(weeklyEntries)
        .sort((a, b) => b.sortDate - a.sortDate); // newest first

    if (allEntries.length === 0) {
        list.innerHTML = '<p>Todavía no hay pagos anteriores.</p>';
        return;
    }

    list.innerHTML = allEntries.map(entry => {
        const record = entry.record;
        const statusClass = record.paid ? 'paid-tag' : 'unpaid-tag';
        const statusText = record.paid ? 'PAGADO' : 'pendiente';
        const amountText = record.amount ? ` — $${record.amount}` : '';

        return `
            <div class="history-row">
                <span>${record.name} — ${entry.label}${amountText}</span>
                <span class="${statusClass}">${statusText}</span>
            </div>
        `;
    }).join('');
}


/* ============================================
   MAIN UPDATE FUNCTION
   ============================================ */
async function updateDisplay() {
    const state = await loadState();

    if (state.rotation.length === 0) {
        document.querySelector('#notSetUpSection').hidden = false;
        document.querySelector('#currentSection').hidden = true;
        document.querySelector('#yearSection').hidden = true;
        document.querySelector('#historySection').hidden = true;
        document.querySelector('#rotationSection').hidden = true;
        document.querySelector('#weeklySection').hidden = true;
        return;
    }

    const today = new Date();
    const currentKey = getMonthKey(today);
    const monthLabel = formatMonthLabel(today);
    const currentWeekKey = getWeekKey(today);

    // if nobody has been assigned this month yet, figure it out and save it
    if (!state.records[currentKey]) {
        const monthsPassed = howManyMonthsPassed(state.startMonth, currentKey);
        const name = whoseTurnIsIt(state.rotation, monthsPassed);

        state.records[currentKey] = {
            name: name,
            paid: false,
            paidAt: null,
            amount: ""
        };

        await saveState(state);
    }

    // same idea, but for the weekly food rotation -- only if it's been set up
    const weeklySetUp = state.weeklyRotation && state.weeklyRotation.length > 0;

    if (weeklySetUp && !state.weeklyRecords[currentWeekKey]) {
        const weeksPassed = howManyWeeksPassed(state.weeklyStartWeek, currentWeekKey);
        const name = whoseWeekIsIt(state.weeklyRotation, weeksPassed);

        state.weeklyRecords[currentWeekKey] = {
            name: name,
            paid: false,
            paidAt: null
        };

        await saveState(state);
    }

    const record = state.records[currentKey];

    renderCurrentCard(record, monthLabel);
    renderYearGrid(state, today.getFullYear(), currentKey);
    renderRotationList(state);

    if (weeklySetUp) {
        document.querySelector('#weeklySection').hidden = false;
        const weeklyRecord = state.weeklyRecords[currentWeekKey];
        renderWeeklyCard(weeklyRecord, weekLabelFromKey(currentWeekKey));
    } else {
        document.querySelector('#weeklySection').hidden = true;
    }

    renderHistory(state, currentKey, weeklySetUp ? currentWeekKey : null);
}


/* ============================================
   BUTTONS -- MONTHLY
   ============================================ */
function setupPayButton() {
    const payBtn = document.querySelector('#payBtn');

    payBtn.addEventListener('click', async function () {
        const state = await loadState();
        const currentKey = getMonthKey(new Date());
        const record = state.records[currentKey];

        record.amount = document.querySelector('#amountInput').value;
        record.paid = true;
        record.paidAt = new Date().toISOString();

        await saveState(state);
        updateDisplay();
    });
}

function setupReminderButton() {
    const reminderBtn = document.querySelector('#reminderBtn');

    reminderBtn.addEventListener('click', async function () {
        const state = await loadState();
        const currentKey = getMonthKey(new Date());
        const record = state.records[currentKey];
        const monthLabel = formatMonthLabel(new Date());

        const amountText = record.amount ? `$${record.amount}` : 'el monto habitual';
        const message = `Recordatorio: le toca a ${record.name} pagar la cuota de ${monthLabel} (${amountText}). ${window.location.href}`;

        navigator.clipboard.writeText(message);
        alert(`Mensaje copiado:\n\n${message}`);
    });
}


/* ============================================
   BUTTONS -- WEEKLY
   ============================================ */
function setupWeeklyPayButton() {
    const payBtn = document.querySelector('#weeklyPayBtn');

    payBtn.addEventListener('click', async function () {
        const state = await loadState();
        const currentWeekKey = getWeekKey(new Date());
        const record = state.weeklyRecords[currentWeekKey];

        record.paid = true;
        record.paidAt = new Date().toISOString();

        await saveState(state);
        updateDisplay();
    });
}

function setupWeeklyReminderButton() {
    const reminderBtn = document.querySelector('#weeklyReminderBtn');

    reminderBtn.addEventListener('click', async function () {
        const state = await loadState();
        const currentWeekKey = getWeekKey(new Date());
        const record = state.weeklyRecords[currentWeekKey];
        const weekLabel = weekLabelFromKey(currentWeekKey);

        const message = `Recordatorio: le toca a ${record.name} pagar la comida de esta ${weekLabel}. ${window.location.href}`;

        navigator.clipboard.writeText(message);
        alert(`Mensaje copiado:\n\n${message}`);
    });
}


/* ============================================
   RUN EVERYTHING
   ============================================ */
updateDisplay();
setupPayButton();
setupReminderButton();
setupWeeklyPayButton();
setupWeeklyReminderButton();