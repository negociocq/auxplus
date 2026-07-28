<?php
session_start();
require 'db.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

$user_id = $_SESSION['user_id'];

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $near_due_days = intval($_POST['near_due_days']);
    $far_due_days = intval($_POST['far_due_days']);

    $stmt = $pdo->prepare("REPLACE INTO settings (user_id, near_due_days, far_due_days) VALUES (?, ?, ?)");
    $stmt->execute([$user_id, $near_due_days, $far_due_days]);
}

$settings_stmt = $pdo->prepare("SELECT * FROM settings WHERE user_id = ?");
$settings_stmt->execute([$user_id]);
$settings = $settings_stmt->fetch();
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configurações</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Configurações de Vencimento</h1>
    </header>
    <main>
        <form method="post">
            <label for="near_due_days">Dias para "Perto de Vencer":</label>
            <input type="number" id="near_due_days" name="near_due_days" value="<?php echo htmlspecialchars($settings['near_due_days'] ?? '10'); ?>" required>
            
            <label for="far_due_days">Dias para "Longe de Vencer":</label>
            <input type="number" id="far_due_days" name="far_due_days" value="<?php echo htmlspecialchars($settings['far_due_days'] ?? '20'); ?>" required>
            
            <button type="submit">Salvar Configurações</button>
        </form>
    </main>
</body>
</html>
