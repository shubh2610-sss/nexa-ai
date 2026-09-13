"use strict";

/* =========================================================
   NEXA ADMIN CONSOLE
   PRO MANAGEMENT
   ========================================================= */

const state = {
    token: sessionStorage.getItem("nexa_admin_token") || "",
    users: [],
    pendingConfirm: null,
    loadingUsers: false
};

const $ = id => document.getElementById(id);


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    setupEvents();

    if (state.token) {
        showDashboard();
        loadUsers();
    } else {
        showLogin();
    }
});


/* =========================================================
   EVENT SETUP
   ========================================================= */

function setupEvents() {
    const loginForm = $("adminLoginForm");
    const logoutButton = $("logoutButton");
    const refreshButton = $("refreshButton");
    const togglePasswordButton = $("togglePassword");
    const userSearch = $("userSearch");
    const usersTableBody = $("usersTableBody");
    const pendingRequests = $("pendingRequests");
    const confirmCancel = $("confirmCancel");
    const confirmAction = $("confirmAction");
    const confirmModal = $("confirmModal");

    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", () => logout(true));
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", loadUsers);
    }

    if (togglePasswordButton) {
        togglePasswordButton.addEventListener(
            "click",
            togglePassword
        );
    }

    if (userSearch) {
        userSearch.addEventListener(
            "input",
            renderUsers
        );
    }

    if (usersTableBody) {
        usersTableBody.addEventListener(
            "click",
            handleTableAction
        );
    }

    if (pendingRequests) {
        pendingRequests.addEventListener(
            "click",
            handleRequestAction
        );
    }

    if (confirmCancel) {
        confirmCancel.addEventListener(
            "click",
            closeConfirmModal
        );
    }

    if (confirmAction) {
        confirmAction.addEventListener(
            "click",
            executeConfirmedAction
        );
    }

    if (confirmModal) {
        confirmModal.addEventListener(
            "click",
            event => {
                if (event.target === confirmModal) {
                    closeConfirmModal();
                }
            }
        );
    }

    document.addEventListener(
        "keydown",
        event => {
            if (event.key === "Escape") {
                closeConfirmModal();
            }
        }
    );
}


/* =========================================================
   LOGIN
   ========================================================= */

async function handleLogin(event) {
    event.preventDefault();

    const passwordInput = $("adminPassword");

    if (!passwordInput) {
        return;
    }

    const password = passwordInput.value.trim();

    if (!password) {
        showLoginError(
            "Enter the developer password."
        );
        return;
    }

    const button = $("loginButton");

    if (button) {
        button.disabled = true;

        button.innerHTML = `
            <span>AUTHENTICATING...</span>
            <span class="button-spinner"></span>
        `;
    }

    clearLoginError();

    try {
        const response = await fetch(
            "/api/admin/login",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    password
                })
            }
        );

        const data = await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                "Developer login failed."
            );
        }

        /*
         * Backend uses sessionId.
         */

        const sessionId =
            data.sessionId ||
            data.token ||
            data.session ||
            "";

        if (!sessionId) {
            throw new Error(
                "Developer session was not created."
            );
        }

        state.token = sessionId;

        sessionStorage.setItem(
            "nexa_admin_token",
            state.token
        );

        passwordInput.value = "";

        /*
         * SHOW DASHBOARD IMMEDIATELY.
         *
         * Even if loading users has a temporary
         * problem, the dashboard must NOT disappear.
         */

        showDashboard();

        showToast(
            "Developer access granted.",
            "success"
        );

        /*
         * Load users after dashboard is visible.
         */

        await loadUsers();

    } catch (error) {
        console.error(
            "ADMIN LOGIN ERROR:",
            error
        );

        showLoginError(
            error.message ||
            "Developer login failed."
        );

    } finally {
        if (button) {
            button.disabled = false;

            button.innerHTML = `
                <span>ENTER CONSOLE</span>
                <span class="button-arrow">→</span>
            `;
        }
    }
}


/* =========================================================
   ADMIN API
   ========================================================= */

