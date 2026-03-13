const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
let ROOM_NAME = urlParams.get('sala');
let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUser = { login: GITHUB_USER, avatar: `https://github.com/${GITHUB_USER}.png`, name: GITHUB_USER };
let boardState = [];
let activityLogs = [];

const playSound = (id) => { const a = document.getElementById(id); if(a) { a.currentTime = 0; a.play(); } };

async function startApp() {
    if (!ROOM_NAME) {
        renderLanding();
    } else {
        renderMuralSkeleton();
        await fetchUserProfile(GITHUB_USER);
        initRoom();
    }
}

function renderLanding() {
    document.getElementById('app-container').innerHTML = `
        <div class="landing-page">
            <h1>Post-it Board /</h1>
            <input type="text" id="room-input" placeholder="nome-da-sala" autofocus>
            <p style="color: #888; margin-top: 20px; font-family: monospace;">Acesse murais instantâneos.</p>
        </div>
    `;
    const input = document.getElementById('room-input');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value) window.location.href = `?sala=${input.value.trim()}`;
    });
}

function renderMuralSkeleton() {
    document.getElementById('app-container').innerHTML = `
        <header>
            <div class="header-left">
                <div class="user-profile" id="user-profile" onclick="changeUser()">
                    <img src="${currentUser.avatar}"> <span>${currentUser.name}</span>
                </div>
                <div class="room-info" onclick="window.location.href='index.html'">
                    Mural: <strong id="room-display">${ROOM_NAME}</strong> <span id="lock-status">🔓</span>
                </div>
                <input type="text" id="board-search" placeholder="Buscar..." oninput="renderBoard()" style="padding: 5px 10px; border-radius: 15px; border: 1px solid #ccc; outline: none;">
            </div>
            <div class="actions">
                <button onclick="shareBoard()" style="padding: 5px 10px; background: #000; color: #fff; border: none; cursor: pointer; border-radius: 4px;">Link</button>
            </div>
        </header>
        <main id="kanban-board" class="board-container"></main>
        <div id="log-panel" class="log-panel">
            <div class="log-header">Status <span id="stats-content">0%</span></div>
            <div class="log-header">Histórico <button onclick="clearLogs()" style="border:none; background:transparent; cursor:pointer;">🗑️</button></div>
            <div id="log-content" class="log-content"></div>
        </div>
    `;
}

async function initRoom() {
    let { data } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM_NAME).maybeSingle();

    if (!data) {
        const pass = prompt(`Mural "${ROOM_NAME}" é novo. Senha? (Vazio = Público)`);
        const initialState = [{id:"todo", title:"Para fazer", cards:[]},{id:"doing", title:"Em curso", cards:[]},{id:"done", title:"Concluído", cards:[]}];
        const { data: newData } = await _supabase.from('kanban_data').insert([{ room_name: ROOM_NAME, state: initialState, logs: [], room_password: pass || null }]).select().single();
        data = newData;
    }

    if (data.room_password) {
        if (sessionStorage.getItem(`auth_${ROOM_NAME}`) !== data.room_password) {
            const p = prompt("Senha:");
            if (p === data.room_password) sessionStorage.setItem(`auth_${ROOM_NAME}`, p);
            else { window.location.href = "index.html"; return; }
        }
        document.getElementById('lock-status').innerText = "🔒";
    }

    boardState = data.state;
    activityLogs = data.logs || [];
    renderBoard(); renderLogs(); updateStats();

    _supabase.channel(`room-${ROOM_NAME}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM_NAME}` }, 
    payload => { boardState = payload.new.state; activityLogs = payload.new.logs || []; renderBoard(); renderLogs(); updateStats(); }).subscribe();
}

function renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board || !boardState) return;
    const search = document.getElementById('board-search').value.toLowerCase();
    
    board.innerHTML = boardState.map(col => {
        let cards = col.cards.filter(c => c.content.toLowerCase().includes(search));
        return `
        <div class="column">
            <div class="column-header">${col.title} (${cards.length})</div>
            <div class="card-list" ondragover="event.preventDefault()" ondrop="drop(event, '${col.id}')">
                ${cards.map(card => `
                    <div class="card" id="${card.id}" draggable="true" ondragstart="drag(event)" ondblclick="deleteCard('${card.id}')">
                        <div class="card-content">${card.content}</div>
                        <div class="card-footer">
                            <span>@${card.owner}</span>
                            <div class="owner-info"><img src="${card.ownerAvatar}"></div>
                        </div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Novo Post-it</button>
        </div>`;
    }).join('');
}

async function save(logMsg) {
    if (logMsg) activityLogs.unshift({ msg: logMsg, time: new Date().toLocaleTimeString() });
    await _supabase.from('kanban_data').update({ state: boardState, logs: activityLogs }).eq('room_name', ROOM_NAME);
}

// APOIO (ADD, DRAG, DROP, LOGS)
async function addCard(colId) {
    const txt = prompt("Texto:"); if (!txt) return;
    boardState.find(c => c.id === colId).cards.push({ id: crypto.randomUUID(), content: txt, owner: currentUser.login, ownerAvatar: currentUser.avatar });
    playSound('audio-paper'); renderBoard(); await save(`@${currentUser.login} criou card`);
}
function drag(e) { e.dataTransfer.setData("text", e.target.id); }
async function drop(e, colId) {
    const id = e.dataTransfer.getData("text"); let card;
    boardState.forEach(c => { const i = c.cards.findIndex(x => x.id === id); if(i > -1) card = c.cards.splice(i, 1)[0]; });
    if(card) { boardState.find(c => c.id === colId).cards.push(card); playSound('audio-paper'); renderBoard(); await save(`Movido`); }
}
async function fetchUserProfile(u) {
    try {
        const r = await fetch(`https://api.github.com/users/${u}`);
        const d = await r.json();
        currentUser = { login: d.login, avatar: d.avatar_url, name: d.name || d.login };
    } catch(e) {}
}
function renderLogs() { const lc = document.getElementById('log-content'); if(lc) lc.innerHTML = activityLogs.map(l => `<div>[${l.time}] ${l.msg}</div>`).join(''); }
function updateStats() {
    const tot = boardState.reduce((a, c) => a + c.cards.length, 0);
    const ok = boardState.find(c => c.id === 'done')?.cards.length || 0;
    const st = document.getElementById('stats-content');
    if(st) st.innerText = `${tot > 0 ? Math.round((ok/tot)*100) : 0}%`;
}
function shareBoard() { navigator.clipboard.writeText(window.location.href); alert("Copiado!"); }
function changeUser() { const u = prompt("User:"); if(u) { localStorage.setItem('kanban_user', u); location.reload(); } }
async function deleteCard(id) { if(confirm("Deletar?")) { boardState.forEach(c => c.cards = c.cards.filter(x => x.id !== id)); renderBoard(); await save(`Removido`); } }

document.addEventListener('DOMContentLoaded', startApp);
