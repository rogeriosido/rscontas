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

let produtosCadastrados = [];
async function carregarProdutos() {
  try {
    const produtos = await fetchJson('/api/produtos');
    produtosCadastrados = Array.isArray(produtos) ? produtos : [];
    const tbody = $('productsTableBody');
    const empty = $('productsEmpty');
    if (!tbody || !empty) return;
    tbody.innerHTML = produtos.map(produto => {
      const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(produto.data_ultimo_preco || '');
      const displayDate = dateMatch ? `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}` : '';
      const lastPrice = produto.ultimo_preco == null
        ? 'Sem pre\u00e7o registrado'
        : `R$ ${Number(produto.ultimo_preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 10 })}${displayDate ? ` <span class="product-last-price-date">(${displayDate})</span>` : ''}`;
      return `<tr data-product-id="${esc(produto.id)}"><td data-label="C\u00f3digo de barras">${esc(produto.codigo_barras)}</td><td data-label="Nome do produto">${esc(produto.nome)}</td><td data-label="Pre\u00e7os e a\u00e7\u00f5es"><div class="product-last-price">${lastPrice}</div><div class="product-actions"><button class="btn secondary product-prices-btn" type="button">Pre\u00e7os</button><button class="btn secondary product-edit-btn" type="button">Editar</button></div></td></tr>`;
    }).join('');
    empty.style.display = produtos.length ? 'none' : 'block';
    $('productsCount').textContent = `${produtos.length} produto${produtos.length === 1 ? '' : 's'} cadastrado${produtos.length === 1 ? '' : 's'}`;
  } catch (error) {
    console.warn('Erro ao carregar produtos:', error);
    alert('N\u00e3o foi poss\u00edvel carregar os produtos. Verifique se voc\u00ea est\u00e1 conectado.');
  }
}

const $ = id => document.getElementById(id);
const form = $('accountForm');
const invoiceDateInput = $('invoiceDate');
if (invoiceDateInput && !invoiceDateInput.value) {
  invoiceDateInput.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const invoiceCaptureBody = $('invoiceCaptureBody');
if (invoiceCaptureBody) invoiceCaptureBody.addEventListener('input', event => {
  if (event.target.matches('.invoice-product-barcode')) {
    const index = event.target.dataset.index;
    const checkbox = invoiceCaptureBody.querySelector(`.invoice-product-check[data-index="${index}"]`);
    if (checkbox) {
      checkbox.disabled = !event.target.value.trim();
      checkbox.checked = !checkbox.disabled;
    }
    return;
  }
  if (!event.target.matches('.invoice-product-quantity, .invoice-product-value')) return;
  const row = event.target.closest('tr');
  const cells = row?.querySelectorAll('td');
  if (!cells || cells.length < 8) return;
  const parse = value => {
    const text = String(value || '').trim();
    return text ? Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text) : NaN;
  };
  const quantity = parse(row.querySelector('.invoice-product-quantity').value);
  const value = parse(row.querySelector('.invoice-product-value').value);
  const discount = parse(cells[5].textContent);
  const net = quantity > 0 && Number.isFinite(value) && Number.isFinite(discount) ? value - discount / quantity : NaN;
  const total = Number.isFinite(net) ? quantity * net : NaN;
  const money = number => Number.isFinite(number) ? number.toFixed(2).replace('.', ',') : '';
  cells[6].textContent = money(net);
  cells[7].textContent = money(total);
  const grandTotal = Array.from(invoiceCaptureBody.querySelectorAll('tr')).reduce((sum, productRow) => sum + (parse(productRow.cells[7]?.textContent) || 0), 0);
  $('invoiceCaptureFooter').innerHTML = `<tr><th colspan="7">Total geral dos produtos</th><th>${grandTotal.toFixed(2).replace('.', ',')}</th></tr>`;
});

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
bindIfExists('productsBtn', async () => {
  mostrarTela('productsPanel');
  await carregarProdutos();
});

const productForm = $('productForm');
if (productForm) productForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = productForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await fetchJson('/api/produtos', {
      method: 'POST',
      body: JSON.stringify({ codigo_barras: $('productBarcode').value, nome: $('productName').value })
    });
    productForm.reset();
    await carregarProdutos();
  } catch (error) {
    alert(error.message.includes('409') ? 'J\u00e1 existe um produto com este c\u00f3digo de barras.' : 'N\u00e3o foi poss\u00edvel cadastrar o produto. Verifique os dados e tente novamente.');
  } finally {
    submit.disabled = false;
  }
});