async function api(endpoint, options = {}) {
    const headers = {
        ...(options.headers || {})
    };

    /*
     * Send the admin session using the backend's
     * expected header.
     */

    if (state.token) {
        headers["x-admin-session"] =
            state.token;

        /*
         * Also send Authorization for compatibility.
         */

        headers["Authorization"] =
            "Bearer " + state.token;
    }

    if (
        options.body &&
        typeof options.body !== "string" &&
        !headers["Content-Type"]
    ) {
        headers["Content-Type"] =
            "application/json";

        options = {
            ...options,
            body: JSON.stringify(options.body)
        };
    }

    let response;

    try {
        response = await fetch(
            endpoint,
            {
                ...options,
                headers
            }
        );
    } catch (error) {
        throw new Error(
            "Unable to connect to the NEXA server."
        );
    }

    const data = await response
        .json()
        .catch(() => ({}));

    if (response.status === 401) {
        const error = new Error(
            "ADMIN_SESSION_EXPIRED"
        );

        error.status = 401;
        error.data = data;

        throw error;
    }

    if (!response.ok) {
        const error = new Error(
            data.error ||
            data.message ||
            "Request failed."
        );

        error.status = response.status;
        error.data = data;

        throw error;
    }

    return data;
}


/* =========================================================
   LOAD USERS
   ========================================================= */

async function loadUsers() {
    if (state.loadingUsers) {
        return;
    }

    state.loadingUsers = true;

    const refreshButton =
        $("refreshButton");

    if (refreshButton) {
        refreshButton.disabled = true;

        refreshButton.classList.add(
            "refreshing"
        );
    }

    try {
        const response =
            await api("/api/admin/users");

        state.users =
            Array.isArray(response.users)
                ? response.users
                : [];

        updateStats();
        renderPendingRequests();
        renderUsers();

    } catch (error) {
        console.error(
            "LOAD USERS ERROR:",
            error
        );

        /*
         * IMPORTANT:
         *
         * DO NOT automatically close the
         * admin dashboard here.
         *
         * This was the reason the panel was
         * disappearing after login.
         */

        if (
            error.message ===
            "ADMIN_SESSION_EXPIRED"
        ) {
            showToast(
                "⚠️ Admin session could not be verified. Please refresh and login again.",
                "error"
            );

            /*
             * Keep dashboard visible.
             */
            showDashboard();

            return;
        }

        showToast(
            error.message ||
            "Unable to load users.",
            "error"
        );

    } finally {
        state.loadingUsers = false;

        if (refreshButton) {
            refreshButton.disabled = false;

            refreshButton.classList.remove(
                "refreshing"
            );
        }
    }
}


/* =========================================================
   REQUEST STATUS
   ========================================================= */

function getRequestStatus(user) {
    if (!user || !user.proRequest) {
        return "";
    }

    if (
        typeof user.proRequest ===
        "object"
    ) {
        return String(
            user.proRequest.status || ""
        ).toLowerCase();
    }

    return String(
        user.proRequest
    ).toLowerCase();
}


/* =========================================================
   STATS
   ========================================================= */

function updateStats() {
    const total =
        state.users.length;

    const pro =
        state.users.filter(
            user =>
                String(user.plan || "")
                    .toLowerCase() === "pro"
        ).length;

    const pending =
        state.users.filter(
            user =>
                getRequestStatus(user) ===
                "pending"
        ).length;

    const free =
        total - pro;

    animateNumber(
        $("totalUsers"),
        total
    );

    animateNumber(
        $("totalPro"),
        pro
    );

    animateNumber(
        $("totalPending"),
        pending
    );

    animateNumber(
        $("totalFree"),
        free
    );

    const pendingBadge =
        $("pendingBadge");

    if (pendingBadge) {
        pendingBadge.textContent =
            `${pending} pending`;
    }
}


/* =========================================================
   NUMBER ANIMATION
   ========================================================= */

function animateNumber(element, target) {
    if (!element) {
        return;
    }

    const start =
        Number(element.textContent) || 0;

    if (start === target) {
        element.textContent = target;
        return;
    }

    const duration = 450;
    const startTime = performance.now();

    function frame(now) {
        const progress =
            Math.min(
                (now - startTime) /
                duration,
                1
            );

        const eased =
            1 -
            Math.pow(
                1 - progress,
                3
            );

        element.textContent =
            Math.round(
                start +
                (target - start) *
                eased
            );

        if (progress < 1) {
            requestAnimationFrame(frame);
        }
    }

    requestAnimationFrame(frame);
}


/* =========================================================
   PENDING REQUESTS
   ========================================================= */

