const API_URL = "https://script.google.com/macros/s/AKfycbzIECTj1Aq0VPpCzgdDAQX3iIFyck8cuYkw49czx-LfMK1tBIKOeeOAj3FnXOnDTgM5/exec";

// Estado da aplicação
let PERFIL = null;
let CACHE = [];
let DADOS_FILTRADOS = [];
let PAGINA_ATUAL = 1;
let ITENS_POR_PAGINA = 10;
let ORDEM_ATUAL = { campo: null, direcao: 'asc' };
let MODAL_CALLBACK = null;

// Cache de requisições
const CACHE_REQUISICOES = new Map( );
const CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutos

/* ================= VALIDAÇÃO ================= */
function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarEntrada(valor) {
  // Sanitizar entrada para prevenir XSS
  const div = document.createElement('div');
  div.textContent = valor;
  return div.innerHTML;
}

function validarCamposLogin() {
  const user = document.getElementById('user');
  const pass = document.getElementById('pass');
  let valido = true;

  // Limpar erros anteriores
  document.getElementById('user-error').textContent = '';
  document.getElementById('pass-error').textContent = '';

  if (!user.value.trim()) {
    document.getElementById('user-error').textContent = 'Usuário é obrigatório';
    valido = false;
  }

  if (!pass.value) {
    document.getElementById('pass-error').textContent = 'Senha é obrigatória';
    valido = false;
  }

  return valido;
}

/* ================= LOGIN ================= */
function handleLogin(event) {
  event.preventDefault();

  if (!validarCamposLogin()) {
    return;
  }

  login();
}

async function login() {
  const user = document.getElementById('user').value.trim();
  const pass = document.getElementById('pass').value;
  const erro = document.getElementById('loginErro');
  const btn = document.getElementById('login-btn');

  erro.textContent = '';
  btn.disabled = true;
  document.querySelector('.btn-text').classList.add('hidden');
  document.querySelector('.btn-loader').classList.remove('hidden');

  try {
    const cacheKey = `login_${user}`;
    let resposta;

    // Verificar cache
    if (CACHE_REQUISICOES.has(cacheKey)) {
      const cached = CACHE_REQUISICOES.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TIMEOUT) {
        resposta = cached.data;
      }
    }

    if (!resposta) {
      const r = await fetch(`${API_URL}?acao=login&login=${encodeURIComponent(user)}&senha=${encodeURIComponent(pass)}`);
      
      if (!r.ok) throw new Error('Erro na conexão com o servidor');
      
      resposta = await r.json();
      
      // Cachear resposta
      CACHE_REQUISICOES.set(cacheKey, {
        data: resposta,
        timestamp: Date.now()
      });
    }

    if (!resposta.sucesso) {
      erro.textContent = 'Usuário ou senha inválidos';
      return;
    }

    PERFIL = resposta.perfil;
    toggleTela(true);
    carregar();

  } catch (error) {
    console.error('Erro de login:', error);
    erro.textContent = 'Erro de conexão. Tente novamente.';
  } finally {
    btn.disabled = false;
    document.querySelector('.btn-text').classList.remove('hidden');
    document.querySelector('.btn-loader').classList.add('hidden');
  }
}

/* ================= LOGOUT ================= */
function confirmarLogout() {
  abrirModal(
    'Confirmar Saída',
    'Tem certeza que deseja sair do sistema?',
    () => {
      PERFIL = null;
      CACHE = [];
      DADOS_FILTRADOS = [];
      PAGINA_ATUAL = 1;
      CACHE_REQUISICOES.clear();
      toggleTela(false);
      document.getElementById('user').value = '';
      document.getElementById('pass').value = '';
    }
  );
}

