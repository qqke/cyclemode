import { createClient } from "@supabase/supabase-js";

const configElement = document.querySelector("#app-config");
const config = configElement ? JSON.parse(configElement.textContent || "{}") : {};
const supabaseUrl = config.supabaseUrl || "";
const supabaseAnonKey = config.supabaseAnonKey || "";

const state = {
  client: null,
  reservation: null,
  deviceId: "",
  adminPassword: "",
  reservations: []
};

const els = {
  setupNotice: document.querySelector("[data-setup-notice]"),
  loading: document.querySelector("[data-loading]"),
  customerPanel: document.querySelector("[data-customer-panel]"),
  ticketPanel: document.querySelector("[data-ticket-panel]"),
  bookingPanel: document.querySelector("[data-booking-panel]"),
  ticketNumber: document.querySelector("[data-ticket-number]"),
  ticketTime: document.querySelector("[data-ticket-time]"),
  ticketDate: document.querySelector("[data-ticket-date]"),
  ticketStatus: document.querySelector("[data-ticket-status]"),
  ageCheck: document.querySelector("[data-age-check]"),
  reserveButton: document.querySelector("[data-reserve-button]"),
  customerMessage: document.querySelector("[data-customer-message]"),
  adminPassword: document.querySelector("[data-admin-password]"),
  adminLogin: document.querySelector("[data-admin-login]"),
  adminRefresh: document.querySelector("[data-admin-refresh]"),
  adminMessage: document.querySelector("[data-admin-message]"),
  adminPanel: document.querySelector("[data-admin-panel]"),
  adminTableBody: document.querySelector("[data-admin-table-body]")
};

function setMessage(target, text, tone = "neutral") {
  target.textContent = text;
  target.dataset.tone = tone;
}

function getDeviceId() {
  const key = "cyclemode_test_ride_device_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  localStorage.setItem(key, id);
  return id;
}

async function hashDeviceId(deviceId) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(deviceId)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function getTokyoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function normalizeReservation(payload) {
  const reservation = Array.isArray(payload)
    ? payload[0]
    : (payload?.reservation ?? payload);
  if (!reservation) return null;
  if (reservation.queue_number == null) {
    throw new Error("受付番号を取得できませんでした。");
  }
  return reservation;
}

function renderReservation(reservation) {
  state.reservation = reservation;
  if (!reservation) {
    els.ticketPanel.hidden = true;
    els.bookingPanel.hidden = false;
    return;
  }

  els.ticketNumber.textContent = `A-${String(reservation.queue_number).padStart(3, "0")}`;
  els.ticketTime.textContent = formatDateTime(reservation.reserved_at);
  els.ticketDate.textContent = reservation.event_date;
  els.ticketStatus.textContent =
    reservation.status === "completed" ? "体験済み" : "待機中";
  els.ticketPanel.hidden = false;
  els.bookingPanel.hidden = true;
}

async function callRpc(name, params) {
  const { data, error } = await state.client.rpc(name, params);
  if (error) {
    if (error.message?.includes("AGE_CONFIRMATION_REQUIRED")) {
      throw new Error("16歳以上であることを確認してください。");
    }
    if (error.message?.includes("ADMIN_PASSWORD_INVALID")) {
      throw new Error("パスワードが正しくありません。");
    }
    if (error.message?.includes("INVALID_STATUS")) {
      throw new Error("更新内容が正しくありません。");
    }
    throw new Error(error.message || "通信に失敗しました。");
  }
  return data;
}

async function loadOwnReservation() {
  els.loading.hidden = false;
  els.customerPanel.hidden = true;
  try {
    const data = await callRpc("get_own_reservation", {
      p_event_date: getTokyoDate(),
      p_device_hash: await hashDeviceId(state.deviceId)
    });
    renderReservation(normalizeReservation(data));
    if (!state.reservation) {
      setMessage(
        els.customerMessage,
        "16歳以上であることを確認してから予約してください。"
      );
    }
  } catch (error) {
    setMessage(els.customerMessage, error.message, "error");
    renderReservation(null);
  } finally {
    els.loading.hidden = true;
    els.customerPanel.hidden = false;
  }
}