function renderPendingRequests() {
    const container =
        $("pendingRequests");

    if (!container) {
        return;
    }

    const pending =
        state.users.filter(
            user =>
                getRequestStatus(user) ===
                "pending"
        );

    if (!pending.length) {
        container.innerHTML = `
            <div class="request-empty">
                <div class="empty-icon">✓</div>

                <strong>
                    All caught up
                </strong>

                <span>
                    There are no pending Pro requests right now.
                </span>
            </div>
        `;

        return;
    }

    container.innerHTML =
        pending
            .map(user => `
                <div
                    class="request-card"
                    data-user-id="${escapeHtml(user.id)}"
                >

                    <div class="request-main">

                        <div class="request-avatar">
                            ${escapeHtml(
                                getInitial(
                                    user.username
                                )
                            )}
                        </div>

                        <div class="request-user">

                            <div class="request-name-row">

                                <strong>
                                    ${escapeHtml(
                                        user.username
                                    )}
                                </strong>

                                <span class="request-new-badge">
                                    NEW REQUEST
                                </span>

                            </div>

                            <span class="request-description">
                                Requesting NEXA Pro access
                            </span>

                            <div class="request-meta">

                                <span>
                                    💎 Unlimited AI messages
                                </span>

                                <span>
                                    ₹99 / month
                                </span>

                            </div>

                        </div>

                    </div>

                    <div class="request-actions">

                        <button
                            class="action-btn approve-btn"
                            data-action="approve"
                            data-user-id="${escapeHtml(user.id)}"
                        >
                            <span>✓</span>
                            APPROVE
                        </button>

                        <button
                            class="action-btn reject-btn"
                            data-action="reject"
                            data-user-id="${escapeHtml(user.id)}"
                        >
                            <span>×</span>
                            REJECT
                        </button>

                    </div>

                </div>
            `)
            .join("");
}


/* =========================================================
   USERS TABLE
   ========================================================= */

