<?php
session_start();
require 'db.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

$user_id = $_SESSION['user_id'];
$folder_id = $_GET['folder_id'] ?? null;

// Função para limpar e validar dados
function cleanData($data) {
    return htmlspecialchars(trim($data));
}

// Processar o upload do arquivo
if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_FILES['file']) && isset($_POST['folder_id'])) {
    if ($_FILES['file']['error'] == 0) {
        $upload_dir = 'uploads/'; // Diretório para armazenar uploads
        $upload_file = $upload_dir . basename($_FILES['file']['name']);
        
        // Cria o diretório se não existir
        if (!is_dir($upload_dir)) {
            mkdir($upload_dir, 0755, true);
        }

        // Move o arquivo para o diretório de uploads
        if (move_uploaded_file($_FILES['file']['tmp_name'], $upload_file)) {
            echo "Arquivo enviado com sucesso.<br>";

            // Leitura e processamento do arquivo para adicionar dados na tabela 'items'
            if (($handle = fopen($upload_file, "r")) !== FALSE) {
                $header = fgetcsv($handle); // Lê o cabeçalho
                if ($header === FALSE) {
                    echo "Erro ao ler o cabeçalho do arquivo CSV.<br>";
                } else {
                    // Verifica o cabeçalho esperado
                    if (count($header) != 5 || !in_array('usuario', $header) || !in_array('nome', $header) || !in_array('vencimento', $header) || !in_array('número', $header) || !in_array('price', $header)) {
                        echo "O cabeçalho do arquivo CSV está incorreto. Esperado: usuario, nome, vencimento, número, price.<br>";
                        fclose($handle);
                        exit();
                    }

                    // Contadores de novas inserções e atualizações
                    $new_items = 0;
                    $updated_items = 0;

                    // Ler cada linha e processar os dados
                    while (($data = fgetcsv($handle, 1000, ',')) !== FALSE) {
                        // Exibir dados lidos para depuração
                        echo "Dados lidos: " . implode(", ", $data) . "<br>";
                        if (count($data) == 5) { // Verifica se há 5 colunas
                            $usuario = cleanData($data[0]);
                            $name = cleanData($data[1]);
                            $due_date = cleanData($data[2]);
                            $phone = cleanData($data[3]);
                            $price = cleanData($data[4]); // Pegando o preço
                            $status = 'active'; // Definindo um status padrão

                            // Verifica se a data está no formato correto
                            if (!DateTime::createFromFormat('Y-m-d', $due_date)) {
                                echo "Data inválida: $due_date.<br>";
                                continue;
                            }

                            // Verifica se o preço é válido
                            if (!is_numeric($price)) {
                                echo "Preço inválido: $price.<br>";
                                continue;
                            }

                            try {
                                // Verificar se o "usuario" já existe (pelo telefone)
                                echo "Verificando se o usuário existe para usuario: $usuario <br>";
                                $stmt = $pdo->prepare("SELECT * FROM items WHERE phone = ?");
                                $stmt->execute([$usuario]);
                                $existing_user = $stmt->fetch();

                                // Depuração da verificação
                                echo "Resultado da verificação: " . ($existing_user ? 'Encontrado' : 'Não encontrado') . "<br>";

                                if ($existing_user) {
                                    // Atualiza os campos 'due_date' e 'phone' do usuário existente
                                    echo "Usuário encontrado, atualizando...<br>";
                                    $stmt = $pdo->prepare("UPDATE items SET due_date = ?, phone = ? WHERE phone = ?");
                                    $stmt->execute([$due_date, $phone, $usuario]);
                                    $updated_items++; // Incrementa o contador de atualizações
                                    echo "Usuário atualizado.<br>";
                                } else {
                                    // Inserir um novo item (usuário não encontrado)
                                    echo "Usuário não encontrado, inserindo novo item...<br>";
                                    $stmt = $pdo->prepare("INSERT INTO items (folder_id, phone, name, due_date, price, status) VALUES (?, ?, ?, ?, ?, ?)");
                                    $stmt->execute([$folder_id, $usuario, $name, $due_date, $price, $status]);
                                    $new_items++; // Incrementa o contador de novas inserções
                                    echo "Novo usuário inserido.<br>";
                                }
                            } catch (PDOException $e) {
                                echo "Erro ao inserir/atualizar dados: " . $e->getMessage() . "<br>";
                            }
                        } else {
                            echo "Linha inválida no arquivo CSV: " . implode(", ", $data) . "<br>";
                        }
                    }

                    fclose($handle);

                    // Exibindo a mensagem final com base no número de itens inseridos/atualizados
                    if ($new_items > 0 && $updated_items > 0) {
                        echo "Items adicionados/atualizados com sucesso.<br>";
                    } elseif ($new_items > 0) {
                        echo "Items adicionados com sucesso.<br>";
                    } elseif ($updated_items > 0) {
                        echo "Items atualizados com sucesso.<br>";
                    } else {
                        echo "Nenhuma alteração foi realizada.<br>";
                    }
                }
            } else {
                echo "Erro ao abrir o arquivo CSV.<br>";
            }
        } else {
            echo "Falha ao enviar o arquivo.<br>";
        }
    } else {
        echo "Erro no upload do arquivo.<br>";
    }
}
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Importar Itens</title>
</head>
<body>
    <h1>Importar Itens em Massa</h1>
    
    <!-- Formulário para upload de arquivos -->
    <form action="import_items.php?folder_id=<?php echo htmlspecialchars($folder_id); ?>" method="post" enctype="multipart/form-data">
        <label for="file">Escolha o arquivo CSV:</label>
        <input type="file" name="file" id="file" required>
        <br><br>
        <input type="hidden" name="folder_id" value="<?php echo htmlspecialchars($folder_id); ?>">
        <button type="submit">Importar</button>
    </form>
</body>
</html>
