"use strict";


/* =========================================================
   NEXA ADMIN CONSOLE
   PRO MANAGEMENT
   ========================================================= */


const state = {

    token:
        sessionStorage.getItem(
            "nexa_admin_token"
        ) || "",

    users: [],

    pendingConfirm: null

};


const $ = id =>
    document.getElementById(id);


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        setupEvents();

        if (state.token) {

            showDashboard();

            loadUsers();

        } else {

            showLogin();

        }

    }
);


/* =========================================================
   EVENT SETUP
   ========================================================= */

function setupEvents() {

    $("adminLoginForm")
        .addEventListener(
            "submit",
            handleLogin
        );


    $("logoutButton")
        .addEventListener(
            "click",
            logout
        );


    $("refreshButton")
        .addEventListener(
            "click",
            loadUsers
        );


    $("togglePassword")
        .addEventListener(
            "click",
            togglePassword
        );


    $("userSearch")
        .addEventListener(
            "input",
            renderUsers
        );


    $("usersTableBody")
        .addEventListener(
            "click",
            handleTableAction
        );


    $("pendingRequests")
        .addEventListener(
            "click",
            handleRequestAction
        );


    $("confirmCancel")
        .addEventListener(
            "click",
            closeConfirmModal
        );


    $("confirmAction")
        .addEventListener(
            "click",
            executeConfirmedAction
        );


    $("confirmModal")
        .addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    $("confirmModal")
                ) {
                    closeConfirmModal();
                }

            }
        );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape"
            ) {
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


    const password =
        $("adminPassword").value;


    if (!password) {

        showLoginError(
            "Enter the developer password."
        );

        return;

    }


    const button =
        $("loginButton");


    button.disabled = true;


    button.innerHTML = `
        <span>AUTHENTICATING...</span>
        <span class="button-spinner"></span>
    `;


    clearLoginError();


    try {

        const response =
            await fetch(
                "/api/admin/login",
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            password
                        })

                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Login failed."
            );

        }


        state.token =
            data.token;


        sessionStorage.setItem(
            "nexa_admin_token",
            state.token
        );


        $("adminPassword").value = "";


        showDashboard();


        await loadUsers();


        showToast(
            "Developer access granted.",
            "success"
        );


    } catch (error) {

        showLoginError(
            error.message
        );

    } finally {

        button.disabled = false;

        button.innerHTML = `
            <span>ENTER CONSOLE</span>
            <span class="button-arrow">→</span>
        `;

    }

}


/* =========================================================
   API
   ========================================================= */

async function api(
    endpoint,
    options = {}
) {

    const headers = {

        ...(options.headers || {}),

        Authorization:
            `Bearer ${state.token}`

    };


    if (
        options.body &&
        !headers["Content-Type"]
    ) {

        headers["Content-Type"] =
            "application/json";

    }


    const response =
        await fetch(
            endpoint,
            {
                ...options,
                headers
            }
        );


    const data =
        await response
            .json()
            .catch(
                () => ({})
            );


    if (response.status === 401) {

        throw new Error(
            "ADMIN_SESSION_EXPIRED"
        );

    }


    if (!response.ok) {

        throw new Error(
            data.error ||
            data.message ||
            "Request failed."
        );

    }


    return data;

}


/* =========================================================
   LOAD USERS
   ========================================================= */

async function loadUsers() {

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
            await api(
                "/api/admin/users"
            );


        state.users =
            response.users || [];


        updateStats();

        renderPendingRequests();

        renderUsers();


    } catch (error) {

        if (
            error.message ===
            "ADMIN_SESSION_EXPIRED"
        ) {

            logout();

            return;

        }


        showToast(
            error.message,
            "error"
        );

    } finally {

        if (refreshButton) {

            refreshButton.disabled = false;

            refreshButton.classList.remove(
                "refreshing"
            );

        }

    }

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
                user.plan === "pro"
        ).length;


    const pending =
        state.users.filter(
            user =>
                user.proRequest ===
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


    $("pendingBadge")
        .textContent =
        `${pending} pending`;

}


/* =========================================================
   NUMBER ANIMATION
   ========================================================= */

function animateNumber(
    element,
    target
) {

    if (!element) {
        return;
    }


    const start =
        Number(
            element.textContent
        ) || 0;


    if (start === target) {
        element.textContent = target;
        return;
    }


    const duration = 450;

    const startTime =
        performance.now();


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

            requestAnimationFrame(
                frame
            );

        }

    }


    requestAnimationFrame(
        frame
    );

}


/* =========================================================
   PENDING REQUESTS
   ========================================================= */

