document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const welcome = $('#welcome');
  const login = $('#login');
  const app = $('#app');
  const API_URL = 'https://script.google.com/macros/s/AKfycbzIEdph3F_aJ33J3Z7IgqhvfDcOP4tmMtKzw3ENT7aC5ptzfK1OcPdlYmlsbnPlkm3F/exec';

  let session = null;
  let cloud = { books: [], notes: [], goal: null };
  let filter = 'todos';
  let selectedBook = null;

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function safeImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  function showLoginError(message) {
    const target = $('#loginError');
    if (target) target.textContent = message || '';
  }

  // O Apps Script Content Service redireciona as respostas para outro domínio.
  // O formulário direcionado a um iframe evita depender de fetch/CORS.
  function api(action, data = {}) {
    return new Promise((resolve, reject) => {
      const requestId = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      const frameName = `vp_api_${requestId.replace(/[^a-zA-Z0-9_]/g, '')}`;
      const frame = document.createElement('iframe');
      frame.name = frameName;
      frame.title = 'Conexão segura com a biblioteca';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;border:0;';

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = API_URL;
      form.target = frameName;
      form.acceptCharset = 'UTF-8';
      form.style.display = 'none';

      const payload = document.createElement('input');
      payload.type = 'hidden';
      payload.name = 'payload';
      payload.value = JSON.stringify({ action, ...data });
      const id = document.createElement('input');
      id.type = 'hidden';
      id.name = 'requestId';
      id.value = requestId;
      form.append(payload, id);

      let finished = false;
      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        clearTimeout(timeout);
        form.remove();
        frame.remove();
      };
      const onMessage = event => {
        const message = event.data;
        if (!message || message.type !== 'vp-api-response' || message.requestId !== requestId) return;
        finished = true;
        cleanup();
        if (!message.data || !message.data.ok) {
          reject(new Error(message.data?.error || 'Não foi possível concluir a operação.'));
        } else {
          resolve(message.data);
        }
      };
      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('O banco não respondeu. Confira a implantação do Apps Script e tente novamente.'));
      }, 25000);

      window.addEventListener('message', onMessage);
      document.body.append(frame, form);
      try { form.submit(); }
      catch (_) {
        finished = true;
        cleanup();
        reject(new Error('Não foi possível enviar a solicitação ao banco.'));
      }
    });
  }

  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem('vp_auth_session', JSON.stringify(value));
    else localStorage.removeItem('vp_auth_session');
  }

  function renderProfile() {
    const name = session?.name || 'Leitor';
    const first = name.trim().charAt(0).toUpperCase() || 'L';
    $('#profileLabel').textContent = name;
    $('#welcomeName').textContent = name;
    $('#profileName').textContent = name;
    $('#profileAvatar').textContent = first;
    $('#sidebarName').textContent = name;
    $('#sidebarAvatar').textContent = first;
    $('#profileSwitch').textContent = '↪';
  }

  function openPage(id) {
    if (!$('#' + id)) return;
    $$('.page').forEach(page => page.classList.toggle('active', page.id === id));
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (id === 'inicio') renderHome();
    if (id === 'estante') renderBooks();
    if (id === 'anotacoes') renderNotes();
    if (id === 'calendario') renderGoal();
  }

  function enterApp() {
    welcome.classList.add('hidden');
    login.classList.add('hidden');
    app.classList.remove('hidden');
    renderProfile();
    renderHome();
    openPage('inicio');
  }

  async function loadCloudData() {
    const result = await api('getData', { token: session.token });
    const data = result.data || {};
    cloud = {
      books: Array.isArray(data.books) ? data.books : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      goal: data.goal || null
    };
  }

  function nomesLegadosDoPerfil(nome) {
    const original = String(nome || '').trim().toLowerCase();
    const nomes = [original];
    if (original.includes('fern')) nomes.push('fernando');
    if (original.includes('let')) nomes.push('letícia', 'leticia');
    return [...new Set(nomes.filter(Boolean))];
  }

  function lerListaLegada(chave) {
    try {
      const valor = JSON.parse(localStorage.getItem(chave) || '[]');
      return Array.isArray(valor) ? valor : [];
    } catch (_) { return []; }
  }

  function salvarListaLegada(chave, lista) {
    localStorage.setItem(chave, JSON.stringify(lista));
  }

  function novoIdLegado() {
    return (window.crypto && crypto.randomUUID)
      ? 'legado-' + crypto.randomUUID()
      : 'legado-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  async function migrarDadosLocais() {
    // Mantém a cópia local intacta. Os IDs são gravados nela antes do envio,
    // para que uma tentativa repetida atualize o mesmo registro sem duplicá-lo.
    const marcador = 'vp_cloud_migrated_v2_' + String(session.email || '').toLowerCase();
    if (localStorage.getItem(marcador) === '1') return { livros: 0, anotacoes: 0, pendencias: 0 };

    let livrosMigrados = 0, anotacoesMigradas = 0, pendencias = 0;
    const nomes = nomesLegadosDoPerfil(session.name);

    for (const nome of nomes) {
      const chaveLivros = 'vp_' + nome + '_books';
      const livros = lerListaLegada(chaveLivros);
      let livrosAlterados = false;
      for (const livro of livros) {
        if (!livro || !String(livro.titulo || '').trim()) continue;
        if (!livro.id) { livro.id = novoIdLegado(); livrosAlterados = true; }
        if (cloud.books.some(b => String(b.id) === String(livro.id))) continue;
        try {
          const result = await api('saveBook', { token: session.token, book: {
            id: livro.id, titulo: livro.titulo, autor: livro.autor || '', editora: livro.editora || '',
            genero: livro.genero || '', paginas: livro.paginas || '', isbn: livro.isbn || '',
            capa: livro.capa || '', status: livro.status || 'Quero ler'
          }});
          cloud.books.unshift(result.book);
          livrosMigrados++;
        } catch (err) { pendencias++; }
      }
      if (livrosAlterados) salvarListaLegada(chaveLivros, livros);

      const chaveNotas = 'vp_' + nome + '_notes';
      const notas = lerListaLegada(chaveNotas);
      let notasAlteradas = false;
      for (const nota of notas) {
        if (!nota || !String(nota.text || '').trim()) continue;
        if (!nota.id) { nota.id = novoIdLegado(); notasAlteradas = true; }
        if (cloud.notes.some(n => String(n.id) === String(nota.id))) continue;
        try {
          const result = await api('saveNote', { token: session.token, note: {
            id: nota.id, book: nota.book || 'Anotação livre', text: nota.text
          }});
          cloud.notes.unshift(result.note);
          anotacoesMigradas++;
        } catch (err) { pendencias++; }
      }
      if (notasAlteradas) salvarListaLegada(chaveNotas, notas);

      const chaveMeta = 'vp_' + nome + '_goal';
      const meta = (() => { try { return JSON.parse(localStorage.getItem(chaveMeta) || 'null'); } catch (_) { return null; } })();
      if (meta && (String(meta.goal || '').trim() || String(meta.book || '').trim())) {
        try {
          const result = await api('saveGoal', { token: session.token, goal: { goal: meta.goal || '', book: meta.book || '' } });
          cloud.goal = result.goal;
        } catch (err) { pendencias++; }
      }
    }

    if (pendencias === 0) localStorage.setItem(marcador, '1');
    return { livros: livrosMigrados, anotacoes: anotacoesMigradas, pendencias };
  }

  function mensagemAposMigracao(resultado) {
    if (!resultado) return;
    const total = resultado.livros + resultado.anotacoes;
    if (total > 0) {
      toast(resultado.pendencias
        ? `Importados ${resultado.livros} livro(s) e ${resultado.anotacoes} anotação(ões). Algumas informações precisam ser reenviadas.`
        : `Dados anteriores importados: ${resultado.livros} livro(s) e ${resultado.anotacoes} anotação(ões).`);
    } else if (resultado.pendencias > 0) {
      toast('A conta entrou, mas alguns dados locais ainda não foram sincronizados.');
    }
  }
  async function loginWith(email, senha) {
    const result = await api('login', { email, senha });
    if (!result.token || !result.user) throw new Error('O servidor não retornou uma sessão válida.');
    saveSession({ token: result.token, name: result.user.name, email: result.user.email });
    await loadCloudData();
    const migracao = await migrarDadosLocais();
    enterApp();
    if (migracao.livros || migracao.anotacoes || migracao.pendencias) mensagemAposMigracao(migracao);
    else toast('Bem-vindo(a), ' + session.name + '. Sua biblioteca está aberta.');
  }

  async function restoreSession() {
    try {
      const saved = JSON.parse(localStorage.getItem('vp_auth_session') || 'null');
      if (!saved?.token) return;
      session = saved;
      await loadCloudData();
      const migracao = await migrarDadosLocais();
      enterApp();
      mensagemAposMigracao(migracao);
    } catch (_) {
      saveSession(null);
      welcome.classList.remove('hidden');
      login.classList.add('hidden');
      showLoginError('Sua sessão expirou. Entre novamente com seu e-mail e senha.');
    }
  }

  function logout() {
    saveSession(null);
    cloud = { books: [], notes: [], goal: null };
    app.classList.add('hidden');
    login.classList.add('hidden');
    welcome.classList.remove('hidden');
    $('#loginForm').reset();
    showLoginError('');
    toast('Você saiu da sua biblioteca.');
  }

  function renderHome() {
    const books = Array.isArray(cloud.books) ? cloud.books : [];
    const normalizedStatus = book => String(book.status || '').trim().toLocaleLowerCase('pt-BR');
    const readingBooks = books.filter(book => normalizedStatus(book) === 'lendo');
    const reading = readingBooks[0] || null;
    const finished = books.filter(book => normalizedStatus(book) === 'lido').length;
    const wantRead = books.filter(book => normalizedStatus(book) === 'quero ler').length;

    $('#statBooks').textContent = String(books.length);
    $('#statReading').textContent = String(readingBooks.length);
    $('#statFinished').textContent = String(finished);
    $('#statWantRead').textContent = String(wantRead);

    const cover = $('#homeReadingCover');
    const title = $('#homeReadingTitle');
    const author = $('#homeReadingAuthor');
    const meta = $('#homeReadingMeta');
    const action = $('#homeReadingAction');
    const progressWrap = $('#homeProgressWrap');
    const progressBar = $('#homeProgressBar');
    const progressLabel = $('#homeProgressLabel');

    if (reading) {
      const image = safeImageUrl(reading.capa);
      cover.innerHTML = image
        ? `<img src="${escapeHtml(image)}" alt="Capa de ${escapeHtml(reading.titulo || 'livro')}">`
        : `<span class="fallback-cover-title">${escapeHtml(reading.titulo || 'V&amp;P')}</span>`;
      title.textContent = reading.titulo || 'Livro em leitura';
      author.textContent = reading.autor || 'Autor não informado';
      const pages = Number(reading.paginas || 0);
      meta.innerHTML = pages > 0
        ? `<span>◫ ${pages.toLocaleString('pt-BR')} páginas</span><span>• Em leitura</span>`
        : '<span>Um capítulo de cada vez.</span>';
      const progress = Number(reading.progresso ?? reading.PROGRESSO ?? 0);
      if (Number.isFinite(progress) && progress > 0) {
        const percent = Math.max(0, Math.min(100, progress));
        progressWrap.hidden = false;
        progressBar.style.width = `${percent}%`;
        progressLabel.textContent = `${Math.round(percent)}% concluído`;
      } else {
        progressWrap.hidden = true;
        progressBar.style.width = '0%';
      }
      action.textContent = 'Abrir ficha do livro →';
      action.dataset.openCurrentBook = 'true';
      action.dataset.page = '';
    } else {
      cover.innerHTML = '<span class="fallback-cover-title">V&amp;P</span>';
      title.textContent = books.length ? 'Escolha o próximo volume' : 'Ainda não há um livro sobre a mesa';
      author.textContent = books.length
        ? 'Sua biblioteca está pronta para a próxima jornada.'
        : 'Adicione um exemplar e prepare o lugar para sua próxima leitura.';
      meta.innerHTML = books.length
        ? `<span>${books.length} ${books.length === 1 ? 'volume' : 'volumes'} no acervo</span>`
        : '<span>Sua próxima história começa aqui.</span>';
      progressWrap.hidden = true;
      progressBar.style.width = '0%';
      action.textContent = books.length ? 'Percorrer minhas estantes →' : 'Adicionar primeiro exemplar →';
      action.dataset.openCurrentBook = '';
      action.dataset.page = books.length ? 'estante' : 'adicionar';
    }

    const recentTarget = $('#homeRecentBooks');
    if (recentTarget) {
      const recent = books.slice(0, 3);
      if (!recent.length) {
        recentTarget.innerHTML = '<div class="acquisition-empty"><span>✧</span><b>Sua próxima descoberta começa aqui.</b><button class="outline-button" data-page="adicionar">Adicionar primeiro livro →</button></div>';
      } else {
        recentTarget.innerHTML = recent.map((book, index) => {
          const originalIndex = books.indexOf(book);
          const image = safeImageUrl(book.capa);
          const coverHtml = image
            ? `<img src="${escapeHtml(image)}" alt="Capa de ${escapeHtml(book.titulo || 'livro')}" loading="lazy">`
            : `<span>${escapeHtml(book.titulo || 'V&amp;P')}</span>`;
          return `<button type="button" class="acquisition-book" data-home-book-index="${originalIndex}" aria-label="Abrir ${escapeHtml(book.titulo || 'livro')}">
            <span class="acquisition-cover">${coverHtml}</span>
            <span class="acquisition-title">${escapeHtml(book.titulo || 'Sem título')}</span>
            <span class="acquisition-author">${escapeHtml(book.autor || 'Autor não informado')}</span>
          </button>`;
        }).join('');
      }
    }
  }

  $('#enterLibrary').addEventListener('click', () => {
    welcome.classList.add('hidden');
    login.classList.remove('hidden');
    window.setTimeout(() => $('#email').focus(), 120);
  });

  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    showLoginError('');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Abrindo a biblioteca…';
    try {
      await loginWith($('#email').value.trim(), $('#senha').value);
    } catch (error) {
      showLoginError(error.message);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  $('#forgotPassword').addEventListener('click', () => {
    showLoginError('A recuperação de senha ainda não está habilitada. A senha precisa ser redefinida pelo painel seguro do banco.');
  });

  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-page]');
    if (nav) {
      event.preventDefault();
      if (nav.dataset.openCurrentBook === 'true') {
        const current = cloud.books.find(book => String(book.status || '').toLowerCase() === 'lendo');
        if (current) openBook(current); else openPage('estante');
        return;
      }
      openPage(nav.dataset.page);
    }
  });

  $('#profileSwitch').addEventListener('click', logout);
  $('#changeProfile').addEventListener('click', logout);
  $('#logout').addEventListener('click', logout);

  function renderBooks() {
    const term = ($('#buscarLivro').value || '').toLocaleLowerCase('pt-BR');
    const books = cloud.books.map((book, index) => ({ book, index }));
    const filtered = books.filter(({ book }) => {
      const searchable = `${book.titulo || ''} ${book.autor || ''}`.toLocaleLowerCase('pt-BR');
      const matchesTerm = searchable.includes(term);
      const normalized = String(book.status || '').toLocaleLowerCase('pt-BR');
      const matchesStatus = filter === 'todos'
        || (filter === 'lendo' && normalized === 'lendo')
        || (filter === 'lidos' && normalized === 'lido')
        || (filter === 'quero-ler' && normalized === 'quero ler');
      return matchesTerm && matchesStatus;
    });

    const target = $('#listaLivros');
    if (!filtered.length) {
      target.innerHTML = '<div class="empty-state"><span>▤</span><b>Sua estante ainda aguarda novos volumes</b><p>Adicione um livro para começar a construir sua biblioteca particular.</p><button class="primary compact" data-page="adicionar">Adicionar exemplar</button></div>';
      return;
    }

    const chunks = [];
    for (let i = 0; i < filtered.length; i += 5) chunks.push(filtered.slice(i, i + 5));
    target.innerHTML = chunks.map((chunk, shelfIndex) => `
      <div class="bookcase-shelf" aria-label="Prateleira ${shelfIndex + 1}">
        <div class="shelf-books">
          ${chunk.map(({ book, index }) => {
            const image = safeImageUrl(book.capa);
            const cover = image
              ? `<img src="${escapeHtml(image)}" alt="Capa de ${escapeHtml(book.titulo || 'livro')}">`
              : `<span class="jacket-title">${escapeHtml(book.titulo || 'Sem título')}</span><span class="jacket-author">${escapeHtml(book.autor || 'ACERVO V&amp;P')}</span>`;
            return `<button type="button" class="shelf-book" data-book-index="${index}" aria-label="Abrir ${escapeHtml(book.titulo || 'livro')}">
              <span class="book-jacket">${cover}</span>
              <span class="shelf-book-title">${escapeHtml(book.titulo || 'Sem título')}</span>
              <span class="shelf-book-author">${escapeHtml(book.autor || 'Autor não informado')}</span>
              <span class="shelf-book-status">${escapeHtml(book.status || 'No acervo')}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="shelf-plank" aria-hidden="true"></div>
      </div>`).join('');
  }

  function openBook(book) {
    if (!book) return;
    selectedBook = book;
    const image = safeImageUrl(book.capa);
    const cover = $('#detailCover');
    cover.innerHTML = image ? `<img src="${escapeHtml(image)}" alt="Capa de ${escapeHtml(book.titulo || 'livro')}">` : '<span>V&amp;P</span>';
    $('#detailTitle').textContent = book.titulo || 'Sem título';
    $('#detailAuthor').textContent = book.autor || 'Autor não informado';
    $('#detailGenre').textContent = book.genero || 'Gênero não informado';
    $('#detailStatus').textContent = String(book.status || 'No acervo').toLocaleUpperCase('pt-BR');
    const fields = [
      ['EDITORA', book.editora || 'Não informada'],
      ['PÁGINAS', book.paginas || 'Não informado'],
      ['ISBN', book.isbn || 'Não informado'],
      ['GÊNERO', book.genero || 'Não informado']
    ];
    $('#detailMeta').innerHTML = fields.map(([label, value]) => `<div class="meta-item"><small>${label}</small><b>${escapeHtml(value)}</b></div>`).join('');
    const dialog = $('#bookDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', 'open');
  }

  $('#homeRecentBooks').addEventListener('click', event => {
    const button = event.target.closest('[data-home-book-index]');
    if (!button) return;
    const index = Number(button.dataset.homeBookIndex);
    openBook(Number.isInteger(index) ? cloud.books[index] : null);
  });

  $('#listaLivros').addEventListener('click', event => {
    const button = event.target.closest('[data-book-index]');
    if (!button) return;
    const index = Number(button.dataset.bookIndex);
    openBook(Number.isInteger(index) ? cloud.books[index] : null);
  });

  $('#closeBookDialog').addEventListener('click', () => $('#bookDialog').close());
  $('#bookDialog').addEventListener('click', event => {
    if (event.target === $('#bookDialog')) $('#bookDialog').close();
  });
  $('#detailNoteButton').addEventListener('click', () => {
    if (selectedBook) $('#noteBook').value = selectedBook.titulo || '';
    $('#bookDialog').close();
    openPage('anotacoes');
    $('#noteText').focus();
  });

  $('#bookForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!session?.token) { toast('Entre na sua conta antes de guardar um livro.'); return; }
    const form = event.currentTarget;
    const values = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    const original = button.textContent;
    const book = {
      titulo: String(values.get('titulo') || '').trim(),
      autor: String(values.get('autor') || '').trim(),
      editora: String(values.get('editora') || '').trim(),
      genero: String(values.get('genero') || '').trim(),
      paginas: String(values.get('paginas') || '').trim(),
      isbn: String(values.get('isbn') || '').trim(),
      capa: String(values.get('capa') || '').trim(),
      status: String(values.get('status') || 'Quero ler')
    };
    button.disabled = true;
    button.textContent = 'Guardando exemplar…';
    try {
      const result = await api('saveBook', { token: session.token, book });
      cloud.books.unshift(result.book);
      form.reset();
      renderHome();
      toast('Exemplar guardado na sua biblioteca.');
      openPage('estante');
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  $('#buscarLivro').addEventListener('input', renderBooks);
  $$('.filter-chip').forEach(chip => chip.addEventListener('click', () => {
    $$('.filter-chip').forEach(item => item.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.filter;
    renderBooks();
  }));

  $('#saveNote').addEventListener('click', async () => {
    const text = $('#noteText').value.trim();
    if (!text) { toast('Escreva sua anotação primeiro.'); return; }
    if (!session?.token) { toast('Entre na sua conta antes de guardar uma anotação.'); return; }
    const button = $('#saveNote');
    button.disabled = true;
    try {
      const result = await api('saveNote', { token: session.token, note: { book: $('#noteBook').value.trim() || 'Anotação livre', text } });
      cloud.notes.unshift(result.note);
      $('#noteText').value = '';
      $('#noteBook').value = '';
      renderNotes();
      toast('Anotação guardada no seu caderno.');
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });

  function renderNotes() {
    const target = $('#notesList');
    target.innerHTML = cloud.notes.length
      ? cloud.notes.map(note => `<article class="note-item"><b>${escapeHtml(note.book || 'Anotação livre')}</b><small> · ${escapeHtml(note.date || 'Registro pessoal')}</small><p>${escapeHtml(note.text || '')}</p></article>`).join('')
      : '<p class="muted">Seu caderno ainda está em branco. A primeira anotação pode começar aqui.</p>';
  }

  async function saveGoal() {
    const goal = $('#readingGoal').value;
    const book = $('#goalBook').value.trim();
    if (!goal && !book) { toast('Informe uma meta ou um livro para seu planejamento.'); return; }
    if (!session?.token) { toast('Entre na sua conta antes de guardar o planejamento.'); return; }
    const button = $('#saveGoal');
    button.disabled = true;
    try {
      const result = await api('saveGoal', { token: session.token, goal: { goal, book } });
      cloud.goal = result.goal;
      $('#goalSaved').textContent = 'Seu planejamento foi guardado na biblioteca.';
      toast('Planejamento guardado.');
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  }

  function renderGoal() {
    if (!cloud.goal) return;
    $('#readingGoal').value = cloud.goal.goal || '';
    $('#goalBook').value = cloud.goal.book || '';
    $('#goalSaved').textContent = 'Planejamento carregado da sua conta.';
  }
  $('#saveGoal').addEventListener('click', saveGoal);

  $$('[data-collection]').forEach(button => button.addEventListener('click', () => {
    $('#buscarLivro').value = '';
    filter = 'todos';
    $$('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'todos'));
    openPage('estante');
    toast('Sua coleção “' + button.dataset.collection + '” está pronta para explorar.');
  }));

  $$('[data-studio]').forEach(button => button.addEventListener('click', () => {
    toast('O recurso “' + button.dataset.studio + '” será desenvolvido na próxima etapa do ateliê.');
  }));

  restoreSession();
});
