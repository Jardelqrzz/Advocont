/* ---------- Web3Forms ---------- */
const WEB3FORMS_KEY = "727f2ca2-c42b-49a3-be7b-96566f0f1071";

async function submitLead(fields, subject) {
  const payload = {
    access_key: WEB3FORMS_KEY,
    subject: subject,
    from_name: "Site Advocont",
    ...fields,
  };
  const res = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Falha ao enviar formulário");
  return data;
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/* ---------- Dados dos planos (espelha a tabela comparativa do index.html) ----------
   notasInclusas e funcionariosConfortaveis alimentam a recomendação do caminho "ainda não
   tenho CNPJ" (ver recommendPlanCompleto) — refletem a capacidade de cada plano (notas
   inclusas/mês da tabela comparativa) e o perfil descrito em cada plan-desc do index.html
   (autônomo/começando -> equipe própria -> escritório consolidado). Ajustável se o Jardel
   quiser outro corte de funcionários por plano. */
const PLANS = {
  essencial: {
    name: "Advocont Essencial",
    limite: 30000,
    notasInclusas: 10,
    funcionariosConfortaveis: 1,
    preco: "R$250/mês",
    deliverables: [
      "Contabilidade completa do escritório",
      "10 notas de honorários inclusas/mês",
      "Atendimento por e-mail, WhatsApp e aplicativo web e mobile",
      "Abertura de sociedade sem custo",
    ],
  },
  estrategico: {
    name: "Advocont Estratégico",
    limite: 40000,
    notasInclusas: 40,
    funcionariosConfortaveis: 4,
    preco: "R$350/mês",
    deliverables: [
      "Tudo do plano Essencial",
      "40 notas de honorários inclusas/mês",
      "Certificado digital gratuito (1x/ano)",
      "Atendimento por e-mail, WhatsApp e aplicativo web e mobile",
    ],
  },
  prime: {
    name: "Advocont Prime",
    limite: 100000,
    notasInclusas: Infinity,
    funcionariosConfortaveis: Infinity,
    preco: "R$550/mês",
    deliverables: [
      "Tudo do plano Estratégico",
      "Notas de honorários ilimitadas",
      "Gerente de conta dedicado",
      "Reunião de consultoria tributária mensal",
      "Folha de pagamento — 2 colaboradores inclusos",
    ],
  },
};

const PLAN_ORDER = ["essencial", "estrategico", "prime"];

function recommendPlan(faturamentoMensal) {
  if (faturamentoMensal <= PLANS.essencial.limite) return "essencial";
  if (faturamentoMensal <= PLANS.estrategico.limite) return "estrategico";
  return "prime";
}

/* Caminho "ainda não tenho CNPJ": considera faturamento, funcionários e notas —
   o plano recomendado é o mais exigente entre os três critérios (nunca "arredonda pra baixo"). */
function menorIndicePlanoQueAtende(getLimite, valor) {
  const idx = PLAN_ORDER.findIndex((key) => valor <= getLimite(PLANS[key]));
  return idx === -1 ? PLAN_ORDER.length - 1 : idx;
}
function recommendPlanCompleto(faturamentoMensal, funcionarios, notas) {
  const idxFaturamento = menorIndicePlanoQueAtende((p) => p.limite, faturamentoMensal);
  const idxNotas = menorIndicePlanoQueAtende((p) => p.notasInclusas, notas);
  const idxFuncionarios = menorIndicePlanoQueAtende((p) => p.funcionariosConfortaveis, funcionarios);
  return PLAN_ORDER[Math.max(idxFaturamento, idxNotas, idxFuncionarios)];
}

/* ---------- Simulação tributária (estimativa — ver aviso na tela) ----------
   RBT12 aproximado como faturamento do último mês x 12.
   ISS assumido em 5% (teto mais comum) na falta da cidade do escritório. */
const SIMPLES_ANEXO_IV = [
  { limite: 180000, aliquota: 0.045, deduzir: 0 },
  { limite: 360000, aliquota: 0.09, deduzir: 8100 },
  { limite: 720000, aliquota: 0.102, deduzir: 12420 },
  { limite: 1800000, aliquota: 0.14, deduzir: 39780 },
  { limite: 3600000, aliquota: 0.22, deduzir: 183780 },
  { limite: 4800000, aliquota: 0.33, deduzir: 828000 },
];

function calcSimplesAnexoIV(faturamentoMensal) {
  const rbt12 = faturamentoMensal * 12;
  const faixa = SIMPLES_ANEXO_IV.find((f) => rbt12 <= f.limite) || SIMPLES_ANEXO_IV[SIMPLES_ANEXO_IV.length - 1];
  const aliquotaEfetiva = Math.max(0, (rbt12 * faixa.aliquota - faixa.deduzir) / rbt12);
  const anual = rbt12 * aliquotaEfetiva;
  return { mensal: anual / 12, anual, aliquotaEfetiva };
}

function calcLucroPresumido(faturamentoMensal) {
  const ISS_ASSUMIDO = 0.05;
  const base = faturamentoMensal * 0.32;
  const irpj = base * 0.15 + (base > 20000 ? (base - 20000) * 0.1 : 0);
  const csll = base * 0.09;
  const pis = faturamentoMensal * 0.0065;
  const cofins = faturamentoMensal * 0.03;
  const iss = faturamentoMensal * ISS_ASSUMIDO;
  const mensal = irpj + csll + pis + cofins + iss;
  return { anual: mensal * 12, mensal };
}

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/* ---------- Máscaras de campo ---------- */
function formatPhoneBR(digits) {
  digits = digits.slice(0, 11);
  if (!digits.length) return "";
  if (digits.length <= 2) return "(" + digits;
  if (digits.length <= 6) return "(" + digits.slice(0, 2) + ") " + digits.slice(2);
  if (digits.length <= 10) return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 6) + "-" + digits.slice(6);
  return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 7) + "-" + digits.slice(7);
}
function attachPhoneMask(input) {
  if (!input) return;
  input.setAttribute("maxlength", "15");
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("placeholder", "(11) 91234-5678");
  input.addEventListener("input", () => {
    input.value = formatPhoneBR(input.value.replace(/\D/g, ""));
  });
}

