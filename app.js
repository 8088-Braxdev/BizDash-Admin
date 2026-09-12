// 1. Connect to your Supabase project (same project as BizDash)
const SUPABASE_URL = "https://jkymsgtbqwinystowmlh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpreW1zZ3RicXdpbnlzdG93bWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTA4MzMsImV4cCI6MjA4Nzk2NjgzM30.X82v6V0TBsJVnp73zUCG90JFjxS1yBjoDCJygiWa32Q";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// This is YOUR uid - only this account is allowed into the dashboard
const ADMIN_UID = "71dc726b-a609-4393-b63f-238dc8a7ea51";

const loginScreen = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const loginBtn = document.getElementById("google-login-btn");
const signoutBtn = document.getElementById("signout-btn");
const businessList = document.getElementById("business-list");
const statsBar = document.getElementById("stats-bar");
const searchInput = document.getElementById("search-input");
const toastContainer = document.getElementById("toast-container");

const paymentModal = document.getElementById("payment-modal");
const modalBusinessName = document.getElementById("modal-business-name");
const paymentAmountInput = document.getElementById("payment-amount");
const paymentPlanSelect = document.getElementById("payment-plan");
const confirmPaymentBtn = document.getElementById("confirm-payment-btn");
const cancelPaymentBtn = document.getElementById("cancel-payment-btn");

// Holds the full list from Supabase so search can filter without refetching
let allBusinesses = [];

// Remembers which business the payment modal is currently open for
let activeBusinessId = null;

// How many days each plan adds
const PLAN_DAYS = {
  "monthly": 30,
  "3-month": 90,
  "6-month": 180,
  "annual": 365
};

// Your fixed prices per plan (TZS)
const PLAN_PRICES = {
  "monthly": 5000,
  "3-month": 13500,
  "6-month": 24000,
  "annual": 42000
};

// 2. Toast notifications - small popup that auto-disappears
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(function () {
    toast.remove();
  }, 3000);
}

// 3. Login / logout buttons
loginBtn.addEventListener("click", function () {
  client.auth.signInWithOAuth({ provider: "google" });
});

signoutBtn.addEventListener("click", async function () {
  await client.auth.signOut();
  window.location.reload();
});

// 4. Check who's logged in, decide what to show
async function checkSession() {
  const result = await client.auth.getSession();
  const session = result.data.session;

  if (session && session.user.id === ADMIN_UID) {
    loginScreen.classList.add("hidden");
    dashboardScreen.classList.remove("hidden");
    loadBusinesses(true);
  } else if (session && session.user.id !== ADMIN_UID) {
    alert("This account is not authorized.");
    client.auth.signOut();
  } else {
    loginScreen.classList.remove("hidden");
    dashboardScreen.classList.add("hidden");
  }
}

// 5. Fetch everything using the RPC function
async function loadBusinesses(showLoadingText) {
  if (showLoadingText) {
    businessList.innerHTML = "<p>Loading...</p>";
  }

  const result = await client.rpc("get_admin_dashboard");

  if (result.error) {
    businessList.innerHTML = "<p>Error loading data: " + result.error.message + "</p>";
    return;
  }

  allBusinesses = result.data;
  renderStats(allBusinesses);
  applySearchFilter();
}

// 6. Calculate and show the stats bar
function renderStats(businesses) {
  const total = businesses.length;
  const premiumCount = businesses.filter(function (b) {
    return b.is_premium;
  }).length;
  const freeCount = total - premiumCount;

  statsBar.innerHTML =
    "<div class='glass-card stat-box'><span>" + total + "</span><p>Total Businesses</p></div>" +
    "<div class='glass-card stat-box'><span>" + premiumCount + "</span><p>Premium</p></div>" +
    "<div class='glass-card stat-box'><span>" + freeCount + "</span><p>Free</p></div>";
}

// 7. Re-apply whatever is currently typed in search, then render
const filterSelect = document.getElementById("filter-select");

function getBusinessStatus(biz) {
  const now = new Date();
  const isActuallyPremium = biz.is_premium && biz.premium_expires_at && new Date(biz.premium_expires_at) > now;
  const isExpired = biz.is_premium && biz.premium_expires_at && new Date(biz.premium_expires_at) <= now;

  if (isActuallyPremium) return "premium";
  if (isExpired) return "expired";
  return "free";
}

function applySearchFilter() {
  const term = searchInput.value.toLowerCase();
  const statusFilter = filterSelect.value;

  const filtered = allBusinesses.filter(function (biz) {
    const nameMatch = biz.business_name.toLowerCase().indexOf(term) !== -1;
    const emailMatch = biz.owner_email.toLowerCase().indexOf(term) !== -1;
    const searchMatch = nameMatch || emailMatch;

    const status = getBusinessStatus(biz);
    const statusMatch = statusFilter === "all" || statusFilter === status;

    return searchMatch && statusMatch;
  });

  renderBusinesses(filtered);
}

searchInput.addEventListener("input", applySearchFilter);
filterSelect.addEventListener("change", applySearchFilter);