function renderUsers() {
    const tbody =
        $("usersTableBody");

    if (!tbody) {
        return;
    }

    const searchInput =
        $("userSearch");

    const search =
        searchInput
            ? searchInput.value
                .trim()
                .toLowerCase()
            : "";

    const users =
        state.users.filter(
            user =>
                String(
                    user.username || ""
                )
                    .toLowerCase()
                    .includes(search)
        );

    if (!users.length) {
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="6"
                    class="table-empty"
                >
                    <div>
                        No users found.
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        users
            .map(user => {
                const isPro =
                    String(user.plan || "")
                        .toLowerCase() === "pro";

                const plan =
                    isPro
                        ? `
                            <span class="plan plan-pro">
                                <i></i>
                                PRO
                            </span>
                        `
                        : `
                            <span class="plan plan-free">
                                FREE
                            </span>
                        `;

                const used =
                    Number(
                        user.aiMessagesUsed || 0
                    );

                const usage =
                    isPro
                        ? `
                            <div class="usage-cell">
                                <strong class="unlimited">
                                    ∞
                                </strong>

                                <span>
                                    Unlimited
                                </span>
                            </div>
                        `
                        : `
                            <div class="usage-cell">
                                <strong>
                                    ${used}/1
                                </strong>

                                <span>
                                    AI message
                                </span>
                            </div>
                        `;

                const requestStatus =
                    getRequestStatus(user);

                let request = `
                    <span class="status-none">
                        —
                    </span>
                `;

                if (requestStatus === "pending") {
                    request = `
                        <span class="status status-pending">
                            <i></i>
                            PENDING
                        </span>
                    `;
                }

                if (requestStatus === "approved") {
                    request = `
                        <span class="status status-approved">
                            <i></i>
                            APPROVED
                        </span>
                    `;
                }

                if (requestStatus === "rejected") {
                    request = `
                        <span class="status status-rejected">
                            <i></i>
                            REJECTED
                        </span>
                    `;
                }

                if (requestStatus === "revoked") {
                    request = `
                        <span class="status status-rejected">
                            <i></i>
                            REVOKED
                        </span>
                    `;
                }

                if (requestStatus === "cancelled") {
                    request = `
                        <span class="status-none">
                            CANCELLED
                        </span>
                    `;
                }

                const created =
                    user.createdAt
                        ? formatDate(
                            user.createdAt
                        )
                        : "—";

                let actions = "";

                if (isPro) {
                    actions = `
                        <button
                            class="action-btn revoke-btn"
                            data-action="revoke"
                            data-user-id="${escapeHtml(user.id)}"
                        >
                            REVOKE
                        </button>
                    `;
                } else if (
                    requestStatus === "pending"
                ) {
                    actions = `
                        <div class="table-actions">

                            <button
                                class="action-btn approve-btn small"
                                data-action="approve"
                                data-user-id="${escapeHtml(user.id)}"
                            >
                                ✓
                            </button>

                            <button
                                class="action-btn reject-btn small"
                                data-action="reject"
                                data-user-id="${escapeHtml(user.id)}"
                            >
                                ×
                            </button>

                        </div>
                    `;
                } else {
                    actions = `
                        <span class="status-none">
                            —
                        </span>
                    `;
                }

                return `
                    <tr>

                        <td>
                            <div class="table-user">

                                <div class="table-avatar">
                                    ${escapeHtml(
                                        getInitial(
                                            user.username
                                        )
                                    )}
                                </div>

                                <div>

                                    <span class="user-name">
                                        ${escapeHtml(
                                            user.username
                                        )}
                                    </span>

                                    <small>
                                        ID ${escapeHtml(
                                            String(
                                                user.id || ""
                                            ).slice(0, 8)
                                        )}
                                    </small>

                                </div>

                            </div>
                        </td>

                        <td>
                            ${plan}
                        </td>

                        <td>
                            ${usage}
                        </td>

                        <td>
                            ${request}
                        </td>

                        <td>
                            <span class="date-text">
                                ${created}
                            </span>
                        </td>

                        <td>
                            ${actions}
                        </td>

                    </tr>
                `;
            })
            .join("");
}


/* =========================================================
   ACTION HANDLERS
   ========================================================= */

function handleRequestAction(event) {
    const button =
        event.target.closest(
            "button[data-action]"
        );

    if (!button) {
        return;
    }

    openActionConfirmation(
        button.dataset.action,
        button.dataset.userId
    );
}


function handleTableAction(event) {
    const button =
        event.target.closest(
            "button[data-action]"
        );

    if (!button) {
        return;
    }

    openActionConfirmation(
        button.dataset.action,
        button.dataset.userId
    );
}


/* =========================================================
   CONFIRMATION
   ========================================================= */

function openActionConfirmation(
    action,
    userId
) {
    const user =
        state.users.find(
            item =>
                String(item.id) ===
                String(userId)
        );

    if (!user) {
        return;
    }

    state.pendingConfirm = {
        action,
        userId
    };

    const icon =
        $("confirmIcon");

    const title =
        $("confirmTitle");

    const message =
        $("confirmMessage");

    const username =
        $("confirmUsername");

    const confirmButton =
        $("confirmAction");

    if (username) {
        username.textContent =
            user.username;
    }

    if (action === "approve") {
        if (icon) {
            icon.textContent = "💎";
            icon.className =
                "confirm-icon approve-modal-icon";
        }

        if (title) {
            title.textContent =
                "Approve Pro Access?";
        }

        if (message) {
            message.textContent =
                `${user.username} will receive unlimited AI messages and NEXA Pro access.`;
        }

        if (confirmButton) {
            confirmButton.textContent =
                "APPROVE PRO";

            confirmButton.className =
                "modal-confirm approve-confirm";
        }
    }

    if (action === "reject") {
        if (icon) {
            icon.textContent = "✕";
            icon.className =
                "confirm-icon reject-modal-icon";
        }

        if (title) {
            title.textContent =
                "Reject Pro Request?";
        }

        if (message) {
            message.textContent =
                `${user.username}'s Pro request will be rejected. They can request again later.`;
        }

        if (confirmButton) {
            confirmButton.textContent =
                "REJECT REQUEST";

            confirmButton.className =
                "modal-confirm reject-confirm";
        }
    }

    if (action === "revoke") {
        if (icon) {
            icon.textContent = "⚠";
            icon.className =
                "confirm-icon revoke-modal-icon";
        }

        if (title) {
            title.textContent =
                "Revoke Pro Access?";
        }

        if (message) {
            message.textContent =
                `${user.username} will lose unlimited Pro AI access.`;
        }

        if (confirmButton) {
            confirmButton.textContent =
                "REVOKE PRO";

            confirmButton.className =
                "modal-confirm revoke-confirm";
        }
    }

    const modal =
        $("confirmModal");

    if (modal) {
        modal.classList.remove("hidden");
    }
}


/* =========================================================
   EXECUTE CONFIRMED ACTION
   ========================================================= */

async function executeConfirmedAction() {
    if (!state.pendingConfirm) {
        return;
    }

    const {
        action,
        userId
    } = state.pendingConfirm;

    const user =
        state.users.find(
            item =>
                String(item.id) ===
                String(userId)
        );

    if (!user) {
        closeConfirmModal();
        return;
    }

    let endpoint = "";

    if (action === "approve") {
        endpoint =
            `/api/admin/pro/${encodeURIComponent(
                userId
            )}/approve`;
    }

    if (action === "reject") {
        endpoint =
            `/api/admin/pro/${encodeURIComponent(
                userId
            )}/reject`;
    }

    if (action === "revoke") {
        endpoint =
            `/api/admin/pro/${encodeURIComponent(
                userId
            )}/revoke`;
    }

    if (!endpoint) {
        closeConfirmModal();
        return;
    }

    const button =
        $("confirmAction");

    if (button) {
        button.disabled = true;
        button.textContent =
            "PROCESSING...";
    }

    try {
        const data =
            await api(
                endpoint,
                {
                    method: "POST"
                }
            );

        closeConfirmModal();

        showToast(
            data.message ||
            "Action completed successfully.",
            "success"
        );

        await loadUsers();

    } catch (error) {
        console.error(
            "ADMIN ACTION ERROR:",
            error
        );

        closeConfirmModal();

        if (
            error.message ===
            "ADMIN_SESSION_EXPIRED"
        ) {
            showToast(
                "⚠️ Admin session expired. Please login again.",
                "error"
            );

            /*
             * Do not silently close the dashboard.
             */
            return;
        }

        showToast(
            error.message ||
            "Action failed.",
            "error"
        );

    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}


/* =========================================================
   CLOSE MODAL
   ========================================================= */

function closeConfirmModal() {
    const modal =
        $("confirmModal");

    if (modal) {
        modal.classList.add("hidden");
    }

    state.pendingConfirm = null;
}


/* =========================================================
   PASSWORD TOGGLE
   ========================================================= */

function togglePassword() {
    const input =
        $("adminPassword");

    const button =
        $("togglePassword");

    if (!input || !button) {
        return;
    }

    if (input.type === "password") {
        input.type = "text";
        button.textContent = "HIDE";
    } else {
        input.type = "password";
        button.textContent = "SHOW";
    }
}


/* =========================================================
   SCREEN
   ========================================================= */

function showLogin() {
    const loginScreen =
        $("loginScreen");

    const dashboardScreen =
        $("dashboardScreen");

    if (loginScreen) {
        loginScreen.classList.remove(
            "hidden"
        );
    }

    if (dashboardScreen) {
        dashboardScreen.classList.add(
            "hidden"
        );
    }
}


function showDashboard() {
    const loginScreen =
        $("loginScreen");

    const dashboardScreen =
        $("dashboardScreen");

    if (loginScreen) {
        loginScreen.classList.add(
            "hidden"
        );
    }

    if (dashboardScreen) {
        dashboardScreen.classList.remove(
            "hidden"
        );
    }
}


/* =========================================================
   LOGIN ERROR
   ========================================================= */

function showLoginError(message) {
    const element =
        $("loginError");

    if (element) {
        element.textContent =
            message;
    }
}


function clearLoginError() {
    const element =
        $("loginError");

    if (element) {
        element.textContent = "";
    }
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout(
    showMessage = true
) {
    const currentToken =
        state.token;

    state.token = "";
    state.users = [];

    sessionStorage.removeItem(
        "nexa_admin_token"
    );

    /*
     * Try to tell the server about logout,
     * but don't let a failed request prevent
     * local logout.
     */

    if (currentToken) {
        try {
            await fetch(
                "/api/admin/logout",
                {
                    method: "POST",

                    headers: {
                        "x-admin-session":
                            currentToken,

                        "Authorization":
                            "Bearer " +
                            currentToken
                    }
                }
            );
        } catch (error) {
            console.warn(
                "Admin logout request failed:",
                error
            );
        }
    }

    showLogin();

    const password =
        $("adminPassword");

    if (password) {
        password.value = "";
    }

    if (showMessage) {
        showToast(
            "Developer session ended.",
            "success"
        );
    }
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(
    message,
    type = ""
) {
    const toast =
        $("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent =
        message;

    toast.className =
        `toast show ${type}`;

    clearTimeout(
        showToast.timer
    );

    showToast.timer =
        setTimeout(
            () => {
                toast.className =
                    "toast";
            },
            3500
        );
}


/* =========================================================
   HELPERS
   ========================================================= */

function getInitial(username) {
    const value =
        String(
            username || "N"
        ).trim();

    return (
        value.charAt(0) ||
        "N"
    ).toUpperCase();
}


function formatDate(value) {
    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "—";
    }

    return date.toLocaleDateString(
        undefined,
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );
}


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}