<?php
// public/index.php

require_once __DIR__ . '/../vendor/autoload.php';

use Dotenv\Dotenv;
$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->load();

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$request_uri = $_SERVER['REQUEST_URI'];
$request_method = $_SERVER['REQUEST_METHOD'];
$request_uri = strtok($request_uri, '?');

set_time_limit(3000);

$db_config = [
    'host' => $_ENV['DB_HOST'],
    'port' => $_ENV['DB_PORT'],
    'dbname' => $_ENV['DB_NAME'],
    'user' => $_ENV['DB_USER'],
    'pass' => $_ENV['DB_PASS']
];

function proxyToPython($path, $method = 'GET', $payload = null) {
    $full_uri = $_SERVER['REQUEST_URI'];
    $query_string = '';
    if (strpos($full_uri, '?') !== false) {
        $query_string = '?' . parse_url($full_uri, PHP_URL_QUERY);
    }
    $url = 'http://127.0.0.1:5000' . $path . $query_string;
    
    $ch = curl_init($url);
    
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3000);

    if ($method === 'POST' && $payload) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    }

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    if ($curl_error) {
        http_response_code(503);
        echo json_encode([
            'success' => false, 
            'error' => 'ML Service Unavailable', 
            'details' => $curl_error
        ]);
        exit();
    }

    http_response_code($http_code);
    header('Content-Type: application/json');
    echo $response;
    exit();
}

