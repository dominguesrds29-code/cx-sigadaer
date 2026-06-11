/**
 * Organograma Premium - App Logic
 * Powered by D3.js + PHP Backend
 */

// --- Persistence Layer ---
let projects = {};
let activeProjectId = localStorage.getItem('organograma_active_project') || null;
let treeData = {};
let isViewerMode = false;

async function loadProjectsFromServer() {
    try {
        const response = await fetch('api.php?action=list');
        projects = await response.json();
        
        if (Object.keys(projects).length === 0) {
            projects["default"] = {
                id: "default", name: "Organograma Principal",
                data: { id: "root", role: "DIRETORIA", name: "NOME DO DIRETOR", docs: "", forwardTo: "", children: [] }
            };
            await saveProjectToServer("default");
        }
        
        activeProjectId = localStorage.getItem('organograma_active_project') || Object.keys(projects)[0];
        if (!projects[activeProjectId]) activeProjectId = Object.keys(projects)[0];
        
        treeData = projects[activeProjectId].data;
        renderProjectsList();
        initChart();
        startHeartbeat(activeProjectId);

        // Exibe o controle de status para o projeto inicial
        const statusControl = document.getElementById("project-status-control");
        const selectStatus = document.getElementById("select-status");
        if (statusControl) statusControl.style.display = "block";
        if (selectStatus) selectStatus.value = projects[activeProjectId].status || "public";
    } catch (e) {
        console.error("Erro ao carregar projetos:", e);
    }
}

async function saveProjectToServer(id) {
    const project = projects[id];
    if (!project) return;
    project.id = id;
    try {
        const response = await fetch('api.php?action=save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        console.log(`Projeto "${project.name}" (ID: ${id}) salvo com sucesso.`);
    } catch (e) { 
        console.error("Erro ao salvar no servidor:", e); 
        alert("Erro ao salvar alterações no servidor.");
    }
}

async function updateNodeOnServer(nodeId, nodeData) {
    try {
        const response = await fetch('api.php?action=update_node', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: activeProjectId,
                nodeId: nodeId,
                nodeData: nodeData,
                isAdmin: true // Informa que é o administrador gravando
            })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        console.log("Nó atualizado individualmente no servidor.");
    } catch (e) {
        console.error("Erro ao atualizar nó no servidor:", e);
        alert("Erro ao salvar alterações da caixa no servidor.");
    }
}

