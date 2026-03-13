// === 1. ESTADO ===
const generateId = () => crypto.randomUUID();

let boardState = [
    { id: "todo", title: "A Fazer", cards: [{ id: generateId(), content: "Configurar o projeto" }, { id: generateId(), content: "Estudar Drag and Drop" }] },
    { id: "doing", title: "Em Andamento", cards: [] },
    { id: "done", title: "Concluído", cards: [] }
];

// === 2. LÓGICA DE MOVIMENTO ===
function handleDragStart(event) {
    event.dataTransfer.setData("text/plain", event.target.id);
}

function handleDragOver(event) {
    event.preventDefault(); // Necessário para permitir o drop
}

function handleDrop(event) {
    event.preventDefault();
    const cardId = event.dataTransfer.getData("text/plain");
    const targetColumn = event.target.closest('.card-list');
    
    if (targetColumn) {
        moveCard(cardId, targetColumn.id);
    }
}

function moveCard(cardId, targetColumnId) {
    let movedCard = null;
    boardState.forEach(col => {
        const index = col.cards.findIndex(c => c.id === cardId);
        if (index !== -1) {
            movedCard = col.cards.splice(index, 1)[0];
        }
    });

    const colDestino = boardState.find(col => col.id === targetColumnId);
    if (colDestino && movedCard) {
        colDestino.cards.push(movedCard);
    }
    renderBoard();
}

// === 3. RENDERIZAÇÃO ===
function renderBoard() {
    console.log("Renderizando quadro...");
    const board = document.getElementById('kanban-board');
    if (!board) {
        console.error("ERRO: Elemento kanban-board não encontrado no HTML!");
        return;
    }

    board.innerHTML = boardState.map(col => `
        <div class="column">
            <h3>${col.title}</h3>
            <div class="card-list" id="${col.id}" ondragover="handleDragOver(event)" ondrop="handleDrop(event)">
                ${col.cards.map(card => `
                    <div class="card" id="${card.id}" draggable="true" ondragstart="handleDragStart(event)">
                        ${card.content}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Inicializa
window.onload = renderBoard;
