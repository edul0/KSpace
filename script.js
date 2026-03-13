const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
let ROOM_NAME = urlParams.get('sala');
let currentUser = { 
    login: localStorage.getItem('kanban_custom_name') || localStorage.getItem('kanban_user') || 'edul0', 
    avatar: localStorage.getItem('kanban_custom_avatar') || `https://github.com/${localStorage.getItem('kanban_user') || 'edul0'}.png` 
};

let boardState = [];
let activityLogs = [];
let activeTab = 'todo'; // Controle mobile

async function startApp() {
    const container = document.getElementById('app-container');
    if (!container) return;
    if(localStorage.getItem('dark_mode') === 'true') document.body.classList.add('dark-mode');
    if (!ROOM_NAME) renderLanding();
    else {
        renderMuralSkeleton();
        initRoom();
    }
}

function renderLanding() {
    document.getElementById('app-container').innerHTML = `
        <div class="landing-page" style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <img src="marca.png" width="100">
            <h1>KSpace /</h1>
            <input type="text" id="room-input" placeholder="nome-da-sala" style="font-size:2rem; text-align:center; border:none; border-bottom:3px solid #000; outline:none;">
        </div>`;
    document.getElementById('room-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.target.value) window.location.href = `?sala=${e.target.value.trim()}`;
    });
}

function renderMuralSkeleton() {
    document.getElementById('app-container').innerHTML = `
        <header>
            <div class="header-left">
                <img src="marca.png" class="header-logo" onclick="window.location.href='index.html'">
                <div class="user-profile" onclick="manageProfile()"><img src="${currentUser.avatar}" style="width:30px; border-radius:50%"></div>
                <button onclick="toggleDarkMode()" style="background:none; border:none; cursor:pointer;">🌓</button>
            </div>
            <div style="display:flex; gap:10px;">
                <button onclick="toggleHistory()" id="mobile-hist-btn" style="background:none; border:none; font-size:20px; display:none;">📜</button>
                <button onclick="shareBoard()" style="background:#000; color:#fff; border:none; padding:5px 10px; border-radius:4px; font-weight:bold;">🔗</button>
            </div>
        </header>
        <main id="kanban-board" class="board-container"></main>
        <nav class="mobile-nav">
            <div class="nav-item active" onclick="switchTab('todo', this)">📝 TO-DO</div>
            <div class="nav-item" onclick="switchTab('doing', this)">⚡ DOING</div>
            <div class="nav-item" onclick="switchTab('done', this)">✅ DONE</div>
        </nav>
        <div id="side-panel" class="side-panel">
            <div class="panel-header">HISTÓRICO <button onclick="toggleHistory()" style="background:none; border:none; color:#0f0; cursor:pointer;">✖</button></div>
            <div id="log-content"></div>
        </div>`;
    
    if(window.innerWidth <= 768) document.getElementById('mobile-hist-btn').style.display = 'block';
}

function switchTab(tabId, el) {
    activeTab = tabId;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    renderBoard();
}

async function initRoom() {
    let { data } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM_NAME).maybeSingle();
    if (!data) {
        const pass = prompt("Defina uma senha (vazio = público):");
        const initialState = [{id:"todo", title:"Para fazer", cards:[]},{id:"doing", title:"Em curso", cards:[]},{id:"done", title:"Concluído", cards:[]}];
        const { data: nD } = await _supabase.from('kanban_data').insert([{ room_name: ROOM_NAME, state: initialState, logs: [], room_password: pass || null }]).select().single();
        data = nD;
    }
    boardState = data.state;
    activityLogs = data.logs || [];
    renderBoard(); renderLogs();
    
    _supabase.channel(ROOM_NAME).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM_NAME}` }, 
    p => { boardState = p.new.state; activityLogs = p.new.logs; renderBoard(); renderLogs(); }).subscribe();
}

function renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const isMobile = window.innerWidth <= 768;

    board.innerHTML = boardState.map(col => `
        <div class="column ${isMobile && col.id === activeTab ? 'active' : ''}">
            <div class="column-header">${col.title}</div>
            <div class="card-list">
                ${col.cards.map(card => `
                    <div class="card ${card.priorityClass || 'prio-media'}" id="${card.id}" ondblclick="deleteCard('${card.id}')">
                        <div class="card-content">${card.content}</div>
                        ${card.imageUrl ? `<img src="${card.imageUrl}" class="attached-image">` : ''}
                        <div style="font-size:9px; color:#999; margin-top:auto; cursor:pointer;" onclick="attachImage('${card.id}')">🖼️ Imagem</div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ NOVO</button>
        </div>`).join('');
}

function toggleHistory() { document.getElementById('side-panel').classList.toggle('open'); }
function toggleDarkMode() { document.body.classList.toggle('dark-mode'); localStorage.setItem('dark_mode', document.body.classList.contains('dark-mode')); }
function shareBoard() { navigator.clipboard.writeText(window.location.href); alert("Link copiado!"); }

async function save(msg) {
    if(msg) activityLogs.unshift({ msg, time: new Date().toLocaleTimeString() });
    await _supabase.from('kanban_data').update({ state: boardState, logs: activityLogs.slice(0,20) }).eq('room_name', ROOM_NAME);
}

async function addCard(colId) {
    const txt = prompt("Tarefa:"); if(!txt) return;
    boardState.find(c => c.id === colId).cards.push({ id: crypto.randomUUID(), content: txt, priorityClass: 'prio-media' });
    renderBoard(); await save(`@${currentUser.login} adicionou card`);
}

async function attachImage(id) {
    const url = prompt("Link da imagem:"); if(!url) return;
    boardState.forEach(col => { const c = col.cards.find(x => x.id === id); if(c) c.imageUrl = url; });
    renderBoard(); await save(`Imagem anexada`);
}

async function deleteCard(id) {
    if(confirm("Deletar?")) {
        boardState.forEach(c => c.cards = c.cards.filter(x => x.id !== id));
        renderBoard(); await save(`Card removido`);
    }
}

function renderLogs() { document.getElementById('log-content').innerHTML = activityLogs.map(l => `<div style="margin-bottom:8px; border-left:2px solid #0f0; padding-left:8px; font-size:10px;">[${l.time}] ${l.msg}</div>`).join(''); }

if (document.readyState === 'complete') startApp(); else document.addEventListener('DOMContentLoaded', startApp);