const productsTableBody = $('productsTableBody');
if (productsTableBody) productsTableBody.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (button?.classList.contains('product-price-delete-btn')) {
    if (!window.confirm('Apagar este registro de pre\u00e7o?')) return;
    const detailRow = button.closest('tr.product-prices-detail');
    const productId = detailRow?.previousElementSibling?.dataset.productId;
    button.disabled = true;
    try {
      await fetchJson(`/api/produtos/precos/${encodeURIComponent(button.dataset.priceId)}`, { method: 'DELETE' });
      await carregarProdutos();
      const refreshedProductRow = Array.from(productsTableBody.querySelectorAll('tr[data-product-id]')).find(item => item.dataset.productId === productId);
      refreshedProductRow?.querySelector('.product-prices-btn')?.click();
    } catch (error) {
      alert('N\u00e3o foi poss\u00edvel apagar este registro de pre\u00e7o.');
      button.disabled = false;
    }
    return;
  }
  const row = button?.closest('tr[data-product-id]');
  if (!button || !row) return;
  if (button.classList.contains('product-prices-btn')) {
    const nextRow = row.nextElementSibling;
    if (nextRow?.classList.contains('product-prices-detail')) {
      nextRow.remove();
      button.textContent = 'Preços';
      return;
    }
    button.disabled = true;
    try {
      const prices = await fetchJson(`/api/produtos/${encodeURIComponent(row.dataset.productId)}/precos`);
      const details = prices.length
        ? `<div class="product-prices-scroll"><table class="product-prices-table"><thead><tr><th>Mercado</th><th>Cupom</th><th>Data</th><th>Quantidade</th><th>Valor unit\u00e1rio</th><th>A\u00e7\u00e3o</th></tr></thead><tbody>${prices.map(price => {
            const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(price.data || '');
            const displayDate = dateMatch ? `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}` : esc(price.data);
            const quantity = Number(price.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
            const value = Number(price.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 10 });
            return `<tr><td>${esc(price.mercado)}</td><td>${esc(price.cupom || '')}</td><td>${displayDate}</td><td>${quantity}</td><td>R$ ${value}</td><td><button class="btn secondary product-price-delete-btn" type="button" data-price-id="${esc(price.id)}">Apagar</button></td></tr>`;
          }).join('')}</tbody></table></div>`
        : '<p class="product-prices-empty">Nenhum pre\u00e7o registrado para este produto.</p>';
      const detailRow = document.createElement('tr');
      detailRow.className = 'product-prices-detail';
      detailRow.innerHTML = `<td colspan="3" data-label="Hist\u00f3rico de pre\u00e7os"><strong>Hist\u00f3rico de pre\u00e7os</strong>${details}</td>`;
      row.after(detailRow);
      button.textContent = 'Ocultar preços';
    } catch (error) {
      alert('N\u00e3o foi poss\u00edvel carregar os pre\u00e7os deste produto.');
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (button.classList.contains('product-edit-btn')) {
    const cells = row.querySelectorAll('td');
    row.dataset.originalCode = cells[0].textContent.trim();
    row.dataset.originalName = cells[1].textContent.trim();
    cells[0].innerHTML = `<input class="product-edit-code" type="text" maxlength="80" value="${esc(row.dataset.originalCode)}" aria-label="C\u00f3digo de barras">`;
    cells[1].innerHTML = `<input class="product-edit-name" type="text" maxlength="160" value="${esc(row.dataset.originalName)}" aria-label="Nome do produto">`;
    cells[2].innerHTML = '<button class="btn primary product-save-btn" type="button">Salvar</button> <button class="btn secondary product-cancel-btn" type="button">Cancelar</button>';
    cells[1].querySelector('input').focus();
    return;
  }
  if (button.classList.contains('product-cancel-btn')) {
    await carregarProdutos();
    return;
  }
  if (!button.classList.contains('product-save-btn')) return;
  const codigo_barras = row.querySelector('.product-edit-code')?.value.trim();
  const nome = row.querySelector('.product-edit-name')?.value.trim();
  if (!codigo_barras || !nome) {
    alert('Informe o c\u00f3digo de barras e o nome do produto.');
    return;
  }
  button.disabled = true;
  try {
    await fetchJson(`/api/produtos/${encodeURIComponent(row.dataset.productId)}`, {
      method: 'PUT',
      body: JSON.stringify({ codigo_barras, nome })
    });
    await carregarProdutos();
  } catch (error) {
    let message = error.message || 'N\u00e3o foi poss\u00edvel salvar as altera\u00e7\u00f5es do produto.';
    try { message = JSON.parse(message).error || message; } catch (parseError) {}
    alert(message);
    button.disabled = false;
  }
});

