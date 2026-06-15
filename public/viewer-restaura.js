/**
 * Organograma Restore Viewer - Logic
 * Specialized in viewing historical backups from data/backups/
 */

let treeData = {};
let activeBackupFile = null;
let allBackups = [];

// --- D3 Configuration ---
const nodeWidth = 240, nodeHeight = 110;
let svg, g, tree, root, zoom;

async function loadBackupList() {
    try {
        const response = await fetch('api-backups.php?action=list');
        allBackups = await response.json();
        renderBackupList(allBackups);
        
        // Auto-load first backup if available
        if (allBackups.length > 0) {
            loadBackup(allBackups[0].filename);
        }
    } catch (e) {
        console.error("Erro ao carregar lista de backups:", e);
    }
}

async function loadBackup(filename) {
    try {
        activeBackupFile = filename;
        const response = await fetch(`api-backups.php?action=get&file=${filename}`);
        const data = await response.json();
        
        // Handle different JSON structures (some have 'data' wrapper, some don't)
        treeData = data.data || data;
        
        renderBackupList(allBackups); // Refresh list to show active item
        initChart();
    } catch (e) {
        console.error("Erro ao carregar backup:", e);
        alert("Erro ao carregar o arquivo de backup.");
    }
}

let searchTimeout;

async function searchBackups() {
    clearTimeout(searchTimeout);
    const query = document.getElementById("search-backup").value;
    const onlyWithForward = document.getElementById("filter-forward").checked;
    
    if (!query && !onlyWithForward) {
        renderBackupList(allBackups);
        return;
    }

    searchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`api-backups.php?action=search&q=${encodeURIComponent(query)}&forward=${onlyWithForward ? 1 : 0}`);
            const filtered = await response.json();
            renderBackupList(filtered);
        } catch (e) {
            console.error("Erro na busca:", e);
        }
    }, 400);
}

function renderBackupList(list) {
    const container = document.getElementById("backup-list");
    if (!container) return;
    
    container.innerHTML = "";
    
    if (list.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">Nenhum backup encontrado.</div>';
        return;
    }

    list.forEach(item => {
        const div = document.createElement("div");
        div.className = `backup-item ${item.filename === activeBackupFile ? 'active' : ''}`;
        div.innerHTML = `
            <span class="filename" title="${item.filename}">${item.filename}</span>
            <div class="info">
                <span>${item.date}</span>
                <span>${item.size}</span>
            </div>
        `;
        div.onclick = () => loadBackup(item.filename);
        container.appendChild(div);
    });
}

// --- Core D3 Setup (Copied/Adapted from viewer.js) ---

function initChart() {
    const container = document.getElementById("canvas");
    if (!container) return;
    const width = container.clientWidth, height = container.clientHeight;
    if (window.lucide) lucide.createIcons();

    zoom = d3.zoom().scaleExtent([0.1, 3]).on("zoom", (event) => g.attr("transform", event.transform));
    d3.select("#canvas").selectAll("svg").remove();
    svg = d3.select("#canvas").append("svg").attr("width", "100%").attr("height", "100%").call(zoom).on("dblclick.zoom", null);
    g = svg.append("g");
    g.append("g").attr("class", "links-group");
    g.append("g").attr("class", "nodes-group");

    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, 80).scale(0.8));
    tree = d3.tree().nodeSize([nodeWidth + 60, nodeHeight + 80]);
    root = d3.hierarchy(treeData);
    root.x0 = width / 2; root.y0 = 0;

    // Start collapsed
    if (root.children) {
        root.children.forEach(collapse);
    }

    update(root);
}

function collapse(d) {
    if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse);
        d.children = null;
    }
}

function diagonal(s, t) {
    const sy = s.y + nodeHeight, sx = s.x, ty = t.y, tx = t.x;
    return `M ${sx} ${sy} C ${sx} ${(sy + ty) / 2}, ${tx} ${(sy + ty) / 2}, ${tx} ${ty}`;
}

