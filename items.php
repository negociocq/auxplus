<?php
session_start();
require 'db.php';

// Verifica se o usuário está logado
if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

// Obtém o folder_id de várias fontes
$folder_id = null;

// Prioridade: URL (GET)
if (isset($_GET['folder_id']) && is_numeric($_GET['folder_id'])) {
    $folder_id = (int) $_GET['folder_id'];
    $_SESSION['folder_id'] = $folder_id; // salva na sessão para uso futuro
} elseif (isset($_SESSION['folder_id']) && is_numeric($_SESSION['folder_id'])) {
    $folder_id = $_SESSION['folder_id'];
}

// Se não tiver, redireciona para uma página padrão
if (!$folder_id) {
    header("Location: dashboard.php");
    exit();
}

// Obtém o ano selecionado
$selected_year = $_GET['year'] ?? date('Y');

// --- Início do código para recuperar informações da pasta ---

// Dados da pasta
$folder_stmt = $pdo->prepare("SELECT name, type FROM folders WHERE id = ?");
$folder_stmt->execute([$folder_id]);
$folder = $folder_stmt->fetch();
$folder_name = $folder['name'] ?? "Pasta Desconhecida";

// --- INÍCIO DA CORREÇÃO PARA CONFIGURAÇÕES DA PASTA ---

// Define os valores padrão para as configurações da pasta (3 e 3)
$default_near_due_days = 3;
$default_far_due_days = 3;

// Inicializa variáveis para os prazos com os valores padrão
$near_due_days = $default_near_due_days;
$far_due_days = $default_far_due_days;

// Inicializa uma variável de mensagem
$message = '';

// Verifica se as configurações da pasta existem
$stmt_check_settings = $pdo->prepare("SELECT COUNT(*) FROM folder_settings WHERE folder_id = ?");
$stmt_check_settings->execute([$folder_id]);
$settings_exist = $stmt_check_settings->fetchColumn();

// Se as configurações não existirem, crie-as com os valores padrão
if ($settings_exist == 0) {
    $stmt_insert_settings = $pdo->prepare("INSERT INTO folder_settings (folder_id, near_due_days, far_due_days) VALUES (?, ?, ?)");
    // Tente inserir e verifique se foi bem-sucedido
    if ($stmt_insert_settings->execute([$folder_id, $default_near_due_days, $default_far_due_days])) {
        // As configurações foram criadas com sucesso, as variáveis $near_due_days e $far_due_days
        // já estão com os valores padrão que acabamos de inserir.
    } else {
        // Se houver um erro na inserção, você pode querer registrar ou exibir uma mensagem
        error_log("Erro ao inserir configurações padrão para a pasta " . $folder_id);
        // As variáveis $near_due_days e $far_due_days ainda manterão os valores padrão inicializados
    }
} else {
    // Se as configurações existirem, obtém os valores armazenados no banco de dados
    $stmt = $pdo->prepare("SELECT near_due_days, far_due_days FROM folder_settings WHERE folder_id = ?");
    $stmt->execute([$folder_id]);
    $settings = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($settings) {
        $near_due_days = $settings['near_due_days'];
        $far_due_days = $settings['far_due_days'];
    }
    // Se $settings for falso (embora improvável após a verificação de existência),
    // as variáveis manterão os valores padrão inicializados.
}

// Atualiza as configurações de vencimento para a pasta específica (se o formulário for submetido)
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['update_settings'])) {
    // Certifique-se de que os valores POST estão presentes antes de usá-los
    if (isset($_POST['near_due_days']) && isset($_POST['far_due_days'])) {
        $near_due_days = (int)$_POST['near_due_days'];
        $far_due_days = (int)$_POST['far_due_days'];

        // Atualiza os valores no banco de dados
        $stmt = $pdo->prepare("UPDATE folder_settings SET near_due_days = ?, far_due_days = ? WHERE folder_id = ?");

        if ($stmt->execute([$near_due_days, $far_due_days, $folder_id])) {
            $message = "Configurações atualizadas com sucesso.";
            // Opcional: Redirecionar para evitar reenvio do formulário ao recarregar
            // header("Location: dashboard.php?page=items&folder_id=" . htmlspecialchars($folder_id));
            // exit();
        } else {
            $message = "Erro ao atualizar as configurações.";
        }
    } else {
        $message = "Erro: Dados de configuração inválidos.";
    }
}

// --- FIM DA CORREÇÃO PARA CONFIGURAÇÕES DA PASTA ---


// Recuperar itens com base no status atualizado e pesquisa
// Use as variáveis $near_due_days e $far_due_days que agora refletem
// as configurações da pasta (se existirem) ou os valores padrão (se não existirem)
$search_query = $_POST['search'] ?? '';
$items_stmt = $pdo->prepare("
    SELECT *,
    CASE
        WHEN status = 'Sem Vencimento' THEN 'item-sem-vencimento'
        WHEN due_date IS NULL THEN 'item-sem-vencimento' -- Trata due_date NULL como sem vencimento
        WHEN DATEDIFF(due_date, NOW()) > ? THEN 'item-longe'
        WHEN DATEDIFF(due_date, NOW()) <= ? AND DATEDIFF(due_date, NOW()) >= 0 THEN 'item-perto'
        ELSE 'item-vencido'
    END AS status_class,
    CASE
        WHEN status = 'Sem Vencimento' THEN 0
        WHEN due_date IS NULL THEN 0 -- Trata due_date NULL como sem vencimento
        WHEN DATEDIFF(due_date, NOW()) > ? THEN 1
        WHEN DATEDIFF(due_date, NOW()) <= ? AND DATEDIFF(due_date, NOW()) >= 0 THEN 2
        ELSE 3
    END AS status_order
    FROM items
    WHERE folder_id = ?
    AND (item_id LIKE ? OR name LIKE ?)
    ORDER BY status_order, due_date DESC
");
$items_stmt->execute([$far_due_days, $near_due_days, $far_due_days, $near_due_days, $folder_id, "%$search_query%", "%$search_query%"]);
$items = $items_stmt->fetchAll();

// AGORA CALCULE AS CONTAGEENS DEPOIS DE OBTER OS ITENS
$counts = [
    'item-longe' => 0,
    'item-perto' => 0,
    'item-vencido' => 0,
    'item-sem-vencimento' => 0
];

if (isset($items) && is_array($items)) {
    foreach ($items as $item) {
        // Certifique-se de que 'status_class' existe no array $item
        if (isset($item['status_class']) && isset($counts[$item['status_class']])) {
            $counts[$item['status_class']]++;
        }
    }
}

$totalItems = array_sum($counts);

// Obtendo itens do banco de dados para o gráfico de total mensal
$stmt_monthly = $pdo->prepare("SELECT created_at, price, due_date FROM items WHERE folder_id = ? ORDER BY created_at ASC");
$stmt_monthly->execute([$folder_id]);
$items_monthly_chart = $stmt_monthly->fetchAll(PDO::FETCH_ASSOC);


// Inicializa variáveis para total mensal
$monthly_totals = [];
$current_month = new DateTime();
$current_year = $current_month->format('Y');

// Inicializa todos os meses do ano com 0
for ($i = 1; $i <= 12; $i++) {
    $month_key = $selected_year . '-' . str_pad($i, 2, '0', STR_PAD_LEFT);
    $monthly_totals[$month_key] = 0;
}

// Loop para calcular totais mensais
foreach ($items_monthly_chart as $item) {
    $created_at = !empty($item['created_at']) ? new DateTime($item['created_at']) : null;
    $due_date = !empty($item['due_date']) ? new DateTime($item['due_date']) : null;

    if ($created_at !== null && $due_date !== null) {
        $price = (float)$item['price'];

        for ($date = clone $created_at; $date <= $current_month; $date->modify('first day of next month')) {
            $month_key = $date->format('Y-m');

            if (isset($monthly_totals[$month_key])) {
                if ($month_key < $current_month->format('Y-m')) {
                    if ($due_date >= new DateTime($month_key . '-01')) {
                        $monthly_totals[$month_key] += $price;
                    }
                } elseif ($month_key == $current_month->format('Y-m')) {
                    if ($due_date >= new DateTime()) {
                        $monthly_totals[$month_key] += $price;
                    }
                }
            }
        }
    }
}


// Preparar dados finais para o gráfico
$months = array_keys($monthly_totals);
$total_prices = array_values($monthly_totals);
$formatted_prices = array_map(function($price) {
    return number_format($price, 2, ',', '.');
}, $total_prices);

// Query para obter o nome e tipo da pasta
$folder_stmt = $pdo->prepare("SELECT name, type FROM folders WHERE id = ?");
$folder_stmt->execute([$folder_id]);
$folder = $folder_stmt->fetch();
$folder_name = $folder['name'] ?? "Pasta Desconhecida";
$folder_type = $folder['type'] ?? "Tipo Desconhecido";

// Tratamento de upload de arquivo
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['file'])) {
    if ($_FILES['file']['error'] == UPLOAD_ERR_OK) {
        $fileTmpPath = $_FILES['file']['tmp_name'];
        $handle = fopen($fileTmpPath, "r");
        if ($handle) {
            while (($data = fgetcsv($handle, 1000, ",")) !== FALSE) {
                if (count($data) >= 4) { // Ajuste para permitir 4 ou 5 colunas
                    $item_id = $data[0];
                    $name = $data[1];
                    $due_date = !empty($data[2]) ? $data[2] : null; // Pode ser nulo
                    $phone = $data[3];
                    $price = $data[4] ?? 0; // Preço pode estar na 5ª coluna ou ser 0

                    // Determina o status com base na data de vencimento
                    $status = ($due_date === null) ? 'Sem Vencimento' : 'Com Vencimento';

                    // Check if the item already exists
                    $stmt = $pdo->prepare("SELECT * FROM items WHERE item_id = ? AND folder_id = ?");
                    $stmt->execute([$item_id, $folder_id]);
                    $existing_item = $stmt->fetch(PDO::FETCH_ASSOC);

                    if ($existing_item === false) {
                        // Item does not exist, insert it
                        $stmt = $pdo->prepare("INSERT INTO items (folder_id, item_id, name, due_date, phone, status, price) VALUES (?, ?, ?, ?, ?, ?, ?)");
                        $stmt->execute([$folder_id, $item_id, $name, $due_date, $phone, $status, $price]);
                    } else {
                         // Item exists, update only the due date, phone, status, and price
                        $stmt = $pdo->prepare("UPDATE items SET due_date = ?, phone = ?, status = ?, price = ? WHERE item_id = ? AND folder_id = ?");
                        $stmt->execute([$due_date, $phone, $status, $price, $item_id, $folder_id]);
                    }
                }
            }
            fclose($handle);
            echo "<script>alert('Items uploaded successfully.'); window.location.href='dashboard.php?page=items&folder_id=" . htmlspecialchars($folder_id) . "';</script>";
        } else {
            echo "<script>alert('Could not open the file.'); window.history.back();</script>";
        }
    } else {
        echo "<script>alert('File upload error.'); window.history.back();</script>";
    }
}