/* ================= CARREGAR DADOS ================= */
async function carregar() {
  const situacao = document.getElementById('filtroSituacao').value || '';
  const ano = document.getElementById('filtroAno').value || '';
  const busca = document.getElementById('searchInput').value || '';
  
  mostrarLoading(true);
  PAGINA_ATUAL = 1;

  try {
    const cacheKey = `dados_${situacao}_${ano}`;
    let dados;

    // Verificar cache
    if (CACHE_REQUISICOES.has(cacheKey)) {
      const cached = CACHE_REQUISICOES.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TIMEOUT) {
        dados = cached.data;
      }
    }

    if (!dados) {
      const r = await fetch(`${API_URL}?acao=dados&situacao=${encodeURIComponent(situacao)}`);
      
      if (!r.ok) throw new Error('Erro ao carregar dados');
      
      dados = await r.json();
      
      // Cachear dados
      CACHE_REQUISICOES.set(cacheKey, {
        data: dados,
        timestamp: Date.now()
      });
    }

    // Filtrar por ano
    CACHE = ano ? dados.filter(d => new Date(d.data).getFullYear() == ano) : dados;

    // Aplicar busca
    if (busca) {
      DADOS_FILTRADOS = CACHE.filter(d => {
        const termo = busca.toLowerCase();
        return String(d.notaFiscal).toLowerCase().includes(termo) ||
               String(d.emitente).toLowerCase().includes(termo) ||
               String(d.cidade).toLowerCase().includes(termo);
      });
    } else {
      DADOS_FILTRADOS = [...CACHE];
    }

    // Aplicar ordenação
    if (ORDEM_ATUAL.campo) {
      ordenarDados();
    }

    popularAnos(dados);
    renderTabela();
    atualizarCards();
    atualizarPaginacao();

  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    mostrarErro('Erro ao carregar dados. Tente novamente.');
  } finally {
    mostrarLoading(false);
  }
}

/* ================= BUSCA COM DEBOUNCE ================= */
const debounce = (func, delay) => {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(carregar, 300));
  }
});

/* ================= RENDERIZAR DIAS ================= */
function renderDias(diasAtendidos) {
  const dias = [
    { abrev: "Seg", completo: "SEGUNDA" },
    { abrev: "Ter", completo: "TERÇA" },
    { abrev: "Qua", completo: "QUARTA" },
    { abrev: "Qui", completo: "QUINTA" },
    { abrev: "Sex", completo: "SEXTA" }
  ];
  
  const diasTexto = String(diasAtendidos || "").toUpperCase();
  let html = '<div class="dias-container">';
  
  dias.forEach((dia) => {
    const ativo = diasTexto.includes(dia.completo);
    const classe = ativo ? "ativo" : "inativo";
    html += `<div class="dia-bolinha ${classe}" title="${dia.completo}">${dia.abrev}</div>`;
  });
  
  html += '</div>';
  return html;
}

/* ================= RENDERIZAR TABELA ================= */
function renderTabela() {
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';

  const inicio = (PAGINA_ATUAL - 1) * ITENS_POR_PAGINA;
  const fim = inicio + ITENS_POR_PAGINA;
  const dadosPagina = DADOS_FILTRADOS.slice(inicio, fim);

  if (dadosPagina.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: #94a3b8;">Nenhum dado encontrado</td></tr>`;
    return;
  }

  dadosPagina.forEach(d => {
    const editavel = PERFIL === "admin" 
      ? `<select onchange="alterarStatus(${d.row},this.value)" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; background: white; font-size: 13px; color: #1e293b; cursor: pointer; font-weight: 500;">
          <option ${sel(d,"AGUARDANDO COLETA")}>AGUARDANDO COLETA</option>
          <option ${sel(d,"COLETADO")}>COLETADO</option>
          <option ${sel(d,"NAO COLETADO")}>NAO COLETADO</option>
          <option ${sel(d,"AVARIADO PELA ENCHENTE")}>AVARIADO PELA ENCHENTE</option>
        </select>`
      : `<span class="tag ${classeSituacao(d.situacao)}">${d.situacao}</span>`;
    
    tbody.innerHTML += `<tr>
      <td>${validarEntrada(String(d.notaFiscal))}</td>
      <td>${validarEntrada(String(d.emitente))}</td>
      <td>${validarEntrada(String(d.cidade))}</td>
      <td>${fmt(d.data)}</td>
      <td>${renderDias(d.diasAtendidos)}</td>
      <td>${validarEntrada(String(d.representante))}</td>
      <td>${editavel}</td>
      <td>${validarEntrada(String(d.observacao || ""))}</td>
    </tr>`;
  });
}

/* ================= ORDENAÇÃO ================= */
function ordenarTabela(campo) {
  if (ORDEM_ATUAL.campo === campo) {
    ORDEM_ATUAL.direcao = ORDEM_ATUAL.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    ORDEM_ATUAL.campo = campo;
    ORDEM_ATUAL.direcao = 'asc';
  }
  
  PAGINA_ATUAL = 1;
  ordenarDados();
  renderTabela();
  atualizarPaginacao();
}

