const STORAGE_KEY = 'rsContas_sqlite_db';
const DEFAULT_DB_NAME = 'rsContas.db';

fetch('/api/version').then(response => response.ok ? response.json() : null).then(info => {
  if (info?.version && $('appVersion')) $('appVersion').textContent = `Versão ${info.version}`;
}).catch(() => {});

let contas = [];
let categorias = {
  centros: [],
  tipos: [],
  subtipos: [],
  pagamentos: []
};

async function fetchJson(url, options = {}) {
  const token = localStorage.getItem('rs_token');
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const response = await fetch(url, {
    headers,
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Erro ao comunicar com o servidor');
  }

  return response.json();
}

function setAuthToken(token, user) {
  if (token) {
    localStorage.setItem('rs_token', token);
    localStorage.setItem('rs_user', JSON.stringify(user || {}));
  } else {
    localStorage.removeItem('rs_token');
    localStorage.removeItem('rs_user');
  }
}

function getCurrentUser(){
  try { return JSON.parse(localStorage.getItem('rs_user') || 'null'); } catch(e){ return null; }
}

function showAuthOverlay(tab='login'){
  const overlay = $('authOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  $('authTitle').textContent = tab === 'login' ? 'Entrar' : (tab === 'register' ? 'Cadastrar' : 'Alterar senha');
  $('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  $('registerForm').style.display = tab === 'register' ? 'block' : 'none';
  $('changePwdForm').style.display = tab === 'change' ? 'block' : 'none';
  const pf = $('profileForm'); if (pf) pf.style.display = tab === 'profile' ? 'block' : 'none';
}

function hideAuthOverlay(){
  const overlay = $('authOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  // clear auth inputs
  const le = $('loginEmail'); if (le) le.value = '';
  const lp = $('loginPassword'); if (lp) lp.value = '';
  const re = $('regEmail'); if (re) re.value = '';
  const rp = $('regPassword'); if (rp) rp.value = '';
  const rn = $('regNome'); if (rn) rn.value = '';
  const rc = $('regCelular'); if (rc) rc.value = '';
  const np = $('newPassword'); if (np) np.value = '';
  const pn = $('profileNome'); if (pn) pn.value = '';
  const pe = $('profileEmail'); if (pe) pe.value = '';
  const pc = $('profileCelular'); if (pc) pc.value = '';
}

async function doLogout(){
  try { await fetchJson('/api/logout', { method: 'POST' }); } catch(e){}
  setAuthToken(null);
  hideApp();
  showAuthOverlay('login');
}


function showApp(){
  const app = $('appContainer');
  if (app) app.style.display = '';
  const loginBtn = $('loginBtn'); if (loginBtn) loginBtn.style.display = 'none';
  const logoutBtn = $('logoutBtn'); if (logoutBtn) logoutBtn.style.display = '';
  const userManageBtn = $('userManageBtn'); if (userManageBtn) userManageBtn.style.display = '';
  const user = getCurrentUser();
  const userDisplay = $('userDisplay');
  if (userDisplay) userDisplay.style.display = user ? '' : 'none';
  if (userDisplay && user) userDisplay.textContent = user.nome || user.email || '';
  if (userManageBtn && user) userManageBtn.textContent = user.nome || user.email || 'Usuário';
}

function hideApp(){
  const app = $('appContainer');
  if (app) app.style.display = 'none';
  const loginBtn = $('loginBtn'); if (loginBtn) loginBtn.style.display = '';
  const logoutBtn = $('logoutBtn'); if (logoutBtn) logoutBtn.style.display = 'none';
  const userManageBtn = $('userManageBtn'); if (userManageBtn) { userManageBtn.style.display = 'none'; userManageBtn.textContent = 'Usuário'; }
  const userDisplay = $('userDisplay'); if (userDisplay) { userDisplay.style.display = 'none'; userDisplay.textContent = ''; }
}

async function carregarCategoriasApi() {
  try {
    const dados = await fetchJson('/api/categorias');
    categorias = {
      centros: Array.isArray(dados.centros) ? dados.centros : [],
      tipos: Array.isArray(dados.tipos) ? dados.tipos : [],
      subtipos: Array.isArray(dados.subtipos) ? dados.subtipos : [],
      pagamentos: Array.isArray(dados.pagamentos) ? dados.pagamentos : []
    };
    return categorias;
  } catch (error) {
    console.warn('Erro ao carregar categorias do backend:', error);
    categorias = { centros: [], tipos: [], subtipos: [], pagamentos: [] };
    return categorias;
  }
}

async function carregarContasApi() {
  try {
    contas = await fetchJson('/api/contas');
    return contas;
  } catch (error) {
    console.warn('Erro ao carregar contas do backend:', error);
    contas = [];
    return contas;
  }
}

async function salvarContaApi(conta) {
  try {
    const result = await fetchJson('/api/contas', {
      method: 'POST',
      body: JSON.stringify(conta)
    });
    contas = Array.isArray(result) ? result : contas;
    return true;
  } catch (error) {
    console.warn('Erro ao salvar conta:', error);
    return false;
  }
}

async function excluirContaApi(id) {
  try {
    const result = await fetchJson(`/api/contas/${id}`, { method: 'DELETE' });
    contas = Array.isArray(result) ? result : contas;
    return true;
  } catch (error) {
    console.warn('Erro ao excluir conta:', error);
    return false;
  }
}

async function adicionarCategoriaApi(tipo, valor) {
  const texto = String(valor || '').trim();
  if (!texto) return false;

  try {
    const result = await fetchJson('/api/categorias', {
      method: 'POST',
      body: JSON.stringify({ grupo: tipo, valor: texto })
    });

    categorias = {
      centros: Array.isArray(result.centros) ? result.centros : [],
      tipos: Array.isArray(result.tipos) ? result.tipos : [],
      subtipos: Array.isArray(result.subtipos) ? result.subtipos : []
    };
    return true;
  } catch (error) {
    console.warn('Erro ao adicionar categoria:', error);
    return false;
  }
}

async function removerCategoriaApi(tipo, valor) {
  const texto = String(valor || '').trim();
  if (!texto) return false;

  try {
    const result = await fetchJson('/api/categorias', {
      method: 'DELETE',
      body: JSON.stringify({ grupo: tipo, valor: texto })
    });

    categorias = {
      centros: Array.isArray(result.centros) ? result.centros : [],
      tipos: Array.isArray(result.tipos) ? result.tipos : [],
      subtipos: Array.isArray(result.subtipos) ? result.subtipos : []
    };
    return true;
  } catch (error) {
    console.warn('Erro ao remover categoria:', error);
    return false;
  }
}

async function salvar(){
  return true;
}

async function salvarCategorias(){
  return true;
}

async function carregar(){
  return contas;
}

async function carregarCategorias(){
  return categorias;
}

async function inicializarDados(){
  await carregarCategoriasApi();
  await carregarContasApi();
  preencherOpcoesCategorias();
  renderizarCategorias();
  atualizar();
}

const $ = id => document.getElementById(id);
const form = $('accountForm');

const bindIfExists = (id, handler) => {
  const el = $(id);
  if (el) el.addEventListener('click', handler);
};


function atualizarSelect(select, valores, valorPadrao='') {
  const atual = select.value;
  select.innerHTML = '';

  if (!valores.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhum item cadastrado';
    select.appendChild(opt);
    select.value = '';
    return;
  }

  valores.forEach(valor => {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = valor;
    select.appendChild(opt);
  });

  const valorValido = valores.includes(atual) ? atual : (valorPadrao && valores.includes(valorPadrao) ? valorPadrao : valores[0]);
  select.value = valorValido || '';
}

function preencherOpcoesCategorias(){
  atualizarSelect($('centroCusto'), categorias.centros, '');
  atualizarSelect($('tipoDespesa'), categorias.tipos, '');
  atualizarSelect($('subtipoDespesa'), categorias.subtipos, '');
  const pagamentoSel = $('pagamento'); if (pagamentoSel) atualizarSelect(pagamentoSel, categorias.pagamentos, '');
}

function renderizarCategorias(){
  renderizarLista('centroList', categorias.centros, 'centros');
  renderizarLista('tipoList', categorias.tipos, 'tipos');
  renderizarLista('subtipoList', categorias.subtipos, 'subtipos');
  renderizarLista('pagamentoList', categorias.pagamentos, 'pagamentos');
}

function renderizarLista(containerId, itens, tipo){
  const lista = $(containerId);
  if (!lista) return;

  if (!itens.length) {
    lista.innerHTML = '<span class="empty-tag">Nenhum item cadastrado.</span>';
    return;
  }

  lista.innerHTML = itens.map(item => `
    <span class="tag-item">
      <span>${esc(item)}</span>
      <button type="button" class="tag-remove" data-kind="${tipo}" data-value="${String(item).replace(/"/g, '&quot;')}">x</button>
    </span>
  `).join('');
}

async function adicionarCategoria(tipo, valor){
  const texto = String(valor || '').trim();
  if (!texto) return;

  const ok = await adicionarCategoriaApi(tipo, texto);
  if (!ok) return;

  await carregarCategoriasApi();
  renderizarCategorias();
  preencherOpcoesCategorias();
}

async function removerCategoria(tipo, valor){
  const texto = String(valor || '').trim();
  if (!texto) return;

  const ok = await removerCategoriaApi(tipo, texto);
  if (!ok) return;

  await carregarCategoriasApi();
  renderizarCategorias();
  preencherOpcoesCategorias();
}

function numero(valor){
  if (valor === null || valor === undefined || valor === '') return 0;
  const texto = String(valor).replace('.', '').replace(',', '.').trim();
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

function dinheiro(valor){
  const numeroFormatado = Number(valor || 0);
  return numeroFormatado.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function dataBR(iso){
  if (!iso) return '';
  const data = String(iso).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

function mesAnoBR(data){
  const iso = dataISO(data);
  const partes = iso.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!partes) return '';
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[Number(partes[2]) - 1]} ${partes[1]}`;
}

function formataDataTexto(data){
  const iso = dataISO(data || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return '';
  }
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function dataISO(data){
  if (!data) return '';
  const valor = String(data).trim();

  if (valor.includes('/')) {
    const partes = valor.split('/');
    if (partes.length === 3) {
      const [d, m, y] = partes.map(p => p.trim());
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  if (valor.includes('-')) {
    const partes = valor.split('-');
    if (partes.length === 3) {
      const [y, m, d] = partes.map(p => p.trim());
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return valor;
  }

  return valor;
}

function formatarParcelaDigitada(valor){
  const numeros = String(valor || '').replace(/\D/g, '').slice(0, 4);
  return numeros.length > 2 ? `${numeros.slice(0, 2)}/${numeros.slice(2)}` : numeros;
}

function normalizarParcelaSalva(valor){
  const partes = String(valor || '').match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/);
  if (partes) return `${partes[1].padStart(2, '0')}/${partes[2].padStart(2, '0')}`;
  return formatarParcelaDigitada(valor);
}

function sincronizarPeriodoComData(data){
  const iso = dataISO(data);
  const partes = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) return;

  const mesAnoSelect = $('lancamentoMesAno');
  if (!mesAnoSelect) return;

  const mesAno = `${partes[1]}-${partes[2]}`;
  if (![...mesAnoSelect.options].some(opcao => opcao.value === mesAno)) {
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const opcao = document.createElement('option');
    opcao.value = mesAno;
    opcao.textContent = `${nomesMeses[Number(partes[2]) - 1]} ${partes[1]}`;
    mesAnoSelect.appendChild(opcao);
  }
  mesAnoSelect.value = mesAno;
}

function sincronizarDataComPeriodo(){
  const mesAno = $('lancamentoMesAno')?.value || '';
  const periodo = mesAno.match(/^(\d{4})-(\d{2})$/);
  if (!periodo) return;
  const ano = Number(periodo[1]);
  const mes = Number(periodo[2]);

  const isoAtual = dataISO($('data').value || $('dataNative').value);
  const partes = isoAtual.match(/^\d{4}-(\d{2})-(\d{2})$/);
  const diaAtual = partes ? Number(partes[2]) : 1;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dia = String(Math.min(diaAtual, ultimoDia)).padStart(2, '0');
  const iso = `${ano}-${String(mes).padStart(2, '0')}-${dia}`;
  $('data').value = formataDataTexto(iso);
  $('dataNative').value = iso;
}

function abrirForm(conta = null){
  $('formPanel').classList.remove('hidden');
  $('formTitle').textContent = conta ? 'Editar conta' : 'Nova conta';
  $('accountId').value = conta?.id || '';
  $('titulo').value = conta?.titulo || '';
  $('tipoConta').value = conta?.tipo || 'P';
  preencherOpcoesCategorias();
  $('centroCusto').value = conta?.centro || categorias.centros[0] || '';
  $('tipoDespesa').value = conta?.tipoDespesa || categorias.tipos[0] || '';
  $('subtipoDespesa').value = conta?.subtipo || categorias.subtipos[0] || '';
  const pagamentoSel = $('pagamento'); if (pagamentoSel) pagamentoSel.value = conta?.pagamento || categorias.pagamentos[0] || '';
  $('parcela').value = normalizarParcelaSalva(conta?.parcela || '');
  const gerarParcelasBtn = $('generateInstallmentsBtn');
  if (gerarParcelasBtn) gerarParcelasBtn.classList.toggle('hidden', !conta || !temParcelasFuturas(conta));
  $('valor').value = conta ? String(conta.valor).replace('.', ',') : '';
  const dataAtual = conta?.data || new Date().toISOString().slice(0, 10);
  $('data').value = formataDataTexto(dataAtual);
  $('dataNative').value = dataAtual;
  const mesAnoSelect = $('lancamentoMesAno');
  if (mesAnoSelect) {
    const anoAtual = new Date().getFullYear();
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    mesAnoSelect.innerHTML = Array.from({ length: 21 }, (_, indice) => anoAtual - 10 + indice)
      .flatMap(ano => nomesMeses.map((nomeMes, indiceMes) => {
        const mes = String(indiceMes + 1).padStart(2, '0');
        return `<option value="${ano}-${mes}">${nomeMes} ${ano}</option>`;
      })).join('');
    sincronizarPeriodoComData(dataAtual);
  }
  $('pago').checked = !!conta?.pago;
  $('obs').value = conta?.obs || '';
  $('titulo').focus();
  $('formPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function mostrarTela(id){
  document.querySelectorAll('.screen-panel').forEach(p => {
    p.classList.toggle('hidden', p.id !== id);
  });
}

function mostrarCadastros(){
  mostrarTela('managementPanel');
}

function voltarDashboard(){
  mostrarTela('dashboardScreen');
  form.reset();
  $('accountId').value = '';
}

function fecharForm(){
  form.reset();
  $('accountId').value = '';
  voltarDashboard();
}

function listPanelScroll(){
  const listPanel = $('listPanel');
  if (listPanel && !listPanel.classList.contains('hidden')) {
    listPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

if (form) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('accountId').value || crypto.randomUUID();
    const conta = {
      id,
      titulo: $('titulo').value.trim(),
      tipo: $('tipoConta').value,
      centro: $('centroCusto').value,
      tipoDespesa: $('tipoDespesa').value,
      subtipo: $('subtipoDespesa').value,
      pagamento: $('pagamento') ? $('pagamento').value : '',
      parcela: $('parcela').value.trim(),
      valor: numero($('valor').value),
      data: dataISO($('data').value || $('dataNative').value),
      pago: $('pago').checked,
      obs: $('obs').value.trim(),
      atualizadoEm: new Date().toISOString()
    };

    const indice = contas.findIndex(x => x.id === id);
    if (indice >= 0) contas[indice] = conta; else contas.push(conta);

    const ok = await salvarContaApi(conta);
    if (ok) {
      await carregarContasApi();
    }

    atualizar();
    fecharForm();
  });
}

function atualizar(){
  const busca = $('search').value.toLowerCase().trim();
  const tipo = $('filterType').value;
  const filtroMesAno = $('filterMesAno');
  const mesAnoSelecionado = filtroMesAno?.value || '';
  const periodos = [...new Set(contas.map(c => {
    const data = dataISO(c.data);
    return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.slice(0, 7) : '';
  }).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  if (filtroMesAno) {
    const nomesMeses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    filtroMesAno.innerHTML = '<option value="">Todos os meses</option>' + periodos.map(periodo => {
      const [ano, mes] = periodo.split('-');
      const nomeMes = nomesMeses[Number(mes) - 1];
      return `<option value="${periodo}">${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} ${ano}</option>`;
    }).join('');
    filtroMesAno.value = periodos.includes(mesAnoSelecionado) ? mesAnoSelecionado : '';
  }
  const status = $('filterStatus').value;
  const lista = contas.filter(c => {
    const data = dataISO(c.data);
    const okBusca = !busca || `${c.titulo} ${c.centro} ${c.tipoDespesa} ${c.subtipo}`.toLowerCase().includes(busca);
    const okTipo = !tipo || c.tipo === tipo;
    const okMesAno = !mesAnoSelecionado || data.startsWith(`${mesAnoSelecionado}-`);
    const okStatus = !status || (status === 'pago' ? c.pago : !c.pago);
    return okBusca && okTipo && okMesAno && okStatus;
  }).sort((a,b)=>String(a.data).localeCompare(String(b.data)));

  $('accountTable').innerHTML = renderLaunchCardsHTML(lista);

  $('emptyState').style.display = lista.length ? 'none' : 'block';
  $('countText').textContent = `${contas.length} ${contas.length === 1 ? 'conta cadastrada' : 'contas cadastradas'}`;

  const pagarPago = contas.filter(c => c.tipo === 'P' && c.pago).reduce((s,c) => s + Number(c.valor || 0), 0);
  const pagarPendente = contas.filter(c => c.tipo === 'P' && !c.pago).reduce((s,c) => s + Number(c.valor || 0), 0);
  const pagarTotal = pagarPago + pagarPendente;

  const receberPago = contas.filter(c => c.tipo === 'R' && c.pago).reduce((s,c) => s + Number(c.valor || 0), 0);
  const receberPendente = contas.filter(c => c.tipo === 'R' && !c.pago).reduce((s,c) => s + Number(c.valor || 0), 0);
  const receberTotal = receberPago + receberPendente;

  $('totalPagar').textContent = dinheiro(pagarTotal);
  $('totalPagoPagar').textContent = dinheiro(pagarPago);
  $('totalPendentePagar').textContent = dinheiro(pagarPendente);

  $('totalReceber').textContent = dinheiro(receberTotal);
  $('totalPagoReceber').textContent = dinheiro(receberPago);
  $('totalPendenteReceber').textContent = dinheiro(receberPendente);
}

function editar(id){ const conta = contas.find(c => c.id === id); if (conta) abrirForm(conta); }
window.editar = editar;

async function excluir(id){
  const conta = contas.find(c => c.id === id);
  if (!conta) return;

  contas = contas.filter(c => c.id !== id);
  const ok = await excluirContaApi(id);
  if (ok) {
    await carregarContasApi();
  }
  atualizar();
}
window.excluir = excluir;

function temParcelasFuturas(conta){
  const partes = String(conta.parcela || '').match(/^(\d{2})\/(\d{2})$/);
  return !!partes && Number(partes[1]) >= 1 && Number(partes[1]) <= Number(partes[2]);
}

async function gerarParcelas(){
  const id = $('accountId').value;
  const conta = contas.find(item => item.id === id);
  if (!conta) return;
  const partes = String(conta.parcela || '').match(/^(\d{2})\/(\d{2})$/);
  if (!partes) return;
  const atual = Number(partes[1]);
  const totalAtual = Number(partes[2]);
  const maximo = 99 - atual;
  const sugestao = Math.max(1, totalAtual - atual);
  const resposta = prompt(`Quantas novas parcelas deseja gerar para ${conta.titulo || 'este lançamento'}? Máximo: ${maximo}.`, String(sugestao));
  if (resposta === null) return;
  const quantidade = Number(resposta.trim());
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > maximo) {
    alert(`Informe um número inteiro entre 1 e ${maximo}.`);
    return;
  }

  try {
    const button = $('generateInstallmentsBtn');
    button.disabled = true;
    const resultado = await fetchJson(`/api/contas/${encodeURIComponent(id)}/gerar-parcelas`, {
      method: 'POST',
      body: JSON.stringify({ quantidade })
    });
    await carregarContasApi();
    const contaAtualizada = contas.find(item => item.id === id);
    if (contaAtualizada) $('parcela').value = normalizarParcelaSalva(contaAtualizada.parcela);
    atualizar();
    alert(`Parcelas geradas: ${resultado.criadas}. Já existentes: ${resultado.existentes}. Total da sequência: ${resultado.total}.`);
  } catch (error) {
    alert(error.message || 'Não foi possível gerar as parcelas.');
  } finally {
    const button = $('generateInstallmentsBtn');
    if (button) button.disabled = false;
  }
}
window.gerarParcelas = gerarParcelas;

function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }

function renderLaunchCardsHTML(lista){
  return (lista || []).map(c => `
    <article class="launch-card" data-id="${c.id}">
      <div class="launch-header">
        <div class="launch-title">
          <span class="launch-period">${esc(mesAnoBR(c.data))}</span>
          <span class="launch-title-text">${esc(c.titulo || 'Sem título')}</span>
        </div>
        <div class="launch-badges">
          <span class="badge ${c.tipo === 'P' ? 'badge-pagar' : 'badge-receber'}">${c.tipo === 'P' ? 'A pagar' : 'A receber'}</span>
        </div>
      </div>

      <div class="launch-meta">
        <div class="meta-row">
          <div class="meta-item">
            <span class="meta-label">Centro</span>
            <span class="meta-value">${esc(c.centro)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Categoria</span>
            <span class="meta-value">${esc(c.tipoDespesa)} / ${esc(c.subtipo)}</span>
          </div>
        </div>

        <div class="meta-row meta-row-secondary">
          <div class="meta-item">
            <span class="meta-label">Data</span>
            <span class="meta-value">${dataBR(c.data)}</span>
          </div>
          <div class="meta-item meta-item-installment">
            <span class="meta-label">Parcela</span>
            <span class="meta-value">${esc(c.parcela || '—')}</span>
          </div>
          <div class="meta-item meta-item-value">
            <span class="meta-label">Valor</span>
            <span class="launch-value">${dinheiro(c.valor)}</span>
          </div>
        </div>

        <div class="payment-actions-row">
          <div class="meta-item">
            ${c.pagamento ? `<span class="meta-label">Pagamento</span><span class="meta-value">${esc(c.pagamento)}</span>` : ''}
          </div>
          <div class="actions">
            <button class="edit" onclick="editar('${c.id}')">Editar</button>
            <button class="delete" onclick="excluir('${c.id}')">Excluir</button>
          </div>
        </div>
        ${c.obs ? `<div class="meta-item"><span class="meta-label">Obs.</span><span class="meta-value">${esc(c.obs)}</span></div>` : ''}
      </div>
      <div class="launch-status">
        <span class="badge ${c.pago ? 'badge-pago' : 'badge-pendente'}">${c.pago ? 'Pago' : 'Pendente'}</span>
      </div>
    </article>`).join('');
}

const mostrarLista = () => {
  mostrarTela('listPanel');
  atualizar();
  listPanelScroll();
};

const mostrarCadastro = () => {
  mostrarTela('formPanel');
  abrirForm();
};

bindIfExists('newAccountBtn', mostrarCadastro);
bindIfExists('managementBtn', mostrarCadastros);
bindIfExists('viewLaunchesBtn', mostrarLista);
bindIfExists('exportExcelBtn', async () => {
  const button = $('exportExcelBtn');
  button.disabled = true;
  try {
    const token = localStorage.getItem('rs_token');
    const response = await fetch('/api/exportar-excel', {
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    });
    if (!response.ok) throw new Error('Não foi possível exportar os dados. Faça login novamente e tente outra vez.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rscontas_exportacao.xls';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message || 'Erro ao exportar os dados.');
  } finally {
    button.disabled = false;
  }
});
bindIfExists('importExcelBtn', () => $('importExcelFile')?.click());
const importExcelFile = $('importExcelFile');
if (importExcelFile) importExcelFile.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const button = $('importExcelBtn');
  const status = $('importExcelStatus');
  button.disabled = true;
  if (status) {
    status.hidden = false;
    status.className = 'import-excel-status is-loading';
    status.textContent = 'Aguarde, a importação está em andamento...';
    await new Promise(requestAnimationFrame);
  }
  try {
    const token = localStorage.getItem('rs_token');
    const formData = new FormData();
    formData.append('arquivo', file);
    const response = await fetch('/api/importar-excel', {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: formData
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível importar a planilha.');
    await inicializarDados();
    const ignorados = result.ignorados || [];
    const detalhesIgnorados = ignorados.slice(0, 8)
      .map(item => `Linha ${item.linha}: ${item.motivo}`).join('\n');
    const complemento = ignorados.length
      ? `\nIgnorados: ${ignorados.length}${detalhesIgnorados ? `\n${detalhesIgnorados}` : ''}${ignorados.length > 8 ? '\n...' : ''}`
      : '';
    const mensagem = `Importação finalizada: ${result.lancamentos} lançamentos e ${result.cadastros} cadastros processados.${complemento}`;
    if (status) {
      status.className = 'import-excel-status is-success';
      status.textContent = mensagem;
    } else {
      alert(mensagem);
    }
  } catch (error) {
    const mensagem = error.message || 'Erro ao importar a planilha.';
    if (status) {
      status.className = 'import-excel-status is-error';
      status.textContent = mensagem;
    } else {
      alert(mensagem);
    }
  } finally {
    button.disabled = false;
    event.target.value = '';
  }
});
bindIfExists('closeFormBtn', fecharForm);
bindIfExists('cancelBtn', fecharForm);
bindIfExists('generateInstallmentsBtn', gerarParcelas);

const searchInput = $('search');
const filterType = $('filterType');
const filterMesAno = $('filterMesAno');
const filterStatus = $('filterStatus');
if (searchInput) searchInput.addEventListener('input', atualizar);
if (filterType) filterType.addEventListener('change', atualizar);
if (filterMesAno) filterMesAno.addEventListener('change', atualizar);
if (filterStatus) filterStatus.addEventListener('change', atualizar);

// Grouping feature
let currentGroupView = false;
let currentGroupKey = null;

function buildGroups(){
  const groups = new Map();
  contas.forEach(c => {
    const tipo = c.tipo || '';
    const pagamento = String(c.pagamento || '').trim();
    const centro = c.centro || '';
    const tipoDesp = c.tipoDespesa || '';
    const subtipo = c.subtipo || '';
    const key = JSON.stringify([tipo, pagamento, centro, tipoDesp, subtipo]);
    if (!groups.has(key)) groups.set(key, { key, tipo, pagamento, centro, tipoDesp, subtipo, total: 0 });
    groups.get(key).total += Number(c.valor || 0);
  });
  return [...groups.values()].sort((a, b) =>
    [a.tipo, a.pagamento, a.centro, a.tipoDesp, a.subtipo]
      .join(' ').localeCompare([b.tipo, b.pagamento, b.centro, b.tipoDesp, b.subtipo].join(' '), 'pt-BR')
  );
}

function showGroups(){
  currentGroupView = true;
  const groups = buildGroups();
  if (!groups.length) {
    $('accountTable').innerHTML = '<div class="empty">Nenhum lançamento para agrupar.</div>';
    return;
  }
  const html = groups.map(g => `
    <article class="launch-card group-card" data-group="${esc(g.key)}" style="cursor:pointer;">
      <div class="launch-header">
        <div class="launch-title">${esc(g.tipoDesp || 'Sem tipo')} / ${esc(g.subtipo || 'Sem subtipo')}</div>
        <span class="badge ${g.tipo === 'P' ? 'badge-pagar' : 'badge-receber'}">${g.tipo === 'P' ? 'A pagar' : 'A receber'}</span>
      </div>
      <div class="launch-meta">
        <div class="meta-row">
          <div class="meta-item"><span class="meta-label">Pagamento</span><span class="meta-value">${esc(g.pagamento || 'Sem pagamento')}</span></div>
          <div class="meta-item"><span class="meta-label">Tipo de despesa</span><span class="meta-value">${esc(g.tipoDesp || 'Sem tipo')}</span></div>
        </div>
        <div class="meta-row">
          <div class="meta-item"><span class="meta-label">Centro de custo</span><span class="meta-value">${esc(g.centro || 'Sem centro de custo')}</span></div>
          <div class="meta-item"><span class="meta-label">Subtipo</span><span class="meta-value">${esc(g.subtipo || 'Sem subtipo')}</span></div>
        </div>
        <div style="margin-top:8px"><strong>Total: ${dinheiro(g.total)}</strong></div>
      </div>
    </article>
  `).join('');
  // add a back button
  const backHtml = `<div style="margin-bottom:10px;"><button id="backGroupsBtn" class="btn secondary">Voltar</button></div>`;
  $('accountTable').innerHTML = backHtml + html;
  // attach handlers
  document.querySelectorAll('.group-card').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.group; showGroupDetail(k);
  }));
  const backBtn = $('backGroupsBtn'); if (backBtn) backBtn.addEventListener('click', () => { currentGroupView = false; atualizar(); });
}

function showTotalsByType(){
  const entries = ['P', 'R'].map(tipo => ({
    value: tipo,
    label: tipo === 'P' ? 'A pagar' : 'A receber',
    total: contas.filter(c => c.tipo === tipo).reduce((soma, c) => soma + Number(c.valor || 0), 0)
  }));
  renderGroup2Totals('Totais por tipo', entries, tipo => showTotalsByPayment(tipo));
}

function showTotalsByPayment(tipo){
  const pagamentos = new Map();
  contas.filter(c => c.tipo === tipo).forEach(c => {
    const pagamento = String(c.pagamento || '').trim();
    pagamentos.set(pagamento, (pagamentos.get(pagamento) || 0) + Number(c.valor || 0));
  });

  const entries = [...pagamentos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([pagamento, total]) => ({ value: pagamento, label: pagamento || 'Sem pagamento', total }));
  const rotuloTipo = tipo === 'P' ? 'A pagar' : 'A receber';
  renderGroup2Totals(`${rotuloTipo} / pagamento`, entries,
    pagamento => showTotalsByCenter(tipo, pagamento), showTotalsByType);
}

function showTotalsByCenter(tipo, pagamento){
  const centros = new Map();
  contas.filter(c => c.tipo === tipo && String(c.pagamento || '').trim() === pagamento).forEach(c => {
    const centro = String(c.centro || '').trim();
    centros.set(centro, (centros.get(centro) || 0) + Number(c.valor || 0));
  });
  const entries = [...centros.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([centro, total]) => ({ value: centro, label: centro || 'Sem centro de custo', total }));
  renderGroup2Totals('Centro de custo', entries,
    centro => showTotalsByExpenseType(tipo, pagamento, centro),
    () => showTotalsByPayment(tipo));
}

function showTotalsByExpenseType(tipo, pagamento, centro){
  const tiposDespesa = new Map();
  contas.filter(c => c.tipo === tipo && String(c.pagamento || '').trim() === pagamento && String(c.centro || '').trim() === centro).forEach(c => {
    const tipoDespesa = String(c.tipoDespesa || '').trim();
    tiposDespesa.set(tipoDespesa, (tiposDespesa.get(tipoDespesa) || 0) + Number(c.valor || 0));
  });
  const entries = [...tiposDespesa.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([tipoDespesa, total]) => ({ value: tipoDespesa, label: tipoDespesa || 'Sem tipo de despesa', total }));
  renderGroup2Totals('Tipo de despesa', entries,
    tipoDespesa => showTotalsBySubtype(tipo, pagamento, centro, tipoDespesa),
    () => showTotalsByCenter(tipo, pagamento));
}

function showTotalsBySubtype(tipo, pagamento, centro, tipoDespesa){
  const subtipos = new Map();
  contas.filter(c => c.tipo === tipo && String(c.pagamento || '').trim() === pagamento && String(c.centro || '').trim() === centro && String(c.tipoDespesa || '').trim() === tipoDespesa).forEach(c => {
    const subtipo = String(c.subtipo || '').trim();
    subtipos.set(subtipo, (subtipos.get(subtipo) || 0) + Number(c.valor || 0));
  });
  const entries = [...subtipos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([subtipo, total]) => ({ value: subtipo, label: subtipo || 'Sem subtipo', total }));
  renderGroup2Totals('Subtipo de despesa', entries,
    subtipo => showGroup2Documents(tipo, pagamento, centro, tipoDespesa, subtipo),
    () => showTotalsByExpenseType(tipo, pagamento, centro));
}

function renderGroup2Totals(titulo, entries, onSelect, onBack = showTotalsByType){
  const linhas = entries.length ? entries.map((entry, index) => `
    <button type="button" class="type-line" data-group2-entry="${index}" style="width:100%;border:0;background:transparent;text-align:left;cursor:pointer;">
      <span>${esc(entry.label)}</span><strong>${dinheiro(entry.total)}</strong>
    </button>
  `).join('') : '<div class="type-line"><span>Nenhum lançamento</span><strong>R$ 0,00</strong></div>';
  $('accountTable').innerHTML = `
    <div style="margin-bottom:10px;"><button id="backGroup2Btn" class="btn secondary" type="button">Voltar</button></div>
    <article class="type-card">
      <div class="type-title">${esc(titulo)}</div>
      <div class="type-subgroup">${linhas}</div>
    </article>
  `;
  document.querySelectorAll('[data-group2-entry]').forEach(button => {
    button.addEventListener('click', () => onSelect(entries[Number(button.dataset.group2Entry)].value));
  });
  const backBtn = $('backGroup2Btn');
  if (backBtn) backBtn.addEventListener('click', onBack);
}

function showGroup2Documents(tipo, pagamento, centro, tipoDespesa, subtipo){
  const documentos = contas.filter(c =>
    c.tipo === tipo && String(c.pagamento || '').trim() === pagamento &&
    String(c.centro || '').trim() === centro && String(c.tipoDespesa || '').trim() === tipoDespesa &&
    String(c.subtipo || '').trim() === subtipo
  ).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const cards = documentos.map(c => `
    <article class="launch-card">
      <div class="launch-header">
        <div class="launch-title">
          <span class="launch-period">${esc(mesAnoBR(c.data))}</span>
          <span class="launch-title-text">${esc(c.titulo || 'Sem título')}</span>
        </div>
        <span class="badge ${c.pago ? 'badge-pago' : 'badge-pendente'}">${c.pago ? 'Pago' : 'Pendente'}</span>
      </div>
      <div class="launch-meta">
        <div class="meta-row meta-row-secondary">
          <div class="meta-item"><span class="meta-label">Data de pagamento</span><span class="meta-value">${esc(dataBR(c.data) || '—')}</span></div>
          <div class="meta-item meta-item-installment"><span class="meta-label">Parcela</span><span class="meta-value">${esc(c.parcela || '—')}</span></div>
          <div class="meta-item meta-item-value"><span class="meta-label">Valor</span><span class="launch-value">${dinheiro(c.valor)}</span></div>
        </div>
        <div class="meta-item"><span class="meta-label">Observação</span><span class="meta-value">${esc(c.obs || '—')}</span></div>
      </div>
    </article>
  `).join('');
  $('accountTable').innerHTML = `
    <div style="margin-bottom:10px;"><button id="backGroup2DocsBtn" class="btn secondary" type="button">Voltar</button></div>
    <div class="launch-grid">${cards || '<div class="empty">Nenhum documento encontrado.</div>'}</div>
  `;
  const backBtn = $('backGroup2DocsBtn');
  if (backBtn) backBtn.addEventListener('click', () => showTotalsBySubtype(tipo, pagamento, centro, tipoDespesa));
}

bindIfExists('dashboardGroup2Btn', () => { mostrarLista(); showTotalsByType(); });

function showGroupDetail(key){
  currentGroupKey = key;
  const [tipo, pagamento, centro, tipoDesp, subtipo] = JSON.parse(key);
  const lista = contas.filter(c => {
    return String(c.tipo || '') === tipo && String(c.pagamento || '').trim() === pagamento && String(c.centro || '') === centro && String(c.tipoDespesa || '') === tipoDesp && String(c.subtipo || '') === subtipo;
  }).sort((a,b)=>String(a.data).localeCompare(String(b.data)));
  // show header back button
  const backHtml = `<div style="margin-bottom:10px;"><button id="backGroupsBtn2" class="btn secondary">Voltar</button></div>`;
  $('accountTable').innerHTML = backHtml + renderLaunchCardsHTML(lista);
  const backBtn = $('backGroupsBtn2'); if (backBtn) backBtn.addEventListener('click', () => { showGroups(); });
}

['groupBtn','dashboardGroupBtn'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('click', () => { mostrarLista(); showGroups(); });
});

document.querySelectorAll('[data-target]').forEach(botao => {
  botao.addEventListener('click', () => {
    const target = botao.dataset.target;
    if (target === 'formPanel') {
      mostrarCadastro();
      return;
    }

    if (target === 'listPanel') {
      mostrarLista();
      return;
    }

    if (target === 'managementPanel') {
      mostrarCadastros();
      return;
    }

    if (target === 'dashboardScreen') {
      voltarDashboard();
    }
  });
});

document.querySelectorAll('.back-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const backTarget = btn.dataset.back || 'dashboardScreen';
    if (backTarget === 'dashboard') {
      voltarDashboard();
      return;
    }
    mostrarTela(backTarget);
  });
});

const dashboardBtn = document.querySelector('.menu[data-screen="dashboard"]');
if (dashboardBtn) dashboardBtn.addEventListener('click', () => {
  voltarDashboard();
});

const valorInput = $('valor');
if (valorInput) {
  valorInput.addEventListener('blur', () => {
    const n = numero(valorInput.value);
    if (n) valorInput.value = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}

const dataInput = $('data');
const dataNative = $('dataNative');
const dataCalendarBtn = $('dataCalendarBtn');

if (dataInput) {
  dataInput.setAttribute('lang', 'pt-BR');
  dataInput.setAttribute('title', 'Selecione a data');
  dataInput.addEventListener('input', () => {
    const valor = dataInput.value.replace(/[^\d/]/g, '');
    const numeros = valor.replace(/\D/g, '').slice(0, 8);
    let formatado = '';

    if (numeros.length > 0) formatado += numeros.slice(0, 2);
    if (numeros.length > 2) formatado += '/' + numeros.slice(2, 4);
    if (numeros.length > 4) formatado += '/' + numeros.slice(4, 8);

    dataInput.value = formatado;
    if (dataNative) {
      const iso = dataISO(formatado);
      dataNative.value = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
    }
  });

  dataInput.addEventListener('blur', () => {
    const formatado = formataDataTexto(dataInput.value);
    dataInput.value = formatado;
    if (dataNative) {
      const iso = dataISO(formatado);
      dataNative.value = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
      sincronizarPeriodoComData(iso);
    }
  });
}

if (dataNative) {
  dataNative.addEventListener('change', () => {
    if (!dataNative.value) return;
    const iso = dataISO(dataNative.value);
    dataInput.value = formataDataTexto(iso);
    sincronizarPeriodoComData(iso);
  });
}

const mesAnoSelect = $('lancamentoMesAno');
if (mesAnoSelect) mesAnoSelect.addEventListener('change', sincronizarDataComPeriodo);

const parcelaInput = $('parcela');
if (parcelaInput) parcelaInput.addEventListener('input', () => {
  parcelaInput.value = formatarParcelaDigitada(parcelaInput.value);
});

if (dataCalendarBtn && dataNative) {
  dataCalendarBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      if (typeof dataNative.showPicker === 'function') {
        dataNative.showPicker();
      } else {
        dataNative.focus();
        dataNative.click();
      }
    } catch (error) {
      dataNative.focus();
    }
  });

  dataNative.addEventListener('click', () => {
    try {
      if (typeof dataNative.showPicker === 'function') {
        dataNative.showPicker();
      }
    } catch (error) {
      dataNative.focus();
    }
  });
}

const centroForm = $('centroForm');
if (centroForm) {
  centroForm.addEventListener('submit', async e => {
    e.preventDefault();
    await adicionarCategoria('centros', $('novoCentro').value);
    $('novoCentro').value = '';
    $('novoCentro').focus();
  });
}

const tipoForm = $('tipoForm');
if (tipoForm) {
  tipoForm.addEventListener('submit', async e => {
    e.preventDefault();
    await adicionarCategoria('tipos', $('novoTipo').value);
    $('novoTipo').value = '';
    $('novoTipo').focus();
  });
}

const subtipoForm = $('subtipoForm');
if (subtipoForm) {
  subtipoForm.addEventListener('submit', async e => {
    e.preventDefault();
    await adicionarCategoria('subtipos', $('novoSubtipo').value);
    $('novoSubtipo').value = '';
    $('novoSubtipo').focus();
  });
}

const pagamentoForm = $('pagamentoForm');
if (pagamentoForm) {
  pagamentoForm.addEventListener('submit', async e => {
    e.preventDefault();
    await adicionarCategoria('pagamentos', $('novoPagamento').value);
    $('novoPagamento').value = '';
    $('novoPagamento').focus();
  });
}

document.addEventListener('click', async e => {
  const botao = e.target.closest('.tag-remove');
  if (!botao) return;
  await removerCategoria(botao.dataset.kind, botao.dataset.value);
});

document.querySelectorAll('.tab-btn').forEach(botao => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn === botao));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${botao.dataset.tab}Panel`));
  });
});

// Auth UI wiring
const loginBtn = $('loginBtn');
if (loginBtn) loginBtn.addEventListener('click', () => showAuthOverlay('login'));

const logoutBtn = $('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', async () => { await doLogout(); });

// user/profile button inside Cadastros
const userManageBtn = $('userManageBtn');
if (userManageBtn) userManageBtn.addEventListener('click', async () => {
  showAuthOverlay('profile');
  try {
    const me = await fetchJson('/api/me');
    const pn = $('profileNome'); if (pn) pn.value = me.nome || '';
    const pe = $('profileEmail'); if (pe) pe.value = me.email || '';
    const pc = $('profileCelular'); if (pc) pc.value = me.celular || '';
  } catch (e) {
    alert('Erro ao carregar perfil');
  }
});

const openRegisterBtn = $('openRegisterBtn');
if (openRegisterBtn) openRegisterBtn.addEventListener('click', () => showAuthOverlay('register'));
const openLoginBtn = $('openLoginBtn');
if (openLoginBtn) openLoginBtn.addEventListener('click', () => showAuthOverlay('login'));

const loginForm = $('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
      try {
        const res = await fetchJson('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        setAuthToken(res.token, res.user);
        // show app immediately
        if (res.force_change) {
          // require password change flow
          showAuthOverlay('change');
        } else {
          hideAuthOverlay();
          showApp();
          await inicializarDados();
        }
      } catch (err) {
        let msg = err.message || 'Erro ao logar';
        try { const j = JSON.parse(msg); msg = j.error || msg; } catch(e){}
        alert('Falha ao logar: ' + msg);
      }
  });
}

