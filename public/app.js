
/* =========================================================
   NEXA AI — USER APP
   Full client-side controller
   ========================================================= */

"use strict";

/* =========================================================
   STATE
   ========================================================= */

const state = {
    token:
        localStorage.getItem("nexa_session") ||
        localStorage.getItem("nexa_token") ||
        "",
    user: null,
    sending: false
};

/* =========================================================
   DOM HELPER
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

/* =========================================================
   TOAST
   ========================================================= */

function showToast(message, duration = 3500) {
    const toast = $("toast");

    if (!toast) {
        alert(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(window.nexaToastTimer);

    window.nexaToastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, duration);
}

/* =========================================================
   LOADING
   ========================================================= */

function setLoading(show) {
    const overlay = $("loadingOverlay");

    if (!overlay) return;

    if (show) {
        overlay.classList.remove("hidden");
    } else {
        overlay.classList.add("hidden");
    }
}

/* =========================================================
   SESSION
   ========================================================= */

function saveSession(sessionId) {
    state.token = sessionId || "";

    if (state.token) {
        localStorage.setItem("nexa_session", state.token);
        localStorage.setItem("nexa_token", state.token);
    }
}

function clearSession() {
    state.token = "";
    state.user = null;

    localStorage.removeItem("nexa_session");
    localStorage.removeItem("nexa_token");
}

/* =========================================================
   API HELPER
   ========================================================= */

async function api(url, options = {}) {
    const config = {
        ...options,
        headers: {
            ...(options.headers || {})
        }
    };

    if (options.body && typeof options.body !== "string") {
        config.headers["Content-Type"] = "application/json";
        config.body = JSON.stringify(options.body);
    }

    if (state.token) {
        config.headers["x-session-id"] = state.token;
        config.headers["Authorization"] = "Bearer " + state.token;
    }

    let response;

    try {
        response = await fetch(url, config);
    } catch (error) {
        throw new Error(
            "Unable to connect to NEXA server. Please check your internet connection."
        );
    }

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        const error = new Error(
            data.error ||
            data.message ||
            `Request failed (${response.status})`
        );

        error.status = response.status;
        error.code = data.code;
        error.data = data;

        throw error;
    }

    return data;
}

/* =========================================================
   AUTH SCREEN
   ========================================================= */

function showAuth(type) {
    const loginForm = $("loginForm");
    const registerForm = $("registerForm");
    const loginTab = $("loginTab");
    const registerTab = $("registerTab");

    if (!loginForm || !registerForm) return;

    if (type === "register") {
        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");

        if (loginTab) loginTab.classList.remove("active");
        if (registerTab) registerTab.classList.add("active");
    } else {
        registerForm.classList.add("hidden");
        loginForm.classList.remove("hidden");

        if (registerTab) registerTab.classList.remove("active");
        if (loginTab) loginTab.classList.add("active");
    }
}

/* =========================================================
   SHOW / HIDE APP
   ========================================================= */

function showApp() {
    const authScreen = $("authScreen");
    const appScreen = $("appScreen");

    if (authScreen) {
        authScreen.classList.add("hidden");
    }

    if (appScreen) {
        appScreen.classList.remove("hidden");
    }

    updateUserUI();
}

function showLogin() {
    const authScreen = $("authScreen");
    const appScreen = $("appScreen");

    if (appScreen) {
        appScreen.classList.add("hidden");
    }

    if (authScreen) {
        authScreen.classList.remove("hidden");
    }

    showAuth("login");
}

/* =========================================================
   LOGIN
   ========================================================= */

async function login(event) {
    if (event) {
        event.preventDefault();
    }

    const usernameInput = $("loginUsername");
    const passwordInput = $("loginPassword");

    const username = usernameInput
        ? usernameInput.value.trim()
        : "";

    const password = passwordInput
        ? passwordInput.value
        : "";

    if (!username || !password) {
        showToast("⚠️ Enter your username and password.");
        return;
    }

    setLoading(true);

    try {
        const result = await api("/api/login", {
            method: "POST",
            body: {
                username,
                password
            }
        });

        const sessionId =
            result.sessionId ||
            result.token ||
            result.session ||
            "";

        if (!sessionId) {
            throw new Error(
                "Login succeeded but no session was returned."
            );
        }

        saveSession(sessionId);

        state.user = result.user || null;

        if (!state.user) {
            await refreshCurrentUser();
        }

        if (!state.user) {
            throw new Error("Unable to load your account.");
        }

        showApp();
        navigateTo("chatPage");

        showToast(
            "✅ Welcome back, " +
            state.user.username +
            "!"
        );

        if (usernameInput) usernameInput.value = "";
        if (passwordInput) passwordInput.value = "";

    } catch (error) {
        clearSession();

        showToast(
            "⚠️ " +
            (error.message || "Login failed.")
        );
    } finally {
        setLoading(false);
    }
}

