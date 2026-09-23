/* ---------- Web3Forms ---------- */
/* WhatsApp comercial (só dígitos, com 55 + DDD) */
const WHATSAPP_NUMERO = "558195553023";

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
  track("generate_lead", { origem: subject.split(" - ")[0] });
  return data;
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/* ---------- Dados dos planos (espelha a tabela comparativa do index.html) ----------
   ATENÇÃO: qualquer mudança de preço, limite ou benefício precisa ser feita aqui E no
   index.html (cards + tabela comparativa), senão a recomendação do formulário diverge da vitrine.
   folhasInclusas / notasInclusas = franquia do plano; o excedente custa EXCEDENTE_UNITARIO
   por folha ou nota (nota ³ da tabela). */
const EXCEDENTE_UNITARIO = 25;
const LIMITE_PLANOS = 100000; // acima disso: proposta personalizada

const PLANS = {
  essencial: {
    name: "Advocont Essencial",
    limite: 30000,
    notasInclusas: 10,
    folhasInclusas: 1,
    valor: 250,
    preco: "R$250/mês",
    deliverables: [
      "Contabilidade completa do escritório",
      "10 notas de honorários inclusas/mês",
      "1 folha de pagamento inclusa",
      "Atendimento por e-mail, WhatsApp e aplicativo web e mobile",
      "Abertura de sociedade sem custo",
    ],
  },
  estrategico: {
    name: "Advocont Estratégico",
    limite: 60000,
    notasInclusas: 60,
    folhasInclusas: 2,
    valor: 350,
    preco: "R$350/mês",
    deliverables: [
      "Tudo do plano Essencial",
      "60 notas de honorários inclusas/mês",
      "Até 2 folhas de pagamento inclusas",
      "Certificado digital com 50% de desconto (1x/ano)",
      "Consultoria tributária 1x por trimestre",
      "Abertura de sociedade sem custo",
    ],
  },
  prime: {
    name: "Advocont Prime",
    limite: 100000,
    notasInclusas: Infinity,
    folhasInclusas: 5,
    valor: 550,
    preco: "R$550/mês",
    deliverables: [
      "Tudo do plano Estratégico",
      "Notas de honorários ilimitadas",
      "Certificado digital incluso (1x/ano)",
      "Gerente de conta dedicado",
      "Reunião de consultoria tributária mensal",
      "Até 5 folhas de pagamento inclusas",
    ],
  },
};

const PLAN_ORDER = ["essencial", "estrategico", "prime"];

/* Custo mensal estimado de um plano para o perfil informado (mensalidade + excedentes). */
function custoPlano(key, funcionarios, notas) {
  const p = PLANS[key];
  const folhasExtras = Math.max(0, (funcionarios || 0) - p.folhasInclusas);
  const notasExtras = Math.max(0, (notas || 0) - p.notasInclusas);
  return p.valor + (folhasExtras + notasExtras) * EXCEDENTE_UNITARIO;
}

/* Caminho "já tenho CNPJ": só o faturamento define a faixa. */
function recommendPlan(faturamentoMensal) {
  return PLAN_ORDER.find((key) => faturamentoMensal <= PLANS[key].limite) || "prime";
}

/* Caminho "ainda não tenho CNPJ": entre os planos cuja faixa comporta o faturamento,
   recomenda o de MENOR custo mensal total (mensalidade + folhas e notas excedentes).
   Em caso de empate, fica o plano superior (mais benefícios pelo mesmo valor).
   Assim o cliente nunca é empurrado para um plano mais caro do que precisa. */