// Calcular total de preços
$total_price = 0;
if (isset($items) && is_array($items)) {
    foreach ($items as $item) {
        if (isset($item['price'])) {
            $total_price += floatval($item['price']);
        }
    }
}

// Debugging: Exibe o total de preços no log de erros
error_log("Total Price: " . number_format($total_price, 2, '.', ''));

// Aqui você pode continuar com a lógica de adição, edição e exclusão de itens
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !isset($_FILES['file']) && !isset($_POST['update_settings'])) { // Adicionado !isset($_FILES['file']) e !isset($_POST['update_settings']) para evitar conflito com upload e atualização de configurações
    if (isset($_POST['add_item'])) {
        try {
            $item_id = $_POST['item_id'];
            $name = $_POST['name'];
            $phone = $_POST['phone'];
            $notes = $_POST['notes'] ?? '';
            $price = $_POST['price'];

            // Verifica se a opção "Sem Vencimento" foi marcada
            $no_due_date = isset($_POST['no_due_date']) && $_POST['no_due_date'] == '1'; // Verifica se o valor é '1'
            $status = $no_due_date ? 'Sem Vencimento' : 'Com Vencimento';
            $due_date = $no_due_date ? null : $_POST['due_date'];

            // Verifica se o item com o mesmo item_id já existe na mesma pasta
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM items WHERE item_id = ? AND folder_id = ?");
            $stmt->execute([$item_id, $folder_id]);
            $exists = $stmt->fetchColumn();

            if ($exists == 0) {
                $stmt = $pdo->prepare("INSERT INTO items (folder_id, item_id, name, due_date, phone, status, price, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$folder_id, $item_id, $name, $due_date, $phone, $status, $price, $notes]);
                echo "<script>alert('Item adicionado com sucesso.'); window.location.href='dashboard.php?page=items&folder_id=" . htmlspecialchars($folder_id) . "';</script>";
            } else {
                echo "<script>alert('Item já existe na pasta.'); window.location.href='dashboard.php?page=items&folder_id=" . htmlspecialchars($folder_id) . "';</script>";
            }
        } catch (Exception $e) {
            echo "<script>alert('Ocorreu um erro ao adicionar o item: " . htmlspecialchars($e->getMessage()) . "'); window.location.href='dashboard.php?page=items&folder_id=" . htmlspecialchars($folder_id) . "';</script>";
        }
    } else if (isset($_POST['edit_item'])) {
        $old_item_id = $_POST['old_item_id'];
        $new_item_id = $_POST['item_id'];
        $name = $_POST['name'];
        $phone = $_POST['phone'];
        $notes = $_POST['notes'] ?? '';
        $price = $_POST['price'];
        $created_at = $_POST['created_at']; // Capture o valor da data de criação

        // Verifica se a opção "Sem Vencimento" foi marcada
        $status = isset($_POST['no_due_date']) && $_POST['no_due_date'] == '1' ? 'Sem Vencimento' : 'Com Vencimento';
        $due_date = ($status === 'Sem Vencimento') ? null : $_POST['due_date'];

        // Atualiza o item
        $stmt = $pdo->prepare("UPDATE items SET item_id = ?, name = ?, due_date = ?, phone = ?, notes = ?, price = ?, status = ?, created_at = ? WHERE item_id = ? AND folder_id = ?");
        $stmt->execute([$new_item_id, $name, $due_date, $phone, $notes, $price, $status, $created_at, $old_item_id, $folder_id]);

        echo "<script>alert('Item atualizado com sucesso.'); window.location.href='dashboard.php?page=items&folder_id=" . htmlspecialchars($folder_id) . "';</script>";
    } else if (isset($_POST['delete_item'])) {
        $item_id = $_POST['item_id'];
        $stmt = $pdo->prepare("DELETE FROM items WHERE item_id = ? AND folder_id = ?");
        $stmt->execute([$item_id, $folder_id]);

        echo "<script>alert('Item excluído com sucesso.'); window.location.href='dashboard.php?page=items&folder_id=" . htmlspecialchars($folder_id) . "';</script>";
    } else if (isset($_POST['delete_all_items'])) {
        $stmt = $pdo->prepare("DELETE FROM items WHERE folder_id = ?");
        $stmt->execute([$folder_id]);

        echo "<script>alert('Todos os itens foram excluídos.'); window.location.href='dashboard.php?page=items&folder_id=" . htmlspecialchars($folder_id) . "';</script>";
    } else if (isset($_POST['move_item'])) {
        $item_id = $_POST['item_id'];
        $new_folder_id = $_POST['new_folder_id'];

        $stmt = $pdo->prepare("UPDATE items SET folder_id = ? WHERE item_id = ? AND folder_id = ?");
        $stmt->execute([$new_folder_id, $item_id, $folder_id]);

        echo "<script>alert('Item movido com sucesso.'); window.location.href='dashboard.php?page=items&folder_id=" . htmlspecialchars($new_folder_id) . "';</script>";
    }
}

// Aqui você pode continuar desenvolvendo a lógica conforme necessário
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Itens na Pasta</title>
     <!-- ... Cabeçalho existente ... -->
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            padding: 0px;
            box-sizing: border-box;
            background-color: #f4f4f4;
            overflow-x: hidden; /* Evita rolagem horizontal */
        }
        header {
            margin-bottom: 20px;
        }
        main {
            margin: 0;
    height: auto; /* Altera de max-height para height */
    overflow-y: visible; /* Permite que o conteúdo preencha o main */
            max-height: 70vh; /* Ajuste a altura máxima aqui */
            overflow-y: scroll; /* Adicione rolagem vertical, mas ocultar a barra */
            scrollbar-width: none; /* Para navegadores Firefox */
        }
        main::-webkit-scrollbar {
            display: none; /* Para navegadores Webkit */
        }
