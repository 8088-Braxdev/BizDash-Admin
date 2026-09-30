// ============================================================
// BizDash Admin - app.js (clean version)
// Record Payment now calls ONE Supabase function (record_payment)
// which does everything: receipt, expiry, premium, analytics, notification.
// ============================================================

// 1. Supabase connection
const SUPABASE_URL = "https://jkymsgtbqwinystowmlh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpreW1zZ3RicXdpbnlzdG93bWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTA4MzMsImV4cCI6MjA4Nzk2NjgzM30.X82v6V0TBsJVnp73zUCG90JFjxS1yBjoDCJygiWa32Q";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Only this account can enter (real protection is RLS + the RPC checks in Supabase)
const ADMIN_UID = "71dc726b-a609-4393-b63f-238dc8a7ea51";

// Plan prices (TZS) - only used to pre-fill the amount box.
// Days per plan are calculated on the server inside record_payment.
const PLAN_PRICES = {
  "monthly": 5000,
  "3-month": 13500,
  "6-month": 24000,
  "annual": 42000
};

// 2. Elements
const loginScreen = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const loginBtn = document.getElementById("google-login-btn");
const signoutBtn = document.getElementById("signout-btn");
const businessList = document.getElementById("business-list");
const statsBar = document.getElementById("stats-bar");
const searchInput = document.getElementById("search-input");
const filterSelect = document.getElementById("filter-select");
const toastContainer = document.getElementById("toast-container");

const paymentModal = document.getElementById("payment-modal");
const modalBusinessName = document.getElementById("modal-business-name");
const paymentAmountInput = document.getElementById("payment-amount");
const paymentPlanSelect = document.getElementById("payment-plan");
const confirmPaymentBtn = document.getElementById("confirm-payment-btn");
const cancelPaymentBtn = document.getElementById("cancel-payment-btn");

// State
let allBusinesses = [];
let activeBusinessId = null;

// 3. Helpers
// Stops user-entered text (business names, emails) from running as HTML
function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(function () {
    toast.remove();
  }, 3500);
}

// premium = paid and not expired | expired = was premium, date passed | free = never paid
function getBusinessStatus(biz) {
  if (!biz.is_premium || !biz.premium_expires_at) return "free";
  return new Date(biz.premium_expires_at) > new Date() ? "premium" : "expired";
}

// 4. Login / logout
loginBtn.addEventListener("click", function () {
  client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href.split("#")[0] }
  });
});

signoutBtn.addEventListener("click", async function () {
  await client.auth.signOut();
  window.location.reload();
});

async function checkSession() {
  const result = await client.auth.getSession();
  const session = result.data.session;

  if (session && session.user.id === ADMIN_UID) {
    loginScreen.classList.add("hidden");
    dashboardScreen.classList.remove("hidden");
    loadBusinesses(true);
  } else if (session) {
    await client.auth.signOut();
    alert("This account is not authorized.");
    loginScreen.classList.remove("hidden");
    dashboardScreen.classList.add("hidden");
  } else {
    loginScreen.classList.remove("hidden");
    dashboardScreen.classList.add("hidden");
  }
}

// 5. Load data
async function loadBusinesses(showLoadingText) {
  if (showLoadingText) {
    businessList.innerHTML = "<p>Loading...</p>";
  }

  const result = await client.rpc("get_admin_dashboard");

  if (result.error) {
    businessList.innerHTML = "<p>Error loading data: " + escapeHtml(result.error.message) + "</p>";
    return;
  }

  allBusinesses = result.data || [];
  renderStats(allBusinesses);
  applySearchFilter();
}

// 6. Stats bar
function renderStats(businesses) {
  let premium = 0;
  let expired = 0;
  let free = 0;

  businesses.forEach(function (b) {
    const status = getBusinessStatus(b);
    if (status === "premium") premium++;
    else if (status === "expired") expired++;
    else free++;
  });

  statsBar.innerHTML =
    "<div class='glass-card stat-box'><span>" + businesses.length + "</span><p>Total Businesses</p></div>" +
    "<div class='glass-card stat-box'><span>" + premium + "</span><p>Premium</p></div>" +
    "<div class='glass-card stat-box'><span>" + free + "</span><p>Free</p></div>" +
    "<div class='glass-card stat-box'><span>" + expired + "</span><p>Expired</p></div>";
}

// 7. Search + filter
function applySearchFilter() {
  const term = searchInput.value.trim().toLowerCase();
  const statusFilter = filterSelect.value;

  const filtered = allBusinesses.filter(function (biz) {
    const name = (biz.business_name || "").toLowerCase();
    const email = (biz.owner_email || "").toLowerCase();
    const searchMatch = name.indexOf(term) !== -1 || email.indexOf(term) !== -1;
    const statusMatch = statusFilter === "all" || statusFilter === getBusinessStatus(biz);
    return searchMatch && statusMatch;
  });

  renderBusinesses(filtered);
}

searchInput.addEventListener("input", applySearchFilter);
filterSelect.addEventListener("change", applySearchFilter);