function formatCNPJ(digits) {
  digits = digits.slice(0, 14);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += "." + digits.slice(2, 5);
  if (digits.length > 5) out += "." + digits.slice(5, 8);
  if (digits.length > 8) out += "/" + digits.slice(8, 12);
  if (digits.length > 12) out += "-" + digits.slice(12, 14);
  return out;
}
function attachCNPJMask(input) {
  if (!input) return;
  input.setAttribute("maxlength", "18");
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("placeholder", "00.000.000/0000-00");
  input.addEventListener("input", () => {
    input.value = formatCNPJ(input.value.replace(/\D/g, ""));
  });
}

function attachCurrencyMask(input) {
  if (!input) return;
  input.setAttribute("inputmode", "decimal");
  input.setAttribute("placeholder", "R$ 0,00");
  input.dataset.rawValue = "0";
  input.addEventListener("input", () => {
    let digits = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    digits = digits.slice(0, 12);
    if (!digits) {
      input.value = "";
      input.dataset.rawValue = "0";
      return;
    }
    const reais = parseInt(digits, 10) / 100;
    input.value = reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    input.dataset.rawValue = String(reais);
  });
}

/* ---------- Popup de saída ----------
   Dispara no mouseleave por cima da janela (padrão de "exit-intent" em desktop).
   Não existe gatilho confiável em mobile, então em telas touch simplesmente não aparece.
   Uma vez por sessão; ausente em formulario.html (o markup do modal não existe lá). */
function initExitIntent() {
  const overlay = document.getElementById("exit-modal");
  if (!overlay) return;
  if (sessionStorage.getItem("advocont_exit_shown")) return;

  let triggered = false;
  function showModal() {
    if (triggered) return;
    triggered = true;
    overlay.hidden = false;
    sessionStorage.setItem("advocont_exit_shown", "1");
    document.removeEventListener("mouseleave", onLeave);
  }
  function onLeave(e) {
    if (e.clientY <= 0) showModal();
  }
  function hideModal() {
    overlay.hidden = true;
  }

  attachPhoneMask(overlay.querySelector('input[name="telefone"]'));

  document.addEventListener("mouseleave", onLeave);
  overlay.querySelector(".modal-close")?.addEventListener("click", hideModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hideModal();
  });

  const form = overlay.querySelector("form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = form.querySelector(".form-status");
    const btn = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    const nome = fd.get("nome");
    btn.disabled = true;
    status.textContent = "Enviando...";
    status.className = "form-status visible is-sending";
    try {
      await submitLead(
        { nome, telefone: fd.get("telefone"), email: fd.get("email"), origem: "Popup de saída — advocont.com" },
        `Contato via pop-up - ${nome}`
      );
      form.hidden = true;
      overlay.querySelector(".form-success").hidden = false;
    } catch (err) {
      status.textContent = "Não foi possível enviar agora. Tente novamente ou chame no WhatsApp.";
      status.className = "form-status visible is-error";
      btn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", initExitIntent);
