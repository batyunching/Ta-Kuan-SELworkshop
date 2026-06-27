(function () {
  const ADMIN_PASSWORD = "22725015";
  const USER_KEY = "selWorkshopUserV1";
  const LOCAL_SUBMISSION_KEY = "selWorkshopSubmissionsV1";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  const TOOLS = {
    mentor: {
      label: "導師暖心作戰手冊",
      className: "mentor"
    },
    thermometer: {
      label: "大觀課程溫度計",
      className: "thermometer"
    }
  };

  const state = {
    user: null,
    storage: null,
    storageMode: "local",
    submissions: [],
    activeTab: "api",
    showcaseFilter: "all",
    adminCategory: "all",
    adminStatus: "all",
    adminSearch: "",
    isAdmin: false,
    projectionItems: [],
    projectionIndex: 0,
    toastTimer: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    state.storage = await createStorage();
    updateStorageBadge();

    const savedUser = readJson(USER_KEY, null);
    if (savedUser && savedUser.name) {
      state.user = normalizeUser(savedUser);
      await enterApp();
    } else {
      showLogin();
    }
  }

  function bindEvents() {
    $("#loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const identity = $("input[name='identity']:checked", event.currentTarget).value;
      const name = $("#loginName").value.trim();
      const code = $("#loginCode").value.trim();
      if (!name) {
        showToast("請先輸入姓名。");
        return;
      }
      state.user = normalizeUser({ identity, name, code });
      localStorage.setItem(USER_KEY, JSON.stringify(state.user));
      await enterApp();
    });

    $("#logoutButton").addEventListener("click", () => {
      localStorage.removeItem(USER_KEY);
      state.user = null;
      state.isAdmin = false;
      showLogin();
    });

    $$(".tab-button").forEach((button) => {
      button.addEventListener("click", () => setActiveTab(button.dataset.tab));
    });

    $$(".submission-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitter = event.submitter;
        const status = submitter?.dataset.saveStatus || "draft";
        await saveForm(form, status);
      });

      $("[data-reset-form]", form).addEventListener("click", () => resetForm(form));
    });

    $$("[data-showcase-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.showcaseFilter = button.dataset.showcaseFilter;
        renderShowcase();
      });
    });

    $("#adminLoginForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const password = $("#adminPassword").value;
      if (password === ADMIN_PASSWORD) {
        state.isAdmin = true;
        $("#adminLoginForm").hidden = true;
        $("#adminPanel").hidden = false;
        $("#adminLoginNote").textContent = "";
        renderAdmin();
      } else {
        $("#adminLoginNote").textContent = "密碼不正確，請重新輸入。";
      }
    });

    $("#adminCategoryFilter").addEventListener("change", (event) => {
      state.adminCategory = event.target.value;
      renderAdmin();
    });

    $("#adminStatusFilter").addEventListener("change", (event) => {
      state.adminStatus = event.target.value;
      renderAdmin();
    });

    $("#adminSearch").addEventListener("input", (event) => {
      state.adminSearch = event.target.value.trim();
      renderAdmin();
    });

    $("#batchDeleteButton").addEventListener("click", async () => {
      const checked = $$("[data-admin-check]:checked").map((input) => input.value);
      await deleteSubmissions(checked, true);
    });

    $("#closeProjection").addEventListener("click", closeProjection);
    $("#prevProjection").addEventListener("click", () => moveProjection(-1));
    $("#nextProjection").addEventListener("click", () => moveProjection(1));

    $("#projectionDialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      closeProjection();
    });

    document.addEventListener("keydown", (event) => {
      const dialog = $("#projectionDialog");
      if (!dialog.open) return;
      if (event.key === "ArrowLeft") moveProjection(-1);
      if (event.key === "ArrowRight") moveProjection(1);
      if (event.key === "Escape") closeProjection();
    });
  }

  function showLogin() {
    $("#loginScreen").hidden = false;
    $("#appShell").hidden = true;
  }

  async function enterApp() {
    $("#loginScreen").hidden = true;
    $("#appShell").hidden = false;
    $("#userBadge").textContent = `${state.user.identity}：${state.user.name}`;
    await refreshSubmissions();
    setActiveTab(state.activeTab || "api");
    renderAll();
  }

  function setActiveTab(tab) {
    state.activeTab = tab;
    $$(".tab-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });
    $$(".page-section").forEach((section) => {
      section.classList.toggle("active", section.dataset.page === tab);
    });
    if (tab === "showcase") renderShowcase();
    if (tab === "admin") renderAdmin();
  }

  async function refreshSubmissions() {
    try {
      state.submissions = await state.storage.loadAll();
    } catch (error) {
      console.error(error);
      showToast("讀取資料時發生問題，已切回本機暫存。");
      state.storage = createLocalStorageAdapter();
      state.storageMode = "local";
      updateStorageBadge();
      state.submissions = await state.storage.loadAll();
    }
  }

  function renderAll() {
    renderMySubmissions("mentor");
    renderMySubmissions("thermometer");
    renderShowcase();
    renderAdmin();
  }

  async function saveForm(form, status) {
    const category = form.elements.category.value;
    const title = form.elements.title.value.trim();
    const description = form.elements.description.value.trim();
    const file = form.elements.file.files[0] || null;
    const note = $("[data-form-note]", form);

    if (!title) {
      note.textContent = "請先輸入成果標題。";
      return;
    }

    const existingId = form.dataset.editingId || "";
    const existing = state.submissions.find((item) => item.id === existingId);
    const now = new Date().toISOString();
    const payload = {
      ...(existing || {}),
      id: existingId || existing?.id || "",
      owner_key: state.user.ownerKey,
      identity: state.user.identity,
      user_name: state.user.name,
      session_code: state.user.code,
      category,
      title,
      description,
      status,
      updated_at: now,
      created_at: existing?.created_at || now
    };

    setFormBusy(form, true);
    note.textContent = "正在儲存，請稍候。";

    try {
      const saved = await state.storage.save(payload, file);
      note.textContent = status === "published" ? "已發表成果。" : "已儲存草稿。";
      form.dataset.editingId = saved.id;
      form.elements.file.value = "";
      await refreshSubmissions();
      renderAll();
      showToast(status === "published" ? "成果已發表。" : "草稿已儲存。");
    } catch (error) {
      console.error(error);
      const detail = getErrorMessage(error);
      note.textContent = detail
        ? `儲存失敗：${detail}`
        : "儲存失敗，請確認網路或 Supabase 設定。";
      showToast("儲存失敗，請稍後再試。");
    } finally {
      setFormBusy(form, false);
    }
  }

  function setFormBusy(form, busy) {
    $$("button", form).forEach((button) => {
      button.disabled = busy;
    });
  }

  function resetForm(form) {
    form.reset();
    delete form.dataset.editingId;
    const note = $("[data-form-note]", form);
    note.textContent = "已切換為新增成果。";
  }

  function renderMySubmissions(category) {
    const container = $(`[data-my-list="${category}"]`);
    const mine = state.submissions
      .filter((item) => item.owner_key === state.user.ownerKey && item.category === category)
      .sort(sortByUpdatedDesc);

    if (!mine.length) {
      container.innerHTML = `<div class="empty-state">目前尚未儲存「${TOOLS[category].label}」成果。</div>`;
      return;
    }

    container.innerHTML = `
      <h3>我的${TOOLS[category].label}成果</h3>
      ${mine.map(renderSubmissionCard).join("")}
    `;

    $$("[data-edit-id]", container).forEach((button) => {
      button.addEventListener("click", () => editSubmission(button.dataset.editId));
    });

    $$("[data-view-id]", container).forEach((button) => {
      button.addEventListener("click", () => openProjectionById(button.dataset.viewId, mine));
    });
  }

  function renderShowcase() {
    $$("[data-showcase-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.showcaseFilter === state.showcaseFilter);
    });

    const items = state.submissions
      .filter((item) => item.status === "published")
      .filter((item) => state.showcaseFilter === "all" || item.category === state.showcaseFilter)
      .sort(sortByUpdatedDesc);

    const grid = $("#showcaseGrid");
    if (!items.length) {
      grid.innerHTML = `<div class="empty-state">目前沒有符合條件的已發表成果。</div>`;
      return;
    }

    grid.innerHTML = items.map(renderSubmissionCard).join("");

    $$("[data-view-id]", grid).forEach((button) => {
      button.addEventListener("click", () => openProjectionById(button.dataset.viewId, items));
    });

    $$("[data-edit-id]", grid).forEach((button) => {
      button.addEventListener("click", () => {
        const item = state.submissions.find((entry) => entry.id === button.dataset.editId);
        if (!item) return;
        setActiveTab(item.category);
        editSubmission(item.id);
      });
    });
  }

  function renderSubmissionCard(item) {
    const canEdit = item.owner_key === state.user?.ownerKey;
    return `
      <article class="submission-card">
        <div class="card-topline">
          <span class="category-pill ${TOOLS[item.category]?.className || ""}">${categoryLabel(item.category)}</span>
          <span class="status-pill ${item.status}">${statusLabel(item.status)}</span>
        </div>
        ${renderFilePreview(item)}
        <div>
          <h3>${escapeHtml(item.title || "未命名成果")}</h3>
          <p>${escapeHtml(item.description || "尚未填寫說明。")}</p>
        </div>
        <p>上傳者：${escapeHtml(item.user_name || "未填姓名")}｜更新：${formatDate(item.updated_at)}</p>
        <div class="card-actions">
          <button class="primary-action" data-view-id="${escapeHtml(item.id)}" type="button">放大檢視</button>
          ${canEdit ? `<button class="secondary-action" data-edit-id="${escapeHtml(item.id)}" type="button">繼續修改</button>` : ""}
        </div>
      </article>
    `;
  }

  function renderAdmin() {
    if (!state.isAdmin) {
      $("#adminLoginForm").hidden = false;
      $("#adminPanel").hidden = true;
      return;
    }

    const list = $("#adminList");
    const items = getAdminFilteredItems();

    if (!items.length) {
      list.innerHTML = `<div class="empty-state">目前沒有符合條件的成果。</div>`;
      $("#batchDeleteButton").disabled = true;
      return;
    }

    list.innerHTML = items.map((item) => `
      <article class="admin-item">
        <input data-admin-check type="checkbox" value="${escapeHtml(item.id)}" aria-label="選取 ${escapeHtml(item.title || "成果")}">
        <div>
          <div class="admin-item-top">
            <div>
              <h3>${escapeHtml(item.title || "未命名成果")}</h3>
              <p>${escapeHtml(item.user_name || "未填姓名")}｜${categoryLabel(item.category)}｜${statusLabel(item.status)}｜${formatDate(item.updated_at)}</p>
            </div>
            <span class="status-pill ${item.status}">${statusLabel(item.status)}</span>
          </div>
          <p>${escapeHtml(item.description || "尚未填寫說明。")}</p>
          <div class="admin-item-actions">
            <button class="secondary-action" data-admin-view="${escapeHtml(item.id)}" type="button">查看</button>
            <button class="danger-action" data-admin-delete="${escapeHtml(item.id)}" type="button">刪除</button>
          </div>
        </div>
      </article>
    `).join("");

    $$("[data-admin-check]", list).forEach((input) => {
      input.addEventListener("change", updateBatchButton);
    });

    $$("[data-admin-view]", list).forEach((button) => {
      button.addEventListener("click", () => openProjectionById(button.dataset.adminView, items));
    });

    $$("[data-admin-delete]", list).forEach((button) => {
      button.addEventListener("click", () => deleteSubmissions([button.dataset.adminDelete]));
    });

    updateBatchButton();
  }

  function getAdminFilteredItems() {
    return state.submissions
      .filter((item) => state.adminCategory === "all" || item.category === state.adminCategory)
      .filter((item) => state.adminStatus === "all" || item.status === state.adminStatus)
      .filter((item) => !state.adminSearch || (item.user_name || "").includes(state.adminSearch))
      .sort(sortByUpdatedDesc);
  }

  function updateBatchButton() {
    const count = $$("[data-admin-check]:checked").length;
    const button = $("#batchDeleteButton");
    button.disabled = count === 0;
    button.textContent = count ? `批次刪除 ${count} 筆` : "批次刪除";
  }

  async function deleteSubmissions(ids, isBatchAction = false) {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
    if (!uniqueIds.length) return;

    const targets = state.submissions.filter((item) => uniqueIds.includes(item.id));
    if (!targets.length) return;

    const confirmed = await confirmDelete(targets, isBatchAction);
    if (!confirmed) {
      showToast("已取消刪除。");
      return;
    }

    try {
      for (const item of targets) {
        await state.storage.remove(item);
      }
      await refreshSubmissions();
      renderAll();
      showToast(`已刪除 ${targets.length} 筆成果。`);
    } catch (error) {
      console.error(error);
      showToast("刪除失敗，請稍後再試。");
    }
  }

  function confirmDelete(items, isBatchAction = false) {
    const dialog = $("#confirmDialog");
    const batchMode = isBatchAction || items.length > 1;
    const title = batchMode ? "確認批次刪除" : "確認刪除成果";
    const message = batchMode
      ? `即將刪除 ${items.length} 筆成果。刪除後將無法在成果發表區顯示。`
      : "即將刪除此成果。刪除後將無法在成果發表區顯示。";

    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    $("#confirmItems").innerHTML = `
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item.title || "未命名成果")}｜${escapeHtml(item.user_name || "未填姓名")}｜${categoryLabel(item.category)}</li>`).join("")}
      </ul>
    `;
    $("#confirmButton").textContent = batchMode ? "確認批次刪除" : "確認刪除";

    if (!dialog.showModal) {
      return Promise.resolve(window.confirm(message));
    }

    return new Promise((resolve) => {
      const handleClose = () => {
        dialog.removeEventListener("close", handleClose);
        resolve(dialog.returnValue === "confirm");
      };
      dialog.addEventListener("close", handleClose);
      dialog.showModal();
    });
  }

  function editSubmission(id) {
    const item = state.submissions.find((entry) => entry.id === id);
    if (!item || item.owner_key !== state.user.ownerKey) {
      showToast("只能修改自己登入身分下的成果。");
      return;
    }

    const form = $(`[data-form="${item.category}"]`);
    if (!form) return;
    form.dataset.editingId = item.id;
    form.elements.title.value = item.title || "";
    form.elements.description.value = item.description || "";
    form.elements.file.value = "";
    $("[data-form-note]", form).textContent = "已載入既有成果，可繼續修改或重新上傳檔案。";
    setActiveTab(item.category);
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function openProjectionById(id, sourceItems) {
    const items = sourceItems && sourceItems.length
      ? sourceItems
      : state.submissions.filter((item) => item.status === "published").sort(sortByUpdatedDesc);
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    state.projectionItems = items;
    state.projectionIndex = index;
    renderProjection();
    const dialog = $("#projectionDialog");
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function renderProjection() {
    const item = state.projectionItems[state.projectionIndex];
    if (!item) return;
    $("#projectionType").textContent = `${categoryLabel(item.category)}｜${statusLabel(item.status)}`;
    $("#projectionTitle").textContent = item.title || "未命名成果";
    $("#projectionMeta").textContent = `上傳者：${item.user_name || "未填姓名"}｜更新：${formatDate(item.updated_at)}`;

    const body = $("#projectionBody");
    if (isImage(item.file_type, item.file_name) && item.file_url) {
      body.innerHTML = `<img src="${escapeAttribute(item.file_url)}" alt="${escapeAttribute(item.title || "成果圖片")}">`;
    } else {
      body.innerHTML = `
        <div class="projection-document">
          <h3>${escapeHtml(item.file_name || "未上傳檔案")}</h3>
          <p>${escapeHtml(item.description || "此成果沒有可直接預覽的圖片。")}</p>
          ${item.file_url ? `<a class="primary-action link-button" href="${escapeAttribute(item.file_url)}" target="_blank" rel="noopener">開啟或下載檔案</a>` : `<p>目前沒有可開啟的檔案連結。</p>`}
        </div>
      `;
    }

    $("#prevProjection").disabled = state.projectionItems.length <= 1;
    $("#nextProjection").disabled = state.projectionItems.length <= 1;
  }

  function moveProjection(direction) {
    if (!state.projectionItems.length) return;
    state.projectionIndex = (state.projectionIndex + direction + state.projectionItems.length) % state.projectionItems.length;
    renderProjection();
  }

  function closeProjection() {
    const dialog = $("#projectionDialog");
    if (dialog.close) dialog.close();
    else dialog.removeAttribute("open");
  }

  function renderFilePreview(item) {
    if (isImage(item.file_type, item.file_name) && item.file_url) {
      return `<div class="file-preview"><img src="${escapeAttribute(item.file_url)}" alt="${escapeAttribute(item.title || "成果圖片")}"></div>`;
    }
    const label = item.file_name ? item.file_name : "尚未上傳檔案";
    return `<div class="file-preview"><div class="file-badge">${escapeHtml(label)}</div></div>`;
  }

  async function createStorage() {
    const config = window.SEL_SUPABASE_CONFIG || {};
    if (config.enabled && config.url && config.anonKey) {
      try {
        await loadSupabaseScript();
        const client = window.supabase.createClient(config.url, config.anonKey);
        state.storageMode = "cloud";
        return createSupabaseAdapter(client, config);
      } catch (error) {
        console.error(error);
        state.storageMode = "local";
        showToast("Supabase 尚未連線，暫時使用本機暫存。");
        return createLocalStorageAdapter();
      }
    }
    state.storageMode = "local";
    return createLocalStorageAdapter();
  }

  function createLocalStorageAdapter() {
    return {
      async loadAll() {
        return readJson(LOCAL_SUBMISSION_KEY, []);
      },
      async save(payload, file) {
        const list = readJson(LOCAL_SUBMISSION_KEY, []);
        const existingIndex = list.findIndex((item) => item.id === payload.id);
        const fileData = file ? await fileToLocalPayload(file) : {};
        const record = {
          ...payload,
          ...fileData,
          id: payload.id || createId()
        };
        if (existingIndex >= 0) list[existingIndex] = record;
        else list.unshift(record);
        localStorage.setItem(LOCAL_SUBMISSION_KEY, JSON.stringify(list));
        return record;
      },
      async remove(item) {
        const list = readJson(LOCAL_SUBMISSION_KEY, []).filter((entry) => entry.id !== item.id);
        localStorage.setItem(LOCAL_SUBMISSION_KEY, JSON.stringify(list));
      }
    };
  }

  function createSupabaseAdapter(client, config) {
    const table = config.table || "sel_submissions";
    const bucket = config.bucket || "sel-submissions";

    return {
      async loadAll() {
        const { data, error } = await client
          .from(table)
          .select("*")
          .order("updated_at", { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async save(payload, file) {
        const record = { ...payload };
        if (file) {
          const uploaded = await uploadFile(client, bucket, payload, file);
          Object.assign(record, uploaded);
        }

        let result;
        if (record.id) {
          result = await client
            .from(table)
            .update(record)
            .eq("id", record.id)
            .select()
            .single();
        } else {
          delete record.id;
          result = await client
            .from(table)
            .insert(record)
            .select()
            .single();
        }

        if (result.error) throw result.error;
        return result.data;
      },
      async remove(item) {
        if (item.file_path) {
          await client.storage.from(bucket).remove([item.file_path]);
        }
        const { error } = await client.from(table).delete().eq("id", item.id);
        if (error) throw error;
      }
    };
  }

  async function uploadFile(client, bucket, payload, file) {
    const safeOwner = `user-${hashString(payload.owner_key || payload.user_name || "anonymous")}`;
    const safeName = safeStorageFileName(file.name);
    const path = `${payload.category}/${safeOwner}/${Date.now()}_${safeName}`;
    const { error } = await client.storage.from(bucket).upload(path, file, {
      contentType: file.type || guessMime(file.name),
      upsert: false
    });
    if (error) throw error;
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return {
      file_name: file.name,
      file_type: file.type || guessMime(file.name),
      file_size: file.size,
      file_path: path,
      file_url: data.publicUrl
    };
  }

  function fileToLocalPayload(file) {
    const limit = 2 * 1024 * 1024;
    if (file.size > limit) {
      return Promise.resolve({
        file_name: file.name,
        file_type: file.type || guessMime(file.name),
        file_size: file.size,
        file_path: "",
        file_url: ""
      });
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        file_name: file.name,
        file_type: file.type || guessMime(file.name),
        file_size: file.size,
        file_path: "local",
        file_url: reader.result
      });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadSupabaseScript() {
    if (window.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SUPABASE_CDN}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = SUPABASE_CDN;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function normalizeUser(user) {
    const identity = user.identity || "訪客";
    const name = (user.name || "").trim();
    const code = (user.code || "").trim();
    return {
      identity,
      name,
      code,
      ownerKey: makeOwnerKey(identity, name, code)
    };
  }

  function makeOwnerKey(identity, name, code) {
    return [identity, name, code || "no-code"]
      .join("|")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function updateStorageBadge() {
    const badge = $("#storageBadge");
    if (state.storageMode === "cloud") {
      badge.textContent = "Supabase 雲端儲存";
      badge.className = "storage-badge cloud";
    } else {
      badge.textContent = "本機暫存模式";
      badge.className = "storage-badge local";
    }
  }

  function categoryLabel(category) {
    return TOOLS[category]?.label || "未分類";
  }

  function statusLabel(status) {
    return status === "published" ? "已發表" : "草稿";
  }

  function isImage(type, name) {
    return (type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(name || "");
  }

  function guessMime(name) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    const map = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    };
    return map[ext] || "application/octet-stream";
  }

  function safeStorageFileName(name) {
    const original = String(name || "file");
    const extMatch = original.match(/(\.[A-Za-z0-9]{1,12})$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : "";
    const base = ext ? original.slice(0, -ext.length) : original;
    const safeBase = base
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "file";
    return `${safeBase}${ext}`;
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function getErrorMessage(error) {
    if (!error) return "";
    return error.message || error.error_description || error.error || error.details || String(error);
  }

  function sortByUpdatedDesc(a, b) {
    return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
  }

  function formatDate(value) {
    if (!value) return "未記錄";
    return new Date(value).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function createId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }
})();
