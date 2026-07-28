<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Plataforma IPTV</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      background: #121212;
      color: #ffffff;
    }
    h1, h2, h3 {
      margin-left: 20px;
    }
    .tab {
      display: inline-block;
      margin: 10px;
      cursor: pointer;
      padding: 10px 20px;
      background-color: #1e1e1e;
    }
    .tab:hover {
      background-color: #333333;
    }
    .tab-content {
      display: none;
    }
    .active-tab {
      background-color: #555555;
    }
    .active-content {
      display: flex;
      height: 90vh;
    }
    .left-pane {
      width: 40%;
      overflow-y: auto;
      padding: 20px;
      border-right: 2px solid #444;
      box-sizing: border-box;
      background: #282828;
    }
    .right-pane {
      width: 60%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: #000;
    }
    video {
      width: 95%;
      height: auto;
      max-height: 80%;
      background: #000;
    }
    .folder h3 {
      cursor: pointer;
      background: #444;
      padding: 8px;
      margin: 0;
    }
    .filme-item, .serie-item {
      margin-left: 20px;
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      cursor: pointer;
    }
    .filme-item img, .serie-item img {
      width: 40px;
      height: 40px;
      margin-right: 10px;
    }
    .folder {
      margin-bottom: 15px;
    }
    input, button {
      width: 100%;
      margin-bottom: 10px;
      padding: 10px;
      box-sizing: border-box;
    }
    .titulo-atual {
      color: white;
      font-weight: bold;
      margin-bottom: 10px;
      text-align: center;
      display: none; /* Inicialmente oculto */
    }
    .selected {
      background: #666; /* Destaque para o item selecionado */
    }
    .nested {
      margin-left: 30px; /* Indentação para itens aninhados */
    }
    .back-button {
      margin: 10px;
      padding: 10px;
      background: #444;
      cursor: pointer;
      display: none;
    }
    .back-button:hover {
      background: #666;
    }
    #seasonList, #episodeList {
      margin: 10px 0;
    }
    .active-item {
      background-color: #555; /* Cor de fundo para o item ativo */
    }
  </style>
</head>
<body>

<h1>📺 Plataforma IPTV</h1>
<div>
  <span class="tab active-tab" onclick="showTab('canais')">Canais</span>
  <span class="tab" onclick="showTab('filmes')">Filmes</span>
  <span class="tab" onclick="showTab('series')">Séries</span>
</div>

<!-- Canais -->
<div id="canais" class="tab-content active-content">
  <div class="left-pane">
    <h3>📁 Carregar lista M3U</h3>
    <input type="file" id="m3uFile" accept=".m3u,.m3u8">
    <button onclick="loadM3UFromFile()">Carregar</button>
    <input type="text" id="searchInput" oninput="filterChannels()" placeholder="Buscar canal...">
    <div id="channelListContainer"></div>
  </div>
  <div class="right-pane">
    <div class="titulo-atual" id="tituloAtualCanal"></div>
    <video id="videoPlayer" controls autoplay></video>
  </div>
</div>

<!-- Filmes -->
<div id="filmes" class="tab-content">
  <div class="left-pane">
    <input type="text" id="searchFilmes" oninput="filterFilmes()" placeholder="Buscar filme...">
    <div id="filmeList"></div>
  </div>
  <div class="right-pane">
    <div class="titulo-atual" id="tituloAtualFilme"></div>
    <video id="filmePlayer" controls autoplay></video>
  </div>
</div>

<!-- Séries -->
<div id="series" class="tab-content">
  <div class="left-pane">
    <input type="text" id="searchSeries" oninput="filterSeries()" placeholder="Buscar série ou temporada...">
    <div id="serieList"></div>
    <button class="back-button" id="backButton" onclick="goBack()">Voltar</button>
    <div id="seasonList"></div>
    <div id="episodeList"></div>
  </div>
  <div class="right-pane" id="rightPaneSeries" style="display: none;">
    <div class="titulo-atual" id="tituloAtualSerie" style="display: none;"></div> <!-- Inicialmente oculto -->
    <video id="seriePlayer" controls autoplay></video>
  </div>
</div>

