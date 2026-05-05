<?php
header('Content-Type: application/json');

$dataDir = 'data/';
if (!is_dir($dataDir)) mkdir($dataDir, 0777, true);
if (!is_dir($dataDir . 'backups/')) mkdir($dataDir . 'backups/', 0777, true);

$action = $_GET['action'] ?? '';

// --- Funções Auxiliares ---
function updateNodeInTree(&$node, $nodeId, $newData) {
    if ($node['id'] === $nodeId) {
        foreach ($newData as $key => $value) {
            if ($key !== 'children' && $key !== 'id') {
                $node[$key] = $value;
            }
        }
        return true;
    }
    if (isset($node['children'])) {
        foreach ($node['children'] as &$child) {
            if (updateNodeInTree($child, $nodeId, $newData)) return true;
        }
    }
    return false;
}

// --- Fluxo Principal ---
switch ($action) {
    case 'list':
        $projects = [];
        $files = glob($dataDir . '*.json');
        foreach ($files as $file) {
            $id = basename($file, '.json');
            $content = json_decode(file_get_contents($file), true);
            if ($content) $projects[$id] = $content;
        }
        echo json_encode($projects);
        break;

    case 'save':
        $data = json_decode(file_get_contents('php://input'), true);
        if ($data && isset($data['id'])) {
            $id = preg_replace('/[^a-zA-Z0-9_\-]/', '', $data['id']);
            $filename = $dataDir . $id . '.json';
            
            // Bloqueio de arquivo para evitar conflito simultâneo
            $fp = fopen($filename, "c+");
            if (flock($fp, LOCK_EX)) {
                $jsonData = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                ftruncate($fp, 0);
                rewind($fp);
                fwrite($fp, $jsonData);
                fflush($fp);
                flock($fp, LOCK_UN);
                
                // Backup
                file_put_contents($dataDir . 'backups/' . $id . '_' . date('Ymd_His') . '.json', $jsonData);
                echo json_encode(['status' => 'success']);
            }
            fclose($fp);
        }
        break;

    case 'update_node':
        $data = json_decode(file_get_contents('php://input'), true);
        if ($data && isset($data['projectId'], $data['nodeId'])) {
            $projectId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $data['projectId']);
            $filename = $dataDir . $projectId . '.json';
            
            if (file_exists($filename)) {
                $fp = fopen($filename, "r+");
                if (flock($fp, LOCK_EX)) {
                    $content = "";
                    while (!feof($fp)) { $content .= fread($fp, 8192); }
                    $projectData = json_decode($content, true);
                    
                    if (updateNodeInTree($projectData['data'], $data['nodeId'], $data['nodeData'])) {
                        // Verifica se o projeto está em readonly (apenas para usuários comuns)
                        $status = $projectData['status'] ?? 'public';
                        if ($status === 'readonly' && !isset($data['isAdmin'])) {
                            flock($fp, LOCK_UN);
                            fclose($fp);
                            http_response_code(403);
                            echo json_encode(['error' => 'Este organograma está em modo de apenas leitura.']);
                            exit;
                        }

                        $jsonData = json_encode($projectData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                        ftruncate($fp, 0);
                        rewind($fp);
                        fwrite($fp, $jsonData);
                        fflush($fp);
                        
                        // Backup rápido
                        file_put_contents($dataDir . 'backups/' . $projectId . '_node_' . date('His') . '.json', $jsonData);
                    }
                    flock($fp, LOCK_UN);
                }
                fclose($fp);
                echo json_encode(['status' => 'success']);
            }
        }
        break;

    case 'check_lock':
        $id = $_GET['id'] ?? '';
        $status = 'public';
        if ($id) {
            $fn = $dataDir . preg_replace('/[^a-zA-Z0-9_\-]/', '', $id) . '.json';
            if (file_exists($fn)) {
                $p = json_decode(file_get_contents($fn), true);
                $status = $p['status'] ?? 'public';
            }
        }
        // Agora o check_lock retorna apenas o status, sem trava automática
        echo json_encode(['locked' => false, 'status' => $status]);
        break;

    case 'delete':
        $data = json_decode(file_get_contents('php://input'), true);
        if (isset($data['id'])) {
            $fn = $dataDir . preg_replace('/[^a-zA-Z0-9_\-]/', '', $data['id']) . '.json';
            if (file_exists($fn)) unlink($fn);
            echo json_encode(['status' => 'success']);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Action not allowed']);
        break;
}