.button-with-icon {
    display: inline-flex;
    align-items: center;
    padding: 10px 15px;
    border: none;
    background-color: #007bff;
    color: white;
    border-radius: 4px;
    font-size: 16px;
    margin-right: 10px;
    transition: background-color 0.3s ease, transform 0.2s;
    cursor: pointer;
    margin-bottom: 20px;
}

.button-with-icon:hover {
    background-color: #0056b3;
    transform: scale(1.05);
}

.content {
    margin-top: 20px; /* Espaçamento superior para o conteúdo */
    padding: 15px; /* Espaçamento interno do conteúdo */
    background-color: #f8f9fa; /* Cor de fundo */
    border: 1px solid #dee2e6; /* Bordas do conteúdo */
    border-radius: 4px; /* Bordas arredondadas */
}
        .icon-button {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 20px;
            color: inherit;
            padding: 5px;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .icon-button:hover {
            transform: scale(1.2);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        select, input[type="text"], input[type="date"], input[type="number"] {
            width: 100%;
            box-sizing: border-box;
            margin-bottom: 10px;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
        }
        ul {
            list-style-type: none;
            padding: 0;
        }
        li {
            display: flex;
            margin: 15px 0; /* Aumentar margem vertical */
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background-color: #fff;
            position: relative;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .item-longe {
            background-color: #d4edda; /* Verde claro */
        }
        .item-perto {
            background-color: #ffeeba; /* Laranja claro */
        }
        .item-vencido {
            background-color: #f8d7da; /* Vermelho claro */
        }
        .item-sem-vencimento {
            background-color: #e7f1ff; /* Cor clara para itens sem vencimento */
        }
        .status-indicator {
            width: 10px;
            height: 100%;
            border-radius: 4px;
            position: absolute;
            left: 0;
            top: 0;
            margin-right: 10px;
        }
        .status-indicator.item-longe {
            background-color: #28a745; /* Verde */
        }
        .status-indicator.item-perto {
            background-color: #ffc107; /* Amarelo */
        }
        .status-indicator.item-vencido {
            background-color: #dc3545; /* Vermelho */
        }
        .status-indicator.item-sem-vencimento {
            background-color: #00238C; 
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 1;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0, 0, 0, 0.4);
            padding-top: 60px;
        }
        .modal-content {
            background-color: #fefefe;
            margin: 5% auto;
            padding: 20px;
            border: 1px solid #888;
            width: 90%;
            max-width: 600px;
            border-radius: 8px;
        }
        .close {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
        }
        .close:hover,
        .close:focus {
            color: black;
            text-decoration: none;
            cursor: pointer;
        }
        @media (max-width: 600px) {
            .button-with-icon {
                width: 100%;
                box-sizing: border-box;
                font-size: 14px;
                margin: 5px 0;
            }
            li {
                flex-direction: column;
                padding: 10px;
                font-size: 14px;
            }
            .status-indicator {
                width: 8px;
            }
        }
        .textarea {
            width: 100%;
            height: 100px;
            margin-bottom: 10px;
        }
         /* (Estilos CSS mantidos) */
        .search-container {
            margin-bottom: 20px;
        }
        .search-container input[type="text"] {
            width: calc(100% - 120px); /* Ajusta a largura do campo de busca */
            display: inline-block;
        }
        .search-container button {
            width: 100px; /* Largura fixa para o botão */
            display: inline-block;
        }

        .chart-slide {
    position: fixed;
    top: 0;
    right: 0;
    width: 300px;
    height: 100%;
    background-color: #fff;
    box-shadow: -2px 0 5px rgba(0, 0, 0, 0.3);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    z-index: 1000;
}

.chart-slide.show {
    transform: translateX(0);
}

.chart-slide-content {
    padding: 20px;
    height: 100%;
    overflow-y: auto;
}

.chart-slide .close {
    position: absolute;
    top: 20px;
    left: 20px;
    font-size: 28px;
    cursor: pointer;
}

.chart-slide canvas {
    width: 100%;
    height: 300px;
}

    // filtro
    .item-longe {
    background-color: #d4edda; /* Verde claro */
}

.item-perto {
    background-color: #ffeeba; /* Laranja claro */
}

.item-vencido {
    background-color: #f8d7da; /* Vermelho claro */
}
.filter-container {
    margin-top: 40px; /* Espaço maior entre o botão acima e o contêiner */
    text-align: left; /* Alinha o texto à esquerda */
}

#color-filter {
    padding: 5px;
    font-size: 16px;
}
.align-right {
    text-align: right; /* Alinha o texto à direita */
    width: 100%; /* Garante que o título ocupe toda a largura disponível */
    margin: 0; /* Remove margens padrão para um alinhamento mais preciso */
}
.upload-container {
            position: relative;
            display: inline-block;
        }

        .button-container {
    display: flex;
    justify-content: center; /* Centraliza horizontalmente */
    gap: 10px; /* Espaço entre os botões */
    margin: 0px 0; /* Espaço acima e abaixo do contêiner de botões */
}

.file-upload-button, .delete-button {
    background-color: #007bff; /* Cor de fundo padrão */
    color: white;
    border: none;
    padding: 8px 20px;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 5px 0; /* Espaço em cima e embaixo de cada botão */
}

.delete-button {
    background-color: #dc3545;
    color: white;
}

        input[type="file"] {
            display: none; /* Oculta o campo de upload de arquivo */ 
        }
        .folder-name {
    font-size: 24px; /* Ajuste o tamanho da fonte, se necessário */
    margin-top: 10px; /* Espaço entre as linhas */
    color: #333; /* Cor do texto, ajuste conforme desejado */
}
            </style>
<!-- Estilo melhorado para o menu -->
<style>
.action-menu {
    display: none; /* Oculta por padrão */
    position: absolute;
    background-color: white;
    border: 1px solid #ccc;
    z-index: 1000;
    padding: 10px;
    border-radius: 4px;
    right: 0; /* Alinhar à direita do botão */
    left: auto; /* Não usar a posição à esquerda */
    box-shadow: 0 2px 10px rgba(0,0,0,0.1); /* Sombra suave */
}
.icon-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 5px;
    display: flex;
    align-items: center;
    font-size: 14px; /* Tamanho da fonte do botão */
    margin: 5px 0; /* Margeando os botões */
    transition: background-color 0.2s; /* Animação para a transição */
}
.icon-button:hover {
    background-color: #f0f0f0; /* Cor de fundo ao passar o mouse */
}
.three-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    transition: transform 0.3s ease; /* Animação de transição suave */
}
.delete-button1 {
    color: red; /* Cor do botão de excluir */
}
i {
    margin-right: 5px; /* Espaço entre o ícone e o texto */
    font-size: 16px; /* Tamanho do ícone */
}
</style>
<style>
/* Estilos para o Modal */
.modal {
    display: none; /* Oculta por padrão */
    position: fixed; /* Fixa na tela */
    z-index: 1000; /* Aparece acima de outros elementos */
    left: 0;
    top: 0;
    width: 100%; /* Largura total */
    height: 100%; /* Altura total */
    overflow: auto; /* Permite rolagem se necessário */
    background-color: rgba(0,0,0,0.5); /* Fundo com semi-transparência */
}

/* Estilos para o conteúdo do modal */
.modal-content {
    background-color: #fefefe; /* Fundo branco claro */
    margin: 15% auto; /* Margem superior e centraliza na tela */
    padding: 20px; /* Espaçamento interno */
    border: 1px solid #888; /* Borda cinza */
    width: 80%; /* Largura do modal */
    max-width: 400px; /* Largura máxima do modal */
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); /* Sombra */
}

/* Estilo para o botão fechar */
.close {
    color: #aaa; /* Cor do "X" */
    float: right; /* Alinha para a direita */
    font-size: 28px; /* Tamanho do "X" */
    font-weight: bold; /* Negrito */
}

.close:hover,
.close:focus {
    color: black; /* Muda a cor ao passar o mouse */
    text-decoration: none; /* Remove sublinhado */
    cursor: pointer; /* Cursor em forma de mão */
}

/* Estilo para o botão Cancelar */
.cancel-button {
    background-color: #f44336; /* Vermelho */
    color: white; /* Texto branco */
    padding: 10px 20px; /* Espaçamento interno */
    border: none; /* Sem borda */
    border-radius: 5px; /* Bordas arredondadas */
    cursor: pointer; /* Cursor em forma de mão */
}

