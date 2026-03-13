const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUser = { login: GITHUB_USER, avatar: 'https://cdn-icons-png.flaticon.com/512/25/25231.png', name: GITHUB_USER };
let boardState = [];
let activityLogs = [];
let filterOnlyMe = false;

const playSound = (id) => { const a = document.getElementById(id); if(a) { a.currentTime = 0; a.play(); } };

async function initRealtime() {
    const { data } = await _supabase.from('kanban_data').select('*').eq('id', 1).single();
    if (data) { boardState = data.state || []; activityLogs = data.logs || []; renderBoard(); renderLogs(); updateStats(); }
    _supabase.channel('kanban-realtime').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data' }, 
    payload => { boardState = payload.new.state; activityLogs = payload.new.logs || []; renderBoard(); renderLogs(); updateStats(); }).subscribe();
}

async function save(logMsg) {
    if (logMsg) activityLogs.unshift({ msg: logMsg, time: new Date().toLocaleTimeString() });
    if (activityLogs.length > 25) activityLogs.pop();
    await _supabase.from('kanban_data').update({ state: boardState, logs: activityLogs }).eq('id', 1);
}

async function fetchUserProfile(username) {
    try {
        const res = await fetch(`https://api.github.com/users/${username}`);
        const data = await res.json();
        if(data.login) currentUser = { login: data.login, avatar: data.avatar_url, name: data.name || data.login };
    } catch(e) { console.warn("Fallback Ativado"); }
    document.getElementById('user-profile').innerHTML = `<img src="${currentUser.avatar}"> <span>${currentUser.name}</span>`;
}

function toggleMyTasks() {
    filterOnlyMe = !filterOnlyMe;
    document.querySelector('.btn-filter-me').classList.toggle('active');
    renderBoard();
}

function updateStats() {
    const total = boardState.reduce((acc, col) => acc + col.cards.length, 0);
    const done = boardState.find(c => c.id === 'done')?.cards.length || 0;
    const perc = total > 0 ? Math.round((done/total)*100) : 0;
    document.getElementById('stats-content').innerHTML = `<div style="background:#ddd; height:8px; border-radius:4px;"><div style="background:var(--success); width:${perc}%; height:100%; border-radius:4px;"></div></div> ${perc}% concluído`;
}

async function addCard(colId) {
    const content = prompt("Conteúdo do Post-it:"); if (!content) return;
    const p = prompt("Prioridade: 1-Alta, 2-Média, 3-Baixa");
    const date = prompt("Entrega (AAAA-MM-DD):", new Date().toISOString().split('T')[0]);
    const prios = {"1":"prio-alta", "2":"prio-media", "3":"prio-baixa"};
    
    boardState.find(c => c.id === colId).cards.push({
        id: crypto.randomUUID(), content: content, priorityClass: prios[p] || "prio-baixa",
        deadline: date, createdAt: new Date().toLocaleString('pt-BR'),
        owner: currentUser.login, ownerAvatar: currentUser.avatar, checklist: []
    });
    playSound('audio-paper');
    renderBoard(); await save(`@${currentUser.login} colou um post-it`);
}

function renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board || boardState.length === 0) return;
    const search = document.getElementById('board-search').value.toLowerCase();
    const today = new Date().toISOString().split('T')[0];

    board.innerHTML = boardState.map(col => {
        let filtered = col.cards.filter(c => c.content.toLowerCase().includes(search) || c.owner.toLowerCase().includes(search));
        if (filterOnlyMe) {
            filtered = filtered.filter(c => c.owner === currentUser.login);
        }

        return `
        <div class="column">
            <div class="column-header">${col.title}</div>
            <div class="card-list" ondragover="event.preventDefault()" ondrop="drop(event, '${col.id}')">
                ${filtered.map(card => `
                    <div class="card ${card.priorityClass} ${card.owner === currentUser.login ? 'is-mine' : ''}" id="${card.id}" draggable="true" ondragstart="drag(event)" ondblclick="deleteCard('${card.id}')">
                        <div class="card-info-row"><span>${card.createdAt}</span></div>
                        <div class="card-content">${card.content}</div>
                        <div class="checklist-container">
                            ${card.checklist.map(i => `<div class="checklist-item ${i.done ? 'done' : ''}" onclick="toggleCheck('${card.id}', '${i.id}')">${i.done ? '✓' : '○'} ${i.text}</div>`).join('')}
                            <div style="cursor:pointer; color:var(--primary); font-size:9px" onclick="addCheckItem('${card.id}')">+ subtarefa</div>
                        </div>
                        <div class="card-footer">
                            <span class="${card.deadline < today && col.id !== 'done' ? 'deadline-alert' : ''}">⏰ ${card.deadline}</span>
                            <div class="owner-info" onclick="assignTask('${card.id}')">
                                <img src="${card.ownerAvatar}">
                                <span>@${card.owner}</span>
                            </div>
                        </div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Novo Post-it</button>
        </div>`;
    }).join('');
}

async function assignTask(cardId) {
    const choice = prompt("Atribuir:\n1 - Mim\n2 - Outro (digite o @nick)");
    if(!choice) return;
    const target = choice === "1" ? currentUser.login : choice;
    boardState.forEach(col => {
        const c = col.cards.find(x => x.id === cardId);
        if(c) { 
            c.owner = target; 
            c.ownerAvatar = `https://github.com/${target}.png`; 
        }
    });
    playSound('audio-click'); renderBoard(); await save(`@${currentUser.login} delegou para @${target}`);
}

async function addCheckItem(cardId) {
    const item = prompt("Subtarefa:"); if(!item) return;
    boardState.forEach(col => { const card = col.cards.find(c => c.id === cardId); if(card) card.checklist.push({ id: crypto.randomUUID(), text: item, done: false }); });
    renderBoard(); await save();
}
async function toggleCheck(cardId, itemId) {
    boardState.forEach(col => { const card = col.cards.find(c => c.id === cardId); if(card) { const it = card.checklist.find(i => i.id === itemId); if(it) it.done = !it.done; } });
    renderBoard(); await save();
}
async function deleteCard(id) { if(confirm("Remover post-it?")) { boardState.forEach(col => col.cards = col.cards.filter(c => c.id !== id)); renderBoard(); await save(`@${currentUser.login} removeu um post-it`); } }
function renderLogs() { document.getElementById('log-content').innerHTML = activityLogs.map(l => `<div class="log-entry"><strong>[${l.time}]</strong> ${l.msg}</div>`).join(''); }
function drag(e) { e.dataTransfer.setData("text", e.target.id); }
async function drop(e, colId) {
    const id = e.dataTransfer.getData("text"); let card;
    boardState.forEach(c => { const i = c.cards.findIndex(x => x.id === id); if(i > -1) card = c.cards.splice(i, 1)[0]; });
    if(card) { boardState.find(c => c.id === colId).cards.push(card); playSound('audio-paper'); renderBoard(); await save(`@${currentUser.login} moveu para ${colId}`); }
}
function toggleDarkMode() { document.body.classList.toggle('dark-mode'); }
function changeUser() { const u = prompt("GitHub User:"); if(u) { localStorage.setItem('kanban_user', u); location.reload(); } }
function shareBoard() { navigator.clipboard.writeText(window.location.href); alert("Copiado!"); }
function clearLogs() { if(confirm("Limpar?")) { activityLogs = []; renderLogs(); save(); } }

document.addEventListener('DOMContentLoaded', () => { fetchUserProfile(GITHUB_USER); initRealtime(); });
