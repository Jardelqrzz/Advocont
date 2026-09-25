/* Lógica do formulário de contratação (antes inline em formulario.html). */
  const planoInteresse = getQueryParam("plano");
  // Botão do site que trouxe o lead (vem da janela "Falar com especialista")
  const origemLead = "Formulário" + (getQueryParam("origem") ? " (botão " + getQueryParam("origem") + ")" : "") + " — advocont.com";
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

  /* Mensagens do resultado "já tenho CNPJ": pedir horário para a análise ou só conversar. */
  function mensagemCNPJ(nome, economiaAnual, agendar) {
    const primeiroNome = nome.trim().split(/\s+/)[0];
    return "Olá, equipe Advocont! Sou " + primeiroNome + " e fiz a estimativa no site: meu escritório pode economizar até " +
      formatBRL(economiaAnual) + " por ano em impostos. " +
      (agendar
        ? "Quero agendar a análise para confirmar esse valor. Quais horários vocês têm disponíveis?"
        : "Quero entender como chegar nesse resultado. Podemos conversar?");
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
  attachCurrencyMask(document.getElementById("a-imposto"));

  const impostoInput = document.getElementById("a-imposto");
  document.getElementById("a-imposto-nao-sei").addEventListener("change", (e) => {
    const naoSei = e.target.checked;
    impostoInput.required = !naoSei;
    impostoInput.disabled = naoSei;
    if (naoSei) { impostoInput.value = ""; impostoInput.dataset.rawValue = "0"; }
    const field = impostoInput.closest(".field");
    field.classList.toggle("desativado", naoSei);
    field.classList.remove("invalid");
  });
  attachCurrencyMask(document.getElementById("b-faturamento"));

  let caminhoAtual = caminhoDireto === "dados-a" ? "a" : caminhoDireto === "dados-b" ? "b" : null;
  function goTo(stepName) {
    document.querySelectorAll(".wizard-step").forEach((el) => el.classList.remove("active"));
    document.querySelector('.wizard-step[data-step="' + stepName + '"]').classList.add("active");
    // O caminho "já tenho CNPJ" termina no resultado: são 3 etapas até a estimativa
    if (stepName === "dados-a") caminhoAtual = "a";
    else if (stepName === "dados-b") caminhoAtual = "b";
    const total = caminhoAtual === "a" ? 3 : TOTAL_STEPS;
    document.getElementById("wizard-progress").textContent =
      stepName === "resultado-a" ? "Sua estimativa" : "Etapa " + STEP_ORDER[stepName] + " de " + total;
  }

  if (caminhoAtual === "a") document.getElementById("wizard-progress").textContent = "Etapa 1 de 3";

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
    const regime = document.getElementById("a-regime").value;
    const naoSei = document.getElementById("a-imposto-nao-sei").checked;
    const impostoInformado = naoSei ? null : parseFloat(impostoInput.dataset.rawValue || "0");
    const est = estimarEconomiaISS(faturamento, regime, impostoInformado);
    const acimaDosPlanos = faturamento > LIMITE_PLANOS;
    const planoKey = recommendPlan(faturamento);
    const plano = PLANS[planoKey];
    const vezes = est.issAnual / (plano.valor * 12);

    document.getElementById("resultado-a-content").innerHTML =
      '<div class="economia-card">' +
        '<p class="economia-rotulo">Seu escritório pode economizar até</p>' +
        '<p class="economia-valor">' + formatBRL(est.issAnual) + ' por ano</p>' +
        '<p class="economia-mensal">cerca de ' + formatBRL(est.issMensal) + ' por mês em impostos</p>' +
      '</div>' +
      '<div class="recommend-card">' +
        '<p class="eyebrow">Plano indicado</p>' +
        (acimaDosPlanos
          ? '<p class="plan-name">Proposta personalizada</p><p class="pricing-note">Acima de R$ 100 mil por mês, o especialista monta a proposta na análise.</p>'
          : '<p class="plan-name">' + plano.name + " · " + plano.preco + '</p>' +
            (vezes >= 1 ? '<p class="pricing-note">A economia estimada paga o plano <strong>' + vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + ' vezes</strong>.</p>' : '')) +
      '</div>' +
      '<p class="economia-aviso">Estimativa baseada no faturamento e nos impostos informados pelo seu escritório. ' +
        (naoSei ? 'Como o imposto não foi informado, usamos o valor esperado para o seu faturamento. ' : '') +
        'O valor exato é confirmado na reunião de análise, sem compromisso.</p>';

    const nome = document.getElementById("nome").value;
    document.getElementById("a-agendar").href = linkWhatsApp(mensagemCNPJ(nome, est.issAnual, true));
    document.getElementById("a-whatsapp").href = linkWhatsApp(mensagemCNPJ(nome, est.issAnual, false));

    enviarLeadA({
      nome,
      telefone: document.getElementById("telefone").value,
      email: document.getElementById("email").value,
      plano_de_interesse: (planoInteresse && PLANS[planoInteresse]) ? PLANS[planoInteresse].name : "(não informado)",
      origem: origemLead,
      caminho: "Já possui CNPJ — estimativa de economia",
      cnpj: document.getElementById("a-cnpj").value,
      regime_atual: regime,
      faturamento_medio_mensal: formatBRL(faturamento),
      imposto_informado: naoSei ? "não sabe" : formatBRL(impostoInformado),
      imposto_usado_no_calculo: formatBRL(est.impostoBase) + " (" + est.origem + ")",
      imposto_esperado_pela_tabela: formatBRL(est.impostoEsperado),
      parcela_de_iss_no_imposto: (est.fatiaIss * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%",
      economia_estimada_mensal: formatBRL(est.issMensal),
      economia_estimada_anual: formatBRL(est.issAnual),
      plano_recomendado: acimaDosPlanos ? "Proposta personalizada" : plano.name,
    });
  }

  /* O lead sai quando o resultado aparece: o contato já foi pedido na 1ª etapa.
     Refazer a estimativa com os mesmos dados não duplica o envio. */
  let ultimoEnvioA = "";
  function enviarLeadA(payload) {
    const chave = JSON.stringify(payload);
    if (chave === ultimoEnvioA) return;
    ultimoEnvioA = chave;
    submitLead(payload, "Estimativa de economia - " + payload.nome + " - " + payload.economia_estimada_anual + "/ano").catch(() => {
      ultimoEnvioA = "";
    });
  }

  ["a-agendar", "a-whatsapp"].forEach((id) =>
    document.getElementById(id).addEventListener("click", () =>
      track("whatsapp_click", { caminho: "cnpj", origem: id === "a-agendar" ? "resultado_agendar" : "resultado_whatsapp" })
    )
  );

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

  document.getElementById("concorda-b").addEventListener("change", (e) => {
    document.getElementById("btn-enviar-b").disabled = !e.target.checked;
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
      origem: origemLead,
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