async function deleteProjectFromServer(id) {
    try {
        await fetch('api.php?action=delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
    } catch (e) { console.error("Erro ao deletar no servidor:", e); }
}

async function saveAll() {
    if (isViewerMode) return;
    if (!projects[activeProjectId]) return;
    projects[activeProjectId].data = treeData;
    await saveProjectToServer(activeProjectId);
    localStorage.setItem('organograma_active_project', activeProjectId);
    renderProjectsList();
}

// --- Configuration ---
const nodeWidth = 240, nodeHeight = 110;
let svg, g, tree, root, zoom;
let selectedNode = null;

// --- Core D3 Setup ---

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

    // Collapse all children initially
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

    nodeEnter.on("click", (event, d) => {
        event.stopPropagation();
        if (event.detail === 1) {
            if (d.children || d._children) {
                if (d.children) { d._children = d.children; d.children = null; }
                else { d.children = d._children; d._children = null; }
                update(d);
            } else {
                animateDocumentFlow(d);
            }
        }
    });
    
    nodeEnter.on("dblclick", (event, d) => { 
        event.stopPropagation(); 
        if (!isViewerMode) openEditPanel(d); 
    });

    nodeEnter.append("rect").attr("class", "node-rect").attr("width", nodeWidth).attr("height", nodeHeight).attr("rx", 16).attr("ry", 16);
    nodeEnter.append("line").attr("x1", 0).attr("y1", 20).attr("x2", 0).attr("y2", nodeHeight - 20).attr("stroke", "var(--accent-color)").attr("stroke-width", 6).attr("stroke-linecap", "round");
    nodeEnter.append("text").attr("class", "node-role").attr("x", nodeWidth / 2).attr("y", 45).attr("text-anchor", "middle").style("font-weight", "700").text(d => d.data.role);
    nodeEnter.append("text").attr("class", "node-name").attr("x", nodeWidth / 2).attr("y", 75).attr("text-anchor", "middle").text(d => d.data.name);

    const toggle = nodeEnter.append("g").attr("class", "node-toggle").attr("transform", `translate(${nodeWidth / 2}, ${nodeHeight})`);
    toggle.append("circle").attr("r", 10).attr("fill", "var(--accent-color)");
    toggle.append("text").attr("class", "toggle-icon").attr("text-anchor", "middle").attr("dy", ".35em").style("fill", "white").style("font-size", "14px").style("font-weight", "bold");

    const nodeUpdate = node.merge(nodeEnter);
    nodeUpdate.transition().duration(400).attr("transform", d => `translate(${d.x - nodeWidth / 2}, ${d.y})`);
    nodeUpdate.select(".node-rect").style("stroke-width", "1px").style("stroke", d => d._children ? "var(--accent-color)" : "rgba(255,255,255,0.1)");
    nodeUpdate.select(".node-role").text(d => d.data.role);
    nodeUpdate.select(".node-name").text(d => d.data.name);
    nodeUpdate.select(".node-toggle").style("display", d => (d.children || d._children || d.data.children?.length) ? "block" : "none");
    nodeUpdate.select(".toggle-icon").text(d => d.children ? "-" : "+");
    node.exit().transition().duration(400).attr("transform", d => `translate(${source.x - nodeWidth / 2}, ${source.y})`).remove();
    nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
}

function openEditPanel(d) {
    if (isViewerMode) return;
    selectedNode = d;
    document.getElementById("edit-panel").classList.add("active");
    document.getElementById("edit-role").value = d.data.role;
    document.getElementById("edit-name").value = d.data.name;
    document.getElementById("edit-docs").value = d.data.docs || "";
    document.getElementById("edit-forward").value = d.data.forwardTo || "";
}

function closeEditPanel() { document.getElementById("edit-panel").classList.remove("active"); selectedNode = null; }

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

