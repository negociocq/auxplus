<?php
session_start();
require 'db.php'; 

if (!isset($_SESSION['user_id']) || !$_SESSION['is_admin']) {
    header("Location: login.php");
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['ticket_id'])) {
    $ticket_id = $_POST['ticket_id'];
    // Aqui você pode adicionar lógica para responder ao ticket
    // Por exemplo, atualizar o status ou registrar a resposta
    // Redirecionar após concluir a resposta
    header("Location: dashboard_adm.php?page=tickets"); // Redireciona de volta para a página de tickets
    exit();
}
?>