bindIfExists('openInvoiceLookupBtn', () => {
  const chave = $('invoiceKey').value.replace(/\D/g, '');
  const status = $('invoiceImportStatus');
  if (chave.length !== 44) {
    status.textContent = 'Informe uma chave de acesso NFC-e com 44 d\u00edgitos.';
    return;
  }
  const url = `https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?chNFe=${chave}&nVersao=100`;
  window.open(url, 'rsContasNfceLookup');
  status.textContent = 'Consulta aberta. Copie os dados da aba Produtos / Servi\u00e7os e cole no campo para analisar.';
});

let capturedInvoiceProducts = [];
function renderCapturedInvoiceProducts(items) {
  if (!Array.isArray(items) || items.length > 1000) return false;
  const parseNumber = value => {
    const normalized = String(value || '').trim();
    if (!normalized) return NaN;
    return Number(normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized);
  };
  const money = value => Number.isFinite(value) ? value.toFixed(2).replace('.', ',') : '';
  const inputNumber = value => Number.isFinite(value)
    ? value.toFixed(10).replace(/\.?0+$/, '').replace('.', ',')
    : '';
  const groups = new Map();
  items.filter(item => item && (typeof item.nome === 'string' || item.codigo_barras)).forEach(item => {
    const nome = String(item.nome || '').trim().slice(0, 160);
    const codigo_barras = String(item.codigo_barras || '').replace(/\D/g, '').slice(0, 80);
    if (!nome && !codigo_barras) return;
    const key = `${codigo_barras}|${nome.toLocaleLowerCase()}`;
    const quantidade = parseNumber(item.quantidade_comercial);
    const valor = parseNumber(item.valor_unitario);
    const liquido = parseNumber(item.base_icms_normal);
    const qtd = Number.isFinite(quantidade) ? quantidade : 0;
    const descontoUnitario = Number.isFinite(valor) && Number.isFinite(liquido) && valor > liquido ? valor - liquido : 0;
    const linhaDesconto = descontoUnitario * qtd;
    let group = groups.get(key);
    if (!group) {
      group = { nome, codigo_barras, quantidade: 0, valorNumerador: 0, valorPeso: 0, desconto: 0 };
      groups.set(key, group);
    }
    group.quantidade += qtd;
    if (Number.isFinite(valor)) { group.valorNumerador += valor * qtd; group.valorPeso += qtd; }
    group.desconto += linhaDesconto;
  });
  capturedInvoiceProducts = Array.from(groups.values()).map(group => {
    const valor = group.valorPeso ? group.valorNumerador / group.valorPeso : NaN;
    const valorLiquido = group.quantidade > 0 && Number.isFinite(valor)
      ? valor - group.desconto / group.quantidade
      : NaN;
    const total = group.quantidade > 0 && Number.isFinite(valorLiquido)
      ? group.quantidade * valorLiquido
      : NaN;
    return {
      nome: group.nome,
      codigo_barras: group.codigo_barras,
      ja_cadastrado: produtosCadastrados.some(product => String(product.codigo_barras || '').replace(/\D/g, '') === group.codigo_barras),
      quantidade_comercial: group.quantidade.toFixed(4).replace('.', ','),
      valor_unitario: inputNumber(valor),
      desconto: money(group.desconto),
      base_icms_normal: money(valorLiquido),
      total: money(total)
    };
  });
  $('invoiceCaptureBody').innerHTML = capturedInvoiceProducts.map((item, index) => `<tr>
    <td data-label="Registrar pre\u00e7o"><input class="invoice-product-check" data-index="${index}" type="checkbox" ${item.codigo_barras ? 'checked' : ''} ${!item.codigo_barras ? 'disabled title="Informe um c\u00f3digo para vincular o pre\u00e7o"' : ''} aria-label="Registrar pre\u00e7o de ${esc(item.nome || item.codigo_barras)}"></td>
    <td data-label="C\u00f3digo"><input class="invoice-product-barcode" data-index="${index}" type="text" maxlength="80" value="${esc(item.codigo_barras)}" placeholder="EAN n\u00e3o encontrado"></td>
    <td data-label="Produto"><input class="invoice-product-name" data-index="${index}" type="text" maxlength="160" value="${esc(item.nome)}" placeholder="Informe o nome" aria-label="Nome do produto" ${item.ja_cadastrado ? 'disabled title="Produto j\u00e1 cadastrado; o pre\u00e7o ser\u00e1 vinculado a ele"' : ''}></td>
    <td data-label="Quantidade"><input class="invoice-product-quantity" data-index="${index}" type="text" inputmode="decimal" value="${esc(item.quantidade_comercial)}" aria-label="Quantidade"></td>
    <td data-label="Valor unit\u00e1rio"><input class="invoice-product-value" data-index="${index}" type="text" inputmode="decimal" value="${esc(item.valor_unitario)}" aria-label="Valor unit\u00e1rio"></td>
    <td data-label="Desconto">${esc(item.desconto)}</td>
    <td data-label="Valor l\u00edquido">${esc(item.base_icms_normal)}</td>
    <td data-label="Total">${esc(item.total)}</td>
  </tr>`).join('');
  const totalGeral = capturedInvoiceProducts.reduce((total, item) => total + (parseNumber(item.total) || 0), 0);
  $('invoiceCaptureFooter').innerHTML = `<tr><th colspan="7">Total geral dos produtos</th><th>${totalGeral.toFixed(2).replace('.', ',')}</th></tr>`;
  const newProducts = capturedInvoiceProducts.filter(item => item.codigo_barras && !item.ja_cadastrado).length;
  const existingProducts = capturedInvoiceProducts.filter(item => item.ja_cadastrado).length;
  $('invoiceCaptureSummary').textContent = `${capturedInvoiceProducts.length} produto(s) agrupado(s); ${newProducts} novo(s); ${existingProducts} já cadastrado(s), com preço para registrar.`;
  $('invoiceCapturePreview').hidden = capturedInvoiceProducts.length === 0;
  $('invoiceImportStatus').textContent = capturedInvoiceProducts.length
    ? 'Preencha Mercado e Data. Os itens selecionados registrar\u00e3o os pre\u00e7os; produtos novos tamb\u00e9m ser\u00e3o cadastrados.'
    : 'Nenhum produto foi reconhecido. Copie tamb\u00e9m os campos Descri\u00e7\u00e3o e C\u00f3digo EAN da consulta.';
  return capturedInvoiceProducts.length > 0;
}