// 8. Turn each business row into a card with buttons
// NOTE: +30/+90 buttons removed - "Record Payment" is now the one real way
// to move someone to premium (it logs a receipt AND extends automatically)
function renderBusinesses(businesses) {
  businessList.innerHTML = "";

  if (businesses.length === 0) {
    businessList.innerHTML = "<p>No businesses match your search.</p>";
    return;
  }

  businesses.forEach(function (biz) {
    const card = document.createElement("div");
    card.className = "glass-card business-card";

    const expiry = biz.premium_expires_at
      ? new Date(biz.premium_expires_at).toLocaleDateString()
      : "No expiry set";
const status = getBusinessStatus(biz);
let planLabel;
if (status === "premium") {
  planLabel = "Premium";
} else if (status === "expired") {
  planLabel = "Expired";
} else {
  planLabel = "Free";
}

    const lastPayment = biz.last_payment_amount
      ? biz.currency + " " + biz.last_payment_amount + " (" + biz.last_payment_plan + ")"
      : "No payments yet";

    card.innerHTML =
      "<h3>" + biz.business_name + "</h3>" +
      "<p>Owner: " + biz.owner_name + " (" + biz.owner_email + ")</p>" +
      "<p>Type: " + biz.business_type + " | Currency: " + biz.currency + "</p>" +
      "<p>Products: " + biz.product_count + " | Transactions: " + biz.transaction_count + "</p>" +
      "<p>Plan: " + planLabel + " | Expires: " + expiry + "</p>" +
      "<p>Last Payment: " + lastPayment + "</p>" +
      "<div class='button-row'>" +
        "<button class='pay-btn' data-id='" + biz.business_id + "' data-name='" + biz.business_name + "'>Record Payment</button>" +
        "<button class='toggle-btn' data-id='" + biz.business_id + "' data-current='" + biz.is_premium + "'>" +
          (biz.is_premium ? "Set Free" : "Set Premium") +
        "</button>" +
        "<button class='delete-btn' data-id='" + biz.business_id + "'>Delete</button>" +
      "</div>";

    businessList.appendChild(card);
  });

  attachButtonEvents();
}

// 9. Wire up all the buttons after rendering
function attachButtonEvents() {
  document.querySelectorAll(".pay-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = btn.getAttribute("data-id");
      const name = btn.getAttribute("data-name");
      openPaymentModal(id, name);
    });
  });

  document.querySelectorAll(".toggle-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = btn.getAttribute("data-id");
      const current = btn.getAttribute("data-current") === "true";
      togglePremium(id, !current);
    });
  });

  document.querySelectorAll(".delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = btn.getAttribute("data-id");
      deleteBusiness(id);
    });
  });
}

// 10. Payment modal open/close
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

// When plan changes, auto-fill the amount with that plan's price
paymentPlanSelect.addEventListener("change", function () {
  const selectedPlan = paymentPlanSelect.value;
  paymentAmountInput.value = PLAN_PRICES[selectedPlan];
});

// 11. Confirm payment - THE main flow now:
// saves a receipt, extends premium, AND notifies the user
confirmPaymentBtn.addEventListener("click", async function () {
  const amount = parseFloat(paymentAmountInput.value);
  const plan = paymentPlanSelect.value;

  if (!amount || amount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }

  // Step A: save the payment receipt
  const insertResult = await client
    .from("payments")
    .insert({
      business_id: activeBusinessId,
      amount: amount,
      plan: plan
    });

  if (insertResult.error) {
    alert("Error saving payment: " + insertResult.error.message);
    return;
  }

  // Step B: extend premium based on the plan chosen
  const days = PLAN_DAYS[plan];
  await extendPremiumSilently(activeBusinessId, days);

  // Step C: notify the user their payment is confirmed and premium is unlocked
  await client
    .from("notifications")
    .insert({
      business_id: activeBusinessId,
      message: "Your " + plan + " payment was confirmed! Premium is now unlocked. 🎉"
    });

  closePaymentModal();
  showToast("Payment recorded, premium unlocked, user notified!");
  loadBusinesses(false);
});

// 12. Shared logic to push the expiry date forward and flip is_premium on
async function extendPremiumSilently(businessId, days) {
  const bizResult = await client
    .from("businesses")
    .select("premium_expires_at")
    .eq("id", businessId)
    .single();

  let baseDate = new Date();
  if (bizResult.data && bizResult.data.premium_expires_at) {
    const existing = new Date(bizResult.data.premium_expires_at);
    if (existing > baseDate) {
      baseDate = existing;
    }
  }

  baseDate.setDate(baseDate.getDate() + days);

  await client
    .from("businesses")
    .update({
      is_premium: true,
      premium_expires_at: baseDate.toISOString()
    })
    .eq("id", businessId);
}

// 13. Manually flip premium on/off - emergency override only
// (e.g. refund a scammer instantly, or grant a free trial without a payment record)
async function togglePremium(businessId, newValue) {
  const updateResult = await client
    .from("businesses")
    .update({ is_premium: newValue })
    .eq("id", businessId);

  if (updateResult.error) {
    alert("Error: " + updateResult.error.message);
  } else {
    showToast(newValue ? "Set to Premium" : "Set to Free");
    loadBusinesses(false);
  }
}

// 14. Delete a business (with a confirm to avoid misclicks)
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

// 15. Run the check once, right when the page loads
checkSession();