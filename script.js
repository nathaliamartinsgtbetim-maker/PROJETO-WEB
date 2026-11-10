/*
 * Meu Kanban — login (demonstração, somente front-end) + quadro de tarefas.
 * Credenciais de teste:  admin  (ou admin@meukanban.com)  /  123456
 * ATENÇÃO: sem servidor, os dados de acesso ficam visíveis no navegador.
 * Para uso real, a validação deve ser feita em um back-end.
 */

/* ============ 1. Autenticação ============ */
const Auth = (() => {
  "use strict";

  const SESSION_KEY = "meu-kanban-sessao";
  const USERS = [
    { username: "admin", email: "admin@meukanban.com", password: "123456", name: "Administrador" }
  ];

  function isLoggedIn() {
    try {
      return sessionStorage.getItem(SESSION_KEY) !== null;
    } catch {
      return false;
    }
  }

  function login(identifier, password) {
    const id = identifier.trim().toLowerCase();
    const user = USERS.find(
      (u) => (u.username === id || u.email === id) && u.password === password
    );
    if (!user) return { ok: false, reason: "invalid" };

    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: user.username, name: user.name }));
      return { ok: true };
    } catch {
      return { ok: false, reason: "storage" };
    }
  }

  function logout() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* sem armazenamento, nada a limpar */
    }
  }

  return { isLoggedIn, login, logout };
})();

/* ============ 2. Navegação entre telas + login ============ */
(() => {
  "use strict";

  const views = {
    inicio: { id: "view-home", title: "Meu Kanban" },
    login: { id: "view-login", title: "Entrar — Meu Kanban" },
    quadro: { id: "view-app", title: "Meu quadro — Meu Kanban" }
  };

  const form = document.querySelector("#login-form");
  const identifierInput = document.querySelector("#identifier");
  const passwordInput = document.querySelector("#password");
  const toggleButton = document.querySelector("#toggle-password");
  const submitButton = document.querySelector("#submit-button");
  const formMessage = document.querySelector("#form-message");

  function route() {
    let name = location.hash.slice(1);
    if (!views[name]) name = "inicio";
    const logged = Auth.isLoggedIn();

    // Área restrita só para quem está autenticado (RF08)
    if (name === "quadro" && !logged) {
      location.replace("#login");
      return;
    }
    if (name === "login" && logged) {
      location.replace("#quadro");
      return;
    }

    for (const [key, view] of Object.entries(views)) {
      document.getElementById(view.id).hidden = key !== name;
    }

    document.querySelectorAll("[data-show]").forEach((el) => {
      el.hidden = (el.dataset.show === "logged-in") !== logged;
    });

    document.title = views[name].title;
    if (name === "login") resetLoginForm();
    window.scrollTo(0, 0);
  }

  // Sair da conta (RF09)
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-logout]")) return;
    Auth.logout();
    location.hash = "login";
    route();
  });

  /* ----- Login ----- */
  function setFieldError(input, message) {
    const error = document.querySelector(`#${input.id}-error`);
    error.textContent = message;
    error.hidden = !message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function showMessage(text, type) {
    formMessage.textContent = text;
    formMessage.className = `form-message is-${type}`;
    formMessage.hidden = false;
  }

  function clearMessage() {
    formMessage.hidden = true;
    formMessage.textContent = "";
  }

  function resetLoginForm() {
    form.reset();
    setFieldError(identifierInput, "");
    setFieldError(passwordInput, "");
    clearMessage();
    passwordInput.type = "password";
    toggleButton.textContent = "Mostrar";
    toggleButton.setAttribute("aria-pressed", "false");
    submitButton.disabled = false;
  }

  // Mostrar / ocultar senha (RF07)
  toggleButton.addEventListener("click", () => {
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    toggleButton.textContent = show ? "Ocultar" : "Mostrar";
    toggleButton.setAttribute("aria-pressed", String(show));
    passwordInput.focus();
  });

  identifierInput.addEventListener("input", () => {
    setFieldError(identifierInput, "");
    clearMessage();
  });

  passwordInput.addEventListener("input", () => {
    setFieldError(passwordInput, "");
    clearMessage();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessage();

    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;

    // Validação dos campos obrigatórios (RF05)
    setFieldError(identifierInput, identifier ? "" : "Informe seu e-mail ou nome de usuário.");
    setFieldError(passwordInput, password ? "" : "Informe sua senha.");

    if (!identifier) return identifierInput.focus();
    if (!password) return passwordInput.focus();

    // Autenticação (RF04, RF06)
    const result = Auth.login(identifier, password);

    if (!result.ok) {
      const text = result.reason === "storage"
        ? "Não foi possível iniciar a sessão. Verifique se o navegador permite armazenamento e tente novamente."
        : "E-mail, usuário ou senha incorretos. Confira os dados e tente novamente.";
      showMessage(text, "error");
      passwordInput.select();
      return;
    }

    showMessage("Login realizado com sucesso! Redirecionando...", "success");
    submitButton.disabled = true;
    setTimeout(() => {
      location.hash = "quadro";
      route();
    }, 600);
  });

  window.addEventListener("hashchange", route);
  route();
})();

