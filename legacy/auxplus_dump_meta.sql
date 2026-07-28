-- phpMyAdmin SQL Dump
-- version 4.9.0.1
-- Host: sql302.infinityfree.com
-- Banco: if0_37080212_auxplus
-- Fixed/imported for AuxPlus Dyad app

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";

CREATE TABLE IF NOT EXISTS `folders` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('Produto','Cliente') NOT NULL,
  `name` varchar(255) NOT NULL,
  `whatsapp_message` text DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

INSERT INTO `folders` (`id`, `user_id`, `type`, `name`, `whatsapp_message`) VALUES
(3, 1, 'Cliente', 'IPTV', NULL),
(12, 3, 'Cliente', 'Banda larga 30MB', NULL),
(5, 2, 'Cliente', 'Internet ', NULL),
(13, 3, 'Produto', 'Mercadinho Preço Bom', NULL),
(14, 4, 'Cliente', 'Hinode', NULL),
(30, 12, 'Cliente', 'Clientes P2P', NULL),
(29, 12, 'Cliente', 'Clientes IPTV', NULL),
(31, 1, 'Cliente', 'Revendedores IPTV', NULL),
(114, 17, 'Cliente', 'IPTV', NULL),
(122, 1, 'Cliente', 'Internet', NULL),
(119, 18, 'Cliente', 'IPTV', NULL),
(106, 16, 'Cliente', 'Clientes 100MB', NULL),
(104, 15, 'Cliente', 'P2P', NULL),
(98, 1, 'Produto', 'Dívidas ', NULL),
(105, 15, 'Cliente', 'REVENDEDOR', NULL),
(103, 15, 'Cliente', 'IPTV', NULL);