function renderProjectsList() {
    const list = document.getElementById("projects-list"); if (!list) return;
    list.innerHTML = "";
    Object.keys(projects).forEach(id => {
        const status = projects[id].status || "public";
        const statusIcons = { "private": "lock", "readonly": "eye", "public": "edit-2" };
        const item = document.createElement("div");
        item.className = `project-item ${id === activeProjectId ? 'active' : ''} status-${status}`;
        item.innerHTML = `
            <div class="project-info">
                <i data-lucide="${statusIcons[status] || 'file-text'}" class="status-icon"></i> 
                <span>${projects[id].name}</span>
            </div>
            <button class="delete-project" title="Excluir projeto">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        item.onclick = () => { if (!isViewerMode) switchProject(id); };
        const delBtn = item.querySelector(".delete-project");
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (isViewerMode) return;
            if (confirm(`Deseja excluir "${projects[id].name}"?`)) deleteProject(id);
        };
        list.appendChild(item);
    });
    if (window.lucide) lucide.createIcons();
}

async function deleteProject(id) {
    if (Object.keys(projects).length <= 1) { alert("Não é possível excluir o único projeto."); return; }
    delete projects[id];
    await deleteProjectFromServer(id);
    if (id === activeProjectId) {
        activeProjectId = Object.keys(projects)[0];
        treeData = projects[activeProjectId].data;
        localStorage.setItem('organograma_active_project', activeProjectId);
        initChart();
    } else renderProjectsList();
}

async function switchProject(id) {
    await saveAll(); 
    activeProjectId = id; 
    treeData = projects[id].data;
    
    // Mostra controle de status e sincroniza valor
    const statusControl = document.getElementById("project-status-control");
    const selectStatus = document.getElementById("select-status");
    if (statusControl) statusControl.style.display = "block";
    if (selectStatus) selectStatus.value = projects[id].status || "public";

    initChart(); 
    localStorage.setItem('organograma_active_project', id);
}

function toggleViewerMode(viewer) {
    isViewerMode = viewer;
    if (isViewerMode) {
        document.body.classList.add("viewer-mode");
        document.getElementById("btn-edit").classList.remove("active");
        document.getElementById("btn-settings").classList.add("active");
        closeEditPanel();
    } else {
        document.body.classList.remove("viewer-mode");
        document.getElementById("btn-edit").classList.add("active");
        document.getElementById("btn-settings").classList.remove("active");
    }
    // Refresh zoom/centering after transition
    setTimeout(() => {
        const c = document.getElementById("canvas");
        svg.transition().call(zoom.transform, d3.zoomIdentity.translate(c.clientWidth/2, 80).scale(0.8));
    }, 450);
}

function setupEventListeners() {
    document.querySelector(".close-panel")?.addEventListener("click", closeEditPanel);
    document.addEventListener("mousedown", (e) => {
        const panel = document.getElementById("edit-panel");
        if (panel?.classList.contains("active")) {
            if (!panel.contains(e.target) && !e.target.closest(".node-container") && !e.target.closest(".toolbar") && !e.target.closest(".canvas-controls") && !e.target.closest(".sidebar")) closeEditPanel();
        }
    });

    window.addEventListener("keydown", (e) => { 
        if (e.key === "Escape") {
            if (isViewerMode) toggleViewerMode(false);
            else closeEditPanel();
        }
    });

    // Toggle Modes
    document.getElementById("btn-settings")?.addEventListener("click", () => toggleViewerMode(true));
    document.getElementById("btn-edit")?.addEventListener("click", () => toggleViewerMode(false));
    document.getElementById("btn-return")?.addEventListener("click", () => toggleViewerMode(false));

    document.getElementById("save-node")?.addEventListener("click", async () => {
        if (!selectedNode) return;
        const nodeData = {
            role: document.getElementById("edit-role").value,
            name: document.getElementById("edit-name").value,
            docs: document.getElementById("edit-docs").value,
            forwardTo: document.getElementById("edit-forward").value
        };
        
        // Atualiza localmente
        Object.assign(selectedNode.data, nodeData);
        
        // Salva apenas este nó no servidor
        await updateNodeOnServer(selectedNode.data.id, nodeData);
        
        update(selectedNode); 
        closeEditPanel();
    });

    document.getElementById("add-child")?.addEventListener("click", () => {
        if (!selectedNode) return;
        const newNode = { id: "node-" + Date.now(), role: "NOVO CARGO", name: "NOME DA PESSOA", docs: "", forwardTo: "", children: [] };
        if (selectedNode._children) { selectedNode.children = selectedNode._children; selectedNode._children = null; }
        if (!selectedNode.data.children) selectedNode.data.children = [];
        selectedNode.data.children.push(newNode);
        root = d3.hierarchy(treeData); saveAll(); update(selectedNode);
        setTimeout(() => { const d3Node = root.descendants().find(n => n.data.id === newNode.id); if (d3Node) openEditPanel(d3Node); }, 500);
    });

    document.getElementById("add-sibling")?.addEventListener("click", () => {
        if (!selectedNode || selectedNode.data.id === "root") return;
        const parent = selectedNode.parent;
        const newNode = { id: "node-" + Date.now(), role: "NOVO CARGO", name: "NOME DA PESSOA", docs: "", forwardTo: "", children: [] };
        if (!parent.data.children) parent.data.children = [];
        const index = parent.data.children.findIndex(c => c.id === selectedNode.data.id);
        parent.data.children.splice(index + 1, 0, newNode);
        root = d3.hierarchy(treeData); saveAll(); update(parent);
        setTimeout(() => { const d3Node = root.descendants().find(n => n.data.id === newNode.id); if (d3Node) openEditPanel(d3Node); }, 500);
    });

    document.getElementById("insert-parent")?.addEventListener("click", () => {
        if (!selectedNode || selectedNode.data.id === "root") return;
        
        const nodeId = selectedNode.data.id;
        
        function findNodeInRaw(node, id) {
            if (node.id === id) return node;
            if (node.children) {
                for (const child of node.children) {
                    const found = findNodeInRaw(child, id);
                    if (found) return found;
                }
            }
            return null;
        }
        
        function findParentInRaw(node, id) {
            if (!node.children) return null;
            for (let i = 0; i < node.children.length; i++) {
                if (node.children[i].id === id) return node;
                const found = findParentInRaw(node.children[i], id);
                if (found) return found;
            }
            return null;
        }
        
        const rawParent = findParentInRaw(treeData, nodeId);
        const rawNode = findNodeInRaw(treeData, nodeId);
        
        if (rawParent && rawNode) {
            const newNode = {
                id: "node-" + Date.now(),
                role: "NOVO CARGO INTERMEDIÁRIO",
                name: "NOME DA PESSOA",
                docs: "",
                forwardTo: "",
                children: []
            };
            
            const groupAll = confirm("Deseja agrupar TODOS os elementos deste nível sob o novo elemento intermediário? \n\n(Clique em 'Cancelar' para mover apenas o elemento selecionado)");
            
            if (groupAll) {
                newNode.children = [...rawParent.children];
                rawParent.children = [newNode];
            } else {
                const index = rawParent.children.findIndex(c => c.id === nodeId);
                if (index !== -1) {
                    newNode.children = [rawNode];
                    rawParent.children.splice(index, 1, newNode);
                }
            }
            
            root = d3.hierarchy(treeData);
            saveAll();
            initChart();
            
            // Open edit panel for the newly created intermediate node
            setTimeout(() => {
                const d3Node = root.descendants().find(n => n.data.id === newNode.id);
                if (d3Node) openEditPanel(d3Node);
            }, 500);
        }
    });

    document.getElementById("delete-node")?.addEventListener("click", () => {
        if (!selectedNode || selectedNode.data.id === "root") return;
        if (confirm("Excluir este nó? (Os sub-elementos serão mantidos e subirão de nível)")) {
            const nodeId = selectedNode.data.id;
            
            // Helper functions to search directly in raw treeData
            function findNodeInRaw(node, id) {
                if (node.id === id) return node;
                if (node.children) {
                    for (const child of node.children) {
                        const found = findNodeInRaw(child, id);
                        if (found) return found;
                    }
                }
                return null;
            }
            
            function findParentInRaw(node, id) {
                if (!node.children) return null;
                for (let i = 0; i < node.children.length; i++) {
                    if (node.children[i].id === id) return node;
                    const found = findParentInRaw(node.children[i], id);
                    if (found) return found;
                }
                return null;
            }
            
            const rawParent = findParentInRaw(treeData, nodeId);
            const rawNode = findNodeInRaw(treeData, nodeId);
            
            if (rawParent && rawNode) {
                const index = rawParent.children.findIndex(c => c.id === nodeId);
                if (index !== -1) {
                    const nodeChildren = rawNode.children || [];
                    rawParent.children.splice(index, 1, ...nodeChildren);
                }
            }
            
            saveAll();
            initChart();
            closeEditPanel();
        }
    });

    document.getElementById("add-root")?.addEventListener("click", () => {
        const name = prompt("Nome do novo organograma:");
        if (name) {
            const id = "proj-" + Date.now();
            projects[id] = { id: id, name: name, data: { id: "root", role: "DIRETORIA", name: "NOVO DIRETOR", docs: "", forwardTo: "", children: [] } };
            activeProjectId = id; treeData = projects[id].data;
            saveAll(); initChart();
            setTimeout(() => openEditPanel(root), 100);
        }
    });

    document.getElementById("btn-export")?.addEventListener("click", () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(treeData, null, 2));
        const a = document.createElement('a'); a.href = dataStr; a.download = `${projects[activeProjectId].name}.json`; a.click();
    });

    document.getElementById("zoom-in")?.addEventListener("click", () => svg.transition().call(zoom.scaleBy, 1.4));
    document.getElementById("zoom-out")?.addEventListener("click", () => svg.transition().call(zoom.scaleBy, 0.7));
    document.getElementById("reset-view")?.addEventListener("click", () => {
        const app = document.getElementById("app");
        if (!document.fullscreenElement) {
            app.requestFullscreen().catch(err => {
                console.error(`Erro ao entrar em tela cheia: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
        
        // Also reset the view
        const c = document.getElementById("canvas");
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(c.clientWidth/2, 80).scale(0.8));
    });


    document.getElementById("theme-toggle")?.addEventListener("click", () => {
        const body = document.body;
        const newTheme = body.getAttribute("data-theme") === "light" ? "dark" : "light";
        body.setAttribute("data-theme", newTheme); lucide.createIcons();
    });

    document.getElementById("select-status")?.addEventListener("change", (e) => {
        if (!activeProjectId || !projects[activeProjectId]) return;
        projects[activeProjectId].status = e.target.value;
        saveAll();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    loadProjectsFromServer();
});

