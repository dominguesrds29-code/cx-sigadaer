<?php
header('Content-Type: application/json');

$dataDir = 'data/';
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'list':
        $projects = [];
        if (is_dir($dataDir)) {
            $files = glob($dataDir . '*.json');
            foreach ($files as $file) {
                $id = basename($file, '.json');
                $content = json_decode(file_get_contents($file), true);
                $projects[$id] = $content;
            }
        }
        echo json_encode($projects);
        break;

    case 'save':
        $data = json_decode(file_get_contents('php://input'), true);
        if ($data && isset($data['id'])) {
            $id = preg_replace('/[^a-zA-Z0-9_\-]/', '', $data['id']);
            $filename = $dataDir . $id . '.json';
            
            // 1. Garantir que a pasta de backups exista
            $backupDir = $dataDir . 'backups/';
            if (!is_dir($backupDir)) {
                mkdir($backupDir, 0777, true);
            }

            // 2. Criar um backup com timestamp ANTES ou DURANTE o salvamento
            // Usamos o formato Ymd_His para fácil ordenação alfabética
            $timestamp = date('Ymd_His');
            $backupFile = $backupDir . $id . '_' . $timestamp . '.json';
            
            $jsonData = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            
            // Salva a cópia de segurança
            file_put_contents($backupFile, $jsonData);

            // 3. Atualiza o arquivo principal
            if (file_put_contents($filename, $jsonData)) {
                echo json_encode([
                    'status' => 'success', 
                    'message' => 'Arquivo atualizado e backup criado.',
                    'file' => $id . '.json',
                    'backup' => basename($backupFile)
                ]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Erro ao gravar o arquivo principal. Verifique as permissões da pasta data/.']);
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Dados inválidos para salvamento.']);
        }
        break;

    case 'delete':
        $data = json_decode(file_get_contents('php://input'), true);
        if ($data && isset($data['id'])) {
            $filename = $dataDir . preg_replace('/[^a-zA-Z0-9_\-]/', '', $data['id']) . '.json';
            if (file_exists($filename)) {
                unlink($filename);
                echo json_encode(['status' => 'success']);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'File not found']);
            }
        }
        break;

    case 'update_node':
        $data = json_decode(file_get_contents('php://input'), true);
        if ($data && isset($data['projectId']) && isset($data['nodeId']) && isset($data['nodeData'])) {
            $projectId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $data['projectId']);
            $filename = $dataDir . $projectId . '.json';
            
            if (file_exists($filename)) {
                $projectData = json_decode(file_get_contents($filename), true);
                
                // Função recursiva para atualizar o nó
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

                if (updateNodeInTree($projectData, $data['nodeId'], $data['nodeData'])) {
                    $jsonData = json_encode($projectData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                    
                    // Backup antes de salvar
                    $backupDir = $dataDir . 'backups/';
                    if (!is_dir($backupDir)) mkdir($backupDir, 0777, true);
                    $timestamp = date('Ymd_His');
                    $backupFile = $backupDir . $projectId . '_nodeUpdate_' . $timestamp . '.json';
                    file_put_contents($backupFile, $jsonData);

                    if (file_put_contents($filename, $jsonData)) {
                        echo json_encode(['status' => 'success', 'message' => 'Nó atualizado individualmente.']);
                    } else {
                        http_response_code(500);
                        echo json_encode(['error' => 'Erro ao salvar arquivo.']);
                    }
                } else {
                    http_response_code(404);
                    echo json_encode(['error' => 'Nó não encontrado na estrutura.']);
                }
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Projeto não encontrado.']);
            }
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Action not allowed']);
        break;
}
?>
