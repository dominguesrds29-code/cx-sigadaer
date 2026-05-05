/**
 * Organogram Backup Viewer Logic
 * Read-only module for historical data
 */

let backupList = [];
let activeBackupFile = null;
let treeData = {};

// --- D3 Variables ---
const nodeWidth = 240, nodeHeight = 110;
let svg, g, tree, root, zoom;

let searchTimeout;

async function init() {
    lucide.createIcons();
    await loadBackupList();
    
    const searchInput = document.getElementById("search-backup");
    const filterForward = document.getElementById("filter-forward");

    const triggerSearch = () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();
        const onlyWithForward = filterForward.checked ? 1 : 0;
        
        // Mostrar feedback de carregamento na lista
        if (query.length > 2) {
            document.getElementById("backup-list").innerHTML = '<div style="padding:20px; color:#94a3b8; text-align:center;">Buscando...</div>';
        }

        searchTimeout = setTimeout(() => {
            if (query.length > 2) {
                searchBackups(query, onlyWithForward);
            } else if (query.length === 0) {
                loadBackupList();
            }
        }, 600);
    };

    searchInput.oninput = triggerSearch;
    filterForward.onchange = triggerSearch;
}

async function searchBackups(query, onlyWithForward = 0) {
    try {
        const response = await fetch(`api-backups.php?action=search&q=${encodeURIComponent(query)}&forward=${onlyWithForward}`);
        backupList = await response.json();
        renderBackupList();
    } catch (e) { console.error("Erro na busca:", e); }
}

async function loadBackupList() {
    try {
        const response = await fetch('api-backups.php?action=list');
        backupList = await response.json();
        renderBackupList();
        
        // Carrega o mais recente automaticamente se houver
        if (backupList.length > 0) {
            selectBackup(backupList[0].filename);
        }
    } catch (e) { console.error("Erro ao carregar lista de backups:", e); }
}

function renderBackupList() {
    const container = document.getElementById("backup-list");
    container.innerHTML = "";
    
    backupList.forEach(item => {
        const div = document.createElement("div");
        div.className = `backup-item ${item.filename === activeBackupFile ? 'active' : ''}`;
        div.innerHTML = `
            <span class="backup-name">${item.filename}</span>
            <div class="backup-info">
                <span><i data-lucide="calendar" style="width:10px"></i> ${item.date}</span>
                <span>${item.size}</span>
            </div>
        `;
        div.onclick = () => selectBackup(item.filename);
        container.appendChild(div);
    });
    lucide.createIcons();
}

async function selectBackup(filename) {
    activeBackupFile = filename;
    renderBackupList();
    
    try {
        const response = await fetch(`api-backups.php?action=get&file=${filename}`);
        const data = await response.json();
        // O backup pode ser o projeto inteiro ou apenas um nó (embora agora salvemos sempre o projeto no backup)
        treeData = data.data || data; 
        initChart();
    } catch (e) { console.error("Erro ao carregar arquivo de backup:", e); }
}

// --- D3 Integration ---

function initChart() {
    const container = document.getElementById("canvas");
    container.innerHTML = "";
    
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg = d3.select("#canvas").append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .call(zoom = d3.zoom().on("zoom", (event) => g.attr("transform", event.transform)));

    g = svg.append("g");
    tree = d3.tree().nodeSize([nodeWidth + 40, nodeHeight + 80]);
    updateChart();
}

function updateChart() {
    if (!treeData) return;
    root = d3.hierarchy(treeData);
    tree(root);

    const links = g.selectAll(".link").data(root.links());
    links.enter().append("path").attr("class", "link")
        .merge(links)
        .attr("d", d3.linkVertical().x(d => d.x).y(d => d.y));

    const nodes = g.selectAll(".node").data(root.descendants(), d => d.data.id);
    const nodeEnter = nodes.enter().append("g").attr("class", "node")
        .attr("transform", d => `translate(${d.x - nodeWidth / 2},${d.y - nodeHeight / 2})`)
        .on("click", (e, d) => showNodeDetails(d.data));

    nodeEnter.append("rect").attr("class", "node-rect").attr("width", nodeWidth).attr("height", nodeHeight);
    
    nodeEnter.append("text").attr("class", "node-role").attr("x", 15).attr("y", 25).text(d => d.data.role);
    nodeEnter.append("text").attr("class", "node-name").attr("x", 15).attr("y", 50).text(d => d.data.name);

    // Centralizar inicialmente
    const initialTransform = d3.zoomIdentity.translate(svg.node().clientWidth / 2, 100).scale(0.8);
    svg.call(zoom.transform, initialTransform);
}

function showNodeDetails(node) {
    document.getElementById("view-role").innerText = node.role || "";
    document.getElementById("view-name").innerText = node.name || "";
    document.getElementById("view-docs").innerText = node.docs || "";
    document.getElementById("view-forward").innerText = node.forwardTo || "";
    document.getElementById("node-modal").style.display = "flex";
}

function closeModal() {
    document.getElementById("node-modal").style.display = "none";
}

document.addEventListener("DOMContentLoaded", init);