/* =========================================================
   REGISTER
   ========================================================= */

async function register(event) {
    if (event) {
        event.preventDefault();
    }

    const usernameInput = $("registerUsername");
    const passwordInput = $("registerPassword");
    const confirmInput = $("registerConfirm");

    const username = usernameInput
        ? usernameInput.value.trim()
        : "";

    const password = passwordInput
        ? passwordInput.value
        : "";

    const confirm = confirmInput
        ? confirmInput.value
        : "";

    if (!username || !password || !confirm) {
        showToast("⚠️ Please fill in all fields.");
        return;
    }

    if (username.length < 3) {
        showToast(
            "⚠️ Username must be at least 3 characters."
        );
        return;
    }

    if (password.length < 4) {
        showToast(
            "⚠️ Password must be at least 4 characters."
        );
        return;
    }

    if (password !== confirm) {
        showToast("⚠️ Passwords do not match.");
        return;
    }

    setLoading(true);

    try {
        const result = await api("/api/register", {
            method: "POST",
            body: {
                username,
                password
            }
        });

        const sessionId =
            result.sessionId ||
            result.token ||
            result.session ||
            "";

        if (!sessionId) {
            throw new Error(
                "Account created, but no login session was returned."
            );
        }

        saveSession(sessionId);

        state.user = result.user || null;

        if (!state.user) {
            await refreshCurrentUser();
        }

        showApp();
        navigateTo("chatPage");

        showToast("✅ Account created successfully!");

        if (usernameInput) usernameInput.value = "";
        if (passwordInput) passwordInput.value = "";
        if (confirmInput) confirmInput.value = "";

    } catch (error) {
        showToast(
            "⚠️ " +
            (error.message || "Registration failed.")
        );
    } finally {
        setLoading(false);
    }
}

/* =========================================================
   CURRENT USER
   ========================================================= */

async function refreshCurrentUser() {
    if (!state.token) {
        state.user = null;
        return null;
    }

    try {
        const result = await api("/api/me", {
            method: "GET"
        });

        state.user =
            result.user ||
            result.data ||
            result ||
            null;

        if (state.user && state.user.user) {
            state.user = state.user.user;
        }

        if (state.user) {
            updateUserUI();
        }

        return state.user;

    } catch (error) {
        if (error.status === 401) {
            clearSession();
        }

        state.user = null;
        return null;
    }
}

/* =========================================================
   USER UI
   ========================================================= */

function updateUserUI() {
    if (!state.user) return;

    const username =
        state.user.username || "User";

    const plan =
        String(state.user.plan || "free").toLowerCase();

    const isPro = plan === "pro";

    const sidebarUsername = $("sidebarUsername");
    const sidebarPlan = $("sidebarPlan");
    const mobilePlan = $("mobilePlan");
    const accountUsername = $("accountUsername");
    const accountPlan = $("accountPlan");
    const accountProStatus = $("accountProStatus");

    if (sidebarUsername) {
        sidebarUsername.textContent = username;
    }

    if (sidebarPlan) {
        sidebarPlan.textContent =
            isPro ? "NEXA PRO" : "FREE PLAN";
    }

    if (mobilePlan) {
        mobilePlan.textContent =
            isPro ? "PRO" : "FREE";
    }

    if (accountUsername) {
        accountUsername.textContent = username;
    }

    if (accountPlan) {
        accountPlan.textContent =
            isPro ? "NEXA PRO" : "FREE";
    }

    if (accountProStatus) {
        accountProStatus.textContent =
            isPro ? "Active" : "Not active";
    }

    updateProPage();
}

/* =========================================================
   PRO REQUEST STATUS
   ========================================================= */

function getProRequestStatus() {
    if (!state.user || !state.user.proRequest) {
        return "";
    }

    const request = state.user.proRequest;

    if (typeof request === "object") {
        return String(
            request.status || ""
        ).toLowerCase();
    }

    return String(request).toLowerCase();
}

/* =========================================================
   PRO PAGE
   ========================================================= */