function analisarTextoNfce(rawText) {
  const normalized = String(rawText || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lines = normalized.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const names = [];
  const itemStarts = [];
  for (let index = 0; index < lines.length; index++) {
    const cells = lines[index].split(/\t+/).map(cell => cell.trim()).filter(Boolean);
    if (cells.length >= 4 && /^\d{1,3}$/.test(cells[0])) {
      const quantityIndex = cells.findIndex((cell, cellIndex) => cellIndex >= 2 && /^\d+[,.]\d+$/.test(cell));
      if (quantityIndex === 2 && cells[1] && !/^\d+$/.test(cells[1])) {
        names.push(cells[1]);
        itemStarts.push(index);
        continue;
      }
    }
    if (/^\d{1,3}$/.test(lines[index]) && lines[index + 1] && lines[index + 2] && /^\d+[,.]\d+$/.test(lines[index + 2])) {
      names.push(lines[index + 1].trim());
      itemStarts.push(index);
      index += 2;
    } else {
      const row = lines[index].match(/^\d{1,3}\s+(.+?)\s+\d+[,.]\d+\s+\S+\s+[\d.,]+$/);
      if (row) {
        names.push(row[1].trim());
        itemStarts.push(index);
      }
    }
  }
  const valuesAfterLabel = (label, pattern = /^\d{8,14}$/) => {
    const values = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const position = line.indexOf(label);
      if (position < 0) continue;
      const sameLineValue = line.slice(position + label.length).trim();
      const value = sameLineValue || (lines[index + 1] || '').trim();
      values.push(pattern.test(value) ? value : '');
    }
    return values;
  };
  let codes = valuesAfterLabel('Codigo EAN Comercial');
  if (!codes.some(Boolean)) codes = valuesAfterLabel('Codigo EAN Tributavel');
  const productCodes = valuesAfterLabel('Codigo do Produto', /^\d{1,80}$/);
  const quantities = valuesAfterLabel('Quantidade Comercial', /^\d+[,.]\d+$/);
  const unitValues = valuesAfterLabel('Valor unitario de comercializacao', /^\d+[,.]\d+$/);
  const bases = itemStarts.map((start, index) => {
    const end = itemStarts[index + 1] ?? lines.length;
    for (let lineIndex = start; lineIndex < end; lineIndex++) {
      if (!lines[lineIndex].includes('Base de Calculo do ICMS Normal')) continue;
      const sameLineValue = lines[lineIndex].replace('Base de Calculo do ICMS Normal', '').trim();
      const value = sameLineValue || (lines[lineIndex + 1] || '').trim();
      return /^\d+(?:[,.]\d+)?$/.test(value) ? value : '';
    }
    return '';
  });
  const asNumber = value => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) return NaN;
    return Number(normalizedValue.includes(',') ? normalizedValue.replace(/\./g, '').replace(',', '.') : normalizedValue);
  };
  const total = Math.max(names.length, codes.length, productCodes.length, quantities.length, unitValues.length, bases.length);
  return Array.from({ length: total }, (_, index) => ({
    nome: names[index] || '',
    codigo_barras: codes[index] || productCodes[index] || '',
    quantidade_comercial: quantities[index] || '',
    valor_unitario: unitValues[index] || '',
    base_icms_normal: bases[index] || '',
    desconto: Number.isFinite(asNumber(unitValues[index])) && Number.isFinite(asNumber(bases[index])) && asNumber(unitValues[index]) > asNumber(bases[index])
      ? (asNumber(unitValues[index]) - asNumber(bases[index])).toFixed(2).replace('.', ',')
      : '0,00'
  }));
}

