const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUser = { login: GITHUB_USER, avatar: '', name: 'Usuário' };
let boardState = [];
let activityLogs = [];

async function initRealtime() {
    const { data } = await _supabase.from('kanban_data').select('state, logs').eq('id', 1).single();
    if (data) { 
        boardState = data.state; 
        activityLogs = data.logs || [];
        renderBoard(); 
        renderLogs();
    }

    _supabase.channel('kanban-realtime').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data' }, 
    payload => { 
        boardState = payload.new.state; 
        activityLogs = payload.new.logs || [];
        renderBoard(); 
        renderLogs();
    }).subscribe();
}

async function save(logMsg) {
    if (logMsg) activityLogs.unshift({ msg: logMsg, time: new Date().toLocaleTimeString() });
    if (activityLogs.length > 20) activityLogs.pop(); // Mantém só os últimos 20
    await _supabase.from('kanban_data').update({ state: boardState, logs: activityLogs }).eq('id', 1);
}

async function fetchUserProfile(username) {
    try {
        const res = await fetch(`https://api.github.com/users/${username}`);
        const data = await res.json();
        currentUser = { login: data.login, avatar: data.avatar_url, name: data.name || data.login };
        document.getElementById('user-profile').innerHTML = `<img src="${data.avatar_url}"> <span>${currentUser.name}</span>`;
    } catch(e) { document.getElementById('user-profile').innerHTML = `<span>@${username}</span>`; }
}

async function addCard(colId) {
    const content = prompt("Tarefa:"); if (!content) return;
    const p = prompt("Prioridade: 1-Alta, 2-Média, 3-Baixa");
    const date = prompt("Data entrega (AAAA-MM-DD):", new Date().toISOString().split('T')[0]);
    const prios = {"1":"prio-alta", "2":"prio-media", "3":"prio-baixa"};
    
    const newCard = {
        id: crypto.randomUUID(),
        content: content,
        priorityClass: prios[p] || "prio-baixa",
        deadline: date,
        owner: currentUser.login,
        ownerAvatar: currentUser.avatar
    };

    boardState.find(c => c.id === colId).cards.push(newCard);
    renderBoard(); 
    await save(`@${currentUser.login} criou "${content}"`);
}

async function takeTask(cardId) {
    boardState.forEach(col => {
        const card = col.cards.find(c => c.id === cardId);
        if(card) { card.owner = currentUser.login; card.ownerAvatar = currentUser.avatar; }
    });
    renderBoard(); 
    await save(`@${currentUser.login} assumiu uma tarefa`);
}

function renderBoard() {
    const board = document.getElementById('kanban-board');
    const search = document.getElementById('board-search').value.toLowerCase();
    const today = new Date().toISOString().split('T')[0];

    board.innerHTML = boardState.map(col => {
        const filtered = col.cards.filter(c => c.content.toLowerCase().includes(search) || c.owner.toLowerCase().includes(search));
        return `
        <div class="column">
            <div class="column-header">${col.title} (${filtered.length})</div>
            <div class="card-list" ondragover="event.preventDefault()" ondrop="drop(event, '${col.id}')">
                ${filtered.map(card => `
                    <div class="card ${card.priorityClass}" id="${card.id}" draggable="true" ondragstart="drag(event)" ondblclick="deleteCard('${card.id}')">
                        <div class="card-content">${card.content}</div>
                        <div class="card-footer">
                            <span class="${card.deadline < today && col.id !== 'done' ? 'deadline-alert' : ''}">📅 ${card.deadline}</span>
                            <div class="owner-badge" onclick="takeTask('${card.id}')">
                                <img src="${card.ownerAvatar}"> @${card.owner}
                            </div>
                        </div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Novo Card</button>
        </div>`;
    }).join('');
}

function renderLogs() {
    document.getElementById('log-content').innerHTML = activityLogs.map(l => `
        <div class="log-entry"><strong>[${l.time}]</strong> ${l.msg}</div>
    `).join('');
}

function drag(e) { e.dataTransfer.setData("text", e.target.id); }
async function drop(e, colId) {
    const id = e.dataTransfer.getData("text");
    let card;
    boardState.forEach(c => {
        const i = c.cards.findIndex(x => x.id === id);
        if(i > -1) card = c.cards.splice(i, 1)[0];
    });
    if(card) {
        boardState.find(c => c.id === colId).cards.push(card);
        renderBoard(); 
        await save(`@${currentUser.login} moveu para ${colId}`);
    }
}

async function deleteCard(id) { if(confirm("Deletar?")) { boardState.forEach(col => col.cards = col.cards.filter(c => c.id !== id)); renderBoard(); await save(`@${currentUser.login} deletou um card`); } }
function changeUser() { const u = prompt("GitHub User:"); if(u) { localStorage.setItem('kanban_user', u); location.reload(); } }
function shareBoard() { navigator.clipboard.writeText(window.location.href); alert("Link copiado!"); }

document.addEventListener('DOMContentLoaded', () => { fetchUserProfile(GITHUB_USER); initRealtime(); });
