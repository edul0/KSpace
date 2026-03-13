// === CONFIGURAÇÃO SUPABASE ===
const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// === VARIÁVEIS GLOBAIS ===
const urlParams = new URLSearchParams(window.location.search);
let ROOM_NAME = urlParams.get('sala'); 
let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUser = { login: GITHUB_USER, avatar: `https://github.com/${GITHUB_USER}.png`, name: GITHUB_USER };
let boardState = [];
let activityLogs = [];
let filterOnlyMe = false;

// === INICIALIZAÇÃO ===
async function startApp() {
    if (!ROOM_NAME) {
        renderLandingPage();
    } else {
        await fetchUserProfile(GITHUB_USER);
        initRoom();
    }
}

function renderLandingPage() {
    document.body.innerHTML = `
        <div class="landing-container" style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fff; font-family:monospace;">
            <h1 style="font-size: 3rem; margin: 0; letter-spacing: -2px;">Post-it Board /</h1>
            <input type="text" id="room-input" placeholder="nome-da-sala" 
                style="font-size:2.5rem; border:none; border-bottom:3px solid #000; outline:none; text-align:center; width:80%; max-width:600px; padding:10px;">
            <p style="margin-top:20px; color:#888;">Crie ou acesse murais instantâneos. Como o Dontpad.</p>
        </div>
    `;
    const input = document.getElementById('room-input');
    input.focus();
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value) window.location.href = `?sala=${input.value.trim()}`;
    });
}

async function initRoom() {
    document.getElementById('room-display').innerText = ROOM_NAME;
    
    let { data, error } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM_NAME).maybeSingle();

    if (!data) {
        const pass = prompt(`Mural "${ROOM_NAME}" é novo. Criar senha? (Vazio = Público)`);
        const initialState = [
            {id:"todo", title:"Para fazer", cards:[]},
            {id:"doing", title:"Em curso", cards:[]},
            {id:"done", title:"Concluído", cards:[]}
        ];
        const { data: newData } = await _supabase.from('kanban_data').insert([{ room_name: ROOM_NAME, state: initialState, logs: [], room_password: pass || null }]).select().single();
        data = newData;
    }

    if (data && data.room_password) {
        if (sessionStorage.getItem(`auth_${ROOM_NAME}`) !== data.room_password) {
            const p = prompt("Senha da sala:");
            if (p === data.room_password) sessionStorage.setItem(`auth_${ROOM_NAME}`, p);
            else { window.location.href = "index.html"; return; }
        }
        document.getElementById('lock-status').innerText = "🔒";
    }

    boardState = data.state;
    activityLogs = data.logs || [];
    renderBoard();
    renderLogs();
    updateStats();

    _supabase.channel(`room-${ROOM_NAME}`).on('postgres_changes', { 
        event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM_NAME}` 
    }, payload => {
        boardState = payload.new.state;
        activityLogs = payload.new.logs || [];
        renderBoard(); renderLogs(); updateStats();
    }).subscribe();
}

// === FUNÇÕES DE RENDERIZAÇÃO ===
function renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board || !boardState) return;
    const search = document.getElementById('board-search').value.toLowerCase();
    
    board.innerHTML = boardState.map(col => {
        let cards = col.cards.filter(c => c.content.toLowerCase().includes(search));
        if (filterOnlyMe) cards = cards.filter(c => c.owner === currentUser.login);
        
        return `
        <div class="column">
            <div class="column-header">${col.title} (${cards.length})</div>
            <div class="card-list" ondragover="event.preventDefault()" ondrop="drop(event, '${col.id}')">
                ${cards.map(card => `
                    <div class="card" id="${card.id}" draggable="true" ondragstart="drag(event)" ondblclick="deleteCard('${card.id}')">
                        <div class="card-content">${card.content}</div>
                        <div class="card-footer">
                            <div class="owner-info" onclick="assignTask('${card.id}')">
                                <img src="${card.ownerAvatar || 'https://github.com/identicons/ghost.png'}">
                                <span>@${card.owner}</span>
                            </div>
                        </div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Novo Post-it</button>
        </div>`;
    }).join('');
}

// === AÇÕES DO KANBAN ===
async function addCard(colId) {
    const txt = prompt("Texto do Post-it:");
    if (!txt) return;
    boardState.find(c => c.id === colId).cards.push({
        id: crypto.randomUUID(), content: txt, createdAt: new Date().toLocaleDateString(),
        owner: currentUser.login, ownerAvatar: currentUser.avatar
    });
    renderBoard(); await save(`@${currentUser.login} criou card`);
}

async function save(logMsg) {
    if (logMsg) activityLogs.unshift({ msg: logMsg, time: new Date().toLocaleTimeString() });
    await _supabase.from('kanban_data').update({ state: boardState, logs: activityLogs }).eq('room_name', ROOM_NAME);
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
        renderBoard(); await save(`Movido para ${colId}`);
    }
}

async function fetchUserProfile(u) {
    try {
        const r = await fetch(`https://api.github.com/users/${u}`);
        const d = await r.json();
        currentUser = { login: d.login, avatar: d.avatar_url, name: d.name || d.login };
    } catch(e) {}
    const prof = document.getElementById('user-profile');
    if(prof) prof.innerHTML = `<img src="${currentUser.avatar}" style="width:35px;height:35px;border-radius:50%;"> <span>${currentUser.name}</span>`;
}

async function deleteCard(id) {
    if(confirm("Deletar?")) {
        boardState.forEach(col => col.cards = col.cards.filter(c => c.id !== id));
        renderBoard(); await save(`Removido`);
    }
}

function renderLogs() {
    const lc = document.getElementById('log-content');
    if(lc) lc.innerHTML = activityLogs.map(l => `<div>[${l.time}] ${l.msg}</div>`).join('');
}

function updateStats() {
    const tot = boardState.reduce((a, c) => a + c.cards.length, 0);
    const ok = boardState.find(c => c.id === 'done')?.cards.length || 0;
    const st = document.getElementById('stats-content');
    if(st) st.innerText = `${tot > 0 ? Math.round((ok/tot)*100) : 0}% concluído`;
}

function toggleMyTasks() {
    filterOnlyMe = !filterOnlyMe;
    document.querySelector('.btn-filter-me').classList.toggle('active');
    renderBoard();
}

document.addEventListener('DOMContentLoaded', startApp);