bindIfExists('loadInvoiceCaptureBtn', () => {
  const items = analisarTextoNfce($('invoiceCapturePayload').value);
  if (!renderCapturedInvoiceProducts(items)) {
    $('invoiceImportStatus').textContent = 'N\u00e3o encontrei itens. Na SEFAZ, selecione a aba Produtos / Servi\u00e7os com a Descri\u00e7\u00e3o e os C\u00f3digos EAN vis\u00edveis, copie e cole novamente.';
  }
});

bindIfExists('importCapturedProductsBtn', async event => {
  const button = event.currentTarget;
  const products = Array.from(document.querySelectorAll('.invoice-product-check:checked')).map(check => {
    const index = Number(check.dataset.index);
    const row = check.closest('tr');
    return {
      codigo_barras: document.querySelector(`.invoice-product-barcode[data-index="${index}"]`)?.value.trim(),
      nome: document.querySelector(`.invoice-product-name[data-index="${index}"]`)?.value.trim(),
      quantidade: document.querySelector(`.invoice-product-quantity[data-index="${index}"]`)?.value.trim(),
      valor: row?.cells[6]?.textContent.trim()
    };
  }).filter(item => item.codigo_barras && item.nome && item.quantidade && item.valor);
  const mercado = $('invoiceMarket').value.trim();
  const cupom = $('invoiceCoupon').value.trim();
  const data = $('invoiceDate').value;
  if (!mercado || !cupom || !data) {
    $('invoiceImportStatus').textContent = 'Informe o mercado, o n\u00famero do cupom e a data para registrar os pre\u00e7os.';
    const missingField = !mercado ? $('invoiceMarket') : (!cupom ? $('invoiceCoupon') : $('invoiceDate'));
    missingField.focus();
    missingField.reportValidity();
    $('invoiceImportStatus').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (!products.length) {
    $('invoiceImportStatus').textContent = 'Selecione produtos com c\u00f3digo, quantidade e valor. Produtos existentes tamb\u00e9m podem receber um novo pre\u00e7o.';
    $('invoiceImportStatus').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  button.disabled = true;
  $('invoiceImportStatus').textContent = 'Registrando produtos e pre\u00e7os...';
  try {
    const result = await fetchJson('/api/produtos/importar', {
      method: 'POST',
      body: JSON.stringify({ mercado, cupom, data, produtos: products })
    });
    $('invoiceImportStatus').textContent = `Conclu\u00eddo: ${result.produtos_inseridos} produto(s) novo(s), ${result.produtos_existentes} j\u00e1 cadastrado(s) e ${result.precos_inseridos} pre\u00e7o(s) registrado(s).`;
    await carregarProdutos();
  } catch (error) {
    let message = error.message || '';
    try { message = JSON.parse(message).error || message; } catch (parseError) {}
    $('invoiceImportStatus').textContent = message || 'N\u00e3o foi poss\u00edvel registrar os produtos e pre\u00e7os. Verifique os dados e tente novamente.';
    $('invoiceImportStatus').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    button.disabled = false;
  }
});
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