function recommendPlanCompleto(faturamentoMensal, funcionarios, notas) {
  const elegiveis = PLAN_ORDER.filter((key) => faturamentoMensal <= PLANS[key].limite);
  if (!elegiveis.length) return "prime";
  return elegiveis.reduce((melhor, key) =>
    custoPlano(key, funcionarios, notas) <= custoPlano(melhor, funcionarios, notas) ? key : melhor
  );
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

/* ---------- Validações ----------
   Usadas pelo formulário (atributo data-validate) e pelo popup de saída. */
const VALIDATORS = {
  nome(v) {
    // Nome e sobrenome, cada parte com 2+ letras
    return v.trim().split(/\s+/).filter((p) => p.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 2).length >= 2;
  },
  telefone(v) {
    const d = v.replace(/\D/g, "");
    if (d.length !== 10 && d.length !== 11) return false;
    const ddd = parseInt(d.slice(0, 2), 10);
    if (ddd < 11 || ddd > 99 || d[1] === "0") return false;
    if (d.length === 11 && d[2] !== "9") return false; // celular com 9 dígitos começa com 9
    return !/^(\d)\1+$/.test(d.slice(2));
  },
  email(v) {
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim());
  },
  cnpj(v) {
    const d = v.replace(/\D/g, "");
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const calc = (len) => {
      const pesos = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      const soma = pesos.reduce((acc, p, i) => acc + parseInt(d[i], 10) * p, 0);
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === parseInt(d[12], 10) && calc(13) === parseInt(d[13], 10);
  },
  moeda(v, input) {
    return parseFloat(input.dataset.rawValue || "0") > 0;
  },
};

function isFieldValid(input) {
  const value = String(input.value || "");
  if (input.required && !value.trim()) return false;
  if (!input.checkValidity()) return false;
  const rule = input.dataset.validate;
  if (rule && VALIDATORS[rule] && !VALIDATORS[rule](value, input)) return false;
  return true;
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
    let ok = true;
    form.querySelectorAll("input[required]").forEach((input) => {
      const valid = isFieldValid(input);
      input.closest(".field")?.classList.toggle("invalid", !valid);
      if (!valid) ok = false;
    });
    if (!ok) return;
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

/* ---------- Medição de conversão ----------
   Pronto para quando Google Analytics 4 (gtag) e/ou Meta Pixel (fbq) forem instalados:
   enquanto não existirem, as chamadas não fazem nada. */
function track(evento, dados) {
  try {
    if (typeof window.gtag === "function") window.gtag("event", evento, dados || {});
    if (typeof window.fbq === "function") {
      if (evento === "generate_lead") window.fbq("track", "Lead", dados || {});
      else if (evento === "whatsapp_click") window.fbq("track", "Contact", dados || {});
    }
    (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: evento }, dados || {}));
  } catch (e) {}
}

/* ---------- WhatsApp com dois caminhos ----------
   A mensagem é escrita na voz do advogado, pronta para ele só apertar "enviar". */
const WHATSAPP_MENSAGENS = {
  cnpj:
    "Olá, equipe Advocont! Já tenho CNPJ e quero descobrir quanto meu escritório pode economizar em impostos, dentro da lei. Podem fazer uma análise do meu caso?",
  abertura:
    "Olá, equipe Advocont! Vou abrir minha sociedade de advocacia e quero começar do jeito certo: regularizado e no enquadramento tributário ideal desde o primeiro honorário. Podem me orientar nos próximos passos?",
};

function linkWhatsApp(texto) {
  return "https://wa.me/" + WHATSAPP_NUMERO + "?text=" + encodeURIComponent(texto);
}

function abrirWhatsApp(caminho, texto, origem) {
  track("whatsapp_click", { caminho: caminho, origem: origem || "site" });
  window.open(linkWhatsApp(texto || WHATSAPP_MENSAGENS[caminho]), "_blank", "noopener");
}

/* Seletor "Já tem CNPJ?" aberto por qualquer elemento com data-whatsapp. */
function initWhatsAppChooser() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "wa-chooser";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="modal wa-chooser" role="dialog" aria-modal="true" aria-labelledby="wa-chooser-title">' +
      '<button type="button" class="modal-close" aria-label="Fechar">×</button>' +
      '<p class="eyebrow">Falar com especialista</p>' +
      '<h3 id="wa-chooser-title">Seu escritório já tem CNPJ?</h3>' +
      '<p class="lead">Assim o especialista já começa a conversa pelo que importa para você.</p>' +
      '<div class="choice-group">' +
        '<button type="button" class="choice-btn" data-wa-caminho="cnpj"><strong>Sim, já tenho CNPJ</strong><span>Quero saber quanto posso economizar em impostos.</span></button>' +
        '<button type="button" class="choice-btn" data-wa-caminho="abertura"><strong>Ainda não, vou abrir</strong><span>Quero abrir minha sociedade de advocacia regularizada.</span></button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  let origem = "site";
  const fechar = () => { overlay.hidden = true; };
  overlay.querySelector(".modal-close").addEventListener("click", fechar);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
  overlay.querySelectorAll("[data-wa-caminho]").forEach((btn) =>
    btn.addEventListener("click", () => { fechar(); abrirWhatsApp(btn.dataset.waCaminho, null, origem); })
  );
  document.querySelectorAll("[data-whatsapp]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      origem = el.dataset.whatsapp || "site";
      const menu = document.getElementById("menu-toggle");
      if (menu) menu.checked = false;
      overlay.hidden = false;
      overlay.querySelector("[data-wa-caminho]").focus();
    })
  );
}
document.addEventListener("DOMContentLoaded", initWhatsAppChooser);