.cancel-button:hover {
    background-color: #d32f2f; /* Cor mais escura ao passar o mouse */
}

</style>
    <style>
        /* Estilo para o contêiner */
.container {
    background-color: #6c757d; /* Cinza com 70% de opacidade */
    color: #fff; /* Texto em branco para contraste */
    padding: 20px; /* Espaçamento interno */
    border-radius: 8px; /* Cantos arredondados */
    width: 100%; /* Largura preenchendo totalmente a página */
    max-width: 1200px; /* Largura máxima para telas maiores */
    margin: 0 auto; /* Centraliza o contêiner na página */
    box-sizing: border-box; /* Inclui o padding na largura total */
    min-height: 10vh; /* Garante que o contêiner tenha no mínimo a altura da tela */
}
    </style>
</head>
<body>
      <header>
    <h1 class="align-right">Itens da Pasta</h1>
    <div class="align-right" class="folder-name"><?php echo htmlspecialchars($folder_name); ?></div>
</header>
<center>
<a href="?page=folders" class="button-with-icon" style="background-color: #6c757d;">
            <i class="fas fa-arrow-left"></i> Voltar para Pastas
        </a>
<button id="toggleContentButton" class="button-with-icon">Mostrar Conteúdo</button>
<div id="contentContainer" class="content" style="display: none;">

    <!-- Todo o conteúdo aqui -->
    
    <div class="button-container">
        <form action="dashboard.php?page=items&folder_id=<?php echo htmlspecialchars($folder_id); ?>" method="post" enctype="multipart/form-data">
            <div class="upload-container">
                <label for="file-upload" class="file-upload-button">
                    <i class="fas fa-plus"></i> Importar
                </label>
                <input id="file-upload" type="file" name="file" accept=".csv" required onchange="this.form.submit();" style="display: none;" />
            </div>
        </form>

        <center>
            <form action="dashboard.php?page=items&folder_id=<?php echo htmlspecialchars($folder_id); ?>" method="post" onsubmit="return confirm('Tem certeza que deseja excluir todos os itens?');">
                <input type="hidden" name="folder_id" value="<?php echo htmlspecialchars($folder_id); ?>">
                <button type="submit" name="delete_all_items" class="delete-button">
                    Excluir Todos
                </button>
            </form>
        </center>
    </div>
   <div>  </div>
        <button id="open-add-modal" class="button-with-icon">
            <i class="fas fa-plus"></i> Adicionar Novo
        </button>
                <button id="open-settings-modal" class="button-with-icon">
            <i class="fas fa-calendar-alt"></i> Editar Prazo de Vencimento
        </button>
        <button id="open-whatsapp-modal" class="button-with-icon">
            <i class="fas fa-comments"></i> Editar Mensagem do WhatsApp
        </button>
    <!-- Continue com o restante do conteúdo... -->
</div>


 <div><button id="open-chart-slide" class="button-with-icon">
    <i class="fas fa-chart-bar"></i> Mostrar Gráfico
</button> </div>

<div class="container"> <!-- Contêiner com fundo cinza -->
    <label for="yearSelect">Consultar Anual</label>
    <select id="yearSelect">
        <?php
        // Calcule o intervalo de anos para o seletor
        $current_year = (int) date('Y');
        for ($year = $current_year; $year >= 2020; $year--) { // Por exemplo, anos de 2020 até o atual
            $selected = ($year == $selected_year) ? 'selected' : '';
            echo "<option value='$year' $selected>$year</option>";
        }
        ?>
    </select>

    <!-- Contêiner para o gráfico -->
    <div id="chartContainer" style="display: none;">
        <canvas id="monthlyChart"></canvas>
    </div>

    <!-- Botão para mostrar/esconder o gráfico -->
    <button id="toggleChartButton" class="button-with-icon">Mostrar Gráfico</button>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
    // Lista dos meses em português
    const mesesEmPortugues = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    // Dados para o gráfico
    const months = <?php echo json_encode(array_map(function($month) {
        return (new DateTime($month . "-01"))->format('n'); // Retorna o número do mês (1 a 12)
    }, $months)); ?>;

    const totalPrices = <?php echo json_encode($total_prices); ?>;

    // Mapeia números dos meses para meses em português
    const monthsInPortuguese = months.map(month => mesesEmPortugues[month - 1]); // -1 para ajustar o índice

    // Função para formatar os preços em R$ com vírgula como decimal e ponto como separador de milhares
    function formatCurrency(value) {
        return 'R$ ' + value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    const formattedPrices = totalPrices.map(price => formatCurrency(price));

    const ctx = document.getElementById('monthlyChart').getContext('2d');
    const monthlyChart = new Chart(ctx, {
        type: 'bar', 
        data: {
            labels: monthsInPortuguese, // usa meses em português
            datasets: [{
                label: 'Total de Preços por Mês',
                data: totalPrices, // utiliza os valores originais para o gráfico
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'white', // Cor dos rótulos do eixo Y
                        callback: function(value) {
                            return formatCurrency(value); // Formata os valores do eixo Y
                        }
                    }
                },
                x: {
                    ticks: {
                        color: 'white' // Cor dos rótulos do eixo X
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: 'white' // Cor da legenda
                    }
                },
                tooltip: {
                    titleColor: 'white', // Cor do título da tooltip
                    bodyColor: 'white', // Cor do corpo da tooltip
                    callbacks: {
                        label: function(tooltipItem) {
                            return formatCurrency(tooltipItem.raw); // Formata os valores da tooltip
                        }
                    }
                }
            },
            backgroundColor: '#6c757d' // Cor de fundo do gráfico
        },
    });

    // Alternar a visibilidade do gráfico
    let chartVisible = false;

    document.getElementById('toggleChartButton').addEventListener('click', function () {
        const chartContainer = document.getElementById('chartContainer');
        chartVisible = !chartVisible;

        if (chartVisible) {
            chartContainer.style.display = 'block';
            this.textContent = 'Esconder Gráfico';
        } else {
            chartContainer.style.display = 'none';
            this.textContent = 'Mostrar Gráfico';
        }
    });

    // Redirecionar ao mudar o ano selecionado
    document.getElementById('yearSelect').addEventListener('change', function() {
        const selectedYear = this.value;
        // Redirecione para a mesma página com o ano selecionado
        window.location.href = `?folder_id=<?php echo $folder_id; ?>&year=${selectedYear}`;
    });
</script>
<script>
    document.getElementById('toggleContentButton').addEventListener('click', function () {
        const contentContainer = document.getElementById('contentContainer');
        const isContentVisible = contentContainer.style.display !== 'none';

        if (isContentVisible) {
            contentContainer.style.display = 'none';
            this.textContent = 'Mostrar Conteúdo'; // Altera o texto do botão
        } else {
            contentContainer.style.display = 'block';
            this.textContent = 'Ocultar Conteúdo'; // Altera o texto do botão
        }
    });
</script>
<!-- Slide-out panel para o gráfico -->
<div id="chart-slide" class="chart-slide">
    <div class="chart-slide-content">
        <span class="close" id="close-chart-slide">×</span>
        <h2>Status dos Itens</h2>

        <!-- Exibição do Total de Itens e Preço -->
        <div id="total-items-display">Total de Itens: 0</div>
        <div id="total-price-display">Total de Preço: R$ 0,00</div>

        <!-- Canvas para os gráficos -->
        <canvas id="itemsChart" width="400" height="200" style="margin-top: 20px;"></canvas>
        <canvas id="totalPriceChart" width="400" height="200" style="margin-top: 20px;"></canvas>
        <canvas id="priceLineChart" width="400" height="200" style="margin-top: 20px;"></canvas>
    </div>
</div>


      


</center>

        <div class="filter-container">
    <label for="color-filter">Filtrar por status:</label>
    <select id="color-filter">
        <option value="all">Mostrar Todos (<?php echo $totalItems; ?>)</option>
        <option value="item-sem-vencimento">Sem vencimento (<?php echo $counts['item-sem-vencimento']; ?>)</option>
        <option value="item-longe">Longe de Vencer (<?php echo $counts['item-longe']; ?>)</option>
        <option value="item-perto">Perto de Vencer (<?php echo $counts['item-perto']; ?>)</option>
        <option value="item-vencido">Já Vencido (<?php echo $counts['item-vencido']; ?>)</option>
    </select>