const registerForm = $('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = $('regNome').value.trim();
    const email = $('regEmail').value.trim();
    const celular = $('regCelular').value.trim();
    const password = $('regPassword').value;
    try {
      const res = await fetchJson('/api/register', { method: 'POST', body: JSON.stringify({ nome, email, celular, password }) });
      setAuthToken(res.token, res.user);
      hideAuthOverlay();
      showApp();
      await inicializarDados();
    } catch (err) {
      let msg = err.message || 'Erro ao cadastrar';
      try { const j = JSON.parse(msg); msg = j.error || msg; } catch(e){}
      alert('Falha ao cadastrar: ' + msg);
    }
  });
}

const changePwdForm = $('changePwdForm');
if (changePwdForm) {
  changePwdForm.addEventListener('submit', async e => {
    e.preventDefault();
    const newpwd = $('newPassword').value;
    try {
      await fetchJson('/api/change_password', { method: 'POST', body: JSON.stringify({ new_password: newpwd }) });
      hideAuthOverlay();
      showApp();
      await inicializarDados();
    } catch (err) {
      let msg = err.message || 'Erro ao trocar senha';
      try { const j = JSON.parse(msg); msg = j.error || msg; } catch(e){}
      alert('Falha ao trocar senha: ' + msg);
    }
  });
  const cancelBtn = $('cancelChangePwd');
  if (cancelBtn) cancelBtn.addEventListener('click', () => hideAuthOverlay());
}

// profile form handlers
const profileForm = $('profileForm');
if (profileForm) {
  profileForm.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = $('profileNome').value.trim();
    const email = $('profileEmail').value.trim();
    const celular = $('profileCelular').value.trim();
    try {
      await fetchJson('/api/me', { method: 'PUT', body: JSON.stringify({ nome, email, celular }) });
      // update local user
      const token = localStorage.getItem('rs_token');
      const user = getCurrentUser() || {};
      user.nome = nome; user.email = email; user.celular = celular;
      setAuthToken(token, user);
      hideAuthOverlay();
      showApp();
    } catch (err) {
      let msg = 'Erro ao salvar perfil';
      try { const j = JSON.parse(err.message || ''); msg = j.error || msg; } catch(e) { msg = err.message || msg; }
      alert(msg);
    }
  });
  const profileChange = $('profileChangePwd');
  if (profileChange) profileChange.addEventListener('click', () => showAuthOverlay('change'));
}

// initialize app after auth
const existingToken = localStorage.getItem('rs_token');
if (existingToken) {
  showApp();
  inicializarDados();
} else {
  hideApp();
  showAuthOverlay('login');
}
