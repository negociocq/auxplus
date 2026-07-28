<?php
session_start();
require 'db.php'; // Certifique-se de que o caminho está correto

header('Content-Type: application/json');

$response = [
    'status' => 'error',
    'message' => 'Um erro desconhecido ocorreu.'
];

try {
    // Verifica se o usuário está autenticado
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('Usuário não autenticado.');
    }

    // Verifica se o método de solicitação é POST
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['file'];
            $folder_id = isset($_POST['folder_id']) ? (int)$_POST['folder_id'] : 3;
            $upload_dir = 'uploads/';

            if (!is_dir($upload_dir)) {
                if (!mkdir($upload_dir, 0755, true)) {
                    throw new Exception('Não foi possível criar o diretório de upload.');
                }
            }

            if (!is_writable($upload_dir)) {
                throw new Exception('Diretório de upload não é gravável.');
            }

            $file_path = $upload_dir . basename($file['name']);

            if (move_uploaded_file($file['tmp_name'], $file_path)) {
                $handle = fopen($file_path, 'r');

                if ($handle !== false) {
                    // Ignora o cabeçalho
                    fgetcsv($handle);

                    $stmt = $pdo->prepare("INSERT INTO items (folder_id, item_id, name, due_date, phone, status) VALUES (?, ?, ?, ?, ?, ?)");

                    while (($data = fgetcsv($handle, 1000, ',')) !== false) {
                        if (count($data) < 5) {
                            continue; // Ignora linhas inválidas
                        }

                        $item_id = trim($data[0]);
                        $name = trim($data[1]);
                        $due_date = trim($data[2]);
                        $phone = trim($data[3]);

                        // Converte a data
                        $due_date = str_replace('/', '-', $due_date);
                        $date = DateTime::createFromFormat('Y-m-d', $due_date);
                        if (!$date) {
                            $date = DateTime::createFromFormat('d-m-Y', $due_date);
                        }

                        if (!$date) {
                            continue; // Ignora datas inválidas
                        }

                        $status = getStatus($date->format('Y-m-d'));

                        $stmt->execute([$folder_id, $item_id, $name, $date->format('Y-m-d'), $phone, $status]);
                    }

                    fclose($handle);
                    $response['status'] = 'success';
                    $response['message'] = 'Arquivo processado e itens adicionados com sucesso.';
                } else {
                    throw new Exception('Erro ao abrir o arquivo.');
                }
            } else {
                throw new Exception('Erro ao mover o arquivo para o diretório de upload.');
            }
        } else {
            $error_code = $_FILES['file']['error'];
            $error_messages = [
                UPLOAD_ERR_INI_SIZE => 'O arquivo enviado excede o limite máximo do servidor.',
                UPLOAD_ERR_FORM_SIZE => 'O arquivo enviado excede o limite máximo permitido pelo formulário.',
                UPLOAD_ERR_PARTIAL => 'O arquivo foi parcialmente enviado.',
                UPLOAD_ERR_NO_FILE => 'Nenhum arquivo foi enviado.',
                UPLOAD_ERR_NO_TMP_DIR => 'Falta diretório temporário.',
                UPLOAD_ERR_CANT_WRITE => 'Falha ao gravar o arquivo no disco.',
                UPLOAD_ERR_EXTENSION => 'Uma extensão PHP interrompeu o upload do arquivo.',
            ];

            $error_message = isset($error_messages[$error_code]) ? $error_messages[$error_code] : 'Erro desconhecido no upload.';
            throw new Exception($error_message);
        }
    } else {
        throw new Exception('Método de solicitação inválido.');
    }
} catch (Exception $e) {
    $response['message'] = $e->getMessage();
    error_log($e->getMessage());
}

echo json_encode($response);

function getStatus($due_date) {
    $now = new DateTime();
    $due_date = new DateTime($due_date);
    $interval = $now->diff($due_date);

    if ($interval->invert) {
        return 'Já Vencido';
    } elseif ($interval->days <= 10) {
        return 'Perto de Vencer';
    } else {
        return 'Longe de Vencer';
    }
}