</div>

<div class="search-container">
        <input type="text" id="search" placeholder="Pesquisar itens..." value="<?php echo htmlspecialchars($search_query); ?>">
    </div>

<!-- Modal para Adicionar Novo Item -->
<div id="add-modal" class="modal">
    <div class="modal-content">
        <span class="close" id="close-add-modal">×</span>
        <h2>Adicionar Novo Item</h2>
        <form method="post" onsubmit="return validatePrice('price');">
            <input type="hidden" name="folder_id" value="<?php echo htmlspecialchars($folder_id); ?>">
            <label for="item_id">Usuário:</label>
            <input type="text" id="item_id" name="item_id" required>
            <label for="name">Nome:</label>
            <input type="text" id="name" name="name" required>

            <label for="item-status">Status:</label>
            <select id="item-status" name="no_due_date" onchange="toggleDueDateField()">
                <option value="0">Com Vencimento</option>
                <option value="1">Sem Vencimento</option>
            </select>
            
            <div id="due-date-container">
                <label for="due_date">Data de Vencimento:</label>
                <input type="date" id="due_date" name="due_date">
            </div>

            <label for="phone">Telefone:</label>
            <input type="text" id="phone" name="phone" value="+55" placeholder="" oninput="formatPhone(this)">
            <label for="price">Preço:</label>
            <input type="text" id="price" name="price" placeholder="Ex: 0,00" oninput="formatPrice(this)">
            <label for="notes">Notas:</label>
            <textarea id="notes" name="notes" placeholder="Adicione suas notas aqui..."></textarea>
            <button type="submit" name="add_item" class="button-with-icon">Adicionar Item</button>
        </form>
    </div>
</div>

<script>
function toggleDueDateField() {
    var statusSelect = document.getElementById('item-status');
    var dueDateContainer = document.getElementById('due-date-container');
    var dueDateInput = document.getElementById('due_date');

    if (statusSelect.value === '1') { // "Sem Vencimento" selecionado
        dueDateContainer.style.display = 'none'; // Esconde o campo de data
        dueDateInput.value = ''; // Limpa o campo de data se houver
    } else {
        dueDateContainer.style.display = 'block'; // Mostra o campo de data
        dueDateInput.value = ''; // Limpa o campo de data se houver
    }
}

// Define a data atual se "Sem Vencimento" for selecionado
document.getElementsByName('add_item')[0].onsubmit = function() {
    if (document.getElementById('item-status').value === '1') {
        var today = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
        document.getElementsByName('due_date')[0].value = today; // Preenche a data com a data atual
    }
};
</script>


<!-- Modal de Edição -->
<div id="edit-modal" class="modal">
    <div class="modal-content">
        <span class="close" id="close-edit-modal">×</span>
        <h2>Editar Item</h2>
        <form method="post" onsubmit="return validatePrice('edit-price');">
            <input type="hidden" name="folder_id" id="edit-folder-id">
            <input type="hidden" name="old_item_id" id="old-item-id">
            
            <label for="edit-item-id-input">Usuário:</label>
            <input type="text" id="edit-item-id-input" name="item_id" required>
            <label for="edit-name">Nome:</label>
            <input type="text" id="edit-name" name="name" required>

            <label for="edit-created-at">Data de Criação:</label>
            <input type="date" id="edit-created-at" name="created_at" required>

            <label for="edit-item-status">Status:</label>
            <select id="edit-item-status" name="no_due_date" onchange="toggleEditDueDateField()">
                <option value="0">Com Vencimento</option>
                <option value="1">Sem Vencimento</option>
            </select>
            
            <div id="edit-due-date-container">
                <label for="edit-due-date">Data de Vencimento:</label>
                <input type="date" id="edit-due-date" name="due_date">
            </div>

            <label for="edit-phone">Telefone:</label>
            <input type="text" id="edit-phone" name="phone">
            <label for="edit-price">Preço:</label>
            <input type="text" id="edit-price" name="price" value="" placeholder="0.00" oninput="formatPrice(this)" onkeypress="return isNumberKey(event)">
            <label for="edit-notes">Notas:</label>
            <textarea id="edit-notes" name="notes" placeholder="Adicione suas notas aqui..."></textarea>
            
            <button type="submit" name="edit_item" class="button-with-icon">
                <i class="fas fa-pencil-alt"></i> Atualizar Item
            </button>
        </form>
    </div>
</div>

<script>
// Função para alternar a visualização do campo de data de vencimento no modal de edição
function toggleEditDueDateField() {
    var statusSelect = document.getElementById('edit-item-status');
    var dueDateContainer = document.getElementById('edit-due-date-container');
    var dueDateInput = document.getElementById('edit-due-date');

    if (statusSelect.value === '1') { // "Sem Vencimento" selecionado
        dueDateContainer.style.display = 'none'; // Esconde o campo de data
        dueDateInput.value = ''; // Limpa o campo de data se houver
    } else {
        dueDateContainer.style.display = 'block'; // Mostra o campo de data
    }
}

// Inicializa a visualização correta do campo de data no carregamento do modal
document.addEventListener('DOMContentLoaded', function() {
    var dueDateContainer = document.getElementById('edit-due-date-container');
    var statusSelect = document.getElementById('edit-item-status');

    // Verifica se a data está vazia e ajusta a exibição
    if (dueDateInput.value === '' && statusSelect.value === '1') {
        dueDateContainer.style.display = 'none'; // Esconde se for "Sem Vencimento"
    }
});
</script>

<!-- Modal para Editar Mensagem do WhatsApp -->
<div id="whatsapp-modal" class="modal" style="display: none;">
    <div class="modal-content">
        <span class="close" id="close-whatsapp-modal">×</span>
        <h2>Editar Mensagem do WhatsApp</h2>
        <textarea id="whatsapp_message" rows="10" style="width: 100%;"></textarea>

        <div class="button-container">
            <button id="reset-whatsapp-message" class="button-with-icon">Restaurar Mensagem Padrão</button>
            <button id="save-whatsapp-message" class="button-with-icon">Salvar Mensagem</button>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    // Função para obter a mensagem personalizada do servidor
    function fetchMessage(folder_id, callback) {
        $.ajax({
            url: 'get_message.php',
            type: 'GET',
            data: { folder_id: folder_id },
            success: function(response) {
                const data = JSON.parse(response);
                if (data.status === 'success') {
                    callback(data.message);
                } else {
                    alert(data.message);
                }
            },
            error: function() {
                alert('Erro ao carregar a mensagem.');
            }
        });
    }

    document.getElementById('open-whatsapp-modal').onclick = function() {
        fetchMessage("<?php echo $folder_id; ?>", function(message) {
            document.getElementById('whatsapp_message').value = message || defaultMessage; // Usa mensagem padrão se não houver
            document.getElementById('whatsapp-modal').style.display = 'block';
        });
    };

    document.getElementById('close-whatsapp-modal').onclick = function() {
        document.getElementById('whatsapp-modal').style.display = 'none';
    };

    document.getElementById('reset-whatsapp-message').onclick = function() {
        document.getElementById('whatsapp_message').value = defaultMessage;
    };

    document.getElementById('save-whatsapp-message').onclick = function() {
        const message = document.getElementById('whatsapp_message').value;

        $.ajax({
            url: 'save_message.php',
            type: 'POST',
            data: {
                folder_id: "<?php echo $folder_id; ?>",
                message: message
            },
            success: function(response) {
                const data = JSON.parse(response);
                if (data.status === 'success') {
                    alert("Mensagem salva com sucesso!");
                    document.getElementById('whatsapp-modal').style.display = 'none';
                } else {
                    alert(data.message);
                }
            },
            error: function() {
                alert('Erro ao salvar a mensagem.');
            }
        });
    };

});
</script>

<!-- HTML para o Modal de Edição -->
<div id="settings-modal" class="modal">
    <div class="modal-content">
        <span class="close" id="close-settings-modal">×</span>
        <h2>Editar Prazos de Vencimento</h2>
        <form method="post">
            <label for="near_due_days">Prazos Perto de Vencer (dias):</label>
            <input type="number" id="near_due_days" name="near_due_days" value="<?php echo htmlspecialchars($near_due_days); ?>" min="1" required>
            <label for="far_due_days">Prazos Longe de Vencer (dias):</label>
            <input type="number" id="far_due_days" name="far_due_days" value="<?php echo htmlspecialchars($far_due_days); ?>" min="1" required>
            <button type="submit" name="update_settings" class="button-with-icon">Atualizar Configurações</button>
        </form>
    </div>
