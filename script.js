// CONFIGURAÇÕES DO SUPABASE (Use os dados do seu projeto)
const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; // Aquela chave eyJ...
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUserAvatar = '';
let boardState = [];

// === 1. SINCRONIZAÇÃO EM TEMPO REAL ===
async function initRealtime() {
    console.log("Iniciando conexão com banco...");
    
    // Busca dados iniciais da linha 1 (que você criou no banco)
    const { data, error } = await _supabase
        .from('kanban_data')
        .select('state')
        .eq('id', 1)
        .single();

    if (data) {
        boardState = data.state;
        renderBoard();
    } else {
        console.error("Erro ao carregar dados iniciais. Verifique se existe uma linha com ID 1 no banco.", error);
    }

    // Escuta mudanças em tempo real
    _supabase
        .channel('kanban-realtime')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data' }, payload => {
            console.log("Mudança recebida em tempo real!");
            boardState = payload.new.state;
            renderBoard();
        })
        .subscribe();
}

async function save() {
    const { error } = await _supabase
        .from('kanban_data')
        .update({ state: boardState })
        .eq('id', 1);
    
    if (error) console.error("Erro ao salvar no banco:", error);
}

// === 2. LÓGICA DO GITHUB ===
async function fetchUserProfile(username) {
    try {
        const res = await fetch(`https://api.github.com/users/${username}`);
        if (!res.ok) throw new Error(); // Se der 403, pula pro catch
        
        const data = await res.json();
        currentUserAvatar = data.avatar_url;
        document.getElementById('user-profile').innerHTML = `
            <img src="${currentUserAvatar}" style="width:32px;border-radius:50%">
            <span>${data.name || data.login} | Workspace</span>
        `;
    } catch(e) { 
        console.warn("GitHub rate limit atingido. Usando avatar padrão.");
        currentUserAvatar = 'https://via.placeholder.com/32'; // Avatar de reserva
        document.getElementById('user-profile').innerHTML = `
            <img src="${currentUserAvatar}" style="width:32px;border-radius:50%">
            <span>Eduardo (Offline)</span>
        `;
    }
}
// === 3. CORE DO KANBAN ===
function handleDrop(e) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text");
    const targetCol = e.target.closest('.card-list');
    if (targetCol) moveCard(cardId, targetCol.id);
}

function moveCard(cardId, targetColId) {
    let card;
    boardState.forEach(col => {
        const idx = col.cards.findIndex(c => c.id === cardId);
        if (idx !== -1) card = col.cards.splice(idx, 1)[0];
    });
    const dest = boardState.find(c => c.id === targetColId);
    if (dest && card) {
        dest.cards.push(card);
        renderBoard();
        save(); // Sincroniza com a nuvem
    }
}

function addCard(colId) {
    const val = prompt("O que precisa ser feito?");
    if (!val) return;
    boardState.find(c => c.id === colId).cards.push({
        id: crypto.randomUUID(),
        content: val,
        authorAvatar: currentUserAvatar
    });
    renderBoard();
    save(); // Sincroniza com a nuvem
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
            <div class="card-list" id="${col.id}" ondragover="event.preventDefault()" ondrop="handleDrop(event)">
                ${col.cards.map(card => `
                    <div class="card" id="${card.id}" draggable="true" ondragstart="e => e.dataTransfer.setData('text', e.target.id)">
                        ${card.content}
                        <div class="card-footer"><img src="${card.authorAvatar}" style="width:20px;border-radius:50%"></div>
                    </div>
                `).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Adicionar tarefa</button>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    fetchUserProfile(GITHUB_USER);
    initRealtime();
});
