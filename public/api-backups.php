<?php
header('Content-Type: application/json');

$backupDir = 'data/backups/';
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'list':
        $backups = [];
        if (is_dir($backupDir)) {
            $files = glob($backupDir . '*.json');
            // Ordenar por data de modificação (mais recentes primeiro)
            usort($files, function($a, $b) {
                return filemtime($b) - filemtime($a);
            });

            foreach ($files as $file) {
                $filename = basename($file);
                $backups[] = [
                    'filename' => $filename,
                    'date' => date("d/m/Y H:i:s", filemtime($file)),
                    'size' => round(filesize($file) / 1024, 2) . ' KB'
                ];
            }
        }
        echo json_encode($backups);
        break;

    case 'get':
        $file = $_GET['file'] ?? '';
        // Proteção básica contra navegação de diretório
        $file = basename($file);
        $path = $backupDir . $file;
        
        if (file_exists($path) && pathinfo($path, PATHINFO_EXTENSION) === 'json') {
            echo file_get_contents($path);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Arquivo não encontrado']);
        }
        break;

    case 'restore':
        $file = $_GET['file'] ?? '';
        $file = basename($file);
        $path = $backupDir . $file;
        
        if (file_exists($path) && pathinfo($path, PATHINFO_EXTENSION) === 'json') {
            $content = file_get_contents($path);
            $projectData = json_decode($content, true);
            if ($projectData && isset($projectData['id'])) {
                $id = preg_replace('/[^a-zA-Z0-9_\-]/', '', $projectData['id']);
                $targetPath = 'data/' . $id . '.json';
                
                if (file_put_contents($targetPath, $content) !== false) {
                    echo json_encode(['status' => 'success', 'projectId' => $id]);
                } else {
                    http_response_code(500);
                    echo json_encode(['error' => 'Não foi possível escrever o arquivo de destino']);
                }
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Backup inválido ou sem ID de projeto válido']);
            }
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Arquivo de backup não encontrado']);
        }
        break;


    case 'search':
        $query = $_GET['q'] ?? '';
        $onlyWithForward = ($_GET['forward'] ?? '0') === '1';
        $results = [];

        if ($query && is_dir($backupDir)) {
            $files = glob($backupDir . '*.json');
            
            // Função recursiva para buscar no nó e nos filhos
            function findInTree($node, $query, $onlyWithForward) {
                $name = $node['name'] ?? '';
                $role = $node['role'] ?? '';
                $forward = trim($node['forwardTo'] ?? '');

                // Verifica se o nome ou cargo batem com a busca
                if (mb_stripos($name, $query) !== false || mb_stripos($role, $query) !== false) {
                    if (!$onlyWithForward || !empty($forward)) {
                        return true;
                    }
                }

                // Busca nos filhos
                if (!empty($node['children'])) {
                    foreach ($node['children'] as $child) {
                        if (findInTree($child, $query, $onlyWithForward)) return true;
                    }
                }
                return false;
            }

            foreach ($files as $file) {
                $data = json_decode(file_get_contents($file), true);
                if (!$data) continue;
                
                $rootNode = $data['data'] ?? $data;
                if (findInTree($rootNode, $query, $onlyWithForward)) {
                    $results[] = [
                        'filename' => basename($file),
                        'date' => date("d/m/Y H:i:s", filemtime($file)),
                        'size' => round(filesize($file) / 1024, 2) . ' KB'
                    ];
                }
            }
        }
        echo json_encode($results);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Ação não permitida']);
        break;
}