</div>

<?php
if ($message) {
    echo "<script>alert('" . addslashes($message) . "'); window.location.href='dashboard.php?page=items&folder_id=" . htmlspecialchars($folder_id) . "';</script>";
}?>


<!-- Modal para Mover Item -->
<div id="move-modal" class="modal" style="display:none;">
    <div class="modal-content">
        <span class="close" id="close-move-modal">×</span>
        <h2>Escolha uma Pasta para Mover o Item</h2>
        <ul id="folder-list">
            <?php
            // Recuperar todas as pastas do usuário
            $folders_stmt = $pdo->prepare("SELECT id, name FROM folders WHERE user_id = ?");
            $folders_stmt->execute([$user_id]);
            $folders = $folders_stmt->fetchAll();

            foreach ($folders as $folder) {
                echo "<li><a href='#' class='move-folder' data-folder-id='" . htmlspecialchars($folder['id']) . "'>" . htmlspecialchars($folder['name']) . "</a></li>";
            }
            ?>
        </ul>
        <button onclick="closeModal()" class="cancel-button">Cancelar</button>
    </div>
</div>

<ul id="items-list">
    <?php foreach ($items as $item): 
        // Formata a data de criação
    $created_at_formatted = date('d/m/Y', strtotime($item['created_at'])); // Formata a data de criação
    ?>
        <li class="<?php echo htmlspecialchars($item['status_class']); ?>">
            <div class="status-indicator <?php echo htmlspecialchars($item['status_class']); ?>"></div>
            <div style="flex: 1; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>Usuário: <?php echo htmlspecialchars($item['item_id']); ?></strong><br>
                    <strong><?php echo htmlspecialchars($item['name']); ?></strong><br>
                                <span>Criado em: <?php echo htmlspecialchars($created_at_formatted); ?></span><br>
                    <span>Data de Vencimento: 
                        <?php 
                        if ($item['status'] === 'Sem Vencimento') {
                            echo "Indefinido";
                        } else {
                            $formatted_due_date = date("d/m/Y", strtotime($item['due_date']));
                            echo htmlspecialchars($formatted_due_date); 
                        }
                        ?>
                    </span><br>
                    <span>Telefone: <?php echo htmlspecialchars($item['phone']); ?></span><br>
                    <span>Notas: <?php echo htmlspecialchars($item['notes']); ?></span><br>
                    <span><strong>Preço:</strong> <strong>R$ <?php echo number_format((float)$item['price'], 2, ',', ' '); ?></strong></span><br>
                </div>
                <div class="action-container" style="position: relative;">
                    <button class="icon-button three-dots" onclick="toggleMenu(event, this)">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="action-menu" style="display: none; right: 0; left: auto;">
                    <button class="icon-button" 
        data-item-id="<?php echo htmlspecialchars($item['item_id']); ?>"
        data-name="<?php echo htmlspecialchars($item['name']); ?>"
        data-due-date="<?php echo htmlspecialchars($item['due_date']); ?>"
        data-phone="<?php echo htmlspecialchars($item['phone']); ?>"
        data-notes="<?php echo htmlspecialchars($item['notes']); ?>"
        data-price="<?php echo htmlspecialchars($item['price']); ?>"
        data-created-at="<?php echo htmlspecialchars(date('Y-m-d', strtotime($item['created_at']))); ?>"
        onclick="openEditModal(
            this.getAttribute('data-item-id'),
            this.getAttribute('data-name'),
            this.getAttribute('data-due-date'),
            this.getAttribute('data-phone'),
            this.getAttribute('data-notes'),
            this.getAttribute('data-price'),
            this.getAttribute('data-created-at') <!-- Passando a data de criação -->
        )">
                        <i class="fas fa-pencil-alt"></i> Editar
                    </button>
                    <button class="icon-button" 
                            data-item-id="<?php echo htmlspecialchars($item['item_id']); ?>" 
                            data-name="<?php echo htmlspecialchars($item['name']); ?>" 
                            data-due-date="<?php echo htmlspecialchars($item['due_date']); ?>" 
                            data-phone="<?php echo htmlspecialchars($item['phone']); ?>"  
                            data-folder-type="<?php echo htmlspecialchars($folder_type); ?>" 
                            onclick="sendReminder(
                                this.getAttribute('data-item-id'), 
                                this.getAttribute('data-name'), 
                                this.getAttribute('data-due-date'), 
                                this.getAttribute('data-phone'), 
                                this.getAttribute('data-folder-type')
                            )">
                        <i class="fas fa-bell"></i> Lembrar
                    </button>
                    <button class="icon-button" 
                            data-item-id="<?php echo htmlspecialchars($item['item_id']); ?>" 
                            onclick="showMoveModal('<?php echo htmlspecialchars($item['item_id']); ?>')">
                        <i class="fas fa-arrows-alt"></i> Mover
                    </button>
                    <form style="display:inline;" method="post" onsubmit="return confirm('Tem certeza que deseja excluir este item?');">
                        <input type="hidden" name="folder_id" value="<?php echo htmlspecialchars($folder_id); ?>">
                        <input type="hidden" name="item_id" value="<?php echo htmlspecialchars($item['item_id']); ?>">
                        <button type="submit" name="delete_item" class="icon-button delete-button1">
                            <i class="fas fa-times"></i> Excluir
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </li>
<?php endforeach; ?>
</ul>
<script>
    // Função que verifica se a tecla pressionada é um número
    function isNumberKey(evt) {
        const charCode = (evt.which) ? evt.which : evt.keyCode;
        if (charCode !== 46 && (charCode < 48 || charCode > 57)) {
            return false; // permite apenas números e o ponto
        }
        return true;
    }

    // Função para formatar o preço
    function formatPrice(input) {
        // Remove caracteres que não são dígitos
        let value = input.value.replace(/[^0-9]/g, '');

        // Se nada foi digitado, mantém o campo vazio
        if (value.length === 0) {
            input.value = '';
            return;
        }

        // Obtém a parte inteira e parte decimal
        let decimalPart = value.slice(-2); // Garante que sempre haja dois dígitos na parte decimal
        let integerPart = value.slice(0, -2); // Parte inteira

        // Elimina zeros à esquerda na parte inteira
        integerPart = integerPart.replace(/^0+/, '') || '0'; // Garantindo que haja pelo menos '0'

        // Formata o valor final
        if (integerPart.length === 0) {
            input.value = `0.${decimalPart.padStart(2, '0')}`; // Apenas centavos
        } else {
            input.value = `${integerPart}.${decimalPart.padStart(2, '0')}`; // Inteiro e centavos
        }
    }

    // Validação da entrada de preços
    function validatePrice(priceId) {
        const input = document.getElementById(priceId);
        const value = input.value.trim();

        // Se o campo estiver vazio, considera o valor como 0.00
        if (value === '') {
            input.value = '0.00'; // Atribui o valor padrão de zero
            return true; // Não impede o envio do formulário
        }

        // Verifica se o valor informado é um número válido
        if (isNaN(parseFloat(value))) {
            alert("Por favor, insira um preço válido.");
            return false;
        }

        // Formata o valor para garantir duas casas decimais
        const formattedValue = parseFloat(value).toFixed(2);
        input.value = formattedValue; // Atualiza o campo para mostrar duas casas decimais

        return true;
    }

    // Inicializa o preço com o formato padrão
    window.onload = function() {
        document.getElementById('price').value = ''; // Mantém vazio ao carregar
    };
</script>

<script>
// Fechar o modal quando o "X" é clicado
document.getElementById('close-move-modal').onclick = function() {
    closeModal();
}

// Fechar o modal quando clicar fora dele
window.onclick = function(event) {
    const modal = document.getElementById('move-modal');
    if (event.target == modal) {
        closeModal();
    }
}

function closeModal() {
    document.getElementById('move-modal').style.display = 'none';
}

// Função para abrir o modal
function showMoveModal(itemId) {
    currentItemId = itemId; // Armazena o ID do item a ser movido
    document.getElementById('move-modal').style.display = 'block';
}

