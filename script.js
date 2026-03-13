const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
let ROOM_NAME = urlParams.get('sala');
let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUser = { login: GITHUB_USER, avatar: `https://github.com/${GITHUB_USER}.png`, name: GITHUB_USER };
let boardState = [];
let activityLogs = [];
let filterOnlyMe = false;

const playSound = (id) => { const a = document.getElementById(id); if(a) { a.currentTime = 0; a.play(); } };

async function init() {
    // Se não houver sala na URL, mostra a tela inicial "Dontpad style"
    if (!ROOM_NAME) {
        showLandingPage();
        return;
    }
    
    await fetchUserProfile(GITHUB_USER);
    await initRealtime();
}

function showLandingPage() {
    document.body.innerHTML = `
        <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fff; font-family:monospace;">
            <h1 style="font-size:3rem; margin-bottom:10px;">Post-it Board /</h1>
            <input type="text" id="new-room-input" placeholder="nome-da-sua-sala" 
                style="font-size:1.5rem; padding:10px; border:none; border-bottom:2px solid #000; outline:none; text-align:center;">
            <p style="margin-top:20px; color:#666;">Crie ou acesse um mural instantâneo.</p>
            <button onclick="window.location.href = '?sala=' + document.getElementById('new-room-input').value" 
                style="margin-top:20px; padding:10px 20px; background:#000; color:#fff; border:none; cursor:pointer;">Entrar</button>
        </div>
    `;
    document.getElementById('new-room-input').focus();
    document.getElementById('new-room-input').onkeypress = (e) => {
        if(e.key === 'Enter') window.location.href = '?sala=' + e.target.value;
    };
}

async function initRealtime() {
    document.getElementById('room-display').innerText = ROOM_NAME;
    
    // Busca ou cria a sala no banco
    let { data, error } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM_NAME).maybeSingle();

    if (!data) {
        const pass = prompt(`Mural "${ROOM_NAME}" é novo. Definir senha? (Vazio = Público)`);
        const initialState = [{"id":"todo","title":"Para fazer","cards":[]},{"id":"doing","title":"Em curso","cards":[]},{"id":"done","title":"Concluído","cards":[]}];
        const { data: newData } = await _supabase.from('kanban_data').insert([{ 
            room_name: ROOM_NAME, state: initialState, logs: [], room_password: pass || null 
        }]).select().single();
        data = newData;
    }

    // Validação de Senha
    if (data.room_password) {
        let attempt = sessionStorage.getItem(`auth_${ROOM_NAME}`);
        if (attempt !== data.room_password) {
            const passInput = prompt("Senha da sala:");
            if (passInput === data.room_password) {
                sessionStorage.setItem(`auth_${ROOM_NAME}`, passInput);
            } else {
                alert("Senha errada."); window.location.href = "/"; return;
            }
        }
        document.getElementById('lock-status').innerText = "🔒";
    }

    boardState = data.state;
    activityLogs = data.logs || [];
    renderBoard(); renderLogs(); updateStats();

    // Inscrição Realtime
    _supabase.channel(`room-${ROOM_NAME}`).on('postgres_changes', { 
        event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM_NAME}` 
    }, payload => {
        boardState = payload.new.state;
        activityLogs = payload.new.logs || [];
        renderBoard(); renderLogs(); updateStats();
    }).subscribe();
}

async function save(logMsg) {
    if (logMsg) activityLogs.unshift({ msg: logMsg, time: new Date().toLocaleTimeString() });
    if (activityLogs.length > 30) activityLogs.pop();
    await _supabase.from('kanban_data').update({ state: boardState, logs: activityLogs }).eq('room_name', ROOM_NAME);
}

// === RESTANTE DAS FUNÇÕES (RENDER, ADD, DRAG...) ===
function renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const search = document.getElementById('board-search').value.toLowerCase();
    const today = new Date().toISOString().split('T')[0];

    board.innerHTML = boardState.map(col => {
        let filtered = col.cards.filter(c => c.content.toLowerCase().includes(search) || c.owner.toLowerCase().includes(search));
        if (filterOnlyMe) filtered = filtered.filter(c => c.owner === currentUser.login);
        return `
        <div class="column">
            <div class="column-header">${col.title}</div>
            <div class="card-list" ondragover="event.preventDefault()" ondrop="drop(event, '${col.id}')">
                ${filtered.map(card => `
                    <div class="card ${card.owner === currentUser.login ? 'is-mine' : ''}" id="${card.id}" draggable="true" ondragstart="drag(event)" ondblclick="deleteCard('${card.id}')" style="border-top: 5px solid ${card.priorityClass === 'prio-alta' ? '#d13438' : (card.priorityClass === 'prio-media' ? '#ffa500' : '#107c10')}">
                        <div class="card-info-row"><span>${card.createdAt}</span></div>
                        <div class="card-content">${card.content}</div>
                        <div class="card-footer">
                            <span class="${card.deadline < today && col.id !== 'done' ? 'deadline-alert' : ''}">⏰ ${card.deadline}</span>
                            <div class="owner-info" onclick="assignTask('${card.id}')"><img src="${card.ownerAvatar}"> <span>@${card.owner}</span></div>
                        </div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Novo Post-it</button>
        </div>`;
    }).join('');
}

