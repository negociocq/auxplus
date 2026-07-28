<?php
session_start();
require 'db.php'; 

if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

$user_id = $_SESSION['user_id'];

// Processamento do envio do ticket
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $question = $_POST['question'];
    $stmt = $pdo->prepare("INSERT INTO tickets (user_id, question) VALUES (?, ?)");
    $stmt->execute([$user_id, $question]);
    $success_message = "Ticket enviado com sucesso!";
}
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enviar Ticket</title>
</head>
<body>
    <h2>Enviar Ticket</h2>
    <?php if (!empty($success_message)): ?>
        <p><?php echo htmlspecialchars($success_message); ?></p>
    <?php endif; ?>
    <form method="post">
        <label for="question">Sua Dúvida:</label>
        <textarea id="question" name="question" required></textarea>
        <button type="submit">Enviar</button>
    </form>
</body>
</html>