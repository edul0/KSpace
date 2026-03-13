// === CONFIGURAÇÕES (SUBSTITUA A KEY) ===
const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUserAvatar = '';
let boardState = [];

// === SINCRONIZAÇÃO E BANCO ===
async function initRealtime() {
    console.log("Iniciando conexão Realtime...");

    // Busca inicial
    const { data, error } = await _supabase
        .from('kanban_data')
        .select('state')
        .eq('id', 1);

    if (error) {
        console.error("Erro ao carregar dados:", error.message);
        return;
    }

    if (data && data.length > 0) {
        boardState = typeof data[0].state === 'string' ? JSON.parse(data[0].state) : data[0].state;
        renderBoard();
    }

    // Ouvinte em tempo real
    _supabase
        .channel('kanban-realtime')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data' }, payload => {
            console.log("Mudança detectada em outro dispositivo!");
            boardState = typeof payload.new.state === 'string' ? JSON.parse(payload.new.state) : payload.new.state;
            renderBoard();
        })
        .subscribe();
}

async function save() {
    const { error } = await _supabase
        .from('kanban_data')
        .update({ state: boardState })
        .eq('id', 1);
    
    if (error) console.error("Erro ao salvar no banco:", error.message);
}

// === GESTÃO DE USUÁRIO ===
async function fetchUserProfile(username) {
    try {
        const res = await fetch(`https://api.github.com/users/${username}`);
        const data = await res.json();
        currentUserAvatar = data.avatar_url || 'https://via.placeholder.com/32';
        document.getElementById('user-profile').innerHTML = `
            <img src="${currentUserAvatar}" alt="Avatar">
            <span>${data.name || data.login} | Workspace</span>
        `;
    } catch(e) {
        currentUserAvatar = 'https://via.placeholder.com/32';
    }
}

function changeUser() {
    const user = prompt("Digite seu @ do GitHub:");
    if (user) {
        localStorage.setItem('kanban_user', user);
        location.reload();
    }
}

// === LÓGICA DO KANBAN ===
function handleDragStart(e) { e.dataTransfer.setData("text", e.target.id); }
function handleDragOver(e) { e.preventDefault(); }

async function handleDrop(e) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text");
    const targetCol = e.target.closest('.card-list');
    if (targetCol) {
        moveCard(cardId, targetCol.id);
    }
}

async function moveCard(cardId, targetColId) {
    let card;
    boardState.forEach(col => {
        const idx = col.cards.findIndex(c => c.id === cardId);
        if (idx !== -1) card = col.cards.splice(idx, 1)[0];
    });

    const dest = boardState.find(c => c.id === targetColId);
    if (dest && card) {
        dest.cards.push(card);
        renderBoard();
        await save(); // O await agora está dentro de uma função async
    }
}

async function addCard(colId) {
    const val = prompt("O que precisa ser feito?");
    if (!val) return;

    boardState.find(c => c.id === colId).cards.push({
        id: crypto.randomUUID(),
        content: val,
        authorAvatar: currentUserAvatar
    });

    renderBoard();
    await save(); // Sincroniza com a nuvem
}

function renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    board.innerHTML = boardState.map(col => `
        <div class="column">
            <div class="column-header">
                <div style="font-size: 11px; opacity: 0.6;">${col.title.toUpperCase()}</div>
                <div style="font-size: 24px;">${col.cards.length}</div>
            </div>
            <div class="card-list" id="${col.id}" ondragover="handleDragOver(event)" ondrop="handleDrop(event)">
                ${col.cards.map(card => `
                    <div class="card" id="${card.id}" draggable="true" ondragstart="handleDragStart(event)">
                        ${card.content}
                        <div class="card-footer">
                            <img src="${card.authorAvatar}" class="card-avatar">
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Adicionar tarefa</button>
        </div>
    `).join('');
} 

// === INICIALIZAÇÃO ===
document.addEventListener('DOMContentLoaded', () => {
    fetchUserProfile(GITHUB_USER);
    initRealtime();
}); // <--- CHAVE E PARÊNTESE DE FECHAMENTO DO EVENTO

// === START ===
document.addEventListener('DOMContentLoaded', () => {
    fetchUserProfile(GITHUB_USER);
    initRealtime();
});
