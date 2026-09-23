/* Lógica do formulário de contratação (antes inline em formulario.html). */
  const planoInteresse = getQueryParam("plano");
  const state = {};
  const STEP_ORDER = { contato: 1, cnpj: 2, "dados-a": 3, "resultado-a": 4, "dados-b": 3, "resultado-b": 4, confirmacao: 5 };
  const TOTAL_STEPS = 5;

  if (planoInteresse && PLANS[planoInteresse]) {
    document.getElementById("wizard-plan-chip").innerHTML =
      '<span class="plan-chip">Plano escolhido: ' + PLANS[planoInteresse].name + " · " + PLANS[planoInteresse].preco + "</span>";
  }

  /* Bloco extra do resultado: faturamento acima dos planos ou plano recomendado diferente do escolhido. */
  function avisoPlano(faturamento, planoKey) {
    if (faturamento > LIMITE_PLANOS) {
      return '<p class="pricing-note"><strong>Seu faturamento está acima de R$ 100 mil/mês.</strong> Para esse porte a Advocont monta uma proposta personalizada, e o especialista apresenta os valores na conversa.</p>';
    }
    if (planoInteresse && PLANS[planoInteresse] && planoInteresse !== planoKey) {
      return '<p class="pricing-note">Você escolheu o ' + PLANS[planoInteresse].name + ', mas pelo perfil informado o ' + PLANS[planoKey].name + ' é o mais adequado. O especialista confirma com você.</p>';
    }
    return "";
  }

  /* Botão da tela final: abre o WhatsApp com a mensagem montada a partir do formulário. */
  function prepararWhatsAppFinal(caminho, texto) {
    const btn = document.getElementById("confirm-whatsapp");
    btn.href = linkWhatsApp(texto);
    btn.onclick = () => track("whatsapp_click", { caminho: caminho, origem: "formulario_final" });
  }

  function mensagemCNPJ(nome, regime, faturamentoTxt, plano) {
    const nomes = { simples: "Simples Nacional", presumido: "Lucro Presumido" };
    const melhor = state.simplesAnual <= state.presumidoAnual ? "simples" : "presumido";
    const diferenca = Math.abs(state.presumidoAnual - state.simplesAnual);
    const atual = regime === "Simples Nacional" ? "simples" : regime === "Lucro Presumido" ? "presumido" : null;
    let economia;
    if (atual && atual !== melhor) {
      economia = "A simulação apontou uma economia estimada de " + formatBRL(diferenca) + " por ano migrando para o " + nomes[melhor] + ". ";
    } else if (atual) {
      economia = "A simulação indicou que já estou no regime mais vantajoso, e quero saber onde mais dá para economizar. ";
    } else {
      economia = "A simulação indicou o " + nomes[melhor] + " como o mais vantajoso, com diferença estimada de " + formatBRL(diferenca) + " por ano. ";
    }
    return "Olá, equipe Advocont! Sou " + nome + " e acabei de fazer a simulação no site. Meu escritório já tem CNPJ, está " +
      (atual ? "no " + regime : "com regime a confirmar") + " e fatura cerca de " + faturamentoTxt + " por mês. " + economia +
      "Quero seguir com o " + plano + ". Podemos conversar?";
  }

  function mensagemAbertura(nome, cidade, uf, plano) {
    return "Olá, equipe Advocont! Sou " + nome + " e vou abrir minha sociedade de advocacia em " + cidade + "/" + uf +
      ". Quero começar do jeito certo: regularizado e no enquadramento tributário ideal desde o primeiro honorário. O site indicou o " +
      plano + ". Podem me passar os próximos passos?";
  }

  /* Entrada direta por caminho (?caminho=cnpj ou ?caminho=abertura), vinda dos botões da home. */
  const caminhoDireto = { cnpj: "dados-a", abertura: "dados-b" }[getQueryParam("caminho")];

  attachPhoneMask(document.getElementById("telefone"));
  attachCNPJMask(document.getElementById("a-cnpj"));
  attachCurrencyMask(document.getElementById("a-faturamento"));
  attachCurrencyMask(document.getElementById("b-faturamento"));

  function goTo(stepName) {
    document.querySelectorAll(".wizard-step").forEach((el) => el.classList.remove("active"));
    document.querySelector('.wizard-step[data-step="' + stepName + '"]').classList.add("active");
    document.getElementById("wizard-progress").textContent = "Etapa " + STEP_ORDER[stepName] + " de " + TOTAL_STEPS;
  }

  function validateStep(stepEl) {
    let valid = true;
    stepEl.querySelectorAll("input[required], select[required]").forEach((input) => {
      const field = input.closest(".field");
      if (!isFieldValid(input)) {
        field?.classList.add("invalid");
        valid = false;
      } else {
        field?.classList.remove("invalid");
      }
    });
    return valid;
  }

  document.querySelectorAll("[data-next]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = btn.closest(".wizard-step");
      if (!validateStep(step)) return;
      goTo(caminhoDireto || "cnpj");
    });
  });

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => goTo(btn.dataset.back));
  });

  document.getElementById("choice-sim").addEventListener("click", () => goTo("dados-a"));
  document.getElementById("choice-nao").addEventListener("click", () => goTo("dados-b"));

  document.querySelector('[data-calc="a"]').addEventListener("click", () => {
    const step = document.querySelector('.wizard-step[data-step="dados-a"]');
    if (!validateStep(step)) return;
    renderResultadoA();
    goTo("resultado-a");
  });

  document.querySelector('[data-calc="b"]').addEventListener("click", () => {
    const step = document.querySelector('.wizard-step[data-step="dados-b"]');
    if (!validateStep(step)) return;
    renderResultadoB();
    goTo("resultado-b");
  });

  function renderResultadoA() {
    const faturamento = parseFloat(document.getElementById("a-faturamento").dataset.rawValue || "0");
    const simples = calcSimplesAnexoIV(faturamento);
    const presumido = calcLucroPresumido(faturamento);
    const planoKey = recommendPlan(faturamento);
    const plano = PLANS[planoKey];
    const melhor = simples.anual <= presumido.anual ? "simples" : "presumido";

    document.getElementById("resultado-a-content").innerHTML =
      '<div class="compare-result">' +
        '<div class="regime-card ' + (melhor === "simples" ? "better" : "") + '">' +
          '<p class="regime-name">Simples Nacional (Anexo IV)</p>' +
          '<p class="regime-value">' + formatBRL(simples.mensal) + '<span class="regime-unit">/mês</span></p>' +
          '<p class="regime-annual">' + formatBRL(simples.anual) + '/ano</p>' +
        '</div>' +
        '<div class="regime-card ' + (melhor === "presumido" ? "better" : "") + '">' +
          '<p class="regime-name">Lucro Presumido</p>' +
          '<p class="regime-value">' + formatBRL(presumido.mensal) + '<span class="regime-unit">/mês</span></p>' +
          '<p class="regime-annual">' + formatBRL(presumido.anual) + '/ano</p>' +
        '</div>' +
      '</div>' +
      '<p class="pricing-note">Valores estimados com base em tabelas padrão. A Advocont confirma o enquadramento exato na consultoria. No Simples Nacional, o INSS patronal (CPP) é recolhido à parte.</p>' +
      '<div class="recommend-card">' +
        '<p class="eyebrow">Plano recomendado</p>' +
        '<p class="plan-name">' + plano.name + " · " + plano.preco + '</p>' +
        '<ul>' + plano.deliverables.map((d) => '<li><span class="tick">✓</span> ' + d + '</li>').join("") + '</ul>' +
      '</div>' + avisoPlano(faturamento, planoKey);

    state.simplesAnual = simples.anual;
    state.presumidoAnual = presumido.anual;
    state.planoRecomendado = plano.name;
  }

  function renderResultadoB() {
    const faturamento = parseFloat(document.getElementById("b-faturamento").dataset.rawValue || "0");
    const funcionarios = parseInt(document.getElementById("b-funcionarios").value, 10) || 0;
    const notas = parseInt(document.getElementById("b-notas").value, 10) || 0;
    const planoKey = recommendPlanCompleto(faturamento, funcionarios, notas);
    const plano = PLANS[planoKey];

    document.getElementById("resultado-b-content").innerHTML =
      '<div class="recommend-card">' +
        '<p class="eyebrow">Plano recomendado para o seu escritório</p>' +
        '<p class="plan-name">' + plano.name + " · " + plano.preco + '</p>' +
        '<ul>' + plano.deliverables.map((d) => '<li><span class="tick">✓</span> ' + d + '</li>').join("") + '</ul>' +
        (custoPlano(planoKey, funcionarios, notas) > plano.valor
          ? '<p class="pricing-note">Custo mensal estimado com folhas e notas excedentes: <strong>' + formatBRL(custoPlano(planoKey, funcionarios, notas)) + '</strong></p>'
          : '') +
      '</div>' + avisoPlano(faturamento, planoKey) +
      '<p class="pricing-note">Estimativa com base no faturamento, número de funcionários e notas informados. O especialista confirma a melhor opção na consultoria.</p>';

    state.planoRecomendado = plano.name;
  }

  document.getElementById("concorda-a").addEventListener("change", (e) => {
    document.getElementById("btn-enviar-a").disabled = !e.target.checked;
  });
  document.getElementById("concorda-b").addEventListener("change", (e) => {
    document.getElementById("btn-enviar-b").disabled = !e.target.checked;
  });

  document.getElementById("form-a").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-enviar-a");
    const status = e.target.querySelector(".form-status");
    const nome = document.getElementById("nome").value;
    const payload = {
      nome,
      telefone: document.getElementById("telefone").value,
      email: document.getElementById("email").value,
      plano_de_interesse: (planoInteresse && PLANS[planoInteresse]) ? PLANS[planoInteresse].name : "(não informado)",
      caminho: "Já possui CNPJ — transferência de contabilidade",
      cnpj: document.getElementById("a-cnpj").value,
      regime_atual: document.getElementById("a-regime").value,
      faturamento_ultimo_mes: document.getElementById("a-faturamento").value,
      simulacao_simples_nacional_anual: formatBRL(state.simplesAnual || 0),
      simulacao_lucro_presumido_anual: formatBRL(state.presumidoAnual || 0),
      plano_recomendado: state.planoRecomendado || "",
    };
    btn.disabled = true;
    status.textContent = "Enviando...";
    status.className = "form-status visible is-sending";
    try {
      await submitLead(payload, "Transferência de contabilidade - " + nome);
      prepararWhatsAppFinal("cnpj", mensagemCNPJ(nome, payload.regime_atual, payload.faturamento_ultimo_mes, payload.plano_recomendado));
      goTo("confirmacao");
    } catch (err) {
      status.textContent = "Não foi possível enviar agora. Tente novamente ou chame no WhatsApp.";
      status.className = "form-status visible is-error";
      btn.disabled = false;
    }
  });

  document.getElementById("form-b").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-enviar-b");
    const status = e.target.querySelector(".form-status");
    const nome = document.getElementById("nome").value;
    const payload = {
      nome,
      telefone: document.getElementById("telefone").value,
      email: document.getElementById("email").value,
      plano_de_interesse: (planoInteresse && PLANS[planoInteresse]) ? PLANS[planoInteresse].name : "(não informado)",
      caminho: "Ainda não possui CNPJ — abertura de novo CNPJ",
      cidade: document.getElementById("b-cidade").value,
      uf: document.getElementById("b-uf").value,
      faturamento_estimado: document.getElementById("b-faturamento").value,
      numero_de_funcionarios: document.getElementById("b-funcionarios").value,
      notas_no_primeiro_mes: document.getElementById("b-notas").value,
      plano_recomendado: state.planoRecomendado || "",
    };
    btn.disabled = true;
    status.textContent = "Enviando...";
    status.className = "form-status visible is-sending";
    try {
      await submitLead(payload, "Abertura de um novo CNPJ - " + nome);
      prepararWhatsAppFinal("abertura", mensagemAbertura(nome, payload.cidade, payload.uf, payload.plano_recomendado));
      goTo("confirmacao");
    } catch (err) {
      status.textContent = "Não foi possível enviar agora. Tente novamente ou chame no WhatsApp.";
      status.className = "form-status visible is-error";
      btn.disabled = false;
    }
  });