/* ============ 3. Quadro Kanban ============ */
(() => {
  "use strict";

  const STORAGE_KEY = "meu-kanban-tarefas-v1";
  const statuses = ["todo", "doing", "done"];
  const examples = [
    {
      id: "exemplo-1",
      title: "Planejar a semana",
      description: "Definir prioridades e organizar as próximas entregas.",
      status: "todo"
    },
    {
      id: "exemplo-2",
      title: "Revisar referências do projeto",
      description: "Separar materiais e anotações importantes.",
      status: "doing"
    }
  ];

  let tasks = [];
  let draggedCard = null;
  let dropCommitted = false;

  const board = document.querySelector("#board");
  const dialog = document.querySelector("#task-dialog");
  const form = document.querySelector("#task-form");
  const titleInput = document.querySelector("#task-title-input");
  const descriptionInput = document.querySelector("#task-description-input");
  const storageNotice = document.querySelector("#storage-notice");

  function isValidTask(task) {
    return task !== null
      && typeof task === "object"
      && typeof task.id === "string"
      && task.id.length > 0
      && typeof task.title === "string"
      && typeof task.description === "string"
      && statuses.includes(task.status);
  }

  function loadTasks() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved === null) {
        tasks = examples.map((task) => ({ ...task }));
        return;
      }

      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(isValidTask)) {
        throw new Error("Os dados salvos não têm o formato esperado.");
      }

      const ids = new Set(parsed.map((task) => task.id));
      if (ids.size !== parsed.length) {
        throw new Error("Foram encontrados identificadores duplicados.");
      }

      tasks = parsed;
    } catch (error) {
      tasks = examples.map((task) => ({ ...task }));
      storageNotice.hidden = false;
      console.warn("Não foi possível carregar as tarefas salvas.", error);
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      storageNotice.hidden = true;
    } catch (error) {
      storageNotice.hidden = false;
      console.warn("Não foi possível salvar as tarefas.", error);
    }
  }

  function createTaskCard(task) {
    const card = document.createElement("article");
    card.className = "task-card";
    card.draggable = true;
    card.tabIndex = 0;
    card.dataset.taskId = task.id;
    card.setAttribute("aria-label", `Tarefa: ${task.title}. Arraste para mover entre colunas.`);

    const title = document.createElement("h3");
    title.className = "task-title";
    title.textContent = task.title;

    const description = document.createElement("p");
    description.className = "task-description";
    description.textContent = task.description;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const statusIndex = statuses.indexOf(task.status);
    const previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.dataset.action = "previous";
    previousButton.textContent = "←";
    previousButton.disabled = statusIndex === 0;
    previousButton.setAttribute("aria-label", `Mover "${task.title}" para a coluna anterior`);
    previousButton.title = "Mover para a coluna anterior";

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.dataset.action = "next";
    nextButton.textContent = "→";
    nextButton.disabled = statusIndex === statuses.length - 1;
    nextButton.setAttribute("aria-label", `Mover "${task.title}" para a próxima coluna`);
    nextButton.title = "Mover para a próxima coluna";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.dataset.action = "delete";
    deleteButton.textContent = "Excluir";
    deleteButton.setAttribute("aria-label", `Excluir a tarefa "${task.title}"`);

    actions.append(previousButton, nextButton, deleteButton);
    card.append(title, description, actions);
    return card;
  }

  function render() {
    for (const status of statuses) {
      const list = board.querySelector(`[data-list="${status}"]`);
      const columnTasks = tasks.filter((task) => task.status === status);
      const fragment = document.createDocumentFragment();

      for (const task of columnTasks) {
        fragment.append(createTaskCard(task));
      }

      list.replaceChildren(fragment);

      const count = board.querySelector(`[data-count="${status}"]`);
      count.textContent = String(columnTasks.length);
      count.setAttribute(
        "aria-label",
        `${columnTasks.length} ${columnTasks.length === 1 ? "tarefa" : "tarefas"}`
      );
      board.querySelector(`[data-empty="${status}"]`).hidden = columnTasks.length > 0;
    }
  }

  function createTask(title, description) {
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `tarefa-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    tasks.unshift({ id, title, description, status: "todo" });
    saveTasks();
    render();
  }

  function moveTask(taskId, direction) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    const nextIndex = statuses.indexOf(task.status) + direction;
    if (nextIndex < 0 || nextIndex >= statuses.length) return;

    task.status = statuses[nextIndex];
    saveTasks();
    render();
  }

  function deleteTask(taskId) {
    tasks = tasks.filter((task) => task.id !== taskId);
    saveTasks();
    render();
  }

  board.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const card = button.closest(".task-card");
    if (!card) return;

    const { taskId } = card.dataset;
    if (button.dataset.action === "previous") {
      moveTask(taskId, -1);
    } else if (button.dataset.action === "next") {
      moveTask(taskId, 1);
    } else if (button.dataset.action === "delete") {
      deleteTask(taskId);
    }
  });

  board.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".task-card");
    if (!card || event.target.closest("button")) {
      event.preventDefault();
      return;
    }

    draggedCard = card;
    dropCommitted = false;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.taskId);
  });

  board.addEventListener("dragover", (event) => {
    const column = event.target.closest(".kanban-column");
    if (!column || !draggedCard) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    column.classList.add("is-drag-over");
  });

  board.addEventListener("dragleave", (event) => {
    const column = event.target.closest(".kanban-column");
    if (column && !column.contains(event.relatedTarget)) {
      column.classList.remove("is-drag-over");
    }
  });

  board.addEventListener("drop", (event) => {
    const column = event.target.closest(".kanban-column");
    if (!column || !draggedCard) return;

    event.preventDefault();
    const targetList = column.querySelector(".task-list");
    const targetCard = event.target.closest(".task-card");

    if (targetCard && targetCard !== draggedCard) {
      const bounds = targetCard.getBoundingClientRect();
      const insertAfter = event.clientY > bounds.top + bounds.height / 2;
      targetList.insertBefore(draggedCard, insertAfter ? targetCard.nextSibling : targetCard);
    } else {
      targetList.append(draggedCard);
    }

    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    tasks = statuses.flatMap((status) => {
      const list = board.querySelector(`[data-list="${status}"]`);
      return Array.from(list.children, (card) => {
        const task = tasksById.get(card.dataset.taskId);
        return task ? { ...task, status } : null;
      }).filter(Boolean);
    });

    dropCommitted = true;
    draggedCard = null;
    saveTasks();
    render();
  });

  board.addEventListener("dragend", () => {
    draggedCard = null;
    board.querySelectorAll(".is-drag-over").forEach((column) => {
      column.classList.remove("is-drag-over");
    });

    if (!dropCommitted) render();
    dropCommitted = false;
  });

  document.querySelector("#add-task-button").addEventListener("click", () => {
    dialog.showModal();
    titleInput.focus();
  });

  document.querySelector("#cancel-button").addEventListener("click", () => {
    dialog.close();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    form.reset();
    titleInput.setCustomValidity("");
  });

  titleInput.addEventListener("input", () => titleInput.setCustomValidity(""));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();

    if (!title) {
      titleInput.setCustomValidity("Informe um título para a tarefa.");
      titleInput.reportValidity();
      return;
    }

    createTask(title, descriptionInput.value.trim());
    dialog.close();
  });

  loadTasks();
  render();
})();