async function addCard(colId) {
    const content = prompt("Conteúdo:"); if (!content) return;
    const p = prompt("Prioridade: 1-Alta, 2-Média, 3-Baixa");
    const date = prompt("Prazo:", new Date().toISOString().split('T')[0]);
    boardState.find(c => c.id === colId).cards.push({
        id: crypto.randomUUID(), content: content, priorityClass: p === "1" ? "prio-alta" : (p === "2" ? "prio-media" : "prio-baixa"),
        deadline: date, createdAt: new Date().toLocaleDateString(), owner: currentUser.login, ownerAvatar: currentUser.avatar
    });
    playSound('audio-paper'); renderBoard(); await save(`@${currentUser.login} criou: ${content}`);
}

async function assignTask(cardId) {
    const target = prompt("Delegar para:"); if(!target) return;
    const nick = target === 'eu' ? currentUser.login : target;
    boardState.forEach(col => { const c = col.cards.find(x => x.id === cardId); if(c) { c.owner = nick; c.ownerAvatar = `https://github.com/${nick}.png`; } });
    playSound('audio-click'); renderBoard(); await save(`Delegado para @${nick}`);
}

function drag(e) { e.dataTransfer.setData("text", e.target.id); }
async function drop(e, colId) {
    const id = e.dataTransfer.getData("text"); let card;
    boardState.forEach(c => { const i = c.cards.findIndex(x => x.id === id); if(i > -1) card = c.cards.splice(i, 1)[0]; });
    if(card) { boardState.find(c => c.id === colId).cards.push(card); playSound('audio-paper'); renderBoard(); await save(`Movido`); }
}

async function fetchUserProfile(username) {
    try {
        const res = await fetch(`https://api.github.com/users/${username}`);
        const data = await res.json();
        if(data.login) currentUser = { login: data.login, avatar: data.avatar_url, name: data.name || data.login };
    } catch(e) {}
    const prof = document.getElementById('user-profile');
    if(prof) prof.innerHTML = `<img src="${currentUser.avatar}"> <span>${currentUser.name}</span>`;
}

function updateStats() {
    const total = boardState.reduce((acc, col) => acc + col.cards.length, 0);
    const done = boardState.find(c => c.id === 'done')?.cards.length || 0;
    const perc = total > 0 ? Math.round((done/total)*100) : 0;
    const st = document.getElementById('stats-content');
    if(st) st.innerHTML = `${perc}% concluído`;
}

async function deleteCard(id) { if(confirm("Remover?")) { boardState.forEach(col => col.cards = col.cards.filter(c => c.id !== id)); renderBoard(); await save(`Deletado`); } }
function toggleMyTasks() { filterOnlyMe = !filterOnlyMe; document.querySelector('.btn-filter-me').classList.toggle('active'); renderBoard(); }
function toggleDarkMode() { document.body.classList.toggle('dark-mode'); }
function changeUser() { const u = prompt("User:"); if(u) { localStorage.setItem('kanban_user', u); location.reload(); } }
function shareBoard() { navigator.clipboard.writeText(window.location.href); alert("Link copiado!"); }
function clearLogs() { if(confirm("Limpar?")) { activityLogs = []; renderLogs(); save(); } }
function renderLogs() { const lc = document.getElementById('log-content'); if(lc) lc.innerHTML = activityLogs.map(l => `<div class="log-entry"><strong>[${l.time}]</strong> ${l.msg}</div>`).join(''); }
function changeRoom() { window.location.href = "/Project_Kanban/"; }

document.addEventListener('DOMContentLoaded', init);