<script>
  let canais = {};
  let filmes = {};
  let series = {};
  let hls = null;
  let currentPlayingItem = null; // Item que está sendo reproduzido
  let currentSerie = null; // Armazena a série atual
  let currentSeason = null; // Armazena a temporada atual
  let currentEpisode = null; // Armazena o episódio atual

  const gruposFilmesIgnorados = ['filmes & series', 'filmes 24 horas'];

  function loadM3UFromFile() {
    const file = document.getElementById('m3uFile').files[0];
    if (!file) return alert("Selecione um arquivo M3U.");
    const reader = new FileReader();
    reader.onload = e => parseM3U(e.target.result);
    reader.readAsText(file);
  }

  function parseM3U(content) {
    canais = {};
    filmes = {};
    series = {};
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXTINF')) {
        const infoLine = lines[i];
        const title = infoLine.split(',').pop().trim();
        const url = lines[i + 1]?.trim();
        const groupMatch = infoLine.match(/group-title="([^"]+)"/);
        const groupTitle = groupMatch ? groupMatch[1] : "Sem Grupo";
        const logoMatch = infoLine.match(/tvg-logo="([^"]+)"/);
        const logo = logoMatch ? logoMatch[1] : "";
        if (!url || !url.startsWith("http")) continue;

        const groupLower = groupTitle.toLowerCase();
        const urlLower = url.toLowerCase();
        const item = { title, url, logo, groupTitle };

        if (groupLower.includes("canal") || groupLower.includes("canais")) {
          if (!canais[groupTitle]) canais[groupTitle] = [];
          canais[groupTitle].push(item);
        } else if (urlLower.includes("/movie/") && !gruposFilmesIgnorados.includes(groupLower)) {
          if (!filmes[groupTitle]) filmes[groupTitle] = [];
          filmes[groupTitle].push(item);
        } else if (urlLower.includes("/series/") || groupLower.includes("série")) {
          const serieName = title.split(' S')[0]; // Extrai o nome da série
          const seasonMatch = title.match(/S(\d+)/); // Captura a temporada

          if (!series[groupTitle]) series[groupTitle] = {}; // Agrupa por categorias

          if (!series[groupTitle][serieName]) series[groupTitle][serieName] = {};
          const season = seasonMatch ? `S${seasonMatch[1]}` : "S01";
          if (!series[groupTitle][serieName][season]) series[groupTitle][serieName][season] = [];
          series[groupTitle][serieName][season].push(item);
        } else {
          if (!canais[groupTitle]) canais[groupTitle] = [];
          canais[groupTitle].push(item);
        }
        i++;
      }
    }

    renderCanais();
    renderFilmes();
    renderSeries();
  }

  function renderCanais() {
    const container = document.getElementById('channelListContainer');
    container.innerHTML = '';
    for (const grupo in canais) {
      const folder = document.createElement('div');
      folder.className = 'folder';
      const title = document.createElement('h3');
      title.textContent = grupo;
      const content = document.createElement('div');
      content.style.display = 'none';

      canais[grupo].forEach(c => {
        const item = document.createElement('div');
        item.className = 'filme-item';
        item.innerHTML = `<img src="${c.logo}" alt=""> <span>${c.title}</span>`;
        item.addEventListener('click', () => {
          playMedia('videoPlayer', c.url, c.title, item);
          document.getElementById('tituloAtualCanal').textContent = c.title;
        });
        content.appendChild(item);
      });

      title.addEventListener('click', () => {
        const isOpen = content.style.display === 'block';
        closeAll();
        content.style.display = isOpen ? 'none' : 'block'; // Alterna a visibilidade
      });

      folder.appendChild(title);
      folder.appendChild(content);
      container.appendChild(folder);
    }
  }

  function closeAll() {
    document.querySelectorAll('.folder > div').forEach(content => {
      content.style.display = 'none'; // Fecha todas as pastas
    });
  }

  function renderFilmes() {
    const div = document.getElementById('filmeList');
    div.innerHTML = '';
    for (const grupo in filmes) {
      const folder = document.createElement('div');
      folder.className = 'folder';
      const title = document.createElement('h3');
      title.textContent = grupo;
      const content = document.createElement('div');
      content.style.display = 'none';

      filmes[grupo].forEach(f => {
        const item = document.createElement('div');
        item.className = 'filme-item';
        item.innerHTML = `<img src="${f.logo}" alt=""> <span>${f.title}</span>`;
        item.addEventListener('click', () => {
          playMedia('filmePlayer', f.url, f.title, item);
          document.getElementById('tituloAtualFilme').textContent = f.title;
        });
        content.appendChild(item);
      });

      title.addEventListener('click', () => {
        const isOpen = content.style.display === 'block';
        closeAll();
        content.style.display = isOpen ? 'none' : 'block';
      });

      folder.appendChild(title);
      folder.appendChild(content);
      div.appendChild(folder);
    }
  }

  function renderSeries() {
    const div = document.getElementById('serieList');
    div.innerHTML = '';

    for (const grupo in series) {
      const folder = document.createElement('div');
      folder.className = 'folder';
      const title = document.createElement('h3');
      title.textContent = grupo; // Nome do grupo de séries
      const content = document.createElement('div');
      content.style.display = 'none';

      for (const serieName in series[grupo]) {
        const serieFolder = document.createElement('div');
        serieFolder.className = 'nested'; // Adiciona indentação
        const serieTitle = document.createElement('h3');
        serieTitle.textContent = serieName; // Nome da série

        serieTitle.addEventListener('click', () => {
          closeAll(); // Fecha todas as pastas
          showSerie(grupo, serieName); // Mostra a série
        });

        serieFolder.appendChild(serieTitle);
        content.appendChild(serieFolder);
      }

      title.addEventListener('click', () => {
        const isOpen = content.style.display === 'block';
        closeAll();
        content.style.display = isOpen ? 'none' : 'block';
      });

      folder.appendChild(title);
      folder.appendChild(content);
      div.appendChild(folder);
    }
  }

  function showSerie(grupo, serieName) {
    const rightPane = document.getElementById('rightPaneSeries');
    const seasonList = document.getElementById('seasonList');
    const titleDiv = document.getElementById('tituloAtualSerie');
    const episodeList = document.getElementById('episodeList');

    titleDiv.style.display = 'block'; // Mantém o título sempre visível
    rightPane.style.display = 'block'; // Mostra o painel da série
    seasonList.innerHTML = ''; // Limpa a lista de temporadas
    episodeList.innerHTML = ''; // Limpa a lista de episódios

    // Obtém as temporadas da série selecionada
    if (series[grupo][serieName]) {
      for (const temporada in series[grupo][serieName]) {
        const seasonButton = document.createElement('button');
        seasonButton.textContent = temporada; // Nome da temporada
        seasonButton.className = "season-button";
        seasonButton.onclick = () => showEpisodes(grupo, serieName, temporada, seasonButton);
        seasonList.appendChild(seasonButton);
      }
    }

    // Esconde a lista de séries
    document.getElementById('serieList').style.display = 'none';
    document.getElementById('backButton').style.display = 'block'; // Mostra botão de voltar

    // Limpa a seleção de outras temporadas
    clearSeasonSelection(seasonList);
  }

  function clearSeasonSelection(seasonList) {
    // Remove a classe 'selected' de todos os botões de temporada.
    const seasonButtons = seasonList.getElementsByTagName('button');
    for (let button of seasonButtons) {
      button.classList.remove('selected');
    }
  }

  function showEpisodes(grupo, serieName, temporada, seasonButton) {
    const episodeList = document.getElementById('episodeList');
    episodeList.innerHTML = ''; // Limpa a lista de episódios

    // Verifica se a lista de episódios está visível
    const isCurrentlyOpen = seasonButton.classList.contains('active');
    
    // Altera o estado do botão da temporada
    if (isCurrentlyOpen) {
      seasonButton.classList.remove('active');
      episodeList.style.display = 'none'; // Recolhe a lista
    } else {
      // Limpa a seleção de outras temporadas
      clearSeasonSelection(document.getElementById('seasonList'));

      seasonButton.classList.add('active');
      episodeList.style.display = 'block'; // Exibe a lista

      // Adiciona a classe 'selected' à temporada atual
      seasonButton.classList.add('selected');
    }

    series[grupo][serieName][temporada].forEach(episodio => {
      const episodeItem = document.createElement('div');
      episodeItem.className = 'serie-item';
      episodeItem.innerHTML = `<img src="${episodio.logo}" alt=""> <span>${episodio.title}</span>`;
      episodeItem.onclick = () => {
        playMedia('seriePlayer', episodio.url, episodio.title, episodeItem);
        currentSerie = serieName; // Armazena a série atual
        currentSeason = temporada; // Armazena a temporada atual
        currentEpisode = episodio; // Armazena o episódio atual

        // Atualiza o título da série exibido acima do player
        const titleDiv = document.getElementById('tituloAtualSerie');
        titleDiv.textContent = episodio.title; // Define o titulo do episodio atual
      };
      episodeList.appendChild(episodeItem);
    });
  }

  function showTab(tabName) {
    pauseAllPlayers();
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active-tab'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active-content'));
    document.getElementById(tabName).classList.add('active-content');
    document.querySelector(`.tab[onclick="showTab('${tabName}')"]`).classList.add('active-tab');
    closeAll(); // Fecha todas as pastas ao mudar de aba
    resetSeriesView(); // Reinicia a visualização de séries
  }

  function resetSeriesView() {
    document.getElementById('rightPaneSeries').style.display = 'block'; // Mantém o player exibido
    document.getElementById('backButton').style.display = 'block'; // Mantém o botão de voltar
    document.getElementById('serieList').style.display = 'block'; // Mostra a lista de séries
    clearSeasonSelection(document.getElementById('seasonList')); // Limpa a seleção de temporadas
  }

  function goBack() {
    const episodeList = document.getElementById('episodeList');
    episodeList.innerHTML = ''; // Limpa a lista de episódios ao voltar
    const seasonList = document.getElementById('seasonList');
    seasonList.innerHTML = ''; // Limpa a lista de temporadas ao voltar
    resetSeriesView(); // Restaura a visualização anterior da lista de séries
  }

  function highlightCurrentEpisode() {
    const seasonList = document.getElementById('seasonList');
    const episodeList = document.getElementById('episodeList');

    // Destaque a temporada atual
    if (currentSeason) {
      const seasonButtons = seasonList.getElementsByTagName('button');
      for (let button of seasonButtons) {
        if (button.textContent === currentSeason) {
          button.classList.add('selected');
        }
      }
    }

    // Destaque o episódio atual
    if (currentEpisode) {
      const episodeItems = episodeList.getElementsByClassName('serie-item');
      for (let item of episodeItems) {
        if (item.textContent.includes(currentEpisode.title)) {
          item.classList.add('active-item');
        }
      }
    }
  }

  function pauseAllPlayers() {
    document.querySelectorAll('video').forEach(p => {
      p.pause();
      p.src = ''; // Limpa a fonte do vídeo
    });
    if (hls) { hls.destroy(); hls = null; }
  }

  function clearCurrentPlaying() {
    if (currentPlayingItem) {
      currentPlayingItem.classList.remove('active-item');
      currentPlayingItem = null;
    }
  }

  function playMedia(playerId, url, title = '', item = null) {
    const player = document.getElementById(playerId);
    clearCurrentPlaying(); // Limpa o destaque do item atual

    // Usando o proxy
    const proxyUrl = `proxy.php?url=${encodeURIComponent(url)}`;

    if (proxyUrl.toLowerCase().endsWith('.m3u8')) {
        if (Hls.isSupported()) {
            if (hls) hls.destroy(); // Destrói a instância anterior

            hls = new Hls();
            hls.loadSource(proxyUrl); // Modificado para usar o proxy
            hls.attachMedia(player);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                player.play();
            });

            hls.on(Hls.Events.ERROR, function(event, data) {
                console.error("Error encountered: ", data);
            });
        } else if (player.canPlayType('application/vnd.apple.mpegurl')) {
            player.src = proxyUrl; // Modificado para usar o proxy
            player.addEventListener('loadedmetadata', () => {
                player.play();
            });
        }
    } else {
        player.src = proxyUrl; // Modificado para usar o proxy
        player.play();
    }

    if (item) {
        item.classList.add('active-item'); // Destaca o item atual
        currentPlayingItem = item; // Armazena o item atual
    }
  }

  function filterChannels() {
    const termo = document.getElementById('searchInput').value.toLowerCase();
    const container = document.getElementById('channelListContainer');
    container.innerHTML = '';

    for (const grupo in canais) {
      const itemsFiltrados = canais[grupo].filter(c => c.title.toLowerCase().includes(termo));
      if (itemsFiltrados.length) {
        const folder = document.createElement('div');
        folder.className = 'folder';
        const title = document.createElement('h3');
        title.textContent = grupo;
        const content = document.createElement('div');
        content.style.display = 'none';

        itemsFiltrados.forEach(c => {
          const item = document.createElement('div');
          item.className = 'filme-item';
          item.innerHTML = `<img src="${c.logo}" alt=""> <span>${c.title}</span>`;
          item.addEventListener('click', () => {
            playMedia('videoPlayer', c.url, c.title, item);
            document.getElementById('tituloAtualCanal').textContent = c.title;
          });
          content.appendChild(item);
        });

        title.addEventListener('click', () => {
          const isOpen = content.style.display === 'block';
          closeAll();
          content.style.display = isOpen ? 'none' : 'block'; // Alterna a visibilidade
        });

        folder.appendChild(title);
        folder.appendChild(content);
        container.appendChild(folder);
      }
    }
  }

  function filterFilmes() {
    const termo = document.getElementById('searchFilmes').value.toLowerCase();
    const div = document.getElementById('filmeList');
    div.innerHTML = '';

    for (const grupo in filmes) {
      const filtrados = filmes[grupo].filter(f => f.title.toLowerCase().includes(termo));
      if (filtrados.length) {
        const folder = document.createElement('div');
        folder.className = 'folder';
        const title = document.createElement('h3');
        title.textContent = grupo;
        const content = document.createElement('div');
        content.style.display = 'none';

        filtrados.forEach(f => {
          const item = document.createElement('div');
          item.className = 'filme-item';
          item.innerHTML = `<img src="${f.logo}" alt=""> <span>${f.title}</span>`;
          item.addEventListener('click', () => {
            playMedia('filmePlayer', f.url, f.title, item);
            document.getElementById('tituloAtualFilme').textContent = f.title;
          });
          content.appendChild(item);
        });

        title.addEventListener('click', () => {
          const isOpen = content.style.display === 'block';
          closeAll();
          content.style.display = isOpen ? 'none' : 'block';
        });

        folder.appendChild(title);
        folder.appendChild(content);
        div.appendChild(folder);
      }
    }
  }

  function filterSeries() {
    const termo = document.getElementById('searchSeries').value.toLowerCase();
    const div = document.getElementById('serieList');
    div.innerHTML = '';

    for (const grupo in series) {
      const folder = document.createElement('div');
      folder.className = 'folder';
      const title = document.createElement('h3');
      title.textContent = grupo; // Nome do grupo de séries
      const content = document.createElement('div');
      content.style.display = 'none';

      let hasSeries = false;

      for (const serieName in series[grupo]) {
        if (serieName.toLowerCase().includes(termo)) {
          hasSeries = true; // Grupo tem séries que correspondem ao filtro
          const serieFolder = document.createElement('div');
          serieFolder.className = 'nested'; // Adiciona indentação
          const serieTitle = document.createElement('h3');
          serieTitle.textContent = serieName; // Nome da série

          serieTitle.addEventListener('click', () => {
            closeAll(); // Fecha todas as pastas
            showSerie(grupo, serieName); // Mostra a série
          });

          serieFolder.appendChild(serieTitle);
          content.appendChild(serieFolder);
        }
      }

      if (hasSeries) {
        title.addEventListener('click', () => {
          const isOpen = content.style.display === 'block';
          closeAll();
          content.style.display = isOpen ? 'none' : 'block';
        });

        folder.appendChild(title);
        folder.appendChild(content);
        div.appendChild(folder);
      }
    }
  }
</script>

</body>
</html>