CREATE TABLE IF NOT EXISTS `folder_messages` (
  `id` int(11) NOT NULL,
  `folder_id` int(11) NOT NULL,
  `message` text NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

INSERT INTO `folder_messages` (`id`, `folder_id`, `message`) VALUES
(1, 3, '{getGreeting}\n\nLembrete da \"IPTV\"\n\nUsuário: {item_id}\n\n{dateText} {due_date}\n\nNão esqueça de renovar para continuar assistindo sem interrupções.\n\nAproveite seus programas favoritos!\n\n> Obrigado pela sua preferência!'),
(2, 5, 'Mensagem específica para a pasta Banda larga 30MB'),
(3, 10, '{getGreeting}\n\nGostaríamos de lembrá-lo(a) sobre o vencimento do seguinte produto:\n\nProduto: {name}\n\n{dateText} {due_date}\n\nPor favor, tome as medidas necessárias para gerenciar este produto antes da data de vencimento. Se precisar de mais informações ou assistência, estamos à disposição.\n\nObrigado pela atenção.');

CREATE TABLE IF NOT EXISTS `folder_settings` (
  `folder_id` int(11) NOT NULL,
  `near_due_days` int(11) NOT NULL,
  `far_due_days` int(11) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

INSERT INTO `folder_settings` (`folder_id`, `near_due_days`, `far_due_days`) VALUES
(3, 2, 2),
(5, 3, 3),
(12, 3, 3),
(13, 3, 3),
(14, 3, 3),
(29, 3, 3),
(30, 3, 3),
(31, 3, 3),
(98, 3, 3),
(103, 3, 3),
(104, 3, 3),
(105, 3, 3),
(106, 3, 3),
(107, 3, 3),
(108, 3, 3),
(111, 3, 3),
(119, 2, 2),
(114, 3, 3),
(116, 3, 3),
(120, 3, 3),
(122, 3, 3);

CREATE TABLE IF NOT EXISTS `settings` (
  `user_id` int(11) NOT NULL,
  `folder_id` int(11) NOT NULL,
  `near_due_days` int(11) NOT NULL,
  `far_due_days` int(11) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

INSERT INTO `settings` (`user_id`, `folder_id`, `near_due_days`, `far_due_days`) VALUES
(1, 0, 3, 3),
(2, 0, 10, 20),
(3, 0, 10, 20),
(4, 0, 10, 20),
(12, 0, 3, 3);

CREATE TABLE IF NOT EXISTS `tickets` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `question` text NOT NULL,
  `status` enum('pending','answered') DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `answered_at` timestamp NULL DEFAULT NULL,
  `response` text DEFAULT NULL,
  `responded_at` datetime DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

INSERT INTO `tickets` (`id`, `user_id`, `question`, `status`, `created_at`, `answered_at`, `response`, `responded_at`) VALUES
(1, 1, 'Olá, estou com uma duvida, como verifico o grafico anual da pasta?', 'pending', '2024-11-12 16:15:04', NULL, 'Jaja respondo', '2024-11-12 11:02:15'),
(2, 1, 'Olá, estou com uma duvida, como verifico o grafico anual da pasta?', 'pending', '2024-11-12 16:21:32', NULL, 'Olá TarcioCq, ficamos felizes com seu contato!\r\n\r\nPara verificar o gráfico anual das pastas basta clicar nos 3 traços horizontais no canto superior esquerdo da sua tela >> Pastas >> Mostrar Gráfico.\r\n\r\nFeito isso selecione  o ano que deseja.\r\n\r\n\r\nAtenciosamente, Suporte AuxPlus', '2024-11-12 08:46:18'),
(3, 12, 'Como posso inserir um produto novo na pasta?', 'pending', '2024-11-12 17:00:15', NULL, NULL, NULL),
(4, 1, 'Testando\r\nTeste e teste\r\n\r\nObrigado', 'pending', '2024-11-12 18:47:15', NULL, 'Ola, ola\r\nAbraço \r\n\r\n\r\nAuxplus', '2024-11-12 11:22:15'),
(5, 1, 'Testando\r\nTeste e teste\r\n\r\nObrigado', 'pending', '2024-11-12 18:48:19', NULL, NULL, NULL),
(6, 1, 'Ola quando iniciou a plataforma?\r\n\r\nAbraço ', 'pending', '2024-11-13 12:13:09', NULL, 'Eai começou em 2024\r\n\r\nSegue melhorando\r\nAbraço', '2024-11-13 04:14:30');

CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `is_admin` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `remember_token` varchar(255) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

INSERT INTO `users` (`id`, `username`, `password`, `is_admin`, `is_active`, `remember_token`) VALUES
(1, 'tarciocq', '123456', 0, 1, NULL),
(9, 'admin', 'admin123', 1, 1, NULL),
(12, 'eronvitor', '123456', 0, 1, NULL),
(18, 'natu', '123456', 0, 1, NULL),
(16, 'andrelima', '123456', 0, 1, NULL),
(17, 'ginhocapu', '123456', 0, 1, NULL),
(2, 'usuario_2', '123456', 0, 1, NULL),
(3, 'usuario_3', '123456', 0, 1, NULL),
(4, 'usuario_4', '123456', 0, 1, NULL),
(15, 'usuario_15', '123456', 0, 1, NULL);

CREATE TABLE IF NOT EXISTS `whatsapp_messages` (
  `user_id` int(11) NOT NULL,
  `folder_id` int(11) NOT NULL,
  `message` text DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

INSERT INTO `whatsapp_messages` (`user_id`, `folder_id`, `message`) VALUES
(1, 10, '{getGreeting}\n\nGostaríamos de lembrá-lo(a) sobre o vencimento do seguinte produto:\n\nProduto: {name}\n\n{dateText} {due_date}\n\nPor favor, tome as medidas necessárias para gerenciar este produto antes da data de vencimento. Se precisar de mais informações ou assistência, estamos à disposição.\n\nObrigado pela atenção.'),
(1, 3, '{getGreeting}\n\nLembrete da T&E\n\nUsuário: {item_id}\n\n{dateText} {due_date}\n\nNão esqueça de renovar para continuar assistindo sem interrupções.\n\nAproveite seus programas favoritos!\n\nPara facilitar, aqui está o nosso Pix:\n\nPix 7198616-4082\nBanco do Brasil\nTARCISIO COUTO QUEIROZ\n\n> Obrigado pela sua preferência!'),
(1, 31, 'Lembrem de renovar seus clientes'),
(12, 29, '{getGreeting}\n\nLembrete da \"T&E\"\n[MENSAGEM AUTOMÁTICA]\n\nUsuário: {item_id}\n\n{dateText} {due_date}\n\nNão esqueça de renovar para continuar assistindo sem interrupções.\n\nAproveite seus programas favoritos!\n\nChave Pix: eronvitorchaves@gmail.com\nBanco: Mercado Pago\nRecebedor: Eron Vitor Souza Chaves\n\n> Obrigado pela sua preferência!'),
(12, 30, '{getGreeting}\n\nLembrete da \"T&E\"\n\nLembrete: Automático\n\nUsuário: {item_id}\n\n{dateText} {due_date}\n\nNão esqueça de renovar para continuar assistindo sem interrupções.\n\nAproveite seus programas favoritos!\n\n> Obrigado pela sua preferência!'),
(15, 103, '{getGreeting}\n\nLembrete da \"Uniplay\"\n\nUsuário: {item_id}\n\n{dateText} {due_date}\n\nNão esqueça de renovar para continuar assistindo sem interrupções.\n\nAproveite seus programas favoritos!\n\n> Obrigado pela sua preferência!'),
(16, 106, '{getGreeting}\n\nLembrete\n\nSua conexão {dateText} {due_date}\n\nNão esqueça de renovar sua internet para continuar navegando sem interrupções.\n\nA data de vencimento é dia 15 de cada mês, sendo que o prazo final de pagamento é dia 20,\nApós essa data o sistema fara o bloqueio.\nConto com sua colaboração!\n\nSegue anexo meu PIX\n(71-99199-6305)\nBanco do Brasil\n\n> Obrigado pela sua preferência!'),
(17, 114, '{getGreeting}\n\nLembrete\n\n{dateText} {due_date}\n\nNão esqueça de renovar para continuar assistindo sem interrupções.\n\nAproveite seus programas favoritos!\n\n> Obrigado pela sua preferência!'),
(1, 115, '{getGreeting}\n\nLembrete da \"Empresa\"\n\nUsuário: {item_id}\n\n{dateText} {due_date}\n\nNão esqueça de renovar para continuar assistindo sem interrupções.\n\nAproveite seus programas favoritos!\n\n> Obrigado pela sua preferência!'),
(18, 119, '{getGreeting}\n\nLembrete\n\nUsuário: {item_id}\n\n{dateText} {due_date}\n\nNão esqueça de renovar para continuar assistindo sem interrupções.\n\nAproveite seus programas favoritos!\n\n> Obrigado pela sua preferência!'),
(1, 122, '{getGreeting}\n\nLembrete\n\nUsuário: {item_id}\n{dateText} {due_date}\n\nRenove sua internet para continuar navegando em alta velocidade e sem interrupções!\n\nPara facilitar, aqui está o nosso Pix:\n\nPix 7198616-4082\nBanco do Brasil\nTARCISIO COUTO QUEIROZ\n\n> Obrigado pela sua preferência!');