function animateDocumentFlow(startNode) {
    if (!startNode.parent) return;
    
    const path = [];
    let current = startNode;
    while (current.parent) {
        path.push({ source: current.parent, target: current });
        current = current.parent;
    }
    
    let segmentIndex = 0;
    
    function animateSegment() {
        if (segmentIndex >= path.length) return;
        const segment = path[segmentIndex];
        
        const pathData = diagonal(segment.source, segment.target);
        
        const tempPath = g.append("path")
            .attr("d", pathData)
            .style("fill", "none")
            .style("stroke", "none");
            
        const pathNode = tempPath.node();
        const totalLength = pathNode.getTotalLength();
        
        const marker = g.append("g")
            .attr("class", "flow-marker");
            
        const envelope = marker.append("g")
            .attr("transform", "translate(-12, -8)");
            
        envelope.append("rect")
            .attr("width", 24)
            .attr("height", 16)
            .attr("rx", 3)
            .attr("fill", "var(--accent-color)")
            .style("filter", "drop-shadow(0 0 6px var(--accent-color))");
            
        envelope.append("polygon")
            .attr("points", "0,0 12,8 24,0")
            .attr("fill", "rgba(255,255,255,0.7)");
            
        envelope.append("polygon")
            .attr("points", "0,16 12,8 24,16")
            .attr("fill", "rgba(255,255,255,0.3)");

        marker.transition()
            .duration(1000)
            .ease(d3.easeQuadInOut)
            .tween("pathTween", function() {
                return function(t) {
                    const p = pathNode.getPointAtLength(totalLength * (1 - t));
                    marker.attr("transform", `translate(${p.x}, ${p.y})`);
                };
            })
            .on("end", function() {
                marker.remove();
                tempPath.remove();
                
                const parentNodeG = g.selectAll(".node-container")
                    .filter(d => d.data.id === segment.source.data.id);
                    
                parentNodeG.select(".node-rect")
                    .transition()
                    .duration(200)
                    .style("filter", "drop-shadow(0 0 15px var(--accent-color))")
                    .style("stroke", "var(--accent-color)")
                    .style("stroke-width", "3px")
                    .transition()
                    .duration(200)
                    .style("filter", null)
                    .style("stroke", d => d._children ? "var(--accent-color)" : "rgba(255,255,255,0.1)")
                    .style("stroke-width", "1px");
                
                segmentIndex++;
                animateSegment();
            });
    }
    
    animateSegment();
}