function ordenarDados() {
  if (!ORDEM_ATUAL.campo) return;

  DADOS_FILTRADOS.sort((a, b) => {
    let valA = a[ORDEM_ATUAL.campo];
    let valB = b[ORDEM_ATUAL.campo];

    if (ORDEM_ATUAL.campo === 'data') {
      valA = new Date(valA);
      valB = new Date(valB);
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }

    if (valA < valB) return ORDEM_ATUAL.direcao === 'asc' ? -1 : 1;
    if (valA > valB) return ORDEM_ATUAL.direcao === 'asc' ? 1 : -1;
    return 0;
  });
}

/* ================= PAGINAÇÃO ================= */
function atualizarPaginacao() {
  const totalPaginas = Math.ceil(DADOS_FILTRADOS.length / ITENS_POR_PAGINA);
  document.getElementById('page-info').textContent = `Página ${PAGINA_ATUAL} de ${totalPaginas}`;
  document.getElementById('prev-btn').disabled = PAGINA_ATUAL === 1;
  document.getElementById('next-btn').disabled = PAGINA_ATUAL === totalPaginas;
  
  const paginationSection = document.getElementById('pagination-section');
  paginationSection.classList.toggle('hidden', totalPaginas <= 1);
}

function proximaPagina() {
  const totalPaginas = Math.ceil(DADOS_FILTRADOS.length / ITENS_POR_PAGINA);
  if (PAGINA_ATUAL < totalPaginas) {
    PAGINA_ATUAL++;
    renderTabela();
    atualizarPaginacao();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function paginaAnterior() {
  if (PAGINA_ATUAL > 1) {
    PAGINA_ATUAL--;
    renderTabela();
    atualizarPaginacao();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* ================= CARDS ================= */
function atualizarCards() {
  const aguardando = DADOS_FILTRADOS.filter(d => d.situacao === "AGUARDANDO COLETA").length;
  const coletado = DADOS_FILTRADOS.filter(d => d.situacao === "COLETADO").length;
  
  document.getElementById('totalAguardando').textContent = aguardando;
  document.getElementById('totalColetado').textContent = coletado;
  
  const totalRegistros = DADOS_FILTRADOS.length;
  document.getElementById('table-info-text').textContent = `Mostrando ${totalRegistros} registro(s)`;
}

/* ================= ADMIN - ALTERAR STATUS ================= */
async function alterarStatus(row, valor) {
  try {
    const r = await fetch(`${API_URL}?acao=update&row=${row}&campo=situacao&valor=${encodeURIComponent(valor)}&perfil=${PERFIL}`);
    
    if (!r.ok) throw new Error('Erro ao atualizar');
    
    // Limpar cache para forçar recarregamento
    CACHE_REQUISICOES.clear();
    carregar();
    
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    mostrarErro('Erro ao atualizar status. Tente novamente.');
  }
}

/* ================= EXPORTAR PDF ================= */
function exportarPDF() {
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR');
  
  let htmlPDF = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #1e293b; }
        .container { padding: 20px; max-width: 1000px; margin: 0 auto; }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px solid #3b82f6;
          padding-bottom: 15px;
        }
        
        .header h1 {
          font-size: 24px;
          color: #0f172a;
          margin-bottom: 5px;
        }
        
        .header p {
          font-size: 12px;
          color: #64748b;
        }
        
        .cards {
          display: flex;
          gap: 20px;
          margin-bottom: 30px;
          justify-content: center;
        }
        
        .card {
          flex: 1;
          max-width: 300px;
          padding: 20px;
          border-radius: 8px;
          border-left: 4px solid;
          text-align: center;
        }
        
        .card.warning {
          border-left-color: #f59e0b;
          background: #fef3c7;
        }
        
        .card.success {
          border-left-color: #10b981;
          background: #d1fae5;
        }
        
        .card-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        
        .card.warning .card-label { color: #b45309; }
        .card.success .card-label { color: #047857; }
        
        .card-value {
          font-size: 32px;
          font-weight: 700;
        }
        
        .card.warning .card-value { color: #d97706; }
        .card.success .card-value { color: #059669; }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
          font-size: 12px;
        }
        
        thead {
          background: #f8fafc;
          border-bottom: 2px solid #e2e8f0;
        }
        
        th {
          padding: 12px;
          text-align: left;
          font-weight: 700;
          color: #334155;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.5px;
        }
        
        td {
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
          color: #475569;
        }
        
        tbody tr:nth-child(odd) {
          background: #eff6ff;
        }
        
        tbody tr:nth-child(even) {
          background: #dbeafe;
        }
        
        .tag {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          color: white;
        }
        
        .tag.success {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }
        
        .tag.warning {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }
        
        .tag.danger {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }
        
        .tag.info {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        }
        
        .footer {
          text-align: center;
          font-size: 10px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          padding-top: 15px;
          margin-top: 30px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Conferência de Devolução</h1>
          <p>Relatório de Coletas - ${dataHora}</p>
        </div>
        
        <div class="cards">
          <div class="card warning">
            <div class="card-label">⏳ Aguardando</div>
            <div class="card-value">${document.getElementById("totalAguardando").innerText}</div>
          </div>
          <div class="card success">
            <div class="card-label">✓ Coletados</div>
            <div class="card-value">${document.getElementById("totalColetado").innerText}</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>NF</th>
              <th>Emitente</th>
              <th>Cidade</th>
              <th>Data</th>
              <th>Situação</th>
              <th>Obs</th>
            </tr>
          </thead>
          <tbody>
            ${gerarLinhasPDF()}
          </tbody>
        </table>
        
        <div class="footer">
          <p>Relatório gerado em ${dataHora}</p>
          <p>Dashboard de Conferência de Devolução - 2026</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const janela = window.open('', '_blank');
  janela.document.write(htmlPDF);
  janela.document.close();
  
  setTimeout(() => {
    janela.print();
  }, 500);
}

function gerarLinhasPDF() {
  let html = '';
  
  DADOS_FILTRADOS.forEach(d => {
    const tagClass = classeSituacao(d.situacao);
    html += `<tr>
      <td>${validarEntrada(String(d.notaFiscal))}</td>
      <td>${validarEntrada(String(d.emitente))}</td>
      <td>${validarEntrada(String(d.cidade))}</td>
      <td>${fmt(d.data)}</td>
      <td><span class="tag ${tagClass}">${d.situacao}</span></td>
      <td>${validarEntrada(String(d.observacao || "-"))}</td>
    </tr>`;
  });
  
  return html;
}

/* ================= MODAL ================= */
function abrirModal(titulo, mensagem, callback) {
  document.getElementById('modal-title').textContent = titulo;
  document.getElementById('modal-message').textContent = mensagem;
  document.getElementById('modal-confirmacao').classList.remove('hidden');
  MODAL_CALLBACK = callback;
}

function fecharModal() {
  document.getElementById('modal-confirmacao').classList.add('hidden');
  MODAL_CALLBACK = null;
}

function confirmarAcao() {
  if (MODAL_CALLBACK) {
    MODAL_CALLBACK();
  }
  fecharModal();
}

/* ================= UI HELPERS ================= */
function mostrarLoading(mostrar) {
  document.getElementById('loading-spinner').classList.toggle('hidden', !mostrar);
}

function mostrarErro(mensagem) {
  const erro = document.getElementById('loginErro');
  if (erro) {
    erro.textContent = mensagem;
  }
}

function toggleTela(on) {
  document.getElementById('login-page').classList.toggle('hidden', on);
  document.getElementById('dashboard').classList.toggle('hidden', !on);
}

function recarregar() {
  CACHE_REQUISICOES.clear();
  carregar();
}

function popularAnos(d) {
  const selAno = document.getElementById('filtroAno');
  
  if (selAno.options.length > 1) return;
  
  const anos = [...new Set(d.map(x => new Date(x.data).getFullYear()).filter(Boolean))].sort((a, b) => b - a);
  
  anos.forEach(a => {
    const option = document.createElement('option');
    option.value = a;
    option.textContent = a;
    selAno.appendChild(option);
  });
}

function classeSituacao(s) {
  if (s === "COLETADO") return "success";
  if (s === "AGUARDANDO COLETA") return "warning";
  if (s === "NAO COLETADO") return "danger";
  if (s === "AVARIADO PELA ENCHENTE") return "info";
  return "secondary";
}

function fmt(d) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "";
}

function sel(d, v) {
  return d.situacao === v ? "selected" : "";
}

/* ================= INICIALIZAÇÃO ================= */
document.addEventListener('DOMContentLoaded', () => {
  // Fechar modal ao clicar fora
  document.getElementById('modal-confirmacao').addEventListener('click', (e) => {
    if (e.target.id === 'modal-confirmacao') {
      fecharModal();
    }
  });

  // Tecla ESC para fechar modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      fecharModal();
    }
  });
});