async function createReservation() {
  if (!els.ageCheck.checked) {
    setMessage(
      els.customerMessage,
      "16歳以上であることを確認してください。",
      "error"
    );
    return;
  }

  els.reserveButton.disabled = true;
  setMessage(els.customerMessage, "予約を受け付けています...");
  try {
    const data = await callRpc("create_or_get_reservation", {
      p_event_date: getTokyoDate(),
      p_device_hash: await hashDeviceId(state.deviceId),
      p_age_confirmed: true
    });
    renderReservation(normalizeReservation(data));
    setMessage(
      els.customerMessage,
      "予約を受け付けました。番号をスタッフにお見せください。",
      "success"
    );
  } catch (error) {
    setMessage(els.customerMessage, error.message, "error");
  } finally {
    els.reserveButton.disabled = false;
  }
}

function renderAdminRows(rows) {
  els.adminTableBody.innerHTML = "";
  if (!rows.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="5" class="empty-cell">本日の予約はまだありません。</td>`;
    els.adminTableBody.append(row);
    return;
  }

  for (const reservation of rows) {
    const row = document.createElement("tr");
    const number = `A-${String(reservation.queue_number).padStart(3, "0")}`;
    const statusText =
      reservation.status === "completed" ? "体験済み" : "待機中";
    row.innerHTML = `
      <td class="number-cell">${number}</td>
      <td>${formatDateTime(reservation.reserved_at)}</td>
      <td><code>${reservation.device_hash_short}</code></td>
      <td><span class="status-pill" data-status="${reservation.status}">${statusText}</span></td>
      <td></td>
    `;

    const actionCell = row.lastElementChild;
    const button = document.createElement("button");
    button.className = "small-button";
    button.textContent =
      reservation.status === "completed" ? "完了済み" : "完了にする";
    button.disabled = reservation.status === "completed";
    button.addEventListener("click", () => completeReservation(reservation.id));
    actionCell.append(button);
    els.adminTableBody.append(row);
  }
}

async function loadAdminReservations() {
  if (!state.adminPassword) {
    setMessage(els.adminMessage, "パスワードを入力してください。", "error");
    return;
  }

  els.adminLogin.disabled = true;
  els.adminRefresh.disabled = true;
  setMessage(els.adminMessage, "予約一覧を読み込んでいます...");
  try {
    const data = await callRpc("admin_list_reservations", {
      p_event_date: getTokyoDate(),
      p_admin_password: state.adminPassword
    });
    state.reservations = data ?? [];
    renderAdminRows(state.reservations);
    els.adminPanel.hidden = false;
    setMessage(
      els.adminMessage,
      `${state.reservations.length}件の予約を表示しています。`,
      "success"
    );
  } catch (error) {
    setMessage(els.adminMessage, error.message, "error");
  } finally {
    els.adminLogin.disabled = false;
    els.adminRefresh.disabled = false;
  }
}

async function completeReservation(id) {
  setMessage(els.adminMessage, "ステータスを更新しています...");
  try {
    await callRpc("admin_update_reservation_status", {
      p_admin_password: state.adminPassword,
      p_reservation_id: id,
      p_status: "completed"
    });
    await loadAdminReservations();
  } catch (error) {
    setMessage(els.adminMessage, error.message, "error");
  }
}

function initialize() {
  if (!supabaseUrl || !supabaseAnonKey) {
    els.setupNotice.hidden = false;
    els.loading.hidden = true;
    els.customerPanel.hidden = false;
    renderReservation(null);
    setMessage(
      els.customerMessage,
      "Supabase の公開URLと anon key を設定すると予約を受け付けられます。",
      "error"
    );
    return;
  }

  state.client = createClient(supabaseUrl, supabaseAnonKey);
  state.deviceId = getDeviceId();
  loadOwnReservation();
}

els.reserveButton.addEventListener("click", createReservation);
els.adminLogin.addEventListener("click", () => {
  state.adminPassword = els.adminPassword.value.trim();
  loadAdminReservations();
});
els.adminRefresh.addEventListener("click", loadAdminReservations);
els.adminPassword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    state.adminPassword = els.adminPassword.value.trim();
    loadAdminReservations();
  }
});

initialize();