function updateProPage() {
    const action = $("proAction");

    if (!action || !state.user) {
        return;
    }

    const plan =
        String(state.user.plan || "free").toLowerCase();

    if (plan === "pro") {
        action.innerHTML = `
            <div class="pro-active">
                <strong>✓ NEXA PRO ACTIVE</strong>
                <p>You have unlimited AI access.</p>
            </div>
        `;
        return;
    }

    const status = getProRequestStatus();

    if (
        status === "pending" ||
        status === "requested"
    ) {
        action.innerHTML = `
            <div class="pro-pending">
                <strong>⏳ PRO REQUEST PENDING</strong>
                <p>
                    Your request has been sent to the developer.
                    Please wait for approval.
                </p>
                <button
                    class="pro-btn"
                    onclick="cancelProRequest()">
                    CANCEL REQUEST
                </button>
            </div>
        `;
        return;
    }

    if (
        status === "rejected" ||
        status === "revoked"
    ) {
        action.innerHTML = `
            <div class="pro-rejected">
                <strong>
                    ⚠ PRO REQUEST ${status.toUpperCase()}
                </strong>
                <p>
                    You can submit another request.
                </p>
                <button
                    class="pro-btn"
                    onclick="requestPro()">
                    REQUEST PRO ACCESS — ₹99
                </button>
            </div>
        `;
        return;
    }

    action.innerHTML = `
        <button
            class="pro-btn"
            onclick="requestPro()">
            REQUEST PRO ACCESS — ₹99
        </button>

        <p>
            No automatic payment is made.
            Your request is manually reviewed by the developer.
        </p>
    `;
}

/* =========================================================
   REQUEST PRO
   ========================================================= */

async function requestPro() {
    if (!state.token) {
        showToast("⚠️ Please login first.");
        showLogin();
        return;
    }

    if (!state.user) {
        setLoading(true);

        try {
            await refreshCurrentUser();
        } finally {
            setLoading(false);
        }
    }

    if (!state.user) {
        clearSession();
        showLogin();

        showToast(
            "⚠️ Your session expired. Please login again."
        );

        return;
    }

    const currentPlan =
        String(state.user.plan || "free").toLowerCase();

    if (currentPlan === "pro") {
        showToast("✅ You already have NEXA Pro.");
        updateProPage();
        return;
    }

    const currentStatus =
        getProRequestStatus();

    if (
        currentStatus === "pending" ||
        currentStatus === "requested"
    ) {
        showToast(
            "⏳ Your Pro request is already pending."
        );
        return;
    }

    setLoading(true);

    try {
        const result = await api(
            "/api/pro/request",
            {
                method: "POST"
            }
        );

        state.user =
            result.user || state.user;

        updateUserUI();
        updateProPage();

        showToast(
            "✅ Pro request sent to the developer."
        );

    } catch (error) {
        if (error.status === 401) {
            clearSession();
            showLogin();

            showToast(
                "⚠️ Your session expired. Please login again."
            );

            return;
        }

        showToast(
            "⚠️ " +
            (error.message ||
                "Unable to request Pro.")
        );

    } finally {
        setLoading(false);
    }
}

/* =========================================================
   CANCEL PRO REQUEST
   ========================================================= */

