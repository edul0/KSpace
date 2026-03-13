const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
let ROOM_NAME = urlParams.get('sala');
let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUser = { login: GITHUB_USER, avatar: `https://github.com/${GITHUB_USER}.png` };
let boardState = [];
let activityLogs = [];

async function startApp() {
    if (!ROOM_NAME) { renderLanding(); } 
    else {
        await fetchUserProfile(GITHUB_USER);
        renderMuralSkeleton();
        initRoom();
    }
}

function renderLanding() {
    document.getElementById('app-container').innerHTML = `
        <div class="landing-page">
            <h1>KanbamSpace</h1>
            <input type="text" id="room-input" placeholder="nome-da-sala" autofocus>
            <p>Salas instantâneas com senha.</p>
        </div>`;
    const input = document.getElementById('room-input');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.target.value) window.location.href = `?sala=${e.target.value.trim()}`;
    });
}

function renderMuralSkeleton() {
    document.getElementById('app-container').innerHTML = `
        <header>
            <div class="header-left">
                <div class="user-profile" onclick="changeUser()"><img src="${currentUser.avatar}"> <span>${currentUser.login}</span></div>
                <div class="room-info" onclick="window.location.href='index.html'">Mural: <strong>${ROOM_NAME}</strong></div>
                <input type="text" id="board-search" placeholder="Buscar..." oninput="renderBoard()" style="padding:5px 10px; border-radius:15px; border:1px solid #ccc; outline:none; margin-left:10px;">
            </div>
            <div class="actions">
                <button onclick="shareBoard()" style="padding:8px 15px; background:#000; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Compartilhar</button>
            </div>
        </header>
        <main id="kanban-board" class="board-container"></main>
        <div class="side-panel">
            <div class="panel-header">Status <span id="stats-content">0%</span></div>
            <div class="panel-header">Histórico <button onclick="clearLogs()" style="border:none; background:transparent; cursor:pointer;">🗑️</button></div>
            <div id="log-content"></div>
        </div>`;
}

async function initRoom() {
    let { data } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM_NAME
