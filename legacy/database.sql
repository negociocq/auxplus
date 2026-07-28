-- phpMyAdmin SQL Dump
-- version 4.9.0.1
-- https://www.phpmyadmin.net/
--
-- Host: sql302.byetcluster.com
-- Tempo de geração: 31/08/2024 às 21:45
-- Versão do servidor: 10.6.19-MariaDB
-- Versão do PHP: 7.2.22

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `if0_37080212_auxplus`
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `folders`
--

CREATE TABLE `folders` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('Produto','Cliente') NOT NULL,
  `name` varchar(255) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Despejando dados para a tabela `folders`
--

INSERT INTO `folders` (`id`, `user_id`, `type`, `name`) VALUES
(3, 1, 'Cliente', 'IPTV'),
(12, 3, 'Cliente', 'Banda larga 30MB'),
(5, 2, 'Cliente', 'Internet '),
(10, 1, 'Produto', 'Mercado TOP'),
(13, 3, 'Produto', 'Mercadinho PreÃ§o Bom'),
(14, 4, 'Cliente', 'Hinode'),
(24, 1, '', 'gabriel');

-- --------------------------------------------------------

--
-- Estrutura para tabela `items`
--

CREATE TABLE `items` (
  `id` int(11) NOT NULL,
  `folder_id` int(11) NOT NULL,
  `item_id` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `due_date` date NOT NULL,
  `phone` varchar(15) DEFAULT NULL,
  `status` enum('Longe de Vencer','Perto de Vencer','Já Vencido') NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Despejando dados para a tabela `items`
--

INSERT INTO `items` (`id`, `folder_id`, `item_id`, `name`, `due_date`, `phone`, `status`) VALUES
(536, 3, '3333451', 'Tamires lorena', '2024-09-01', '+557192621895', 'Perto de Vencer'),
(535, 3, '168618488', 'Gilmar andre netgool', '2024-09-04', '+557184727465', 'Perto de Vencer'),
(534, 3, '6404810', 'Davi de levi', '2024-09-04', '+557191871455', 'Perto de Vencer'),
(533, 3, '851432900', 'Tio alexandre IboCQ', '2024-09-04', '+557192191376', 'Perto de Vencer'),
(532, 3, '7545558', 'Gleidson poli', '2024-09-05', '+557192461100', 'Perto de Vencer'),
(531, 3, '452452452', 'deisiane vinicius', '2024-09-05', '+557186407786', 'Perto de Vencer'),
(530, 3, '94648181', 'Jessica Andressa', '2024-09-05', '+557191386673', 'Perto de Vencer'),
(529, 3, '5455580', 'Ian gerson', '2024-09-07', '+557192006316', 'Perto de Vencer'),
(528, 3, '94646788', 'JoÃ£o JT', '2024-09-07', '+557187525223', 'Perto de Vencer'),
(527, 3, '61132754', 'Iago fenix', '2024-09-08', '+557183885431', 'Perto de Vencer'),
(526, 3, '2254471', 'Viviane Sogra de JoÃ£o', '2024-09-08', '+557191917915', 'Perto de Vencer'),
(525, 3, '8484543', 'Geilson PI Xcloud', '2024-09-08', '+557399144978', 'Perto de Vencer'),
(524, 3, '4651888', 'Sapo barbearia', '2024-09-09', '+557192980889', 'Perto de Vencer'),
(523, 3, '561561521', 'Mauricio Helber', '2024-09-09', '+557192882607', 'Perto de Vencer'),
(522, 3, '81601610', 'Everaldo Netgool', '2024-09-09', '+557199003535', 'Perto de Vencer'),
(521, 3, '9434251', 'Geraldo', '2024-09-11', '+0000000000000', 'Perto de Vencer'),
(520, 3, '64640081', 'Altamiro vizinho', '2024-09-11', '+557182724040', 'Perto de Vencer'),
(519, 3, '9994884', 'Davidson vizinho', '2024-09-12', '+557191278425', 'Longe de Vencer'),
(518, 3, '21315542', 'Vanessa Altamiro', '2024-09-13', '+557181496477', 'Longe de Vencer'),
(517, 3, '818161', 'Jean STF Xcloud', '2024-09-13', '+557186096128', 'Longe de Vencer'),
(516, 3, '3.51862E+11', 'Alencaar', '2024-09-14', '+0000000000000', 'Longe de Vencer'),
(515, 3, '8445218', 'Liane sogra de vinicius', '2024-09-14', '+0000000000000', 'Longe de Vencer'),
(514, 3, '54518191', 'Isidio Moura', '2024-09-14', '+557188736139', 'Longe de Vencer'),
(513, 3, '81464432', 'Hozana', '2024-09-15', '+0000000000000', 'Longe de Vencer'),
(512, 3, '496464818', 'Junior de kevin', '2024-09-15', '+557192078999', 'Longe de Vencer'),
(511, 3, '87675811', 'Alessandra lorena prima', '2024-09-15', '+557188867486', 'Longe de Vencer'),
(510, 3, '61615181', 'Williane', '2024-09-16', '+0000000000000', 'Longe de Vencer'),
(509, 3, '9132451', 'Vitoria Netgool', '2024-09-16', '+0000000000000', 'Longe de Vencer'),
(508, 3, '64431251', 'Renan Oliveira', '2024-09-16', '+557381204759', 'Longe de Vencer'),
(507, 3, '51408806885', 'Josemar STF', '2024-09-16', '+557192802759', 'Longe de Vencer'),
(506, 3, '24542157', 'Cristina Altamiro', '2024-09-17', '+557187776035', 'Longe de Vencer'),
(505, 3, '615181818', 'Cadu ubas Xcloud', '2024-09-17', '+557191729678', 'Longe de Vencer'),
(504, 3, '51315814', 'William Wallace de Noelia', '2024-09-18', '+0000000000000', 'Longe de Vencer'),
(503, 3, '54254007', 'Gerson ian', '2024-09-19', '+557188005198', 'Longe de Vencer'),
(502, 3, '2435211', 'Jessica Insta', '2024-09-19', '+0000000000000', 'Longe de Vencer'),
(501, 3, '528524284', 'Hilmar Netgool', '2024-09-19', '+557193019294', 'Longe de Vencer'),
(500, 3, '12526634', 'Khall IboCQ', '2024-09-20', '+557196605764', 'Longe de Vencer'),
(499, 3, '245121558', 'Lucas de valmar', '2024-09-20', '+557184689576', 'Longe de Vencer'),
(498, 3, '215422', 'Banana Guilherme banda', '2024-09-21', '+0000000000000', 'Longe de Vencer'),
(497, 3, '542151', 'Marcos primo de JoÃ£o JT', '2024-09-21', '+0000000000000', 'Longe de Vencer'),
(496, 3, '81297485', 'Tatiane Pessoa Cliente Xcloud', '2024-09-21', '+557191365128', 'Longe de Vencer'),
(495, 3, '51318154319', 'Guilherme filho de luiz joao Xcloud', '2024-09-21', '+0000000000000', 'Longe de Vencer'),
(494, 3, '5134818919', 'Luiz Carlos JoÃ£o Xcloud', '2024-09-21', '+557192384421', 'Longe de Vencer'),
(493, 3, '518181', 'Marcelo Rua Xcloud', '2024-09-22', '+557183567641', 'Longe de Vencer'),
(492, 3, '646455', 'Eliete vÃ³', '2024-09-23', '+557191314941', 'Longe de Vencer'),
(491, 3, '8461312', 'Vitor sobreira', '2024-09-23', '+0000000000000', 'Longe de Vencer'),
(490, 3, '542751845', 'Francine INSTA', '2024-09-24', '+553193235358', 'Longe de Vencer'),
(489, 3, '215433542', 'Ramon Rua', '2024-09-24', '+557188550998', 'Longe de Vencer'),
(488, 3, '3186181121', 'Adler', '2024-09-24', '+555599036758', 'Longe de Vencer'),
(487, 3, '563742', 'Ruan - Davidson', '2024-09-25', '+557199400544', 'Longe de Vencer'),
(486, 3, '9148546', 'AndrÃ© Netgool', '2024-09-25', '+557199366866', 'Longe de Vencer'),
(485, 3, '83322258', 'Wallace Kevin', '2024-09-26', '+557581724715', 'Longe de Vencer'),
(484, 3, '51551124', 'Noelia Ribeiro - Theilane', '2024-09-26', '+557188590161', 'Longe de Vencer'),
(483, 3, '641818', 'Leo Jean IboCQ', '2024-09-26', '+557187783521', 'Longe de Vencer'),
(482, 3, '812215125', 'Magdiel ConstÃ¢ncio', '2024-09-28', '+557894719503', 'Longe de Vencer'),
(481, 3, '64818115', 'Vinicius Grande poli', '2024-09-29', '+557183739054', 'Longe de Vencer'),
(480, 3, '51298445', 'JoÃ£o Primo IboCQ', '2024-09-29', '+557194119424', 'Longe de Vencer'),
(479, 3, '814853', 'Tarcisio e Outros', '2024-09-30', '+0000000000000', 'Longe de Vencer'),
(537, 3, '1112544', 'Tio Fernando', '2024-09-01', '+557188187209', 'Perto de Vencer'),
(538, 3, '552114589', 'Amanda Andressa ATENTO', '2024-08-30', '+557191124634', ''),
(539, 3, '7662554', 'Alef banda o ragah', '2024-08-29', '+557186840886', ''),
(540, 3, '5236521', 'Richard Original', '2024-08-28', '+557192520681', ''),
(541, 3, '36115150', 'AndrÃ© Pai Andressa', '2024-08-27', '+557191996305', ''),
(542, 3, '34615128', 'Gal NETGOOL', '2024-09-30', '+557193756320', 'Longe de Vencer'),
(543, 3, '9454242121', 'Flavio PraÃ§a ubarnas', '2024-08-26', '+557191122689', ''),
(544, 3, '646121255', 'Lucas Santos', '2024-08-26', '+557191280065', ''),
(545, 3, '6134272', 'Edson Alencar Netgool', '2024-08-25', '+557192346987', ''),
(546, 3, '5131518111', 'JosÃ© Solano', '2024-08-25', '+558698290840', ''),
(547, 3, '846431153', 'Biel Castro', '2024-08-24', '+557186172272', ''),
(548, 3, '2251147', 'Ronald bolinha', '2024-08-24', '+557183560887', ''),
(549, 3, '2555441', 'Caique tolate', '2024-09-30', '+557191792992', 'Longe de Vencer'),
(550, 3, '542512788', 'Josicleiton INSTA', '2024-08-20', '+556692159090', ''),
(551, 3, '64521557', 'Wadson banda', '2024-08-17', '+557199863701', ''),
(552, 3, '8108501', 'Tia sanda Netgool', '2024-08-09', '+557196014191', ''),
(553, 3, '9464319', 'Thiago Bolly 2', '2024-07-31', '+557193968872', ''),
(554, 3, '939688', 'Thiago Bolly 1', '2024-07-31', '+557193968872', '');

-- --------------------------------------------------------

--
-- Estrutura para tabela `settings`
--

CREATE TABLE `settings` (
  `user_id` int(11) NOT NULL,
  `near_due_days` int(11) NOT NULL,
  `far_due_days` int(11) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Despejando dados para a tabela `settings`
--

INSERT INTO `settings` (`user_id`, `near_due_days`, `far_due_days`) VALUES
(1, 11, 10),
(2, 10, 20),
(3, 10, 20),
(4, 10, 20);

-- --------------------------------------------------------

--
-- Estrutura para tabela `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `is_admin` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Despejando dados para a tabela `users`
--

INSERT INTO `users` (`id`, `username`, `password`, `is_admin`, `is_active`) VALUES
(1, 'tarciocq', '$2y$10$cp75Q2VPuS4bujVF9d70v.VY3lO0dlRHKh9pzvVv70zsmUMCQmk9O', 0, 1),
(3, 'netgool', '$2y$10$lgFJfwztqZl7VbjMAjF0QeRBNMiIteMibEaHqugZeRJGIcxV55NVi', 0, 1),
(9, 'admin', '$2y$10$7HGd2bF/zWbJE8SN6.ntJu9WrVHG97KxtDShcDCoFA6rLcKWum5By', 1, 1);

-- --------------------------------------------------------

--
-- Estrutura para tabela `whatsapp_messages`
--

CREATE TABLE `whatsapp_messages` (
  `user_id` int(11) NOT NULL,
  `folder_type` enum('Cliente','Produto') NOT NULL,
  `message` text NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Despejando dados para a tabela `whatsapp_messages`
--

INSERT INTO `whatsapp_messages` (`user_id`, `folder_type`, `message`) VALUES
(1, 'Cliente', '{getGreeting} tudo bem?\n\nðŸ”” Lembrete da T&E ðŸ””\n\nUsuÃ¡rio: {item_id}\n\n{dateText} {due_date}\n\nNÃ£o esqueÃ§a de renovar para continuar assistindo sem interrupÃ§Ãµes.\n\nAproveite seus programas favoritos! ðŸ“ºâœ¨\n\n> Obrigado pela sua preferÃªncia! ðŸŒŸ'),
(1, 'Produto', '{getGreeting}\n\nGostarÃ­amos de lembrÃ¡-lo(a) sobre o vencimento do seguinte produto:\n\nProduto: {name}\n\n{dateText} {due_date}\n\nPor favor, tome as medidas necessÃ¡rias para gerenciar este produto antes da data de vencimento. Se precisar de mais informaÃ§Ãµes ou assistÃªncia, estamos Ã  disposiÃ§Ã£o.\n\nObrigado pela atenÃ§Ã£o.'),
(3, 'Cliente', '{Tudo ok'),
(3, 'Produto', 'Tudo certo ne?');

--
-- Índices de tabelas apagadas
--

--
-- Índices de tabela `folders`
--
ALTER TABLE `folders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Índices de tabela `items`
--
ALTER TABLE `items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `folder_id` (`folder_id`);

--
-- Índices de tabela `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`user_id`);

--
-- Índices de tabela `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Índices de tabela `whatsapp_messages`
--
ALTER TABLE `whatsapp_messages`
  ADD PRIMARY KEY (`user_id`,`folder_type`);

--
-- AUTO_INCREMENT de tabelas apagadas
--

--
-- AUTO_INCREMENT de tabela `folders`
--
ALTER TABLE `folders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=28;

--
-- AUTO_INCREMENT de tabela `items`
--
ALTER TABLE `items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=555;

--
-- AUTO_INCREMENT de tabela `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