if (strpos($request_uri, '/api/') === 0) {
    header('Content-Type: application/json');

    if ($request_uri === '/api/info' && $request_method === 'GET') {
        proxyToPython('/info', 'GET');
    }

    if ($request_uri === '/api/health' && $request_method === 'GET') {
        proxyToPython('/health', 'GET');
    }

    if ($request_uri === '/api/datasets' && $request_method === 'GET') {
        proxyToPython('/api/datasets', 'GET');
    }

    if ($request_uri === '/api/train' && $request_method === 'POST') {
        proxyToPython('/api/train', 'POST');
    }

    if (($request_uri === '/api/predict' || $request_uri === '/api/predict-month') && $request_method === 'POST') {
        proxyToPython('/api/predict', 'POST', file_get_contents('php://input'));
    }

    if ($request_uri === '/api/predict/batch' && $request_method === 'POST') {
        proxyToPython('/api/predict/batch', 'POST', file_get_contents('php://input'));
    }

    if ($request_uri === '/api/herd-summary' && $request_method === 'POST') {
        proxyToPython('/api/herd-summary', 'POST', file_get_contents('php://input'));
    }

    if ($request_uri === '/api/herd-summary/current' && $request_method === 'GET') {
        proxyToPython('/api/herd-summary/current', 'GET');
    }

    if ($request_uri === '/api/historical-summary/month' && $request_method === 'GET') {
        proxyToPython('/api/historical-summary/month', 'GET');
    }

    if ($request_uri === '/api/historical-summary/year' && $request_method === 'GET') {
        proxyToPython('/api/historical-summary/year', 'GET');
    }

    if ($request_uri === '/api/cows/ids' && $request_method === 'GET') {
        proxyToPython('/api/cows/ids', 'GET');
    }

    if ($request_uri === '/api/cows/statistics' && $request_method === 'GET') {
        proxyToPython('/api/cows/statistics', 'GET');
    }

    if ($request_uri === '/api/cows/ideal' && $request_method === 'GET') {
        proxyToPython('/api/cows/ideal', 'GET');
    }

    if (preg_match('/^\/api\/cow\/(\d+)$/', $request_uri, $matches) && $request_method === 'GET') {
        proxyToPython('/api/cow/' . $matches[1], 'GET');
    }

    if ($request_uri === '/api/forecast/horizon' && $request_method === 'POST') {
        proxyToPython('/api/forecast/horizon', 'POST', file_get_contents('php://input'));
    }

    if ($request_uri === '/api/cows/predictions' && $request_method === 'GET') {
        proxyToPython('/api/cows/predictions', 'GET');
    }

    if ($request_uri === '/api/forecast/herd' && $request_method === 'POST') {
        proxyToPython('/api/forecast/herd', 'POST', file_get_contents('php://input'));
    }

    if ($request_uri === '/api/messages' && $request_method === 'GET') {
        try {
            $dsn = "pgsql:host={$db_config['host']};port={$db_config['port']};dbname={$db_config['dbname']}";
            $pdo = new PDO($dsn, $db_config['user'], $db_config['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            
            $pdo->exec("CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, text TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
            
            $stmt = $pdo->query("SELECT * FROM messages ORDER BY created_at DESC LIMIT 50");
            echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
        }
        exit();
    }


    if ($request_uri === '/api/register' && $request_method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['login']) || empty($input['password'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Логин и пароль обязательны']);
            exit();
        }

        $email = !empty($input['email']) ? $input['email'] : null;
        if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Некорректный формат email']);
            exit();
        }

        try {
            $dsn = "pgsql:host={$db_config['host']};port={$db_config['port']};dbname={$db_config['dbname']}";
            $pdo = new PDO($dsn, $db_config['user'], $db_config['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            
            $checkTableStmt = $pdo->query("SELECT to_regclass('public.users')");
            $tableExists = $checkTableStmt->fetchColumn();
            
            if (!$tableExists) {
                $pdo->exec("
                    CREATE TABLE users (
                        id SERIAL PRIMARY KEY,
                        login VARCHAR(50) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        email VARCHAR(254) UNIQUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_login TIMESTAMP,
                        is_active BOOLEAN DEFAULT true
                    )
                ");
            } else {
                $checkColumnStmt = $pdo->query("
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'email'
                ");
                $columnExists = $checkColumnStmt->fetchColumn();
                
                if (!$columnExists) {
                    $pdo->exec("ALTER TABLE users ADD COLUMN email VARCHAR(254) UNIQUE");
                } else {
                    $pdo->exec("
                        ALTER TABLE users 
                        ALTER COLUMN email DROP NOT NULL,
                        ALTER COLUMN email TYPE VARCHAR(254)
                    ");
                }
                
                $checkLastLoginStmt = $pdo->query("
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'last_login'
                ");
                if (!$checkLastLoginStmt->fetchColumn()) {
                    $pdo->exec("ALTER TABLE users ADD COLUMN last_login TIMESTAMP");
                }
                
                $checkIsActiveStmt = $pdo->query("
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'is_active'
                ");
                if (!$checkIsActiveStmt->fetchColumn()) {
                    $pdo->exec("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true");
                }
            }
            
            $checkStmt = $pdo->prepare("SELECT id FROM users WHERE login = ? OR (email IS NOT NULL AND email = ?)");
            $checkStmt->execute([$input['login'], $email]);
            if ($checkStmt->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'error' => 'Пользователь с таким логином или email уже существует']);
                exit();
            }
            
            $passwordHash = password_hash($input['password'], PASSWORD_DEFAULT);
            
            if ($email !== null) {
                $stmt = $pdo->prepare("INSERT INTO users (login, password_hash, email) VALUES (?, ?, ?)");
                $stmt->execute([$input['login'], $passwordHash, $email]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO users (login, password_hash) VALUES (?, ?)");
                $stmt->execute([$input['login'], $passwordHash]);
            }
            
            echo json_encode(['success' => true, 'message' => 'Пользователь успешно зарегистрирован']);
        } catch (PDOException $e) {
            error_log("Registration error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Ошибка при регистрации пользователя: ' . $e->getMessage()]);
        }
        exit();
    }


    if ($request_uri === '/api/login' && $request_method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        try {
            $dsn = "pgsql:host={$db_config['host']};port={$db_config['port']};dbname={$db_config['dbname']}";
            $pdo = new PDO($dsn, $db_config['user'], $db_config['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            
            $stmt = $pdo->prepare("SELECT * FROM users WHERE login = ?");
            $stmt->execute([$input['login']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user && password_verify($input['password'], $user['password_hash'])) {
                $updateStmt = $pdo->prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?");
                $updateStmt->execute([$user['id']]);
                
                $token = base64_encode(json_encode([
                    'user_id' => $user['id'],
                    'login' => $user['login'],
                    'exp' => time() + 86400
                ]));
                
                echo json_encode([
                    'success' => true,
                    'token' => $token,
                    'user' => [
                        'id' => $user['id'],
                        'login' => $user['login'],
                        'email' => $user['email']
                    ]
                ]);
            } else {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Неверный логин или пароль']);
            }
        } catch (PDOException $e) {
            error_log("Login error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Ошибка при входе в систему']);
        }
        exit();
    }

    if ($request_uri === '/api/projects' && $request_method === 'GET') {
        try {
            $dsn = "pgsql:host={$db_config['host']};port={$db_config['port']};dbname={$db_config['dbname']}";
            $pdo = new PDO($dsn, $db_config['user'], $db_config['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            
            $stmt = $pdo->query('SELECT "datasetID" as id, "datasetName" as name FROM "Dataset" ORDER BY id DESC');
            $projects = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $result = [];
            foreach ($projects as $project) {
                $cowStmt = $pdo->prepare('SELECT COUNT(*) as count FROM "Cow" WHERE "datasetID" = ?');
                $cowStmt->execute([$project['id']]);
                $cowCount = $cowStmt->fetch(PDO::FETCH_ASSOC);
                
                $result[] = [
                    'id' => $project['id'],
                    'name' => $project['name'],
                    'votes' => $cowCount['count'] ?? 0,
                    'status' => $cowCount['count'] > 0 ? 'активен' : 'неактивен'
                ];
            }
            
            echo json_encode(['success' => true, 'data' => $result], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
        }
        exit();
    }

    if (preg_match('/^\/api\/projects\/(\d+)$/', $request_uri, $matches) && $request_method === 'GET') {
        $projectId = $matches[1];
        
        try {
            $dsn = "pgsql:host={$db_config['host']};port={$db_config['port']};dbname={$db_config['dbname']}";
            $pdo = new PDO($dsn, $db_config['user'], $db_config['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            
            $stmt = $pdo->prepare('SELECT "datasetID" as id, "datasetName" as name FROM "Dataset" WHERE "datasetID" = ?');
            $stmt->execute([$projectId]);
            $project = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$project) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Проект не найден']);
                exit();
            }
            
            $cowStmt = $pdo->prepare('SELECT * FROM "Cow" WHERE "datasetID" = ?');
            $cowStmt->execute([$projectId]);
            $cows = $cowStmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true, 
                'data' => [
                    'project' => $project,
                    'cows' => $cows
                ]
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
        }
        exit();
    }

    if ($request_uri === '/api/projects' && $request_method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (empty($input['name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Название проекта обязательно']);
            exit();
        }
        
        try {
            $dsn = "pgsql:host={$db_config['host']};port={$db_config['port']};dbname={$db_config['dbname']}";
            $pdo = new PDO($dsn, $db_config['user'], $db_config['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            
            $stmt = $pdo->prepare('INSERT INTO "Dataset" ("datasetName") VALUES (?) RETURNING "datasetID"');
            $stmt->execute([$input['name']]);
            $newId = $stmt->fetch(PDO::FETCH_ASSOC)['datasetID'];
            
            echo json_encode([
                'success' => true, 
                'message' => 'Проект успешно создан',
                'id' => $newId
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
        }
        exit();
    }

}

$file_path = __DIR__ . $request_uri;

if ($request_uri !== '/' && is_file($file_path)) {
    $mime_types = [
        'css'  => 'text/css',
        'js'   => 'application/javascript',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'svg'  => 'image/svg+xml',
        'json' => 'application/json'
    ];
    $ext = pathinfo($file_path, PATHINFO_EXTENSION);
    if (isset($mime_types[$ext])) {
        header('Content-Type: ' . $mime_types[$ext]);
    }
    readfile($file_path);
    exit();
}

$index_html = __DIR__ . '/index.html';
if (file_exists($index_html)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($index_html);
} else {
    http_response_code(500);
    echo "Frontend build not found. Please run 'npm run build' in your React project.";
}