// Adiciona evento aos links de mover pasta
document.querySelectorAll('.move-folder').forEach(folder => {
    folder.addEventListener('click', function(event) {
        event.preventDefault(); // Evita o comportamento padrão do link
        const newFolderId = this.getAttribute('data-folder-id');

        // Criar e enviar um formulário para mover o item
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = ''; // Envia para a mesma página
        form.innerHTML = `<input type='hidden' name='item_id' value='${currentItemId}'>
                          <input type='hidden' name='new_folder_id' value='${newFolderId}'>
                          <input type='hidden' name='move_item' value='1'>`;
        document.body.appendChild(form);
        form.submit();
    });
});
</script>

<!-- JavaScript para controlar a exibição do menu (mesmo código anterior) -->
<script>
function toggleMenu(event, button) {
    event.stopPropagation(); // Previne o clique de propagar para o documento
    const menu = button.nextElementSibling;
    const isMenuVisible = menu.style.display === 'block';
    const allMenus = document.querySelectorAll('.action-menu');

    // Fecha todos os menus antes de abrir o atual
    allMenus.forEach(m => m.style.display = 'none');
    
    // Mova os três pontinhos para cima
    if (!isMenuVisible) {
        menu.style.display = 'block';
        button.style.transform = 'translateY(-20px)'; // Mover o botão de pontinhos para cima
    } else {
        button.style.transform = 'translateY(0)';
    }
}

// Fecha o menu ao clicar fora dele
document.addEventListener('click', function() {
    const menus = document.querySelectorAll('.action-menu');
    menus.forEach(menu => {
        menu.style.display = 'none'; // Fecha todos os menus
    });
    
    // Restaura a posição dos botões de três pontinhos
    const dotsButtons = document.querySelectorAll('.three-dots');
    dotsButtons.forEach(button => {
        button.style.transform = 'translateY(0)'; // Restaura a posição original
    });
});

function handleOptionClick(event, button, action) {
    event.stopPropagation(); // Previne o clique de propagar para o documento
    const menu = button.closest('.action-menu');
    if (menu) {
        menu.style.display = 'none'; // Fecha o menu ao clicar em uma opção
    }

    // Execute ações específicas se necessário
    if (action === 'edit') {
        openEditModal(
            button.getAttribute('data-item-id'),
            button.getAttribute('data-name'),
            button.getAttribute('data-due-date'),
            button.getAttribute('data-phone'),
            button.getAttribute('data-notes'),
            button.getAttribute('data-price'),
            button.getAttribute('data-created-at') // Aqui está a data de criação
        );
    } else if (action === 'reminder') {
        sendReminder(
            button.getAttribute('data-item-id'),
            button.getAttribute('data-name'),
            button.getAttribute('data-due-date'),
            button.getAttribute('data-phone'),
            button.getAttribute('data-folder-type')
        );
    }
}
</script>
<script>
// filtro
document.addEventListener('DOMContentLoaded', function() {
    const filterSelect = document.getElementById('color-filter');

    filterSelect.addEventListener('change', function() {
        const filter = this.value;
        filterItems(filter);
    });

    function filterItems(filter) {
        const items = document.querySelectorAll('#items-list li');
        items.forEach(item => {
            if (filter === 'all' || item.classList.contains(filter)) {
                item.style.display = ''; // Mostra o item
            } else {
                item.style.display = 'none'; // Oculta o item
            }
        });
    }
});

</script>

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
// Função para abrir o slide e renderizar os gráficos
document.getElementById('open-chart-slide').onclick = function() {
    document.getElementById('chart-slide').classList.add('show');
    renderCharts(); // Renderiza os gráficos quando o slide é aberto
}

// Função para fechar o slide
document.getElementById('close-chart-slide').onclick = function() {
    document.getElementById('chart-slide').classList.remove('show');
}

// Fechar o slide ao clicar fora dele
document.addEventListener('click', function(event) {
    const chartSlide = document.getElementById('chart-slide');
    if (chartSlide.classList.contains('show') && !chartSlide.contains(event.target) && !document.getElementById('open-chart-slide').contains(event.target)) {
        chartSlide.classList.remove('show');
    }
});


// Função para renderizar todos os gráficos
function renderCharts() {
    const labels = ['Longe de Vencer', 'Perto de Vencer', 'Já Vencido', 'Sem Vencimento'];

    // Dados de status
    const statusData = [
        <?php
        $counts = [
            'item-longe' => 0,
            'item-perto' => 0,
            'item-vencido' => 0,
            'item-sem-vencimento' => 0
        ];
        if (isset($items) && is_array($items)) {
            foreach ($items as $item) {
                $counts[$item['status_class']]++;
            }
        }
        echo $counts['item-longe'] . ', ';
        echo $counts['item-perto'] . ', ';
        echo $counts['item-vencido'] . ', ';
        echo $counts['item-sem-vencimento']; // Contagem para cada status
        ?>
    ];

    const totalItems = <?php echo array_sum($counts); ?>; // Total de itens

    // Dados de preço
    const priceData = [
        <?php
        $priceCounts = [
            'item-longe' => 0,
            'item-perto' => 0,
            'item-vencido' => 0,
            'item-sem-vencimento' => 0
        ];
        if (isset($items) && is_array($items)) {
            foreach ($items as $item) {
                if ($item['status_class'] === 'item-longe') {
                    $priceCounts['item-longe'] += $item['price'];
                } elseif ($item['status_class'] === 'item-perto') {
                    $priceCounts['item-perto'] += $item['price'];
                } elseif ($item['status_class'] === 'item-vencido') {
                    $priceCounts['item-vencido'] += $item['price'];
                } elseif ($item['status_class'] === 'item-sem-vencimento') {
                    $priceCounts['item-sem-vencimento'] += $item['price'];
                }
            }
        }
        echo $priceCounts['item-longe'] . ', ';
        echo $priceCounts['item-perto'] . ', ';
        echo $priceCounts['item-vencido'] . ', ';
        echo $priceCounts['item-sem-vencimento'];
        ?>
    ];

    // Cálculo do total geral
    const totalGeneral = <?php 
        $total = 0;
        if (isset($items) && is_array($items)) {
            foreach ($items as $item) {
                $total += $item['price'];
            }
        }
        echo number_format($total, 2, '.', '');
    ?>;

    // Formatação do total geral
    const formattedTotalGeneral = 'R$ ' + totalGeneral.toString().replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    document.getElementById('total-price-display').innerText = formattedTotalGeneral;
    document.getElementById('total-items-display').innerText = 'Total de Itens: ' + totalItems; // Exibe total de itens

    // Gráfico de Barras para Status dos Itens
    const ctxItems = document.getElementById('itemsChart').getContext('2d');
    new Chart(ctxItems, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Status dos Itens',
                data: statusData,
                backgroundColor: ['#28a745', '#ffc107', '#dc3545', '#17a2b8'],
                borderColor: ['#28a745', '#ffc107', '#dc3545', '#17a2b8'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    // Gráfico de Barras para Preço por Status
    const ctxTotalPrice = document.getElementById('totalPriceChart').getContext('2d');
    new Chart(ctxTotalPrice, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Preço Total por Status',
                data: priceData,
                backgroundColor: ['#28a745', '#ffc107', '#dc3545', '#17a2b8'],
                borderColor: ['#28a745', '#ffc107', '#dc3545', '#17a2b8'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'R$ ' + value.toString().replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // Formatação monetária
                        }
                    }
                }
            }
        }
    });

    // Gráfico de Linha para Preço Total
    const ctxLine = document.getElementById('priceLineChart').getContext('2d');
    new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Preço Total por Status',
                data: priceData,
                borderColor: '#007bff',
                fill: false,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'R$ ' + value.toString().replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // Formatação monetária
                        }
                    }
                }
            }
        }
    });
}
</script>
     <script>
        $(document).ready(function() {
            $('#search').on('input', function() {
                let searchQuery = $(this).val();
                $.ajax({
                    url: 'search.php', // Arquivo PHP que irá retornar os itens pesquisados
                    type: 'POST',
                    data: {
                        search: searchQuery,
                        folder_id: '<?php echo htmlspecialchars($folder_id); ?>'
                    },
                    success: function(response) {
                        $('#items-list').html(response);
                    }
                });
            });
        });
    </script>

   <script>