function update(source) {
    const treeDataLayout = tree(root);
    const nodes = treeDataLayout.descendants(), links = treeDataLayout.links();
    const gLinks = g.select(".links-group"), gNodes = g.select(".nodes-group");

    const link = gLinks.selectAll(".link").data(links, d => d.target.data.id);
    const linkEnter = link.enter().append("path").attr("class", "link")
        .attr("d", d => { const o = { x: source.x0, y: source.y0 }; return diagonal(o, o); });
    link.merge(linkEnter).transition().duration(400).attr("d", d => diagonal(d.source, d.target));
    link.exit().transition().duration(400).attr("d", d => { const o = { x: source.x, y: source.y }; return diagonal(o, o); }).remove();

    const node = gNodes.selectAll(".node-container").data(nodes, d => d.data.id);
    const nodeEnter = node.enter().append("g").attr("class", "node-container")
        .attr("transform", d => `translate(${source.x0 - nodeWidth / 2}, ${source.y0})`)
        .on("mouseenter", (event, d) => showAnnotation(event, d))
        .on("mousemove", (event) => moveAnnotation(event))
        .on("mouseleave", hideAnnotation);
    
    // Abrir painel de cópia com clique simples
    nodeEnter.on("click", (event, d) => {
        event.stopPropagation();
        openCopyPanel(d);
    });

    nodeEnter.append("rect").attr("class", "node-rect").attr("width", nodeWidth).attr("height", nodeHeight).attr("rx", 16).attr("ry", 16);
    nodeEnter.append("line").attr("x1", 0).attr("y1", 20).attr("x2", 0).attr("y2", nodeHeight - 20).attr("stroke", "var(--restore-accent)").attr("stroke-width", 6).attr("stroke-linecap", "round");
    nodeEnter.append("text").attr("class", "node-role").attr("x", nodeWidth / 2).attr("y", 45).attr("text-anchor", "middle").style("font-weight", "700").text(d => d.data.role);
    nodeEnter.append("text").attr("class", "node-name").attr("x", nodeWidth / 2).attr("y", 75).attr("text-anchor", "middle").text(d => d.data.name);

    const toggle = nodeEnter.append("g").attr("class", "node-toggle").attr("transform", `translate(${nodeWidth / 2}, ${nodeHeight})`)
        .on("click", (event, d) => {
            event.stopPropagation();
            if (d.children || d._children) {
                if (d.children) { d._children = d.children; d.children = null; }
                else { d.children = d._children; d._children = null; }
                update(d);
            }
        });
    toggle.append("circle").attr("r", 10).attr("fill", "var(--restore-accent)");
    toggle.append("text").attr("class", "toggle-icon").attr("text-anchor", "middle").attr("dy", ".35em").style("fill", "white").style("font-size", "14px").style("font-weight", "bold");

    const nodeUpdate = node.merge(nodeEnter);
    nodeUpdate.transition().duration(400).attr("transform", d => `translate(${d.x - nodeWidth / 2}, ${d.y})`);
    nodeUpdate.select(".node-rect").style("stroke-width", "1px").style("stroke", d => d._children ? "var(--restore-accent)" : "rgba(255,255,255,0.1)");
    nodeUpdate.select(".node-role").text(d => d.data.role);
    nodeUpdate.select(".node-name").text(d => d.data.name);
    nodeUpdate.select(".node-toggle").style("display", d => (d.children || d._children || d.data.children?.length) ? "block" : "none");
    nodeUpdate.select(".toggle-icon").text(d => d.children ? "-" : "+");
    node.exit().transition().duration(400).attr("transform", d => `translate(${source.x - nodeWidth / 2}, ${source.y})`).remove();
    nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
}

// --- Annotations (Tooltips) ---

function showAnnotation(event, d) {
    const box = document.getElementById("annotation-box");
    document.getElementById("annotation-content").innerText = d.data.docs || "Sem caixas vinculadas";
    document.getElementById("annotation-forward").innerText = d.data.forwardTo || "Nenhum destino";
    box.style.display = "block"; moveAnnotation(event);
}

function moveAnnotation(event) {
    const box = document.getElementById("annotation-box"); if (box.style.display === "none") return;
    const x = event.pageX + 20, y = event.pageY - 20, boxRect = box.getBoundingClientRect();
    const finalX = (x + boxRect.width > window.innerWidth) ? (event.pageX - boxRect.width - 20) : x;
    box.style.left = finalX + "px"; box.style.top = y + "px";
}

function hideAnnotation() { document.getElementById("annotation-box").style.display = "none"; }

// --- Copy Panel Logic ---

function openCopyPanel(d) {
    const panel = document.getElementById("copy-panel");
    panel.classList.add("active");
    
    document.getElementById("view-role").innerText = d.data.role || "";
    document.getElementById("view-name").innerText = d.data.name || "";
    document.getElementById("view-docs").innerText = d.data.docs || "";
    document.getElementById("view-forward").innerText = d.data.forwardTo || "";
    
    if (window.lucide) lucide.createIcons();
}

function closeCopyPanel() {
    document.getElementById("copy-panel").classList.remove("active");
}

function copyToClipboard(elementId, btn) {
    const text = document.getElementById(elementId).innerText;
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(() => {
        const originalContent = btn.innerHTML;
        btn.classList.add("success");
        btn.innerHTML = '<i data-lucide="check" style="width: 12px; height: 12px;"></i> Copiado!';
        if (window.lucide) lucide.createIcons();
        
        setTimeout(() => {
            btn.classList.remove("success");
            btn.innerHTML = originalContent;
            if (window.lucide) lucide.createIcons();
        }, 2000);
    }).catch(err => {
        console.error('Erro ao copiar:', err);
    });
}

// --- Event Listeners ---

function setupEventListeners() {
    document.getElementById("search-backup")?.addEventListener("input", searchBackups);
    document.getElementById("filter-forward")?.addEventListener("change", searchBackups);
    document.getElementById("close-copy-panel")?.addEventListener("click", closeCopyPanel);

    // Fechar painel ao clicar fora
    document.addEventListener("mousedown", (e) => {
        const panel = document.getElementById("copy-panel");
        if (panel?.classList.contains("active")) {
            if (!panel.contains(e.target) && !e.target.closest(".node-container") && !e.target.closest(".sidebar")) closeCopyPanel();
        }
    });

    document.getElementById("zoom-in")?.addEventListener("click", () => svg.transition().call(zoom.scaleBy, 1.4));
    document.getElementById("zoom-out")?.addEventListener("click", () => svg.transition().call(zoom.scaleBy, 0.7));
    document.getElementById("reset-view")?.addEventListener("click", () => {
        const c = document.getElementById("canvas");
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(c.clientWidth / 2, 80).scale(0.8));
    });

    document.getElementById("theme-toggle")?.addEventListener("click", () => {
        const body = document.body;
        const newTheme = body.getAttribute("data-theme") === "light" ? "dark" : "light";
        body.setAttribute("data-theme", newTheme); lucide.createIcons();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    loadBackupList();
    if (window.lucide) lucide.createIcons();
});

// Export functions to global scope for HTML onclicks
window.copyToClipboard = copyToClipboard;