async function cancelProRequest() {
    if (!state.token) {
        showToast("⚠️ Please login first.");
        showLogin();
        return;
    }

    setLoading(true);

    try {
        const result = await api(
            "/api/pro/cancel",
            {
                method: "POST"
            }
        );

        state.user =
            result.user || state.user;

        updateUserUI();
        updateProPage();

        showToast("✅ Pro request cancelled.");

    } catch (error) {
        if (error.status === 401) {
            clearSession();
            showLogin();

            showToast(
                "⚠️ Your session expired. Please login again."
            );

            return;
        }

        showToast(
            "⚠️ " +
            (error.message ||
                "Unable to cancel request.")
        );

    } finally {
        setLoading(false);
    }
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function navigateTo(pageId) {
    const pages =
        document.querySelectorAll(".page");

    const buttons =
        document.querySelectorAll(".nav-btn");

    pages.forEach(page => {
        page.classList.remove("active-page");
    });

    buttons.forEach(button => {
        button.classList.remove("active");
    });

    const target = $(pageId);

    if (target) {
        target.classList.add("active-page");
    }

    buttons.forEach(button => {
        if (button.dataset.page === pageId) {
            button.classList.add("active");
        }
    });

    if (pageId === "proPage") {
        updateProPage();
    }

    toggleSidebar(false);
}

/* =========================================================
   SIDEBAR
   ========================================================= */

function toggleSidebar(force) {
    const sidebar = $("sidebar");

    if (!sidebar) return;

    if (typeof force === "boolean") {
        if (force) {
            sidebar.classList.add("open");
        } else {
            sidebar.classList.remove("open");
        }

        return;
    }

    sidebar.classList.toggle("open");
}

/* =========================================================
   CHAT MESSAGE
   ========================================================= */

function addUserMessage(message) {
    const chat = $("chatMessages");

    if (!chat) return;

    const welcome =
        chat.querySelector(".welcome-message");

    if (welcome) {
        welcome.remove();
    }

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "message user-message";

    wrapper.innerHTML = `
        <div class="message-avatar">YOU</div>
        <div class="message-content"></div>
    `;

    const content =
        wrapper.querySelector(".message-content");

    if (content) {
        content.textContent = message;
    }

    chat.appendChild(wrapper);

    scrollChatToBottom();
}

function addAssistantMessage(message) {
    const chat = $("chatMessages");

    if (!chat) return null;

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "message assistant-message";

    wrapper.innerHTML = `
        <div class="message-avatar">N</div>
        <div class="message-content"></div>
    `;

    const content =
        wrapper.querySelector(".message-content");

    if (content) {
        content.innerHTML =
            formatAssistantText(message);
    }

    chat.appendChild(wrapper);

    scrollChatToBottom();

    return wrapper;
}

/* =========================================================
   TYPING MESSAGE
   ========================================================= */

function addTypingMessage() {
    const chat = $("chatMessages");

    if (!chat) return null;

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "message assistant-message typing-message";

    wrapper.innerHTML = `
        <div class="message-avatar">N</div>
        <div class="message-content">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
        </div>
    `;

    chat.appendChild(wrapper);

    scrollChatToBottom();

    return wrapper;
}

/* =========================================================
   FORMAT AI RESPONSE
   ========================================================= */

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatAssistantText(text) {
    let safe = escapeHtml(text || "");

    /* Correct bold Markdown conversion */
    safe = safe.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    safe = safe.replace(
        /\n/g,
        "<br>"
    );

    return safe;
}

/* =========================================================
   SCROLL CHAT
   ========================================================= */

function scrollChatToBottom() {
    const chat = $("chatMessages");

    if (!chat) return;

    requestAnimationFrame(() => {
        chat.scrollTop = chat.scrollHeight;
    });
}

/* =========================================================
   SEND MESSAGE
   ========================================================= */

async function sendMessage(event) {
    if (event) {
        event.preventDefault();
    }

    /* -----------------------------------------------
       IMPORTANT:
       Get the actual textarea from the submitted form.
       ----------------------------------------------- */

    let input = null;

    if (
        event &&
        event.currentTarget &&
        event.currentTarget.elements
    ) {
        input =
            event.currentTarget.elements.namedItem(
                "chatInput"
            );
    }

    /* Fallback */
    if (!input) {
        input = $("chatInput");
    }

    if (!input) {
        showToast(
            "⚠️ Chat input not found."
        );
        return;
    }

    /* -----------------------------------------------
       Read the real textarea value
       ----------------------------------------------- */

    const message =
        String(input.value || "").trim();

    if (!message) {
        showToast(
            "⚠️ Please enter a message."
        );

        input.focus();

        return;
    }

    /* -----------------------------------------------
       Prevent duplicate requests
       ----------------------------------------------- */

    if (state.sending) {
        return;
    }

    /* -----------------------------------------------
       Authentication
       ----------------------------------------------- */

    if (!state.token) {
        showToast(
            "⚠️ Please login first."
        );

        showLogin();

        return;
    }

    /* -----------------------------------------------
       Restore user if necessary
       ----------------------------------------------- */

    if (!state.user) {
        setLoading(true);

        try {
            await refreshCurrentUser();
        } finally {
            setLoading(false);
        }
    }

    if (!state.user) {
        clearSession();
        showLogin();

        showToast(
            "⚠️ Your session expired. Please login again."
        );

        return;
    }

    state.sending = true;

    const sendButton =
        $("sendButton");

    if (sendButton) {
        sendButton.disabled = true;
    }

    /* -----------------------------------------------
       Add user message
       ----------------------------------------------- */

    addUserMessage(message);

    /* Clear textarea */
    input.value = "";
    input.style.height = "auto";

    const typing =
        addTypingMessage();

    try {
        const result =
            await api(
                "/api/chat",
                {
                    method: "POST",
                    body: {
                        message: message
                    }
                }
            );

        if (typing) {
            typing.remove();
        }

        const answer =
            result.reply ||
            result.response ||
            result.answer ||
            result.text ||
            "";

        if (!answer) {
            throw new Error(
                "NEXA returned an empty response."
            );
        }

        addAssistantMessage(answer);

        if (result.user) {
            state.user =
                result.user;

            updateUserUI();
        } else {
            await refreshCurrentUser();
        }

    } catch (error) {
        if (typing) {
            typing.remove();
        }

        /* Restore user's message */
        input.value = message;

        if (
            error.code ===
            "FREE_LIMIT_REACHED"
        ) {
            addAssistantMessage(
                "You have used your 1 free AI message.\n\n" +
                "Upgrade to NEXA Pro for unlimited AI messages."
            );

            showToast(
                "⚡ Free message used. Upgrade to NEXA Pro."
            );

            return;
        }

        if (error.status === 401) {
            clearSession();
            showLogin();

            showToast(
                "⚠️ Your session expired. Please login again."
            );

            return;
        }

        addAssistantMessage(
            "⚠️ " +
            (
                error.message ||
                "Something went wrong while contacting NEXA."
            )
        );

    } finally {
        state.sending = false;

        if (sendButton) {
            sendButton.disabled = false;
        }

        input.focus();

        scrollChatToBottom();
    }
}

/* =========================================================
   SUGGESTIONS
   ========================================================= */

function useSuggestion(text) {
    const input = $("chatInput");

    if (!input) return;

    input.value = text;

    input.focus();

    const form = $("chatForm");

    if (form) {
        form.requestSubmit();
    }
}

/* =========================================================
   CHAT INPUT RESIZE
   ========================================================= */

function resizeChatInput() {
    const input = $("chatInput");

    if (!input) return;

    input.style.height = "auto";

    input.style.height =
        Math.min(
            input.scrollHeight,
            180
        ) + "px";
}

/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {
    try {
        if (state.token) {
            await api(
                "/api/logout",
                {
                    method: "POST"
                }
            );
        }
    } catch {
        /* Ignore logout server errors */
    }

    clearSession();

    showLogin();

    const chat =
        $("chatMessages");

    if (chat) {
        chat.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    N
                </div>

                <h2>
                    Hello, I'm NEXA.
                </h2>

                <p>
                    Your personal AI assistant is ready.
                </p>

                <div class="suggestions">

                    <button
                        onclick="useSuggestion('What can you do?')">
                        What can you do?
                    </button>

                    <button
                        onclick="useSuggestion('Explain artificial intelligence simply.')">
                        Explain AI
                    </button>

                    <button
                        onclick="useSuggestion('Give me some useful ideas.')">
                        Give me ideas
                    </button>

                </div>
            </div>
        `;
    }

    showToast(
        "👋 Logged out successfully."
    );
}

/* =========================================================
   ENTER KEY
   ========================================================= */

function setupChatKeyboard() {
    const input = $("chatInput");

    if (!input) return;

    input.addEventListener(
        "input",
        resizeChatInput
    );

    input.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {
                event.preventDefault();

                const form =
                    $("chatForm");

                if (form) {
                    form.requestSubmit();
                }
            }
        }
    );
}

/* =========================================================
   FORM SETUP
   ========================================================= */

function setupForms() {
    const loginForm =
        $("loginForm");

    const registerForm =
        $("registerForm");

    const chatForm =
        $("chatForm");

    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            login
        );
    }

    if (registerForm) {
        registerForm.addEventListener(
            "submit",
            register
        );
    }

    if (chatForm) {
        chatForm.addEventListener(
            "submit",
            sendMessage
        );
    }
}

/* =========================================================
   INITIALIZE
   ========================================================= */

async function initialize() {
    setupForms();
    setupChatKeyboard();

    if (state.token) {
        setLoading(true);

        try {
            const user =
                await refreshCurrentUser();

            if (user) {
                showApp();
            } else {
                clearSession();
                showLogin();
            }

        } finally {
            setLoading(false);
        }

        return;
    }

    showLogin();
}

/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.showAuth = showAuth;
window.login = login;
window.register = register;
window.navigateTo = navigateTo;
window.toggleSidebar = toggleSidebar;
window.requestPro = requestPro;
window.cancelProRequest = cancelProRequest;
window.sendMessage = sendMessage;
window.useSuggestion = useSuggestion;
window.logout = logout;

/* =========================================================
   START
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initialize
);