function openEditModal(item_id, name, due_date, phone, notes, price, created_at) {
    document.getElementById('edit-folder-id').value = '<?php echo htmlspecialchars($folder_id); ?>';
    document.getElementById('old-item-id').value = item_id;
    document.getElementById('edit-item-id-input').value = item_id;
    document.getElementById('edit-name').value = name;
    document.getElementById('edit-phone').value = phone;
    document.getElementById('edit-notes').value = notes;
    document.getElementById('edit-price').value = price;
    
    // Definindo a data de criação
    document.getElementById('edit-created-at').value = created_at; // Linha que define a data de criação no campo

    // Configurando o status e a data de vencimento
    const statusSelect = document.getElementById('edit-item-status');
    const dueDateInput = document.getElementById('edit-due-date');

    if (due_date && due_date !== '0000-00-00') {
        statusSelect.value = '0'; // Com Vencimento
        dueDateInput.value = due_date;
    } else {
        statusSelect.value = '1'; // Sem Vencimento
        dueDateInput.value = ''; // Limpa o campo de data
    }

    toggleEditDueDateField(); // Atualiza a exibição do campo de data
    document.getElementById('edit-modal').style.display = 'block';
}

        document.getElementById('close-edit-modal').onclick = function() {
            document.getElementById('edit-modal').style.display = 'none';
        }

        window.onclick = function(event) {
            if (event.target == document.getElementById('edit-modal')) {
                document.getElementById('edit-modal').style.display = 'none';
            }
        }

        document.getElementById('open-add-modal').onclick = function() {
            document.getElementById('add-modal').style.display = 'block';
        }
        document.getElementById('close-add-modal').onclick = function() {
            document.getElementById('add-modal').style.display = 'none';
        }
        document.getElementById('open-settings-modal').onclick = function() {
            document.getElementById('settings-modal').style.display = 'block';
        }
        document.getElementById('close-settings-modal').onclick = function() {
            document.getElementById('settings-modal').style.display = 'none';
        }
        
        
// Estabelecendo a mensagem padrão com base no tipo de pasta
const folderType = "<?php echo htmlspecialchars($folder_type); ?>";
let defaultMessage = "";

if (folderType === "Cliente") {
    defaultMessage = "{getGreeting}\n\n🔔 Lembrete da \"Empresa\" 🔔\n\nUsuário: {item_id}\n\n{dateText} {due_date}\n\nNão esqueça de renovar para continuar assistindo sem interrupções.\n\nAproveite seus programas favoritos! 📺✨\n\n> Obrigado pela sua preferência! 🌟";
} else if (folderType === "Produto") {
    defaultMessage = "{getGreeting}\n\nGostaríamos de lembrá-lo(a) sobre o vencimento do seguinte produto:\n\nProduto: {name}\n\n{dateText} {due_date}\n\nPor favor, tome as medidas necessárias para gerenciar este produto antes da data de vencimento. Se precisar de mais informações ou assistência, estamos à disposição.\n\nObrigado pela atenção.";
}

// Função para obter a mensagem personalizada do servidor
function fetchMessage(folderType, callback) {
    $.ajax({
        url: 'get_message.php',
        type: 'GET',
        data: { folder_id: "<?php echo $folder_id; ?>" }, // Passando o folder_id diretamente
        success: function(response) {
            const data = JSON.parse(response);
            if (data.status === 'success') {
                callback(data.message);
            } else {
                alert(data.message);
            }
        },
        error: function() {
            alert('Erro ao carregar a mensagem.');
        }
    });
}

// Manipulação de eventos para abrir o modal de WhatsApp
document.getElementById('open-whatsapp-modal').onclick = function() {
    fetchMessage(folderType, function(message) {
        document.getElementById('whatsapp_message').value = message || defaultMessage; // Usa mensagem padrão se não houver
        document.getElementById('whatsapp-modal').style.display = 'block';
    });
};

document.getElementById('close-whatsapp-modal').onclick = function() {
    document.getElementById('whatsapp-modal').style.display = 'none';
};

document.getElementById('reset-whatsapp-message').onclick = function() {
    document.getElementById('whatsapp_message').value = defaultMessage;
};

document.getElementById('save-whatsapp-message').onclick = function() {
    const message = document.getElementById('whatsapp_message').value;

    $.ajax({
        url: 'save_message.php',
        type: 'POST',
        data: {
            folder_id: "<?php echo $folder_id; ?>", // Passando o folder_id
            message: message
        },
        success: function(response) {
            const data = JSON.parse(response);
            if (data.status === 'success') {
                alert("Mensagem salva com sucesso!");
                document.getElementById('whatsapp-modal').style.display = 'none';
            } else {
                alert(data.message);
            }
        },
        error: function() {
            alert('Erro ao salvar a mensagem.');
        }
    });
};

// Fechar modais ao clicar fora deles
window.onclick = function(event) {
    const modals = ['add-modal', 'edit-modal', 'settings-modal', 'whatsapp-modal'];
    modals.forEach(modalId => {
        if (event.target == document.getElementById(modalId)) {
            document.getElementById(modalId).style.display = 'none';
        }
    });
};

// Função para determinar a saudação
function getGreeting() {
    const now = new Date();
    const hours = now.getHours();
    if (hours < 12) {
        return "Bom dia,";
    } else if (hours < 18) {
        return "Boa tarde,";
    } else {
        return "Boa noite,";
    }
}

// Função para enviar o lembrete via WhatsApp
function sendReminder(item_id, name, due_date, phone, folderType) {
    const greeting = getGreeting();
    fetchMessage(folderType, function(templateMessage) {
        const dueDate = new Date(due_date);
        // Checa se a dueDate é válida
        if (isNaN(dueDate.getTime())) {
            console.error('Data de vencimento inválida:', due_date);
            return;
        }

        dueDate.setDate(dueDate.getDate() + 1);
        const now = new Date();
        const isExpired = dueDate < now;
        const dateText = isExpired ? "Venceu em:" : "Vai vencer em:";

        const options = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' };
        const formattedDueDate = dueDate.toLocaleDateString('pt-BR', options);

        const message = templateMessage
            .replace(/{getGreeting}/g, greeting)
            .replace(/{item_id}/g, item_id)
            .replace(/{name}/g, name)
            .replace(/{dateText}/g, dateText)
            .replace(/{due_date}/g, formattedDueDate);

        const finalMessage = encodeURIComponent(message);
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${finalMessage}`;

        if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
            window.location.href = whatsappUrl;
        } else {
            window.open(whatsappUrl, '_blank');
        }
    });
}
// Manipulação de eventos para abrir e fechar modais
document.getElementById('open-whatsapp-modal').onclick = function() {
    $.ajax({
        url: 'get_message.php',
        type: 'GET',
        data: { folder_type: folderType },
        success: function(response) {
            const data = JSON.parse(response);
            if (data.status === 'success') {
                document.getElementById('whatsapp_message').value = data.message;
            } else {
                alert(data.message);
            }
            document.getElementById('whatsapp-modal').style.display = 'block';
        },
        error: function() {
            alert('Erro ao carregar a mensagem.');
        }
    });
};

document.getElementById('close-whatsapp-modal').onclick = function() {
    document.getElementById('whatsapp-modal').style.display = 'none';
}

document.getElementById('reset-whatsapp-message').onclick = function() {
    document.getElementById('whatsapp_message').value = defaultMessage;
}

document.getElementById('save-whatsapp-message').onclick = function() {
    const message = document.getElementById('whatsapp_message').value;
    const folder_id = "<?php echo $folder_id; ?>"; // Ou outra maneira de pegar o ID da pasta atual

    $.ajax({
        url: 'save_message.php',
        type: 'POST',
        data: {
            folder_id: folder_id, // Passando o folder_id
            message: message
        },
        success: function(response) {
            const data = JSON.parse(response);
            if (data.status === 'success') {
                alert("Mensagem salva com sucesso!");
                document.getElementById('whatsapp-modal').style.display = 'none';
            } else {
                alert(data.message);
            }
        },
        error: function() {
            alert('Erro ao salvar a mensagem.');
        }
    });
};

// Fechar modais ao clicar fora deles
window.onclick = function(event) {
    if (event.target == document.getElementById('add-modal')) {
        document.getElementById('add-modal').style.display = 'none';
    } else if (event.target == document.getElementById('edit-modal')) {
        document.getElementById('edit-modal').style.display = 'none';
    } else if (event.target == document.getElementById('settings-modal')) {
        document.getElementById('settings-modal').style.display = 'none';
    } else if (event.target == document.getElementById('whatsapp-modal')) {
        document.getElementById('whatsapp-modal').style.display = 'none';
    }
}

    </script>
</body>
</html>