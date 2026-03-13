const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
let ROOM = urlParams.get('sala');
let user = { name: 'Eduardo', avatar: 'https://github.com/edul0.png' };

let state = [];
let logs = [];

async function start() {
    if (!ROOM) return renderLanding();
    renderSkeleton();
    initData();
}

function renderLanding() {
    document.getElementById('app-container').innerHTML = `
        <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:monospace;">
            <img src="marca.png" width="100">
            <h1 style="font-size:3.5rem; margin:15px 0;">KSpace /</h1>
            <input type="text" id="sala-in" placeholder="nome-da-sala" style="font-size:1.8rem; text-align:center; border:none; border-bottom:4px solid #000; outline:none; width:280px;">
        </div>`;
    document.getElementById('sala-in').onkeypress = (e) => { if(e.key==='Enter') window.location.href=`?sala=${e.target.value}`; };
}

function renderSkeleton() {
    document.getElementById('app-container').innerHTML = `
        <header>
            <div class="header-left">
                <img src="marca.png" class="logo" onclick="window.location.href='index.html'">
                <img src="${user.avatar}" style="width:28px; border-radius:50%; border:1px solid #000;">
                <b style="font-size:13px;">${ROOM}</b>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <button class="theme-btn" onclick="toggleTheme()">🌓</button>
                <button onclick="share()" style="background:#000; color:#fff; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px;">🔗 LINK</button>
            </div>
        </header>
        <main id="board" class="board-container"></main>
        <div class="side-panel">
            <div class="panel-header">HISTÓRICO <span>•</span></div>
            <div id="log-content"></div>
        </div>`;
}

async function initData() {
    let { data } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM).maybeSingle();
    if (!data) {
        const init = [{id:"todo", title:"Para fazer", cards:[]},{id:"doing", title:"Em curso", cards:[]},{id:"done", title:"Concluído", cards:[]}];
        const { data: nD } = await _supabase.from('kanban_data').insert([{ room_name: ROOM, state: init, logs: [] }]).select().single();
        data = nD;
    }
    state = data.state; logs = data.logs || [];
    renderBoard(); renderLogs();
    _supabase.channel(ROOM).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM}` }, 
    p => { state = p.new.state; logs = p.new.logs; renderBoard(); renderLogs(); }).subscribe();
}

function renderBoard() {
    const b = document.getElementById('board');
    if (!b) return;
    b.innerHTML = state.map(col => `
        <div class="column">
            <div class="column-header">${col.title} (${col.cards.length})</div>
            <div class="card-list">
                ${col.cards.map(c => `
                    <div class="card" id="${c.id}" ondblclick="delCard('${c.id}')">
                        <div class="card-author">BY: ${c.author || 'ANÔNIMO'}</div>
                        <div style="font-weight:bold; flex:1; font-size:14px;">${c.content}</div>
                        ${c.img ? `<img src="${c.img}">` : ''}
                        <div style="font-size:9px; color:#666; margin-top:10px; cursor:pointer; text-align:right;" onclick="addImg('${c.id}')">🖼️ IMAGEM</div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ NOVO POST-IT</button>
        </div>`).join('');
}

async function save(msg) {
    if(msg) logs.unshift({ msg, time: new Date().toLocaleTimeString() });
    await _supabase.from('kanban_data').update({ state, logs: logs.slice(0,20) }).eq('room_name', ROOM);
}

async function addCard(cid) {
    const t = prompt("O que precisa ser feito?"); if(!t) return;
    state.find(x => x.id === cid).cards.push({ id: crypto.randomUUID(), content: t, author: user.name });
    renderBoard(); await save(`@${user.name} adicionou: ${t}`);
}

async function addImg(id) {
    const u = prompt("URL da imagem:"); if(!u) return;
    state.forEach(col => { const c = col.cards.find(x => x.id === id); if(c) c.img = u; });
    renderBoard(); await save(`@${user.name} anexou imagem`);
}

async function delCard(id) { if(confirm("Apagar post-it?")) { state.forEach(col => col.cards = col.cards.filter(x => x.id !== id)); renderBoard(); await save(`Card removido`); } }
function toggleTheme() { document.body.classList.toggle('dark-mode'); }
function renderLogs() { document.getElementById('log-content').innerHTML = logs.map(l => `<div style="margin-bottom:8px; border-left:2px solid #0f0; padding-left:8px;">[${l.time}] ${l.msg}</div>`).join(''); }
function share() { navigator.clipboard.writeText(window.location.href); alert("Link da sala copiado!"); }

if (document.readyState === 'complete') start(); else document.addEventListener('DOMContentLoaded', start);