function renderPendingRequests() {

    const container =
        $("pendingRequests");


    const pending =
        state.users.filter(
            user =>
                user.proRequest ===
                "pending"
        );


    if (!pending.length) {

        container.innerHTML = `

            <div class="request-empty">

                <div class="empty-icon">
                    ✓
                </div>

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
            .map(
                user => `

                    <div
                        class="request-card"
                        data-user-id="${escapeHtml(
                            user.id
                        )}"
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
                                data-user-id="${escapeHtml(
                                    user.id
                                )}"
                            >
                                <span>✓</span>
                                APPROVE
                            </button>


                            <button
                                class="action-btn reject-btn"
                                data-action="reject"
                                data-user-id="${escapeHtml(
                                    user.id
                                )}"
                            >
                                <span>×</span>
                                REJECT
                            </button>

                        </div>

                    </div>

                `
            )
            .join("");

}


/* =========================================================
   USERS TABLE
   ========================================================= */

function renderUsers() {

    const tbody =
        $("usersTableBody");


    const search =
        $("userSearch")
            .value
            .trim()
            .toLowerCase();


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
            .map(
                user => {

                    const isPro =
                        user.plan === "pro";


                    const plan =
                        isPro

                            ? `
                                <span
                                    class="plan plan-pro"
                                >
                                    <i></i>
                                    PRO
                                </span>
                            `

                            : `
                                <span
                                    class="plan plan-free"
                                >
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


                    let request = `

                        <span class="status-none">
                            —
                        </span>

                    `;


                    if (
                        user.proRequest ===
                        "pending"
                    ) {

                        request = `

                            <span class="status status-pending">
                                <i></i>
                                PENDING
                            </span>

                        `;

                    }


                    if (
                        user.proRequest ===
                        "approved"
                    ) {

                        request = `

                            <span class="status status-approved">
                                <i></i>
                                APPROVED
                            </span>

                        `;

                    }


                    if (
                        user.proRequest ===
                        "rejected"
                    ) {

                        request = `

                            <span class="status status-rejected">
                                <i></i>
                                REJECTED
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
                                data-user-id="${escapeHtml(
                                    user.id
                                )}"
                            >
                                REVOKE
                            </button>

                        `;

                    } else if (
                        user.proRequest ===
                        "pending"
                    ) {

                        actions = `

                            <div class="table-actions">

                                <button
                                    class="action-btn approve-btn small"
                                    data-action="approve"
                                    data-user-id="${escapeHtml(
                                        user.id
                                    )}"
                                >
                                    ✓
                                </button>

                                <button
                                    class="action-btn reject-btn small"
                                    data-action="reject"
                                    data-user-id="${escapeHtml(
                                        user.id
                                    )}"
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
                                                ).slice(
                                                    0,
                                                    8
                                                )
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

                }
            )
            .join("");

}


/* =========================================================
   TABLE ACTION
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
                item.id === userId
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


    username.textContent =
        user.username;


    if (action === "approve") {

        icon.textContent = "💎";

        icon.className =
            "confirm-icon approve-modal-icon";

        title.textContent =
            "Approve Pro Access?";

        message.textContent =
            `${user.username} will receive unlimited AI messages and NEXA Pro access.`;

        confirmButton.textContent =
            "APPROVE PRO";

        confirmButton.className =
            "modal-confirm approve-confirm";

    }


    if (action === "reject") {

        icon.textContent = "✕";

        icon.className =
            "confirm-icon reject-modal-icon";

        title.textContent =
            "Reject Pro Request?";

        message.textContent =
            `${user.username}'s Pro request will be rejected. They can request again later.`;

        confirmButton.textContent =
            "REJECT REQUEST";

        confirmButton.className =
            "modal-confirm reject-confirm";

    }


    if (action === "revoke") {

        icon.textContent = "⚠";

        icon.className =
            "confirm-icon revoke-modal-icon";

        title.textContent =
            "Revoke Pro Access?";

        message.textContent =
            `${user.username} will lose unlimited Pro AI access.`;

        confirmButton.textContent =
            "REVOKE PRO";

        confirmButton.className =
            "modal-confirm revoke-confirm";

    }


    $("confirmModal")
        .classList
        .remove("hidden");

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
                item.id === userId
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


    button.disabled = true;

    button.textContent =
        "PROCESSING...";


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

        closeConfirmModal();


        if (
            error.message ===
            "ADMIN_SESSION_EXPIRED"
        ) {

            logout();

            return;

        }


        showToast(
            error.message,
            "error"
        );

    } finally {

        button.disabled = false;

    }

}


/* =========================================================
   CLOSE MODAL
   ========================================================= */

function closeConfirmModal() {

    $("confirmModal")
        .classList
        .add("hidden");


    state.pendingConfirm = null;

}


/* =========================================================
   PASSWORD
   ========================================================= */

function togglePassword() {

    const input =
        $("adminPassword");

    const button =
        $("togglePassword");


    if (
        input.type ===
        "password"
    ) {

        input.type = "text";

        button.textContent =
            "HIDE";

    } else {

        input.type =
            "password";

        button.textContent =
            "SHOW";

    }

}


/* =========================================================
   SCREEN
   ========================================================= */

function showLogin() {

    $("loginScreen")
        .classList
        .remove("hidden");


    $("dashboardScreen")
        .classList
        .add("hidden");

}


function showDashboard() {

    $("loginScreen")
        .classList
        .add("hidden");


    $("dashboardScreen")
        .classList
        .remove("hidden");

}


/* =========================================================
   LOGIN ERROR
   ========================================================= */

function showLoginError(message) {

    $("loginError")
        .textContent =
        message;

}


function clearLoginError() {

    $("loginError")
        .textContent = "";

}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    try {

        if (state.token) {

            await fetch(
                "/api/admin/logout",
                {
                    method: "POST",

                    headers: {
                        Authorization:
                            `Bearer ${state.token}`
                    }
                }
            );

        }

    } catch (error) {

        console.warn(error);

    }


    state.token = "";

    state.users = [];


    sessionStorage.removeItem(
        "nexa_admin_token"
    );


    showLogin();


    $("adminPassword").value = "";


    showToast(
        "Developer session ended.",
        "success"
    );

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

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}