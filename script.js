// === CONFIGURAÇÕES DO SUPABASE ===
const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUserAvatar = '';
let boardState = [
    { id: "todo", title: "Para fazer", cards: [] },
    { id: "doing", title: "Em curso", cards: [] },
    { id: "done", title: "Concluído", cards: [] }
];

// === SINCRONIZAÇÃO E REALTIME ===
async function initRealtime() {
    console.log("Iniciando conexão Realtime...");

    // Busca inicial do banco
    const { data, error } = await _supabase
        .from('kanban_data')
        .select('state')
        .eq('id', 1);

    if (error) {
        console.error("Erro Supabase:", error.message);
    } else if (data && data.length > 0) {
        updateBoardState(data[0].state);
    }

    // Ouvinte em tempo real para mudanças externas
    _supabase
        .channel('kanban-realtime')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data' }, payload => {
            console.log("Mudança externa detectada!");
            if (payload.new && payload.new.state) {
                updateBoardState(payload.new.state);
            }
        })
        .subscribe();
}

function updateBoardState(newState) {
    try {
        const parsed = typeof newState === 'string' ? JSON.parse(newState) : newState;
        if (Array.isArray(parsed)) {
            boardState = parsed;
            renderBoard();
        }
    } catch (e) {
        console.error("Erro ao processar dados:", e);
    }
}

async function save() {
    const { error } = await _supabase
        .from('kanban_data')
        .update({ state: boardState })
        .eq('id', 1);
    
    if (error) console.error("Erro ao salvar:", error.message);
}

// === GESTÃO DE USUÁRIO ===
async function fetchUserProfile(username) {
    try {
        const res = await fetch(`https://api.github.com/users/${username}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        currentUserAvatar = data.avatar_url;
        document.getElementById('user-profile').innerHTML = `
            <img src="${currentUserAvatar}" alt="Avatar">
            <span>${data.name || data.login} | Workspace</span>
        `;
    } catch(e) {
        currentUserAvatar = 'https://cdn-icons-png.flaticon.com/512/25/25231.png';
        document.getElementById('user-profile').innerHTML = `
            <img src="${currentUserAvatar}" style="opacity:0.6">
            <span>Eduardo (Local) | Workspace</span>
        `;
    }
}

function changeUser() {
    const user = prompt("Digite seu @ do GitHub:");
    if (user) {
        localStorage.setItem('kanban_user', user);
        location.reload();
    }
}

function shareBoard() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        alert("Link copiado! Qualquer um com este link verá as mudanças em tempo real.");
    });
}

// === LÓGICA DO QUADRO ===
function handleDragStart(e) { e.dataTransfer.setData("text", e.target.id); }
function handleDragOver(e) { e.preventDefault(); }

async function handleDrop(e) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text");
    const targetCol = e.target.closest('.card-list');
    if (targetCol) moveCard(cardId, targetCol.id);
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
        await save();
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
    await save();
}

async function deleteCard(cardId) {
    if (confirm("Apagar esta tarefa?")) {
        boardState.forEach(col => {
            col.cards = col.cards.filter(c => c.id !== cardId);
        });
        renderBoard();
        await save();
    }
}

function renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board || !Array.isArray(boardState)) return;
    
    board.innerHTML = boardState.map(col => `
        <div class="column">
            <div class="column-header">
                <div style="font-size: 11px; opacity: 0.6; margin-bottom:5px">${col.title.toUpperCase()}</div>
                <div style="font-size: 24px; font-weight:bold">${col.cards.length}</div>
            </div>
            <div class="card-list" id="${col.id}" ondragover="handleDragOver(event)" ondrop="handleDrop(event)">
                ${col.cards.map(card => `
                    <div class="card" id="${card.id}" draggable="true" ondragstart="handleDragStart(event)" ondblclick="deleteCard('${card.id}')">
                        <div style="font-size: 14px; margin-bottom: 10px;">${card.content}</div>
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

// === START ===
document.addEventListener('DOMContentLoaded', () => {
    fetchUserProfile(GITHUB_USER);
    initRealtime();
});