// 8. Render cards
function renderBusinesses(businesses) {
  businessList.innerHTML = "";

  if (businesses.length === 0) {
    businessList.innerHTML = "<p>No businesses match your search.</p>";
    return;
  }

  businesses.forEach(function (biz) {
    const status = getBusinessStatus(biz);
    const planLabel = status === "premium" ? "Premium" : status === "expired" ? "Expired" : "Free";

    const expiry = biz.premium_expires_at
      ? new Date(biz.premium_expires_at).toLocaleDateString()
      : "No expiry set";

    const lastPayment = biz.last_payment_amount
      ? biz.currency + " " + biz.last_payment_amount + " (" + biz.last_payment_plan + ")"
      : "No payments yet";

    const card = document.createElement("div");
    card.className = "glass-card business-card";

    // "Set Free" only appears while premium is active - emergency override
    const freeBtn = status === "premium"
      ? "<button class='toggle-btn' data-action='free' data-id='" + escapeHtml(biz.business_id) + "'>Set Free</button>"
      : "";

    card.innerHTML =
      "<h3>" + escapeHtml(biz.business_name) + "</h3>" +
      "<p>Owner: " + escapeHtml(biz.owner_name) + " (" + escapeHtml(biz.owner_email) + ")</p>" +
      "<p>Type: " + escapeHtml(biz.business_type) + " | Currency: " + escapeHtml(biz.currency) + "</p>" +
      "<p>Products: " + escapeHtml(biz.product_count) + " | Transactions: " + escapeHtml(biz.transaction_count) + "</p>" +
      "<p>Plan: " + planLabel + " | Expires: " + escapeHtml(expiry) + "</p>" +
      "<p>Last Payment: " + escapeHtml(lastPayment) + "</p>" +
      "<div class='button-row'>" +
        "<button class='pay-btn' data-action='pay' data-id='" + escapeHtml(biz.business_id) + "'>Record Payment</button>" +
        freeBtn +
        "<button class='delete-btn' data-action='delete' data-id='" + escapeHtml(biz.business_id) + "'>Delete</button>" +
      "</div>";

    // Keep the business name on the element itself (safe, no HTML parsing)
    card.dataset.name = biz.business_name || "";

    businessList.appendChild(card);
  });
}

// 9. One click listener for ALL card buttons (event delegation)
businessList.addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const name = btn.closest(".business-card").dataset.name;

  if (action === "pay") openPaymentModal(id, name);
  else if (action === "free") setFree(id);
  else if (action === "delete") deleteBusiness(id);
});

// 10. Payment modal
function openPaymentModal(businessId, businessName) {
  activeBusinessId = businessId;
  modalBusinessName.textContent = "For: " + businessName;
  paymentPlanSelect.value = "monthly";
  paymentAmountInput.value = PLAN_PRICES["monthly"];
  paymentModal.classList.remove("hidden");
}

function closePaymentModal() {
  activeBusinessId = null;
  paymentModal.classList.add("hidden");
}

cancelPaymentBtn.addEventListener("click", closePaymentModal);

paymentPlanSelect.addEventListener("change", function () {
  paymentAmountInput.value = PLAN_PRICES[paymentPlanSelect.value];
});

// 11. Confirm payment - ONE call does everything on the server:
// receipt + correct expiry + premium + analytics + notification
confirmPaymentBtn.addEventListener("click", async function () {
  const amount = parseFloat(paymentAmountInput.value);
  const plan = paymentPlanSelect.value;

  if (!activeBusinessId) return;

  if (!amount || amount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }

  // Block double-clicks so the same payment is never recorded twice
  confirmPaymentBtn.disabled = true;

  const result = await client.rpc("record_payment", {
    p_business_id: activeBusinessId,
    p_amount: amount,
    p_plan: plan
  });

  confirmPaymentBtn.disabled = false;

  if (result.error) {
    alert("Error recording payment: " + result.error.message);
    return;
  }

  closePaymentModal();
  showToast("Payment recorded! Premium valid until " + new Date(result.data).toLocaleDateString());
  loadBusinesses(false);
});

// 12. Emergency override: take premium away (refund, scammer, etc.)
async function setFree(businessId) {
  const sure = confirm("Set this business back to Free?");
  if (!sure) return;

  const updateResult = await client
    .from("businesses")
    .update({
      is_premium: false
      // , analytics_enabled: false   // <- uncomment if you want analytics locked again too
    })
    .eq("id", businessId);

  if (updateResult.error) {
    alert("Error: " + updateResult.error.message);
  } else {
    showToast("Set to Free");
    loadBusinesses(false);
  }
}

// 13. Delete business (with confirm)
async function deleteBusiness(businessId) {
  const sure = confirm("Delete this business permanently? This cannot be undone.");
  if (!sure) return;

  const deleteResult = await client
    .from("businesses")
    .delete()
    .eq("id", businessId);

  if (deleteResult.error) {
    alert("Error: " + deleteResult.error.message);
  } else {
    showToast("Business deleted.");
    loadBusinesses(false);
  }
}

// 14. Start
checkSession();
