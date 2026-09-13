/* =========================================================
   NEXA AI - FRONTEND JAVASCRIPT
   USER APP ONLY
   FREE = 1 SUCCESSFUL AI MESSAGE
   PRO  = UNLIMITED AI MESSAGES
   ========================================================= */

"use strict";


/* =========================================================
   GLOBAL STATE
   ========================================================= */

const state = {
    token: localStorage.getItem("nexa_token") || "",
    user: null
};


/* =========================================================
   DOM HELPER
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    setupEvents();

    if (state.token) {
        loadCurrentUser();
    } else {
        showAuthScreen();
    }
});


/* =========================================================
   EVENT SETUP
   ========================================================= */

function setupEvents() {

    const loginForm = $("loginForm");

    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            handleLogin
        );
    }


    const registerForm = $("registerForm");

    if (registerForm) {
        registerForm.addEventListener(
            "submit",
            handleRegister
        );
    }


    const chatForm = $("chatForm");

    if (chatForm) {
        chatForm.addEventListener(
            "submit",
            handleChatSubmit
        );
    }


    const chatInput = $("chatInput");

    if (chatInput) {

        chatInput.addEventListener(
            "keydown",
            (event) => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {
                    event.preventDefault();
                    handleChatSubmit(event);
                }

            }
        );


        chatInput.addEventListener(
            "input",
            () => {

                chatInput.style.height = "auto";

                chatInput.style.height =
                    Math.min(
                        chatInput.scrollHeight,
                        180
                    ) + "px";

            }
        );

    }
}


/* =========================================================
   AUTH SCREEN
   ========================================================= */

function showAuthScreen() {

    const authScreen = $("authScreen");
    const appScreen = $("appScreen");

    if (authScreen) {
        authScreen.classList.remove("hidden");
    }

    if (appScreen) {
        appScreen.classList.add("hidden");
    }
}


function showAppScreen() {

    const authScreen = $("authScreen");
    const appScreen = $("appScreen");

    if (authScreen) {
        authScreen.classList.add("hidden");
    }

    if (appScreen) {
        appScreen.classList.remove("hidden");
    }
}


/* =========================================================
   AUTH TABS
   ========================================================= */

function showAuth(type) {

    const loginTab = $("loginTab");
    const registerTab = $("registerTab");
    const loginForm = $("loginForm");
    const registerForm = $("registerForm");

    if (
        !loginTab ||
        !registerTab ||
        !loginForm ||
        !registerForm
    ) {
        return;
    }


    if (type === "login") {

        loginTab.classList.add("active");
        registerTab.classList.remove("active");

        loginForm.classList.remove("hidden");
        registerForm.classList.add("hidden");

    } else {

        loginTab.classList.remove("active");
        registerTab.classList.add("active");

        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");

    }
}


/* =========================================================
   API HELPER
   ========================================================= */

async function api(url, options = {}) {

    const config = {
        ...options,

        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    };


    if (state.token) {

        config.headers.Authorization =
            "Bearer " + state.token;

    }


    const response =
        await fetch(url, config);


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

        /*
         * Keep server response information
         * available to the chat handler.
         */

        error.status = response.status;
        error.code = data.code || "";
        error.data = data;

        throw error;
    }


    return data;
}


/* =========================================================
   REGISTER
   ========================================================= */

async function handleRegister(event) {

    event.preventDefault();


    const username =
        $("registerUsername").value.trim();

    const password =
        $("registerPassword").value;

    const confirmPassword =
        $("registerConfirm").value;


    if (username.length < 3) {

        showToast(
            "Username must be at least 3 characters.",
            "error"
        );

        return;
    }


    if (password.length < 6) {

        showToast(
            "Password must be at least 6 characters.",
            "error"
        );

        return;
    }


    if (password !== confirmPassword) {

        showToast(
            "Passwords do not match.",
            "error"
        );

        return;
    }


    setLoading(true);


    try {

        const response =
            await fetch(
                "/api/register",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        username,
                        password
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Registration failed."
            );

        }


        state.token = result.token;
        state.user = result.user;


        localStorage.setItem(
            "nexa_token",
            state.token
        );


        $("registerForm").reset();


        showAppScreen();

        updateUserUI();

        navigateTo("chatPage");


        showToast(
            "Account created successfully!",
            "success"
        );


    } catch (error) {

        showToast(
            error.message,
            "error"
        );

    } finally {

        setLoading(false);

    }
}


/* =========================================================
   LOGIN
   ========================================================= */

async function handleLogin(event) {

    event.preventDefault();


    const username =
        $("loginUsername").value.trim();

    const password =
        $("loginPassword").value;


    if (!username || !password) {

        showToast(
            "Enter username and password.",
            "error"
        );

        return;
    }


    setLoading(true);


    try {

        const response =
            await fetch(
                "/api/login",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        username,
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


        state.token = data.token;
        state.user = data.user;


        localStorage.setItem(
            "nexa_token",
            state.token
        );


        $("loginForm").reset();


        showAppScreen();

        updateUserUI();

        navigateTo("chatPage");


        showToast(
            "Welcome back to NEXA!",
            "success"
        );


    } catch (error) {

        showToast(
            error.message,
            "error"
        );

    } finally {

        setLoading(false);

    }
}


/* =========================================================
   LOAD CURRENT USER
   ========================================================= */

async function loadCurrentUser() {

    try {

        const data =
            await api("/api/me");


        state.user =
            data.user;


        showAppScreen();

        updateUserUI();


    } catch (error) {

        console.error(error);


        localStorage.removeItem(
            "nexa_token"
        );


        state.token = "";
        state.user = null;


        showAuthScreen();

    }
}


/* =========================================================
   REFRESH USER
   ========================================================= */

async function refreshCurrentUser() {

    if (!state.token) {
        return null;
    }


    try {

        const data =
            await api("/api/me");


        state.user =
            data.user;


        updateUserUI();


        return state.user;


    } catch (error) {

        console.warn(
            "Unable to refresh user:",
            error
        );


        return null;
    }
}


/* =========================================================
   UPDATE USER UI
   ========================================================= */

function updateUserUI() {

    if (!state.user) {
        return;
    }


    const username =
        state.user.username || "User";


    const isPro =
        state.user.plan === "pro";


    const proRequest =
        state.user.proRequest || "none";


    const sidebarUsername =
        $("sidebarUsername");

    const sidebarPlan =
        $("sidebarPlan");

    const accountUsername =
        $("accountUsername");

    const accountPlan =
        $("accountPlan");

    const accountProStatus =
        $("accountProStatus");

    const mobilePlan =
        $("mobilePlan");


    if (sidebarUsername) {

        sidebarUsername.textContent =
            username;

    }


    if (sidebarPlan) {

        sidebarPlan.textContent =
            isPro
                ? "NEXA PRO"
                : "FREE PLAN";

    }


    if (accountUsername) {

        accountUsername.textContent =
            username;

    }


    if (accountPlan) {

        accountPlan.textContent =
            isPro
                ? "NEXA PRO"
                : "FREE";

    }


    if (accountProStatus) {

        accountProStatus.textContent =
            getProStatusText(
                isPro,
                proRequest
            );

    }


    if (mobilePlan) {

        mobilePlan.textContent =
            isPro
                ? "PRO"
                : "FREE";

    }


    updateUsageUI();

    updateProPage();
}


/* =========================================================
   USAGE UI
   ========================================================= */

function getRemainingMessages() {

    if (!state.user) {
        return null;
    }


    if (state.user.plan === "pro") {
        return null;
    }


    if (
        typeof state.user.aiMessagesRemaining ===
        "number"
    ) {

        return Math.max(
            0,
            state.user.aiMessagesRemaining
        );

    }


    const used =
        Number(
            state.user.aiMessagesUsed || 0
        );


    return Math.max(
        0,
        1 - used
    );
}


/* =========================================================
   UPDATE USAGE UI
   ========================================================= */

function updateUsageUI() {

    if (!state.user) {
        return;
    }


    const isPro =
        state.user.plan === "pro";


    const remaining =
        getRemainingMessages();


    /*
     * Existing optional elements.
     *
     * If they exist in index.html, they are updated.
     */

    const sidebarUsage =
        $("sidebarUsage");

    const accountUsage =
        $("accountUsage");

    const chatUsage =
        $("chatUsage");

    const mobileUsage =
        $("mobileUsage");


    if (isPro) {

        setElementText(
            sidebarUsage,
            "∞ UNLIMITED AI MESSAGES"
        );

        setElementText(
            accountUsage,
            "∞ UNLIMITED AI MESSAGES"
        );

        setElementText(
            chatUsage,
            "💎 PRO — UNLIMITED AI MESSAGES"
        );

        setElementText(
            mobileUsage,
            "∞ UNLIMITED"
        );

        return;
    }


    const text =
        remaining === 1
            ? "1 AI MESSAGE REMAINING"
            : "0 AI MESSAGES REMAINING";


    setElementText(
        sidebarUsage,
        text
    );


    setElementText(
        accountUsage,
        text
    );


    setElementText(
        chatUsage,
        remaining === 1
            ? "🆓 FREE — 1 AI MESSAGE REMAINING"
            : "🔒 FREE LIMIT REACHED — UPGRADE TO PRO"
    );


    setElementText(
        mobileUsage,
        remaining === 1
            ? "1 LEFT"
            : "0 LEFT"
    );
}


/* =========================================================
   SET ELEMENT TEXT
   ========================================================= */

function setElementText(element, text) {

    if (!element) {
        return;
    }

    element.textContent = text;
}


/* =========================================================
   PRO STATUS
   ========================================================= */

function getProStatusText(
    isPro,
    request
) {

    if (isPro) {
        return "Active";
    }


    if (request === "pending") {
        return "Request Pending";
    }


    if (request === "rejected") {
        return "Request Rejected";
    }


    return "Not active";
}


/* =========================================================
   PRO PAGE
   ========================================================= */

function updateProPage() {

    if (!state.user) {
        return;
    }


    const container =
        $("proAction");


    if (!container) {
        return;
    }


    const isPro =
        state.user.plan === "pro";


    const request =
        state.user.proRequest || "none";


    if (isPro) {

        container.innerHTML = `

            <div class="pro-active">

                <div class="pro-active-icon">
                    ✓
                </div>

                <div>

                    <strong>
                        NEXA PRO ACTIVE
                    </strong>

                    <p>
                        Your account has full Pro access.
                        AI messages are unlimited.
                    </p>

                </div>

            </div>

        `;

        return;
    }


    if (request === "pending") {

        container.innerHTML = `

            <div class="request-pending">

                <div>

                    <strong>
                        REQUEST PENDING
                    </strong>

                    <p>
                        The developer is reviewing your request.
                    </p>

                </div>

                <button
                    class="cancel-btn"
                    onclick="cancelProRequest()">

                    Cancel Request

                </button>

            </div>

        `;

        return;
    }


    if (request === "rejected") {

        container.innerHTML = `

            <div class="request-rejected">

                <strong>
                    REQUEST REJECTED
                </strong>

                <p>
                    You can submit another request.
                </p>

                <button
                    class="pro-btn"
                    onclick="requestPro()">

                    REQUEST AGAIN — ₹99

                </button>

            </div>

        `;

        return;
    }


    container.innerHTML = `

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

    if (!state.user) {
        return;
    }


    setLoading(true);


    try {

        const data =
            await api(
                "/api/pro/request",
                {
                    method: "POST"
                }
            );


        state.user =
            data.user;


        updateUserUI();


        showToast(
            "Pro request sent to the developer.",
            "success"
        );


    } catch (error) {

        showToast(
            error.message,
            "error"
        );

    } finally {

        setLoading(false);

    }
}


/* =========================================================
   CANCEL PRO REQUEST
   ========================================================= */

async function cancelProRequest() {

    setLoading(true);


    try {

        const data =
            await api(
                "/api/pro/cancel",
                {
                    method: "POST"
                }
            );


        state.user =
            data.user;


        updateUserUI();


        showToast(
            "Pro request cancelled.",
            "success"
        );


    } catch (error) {

        showToast(
            error.message,
            "error"
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


    pages.forEach(
        page => {

            page.classList.remove(
                "active-page"
            );

        }
    );


    const target =
        $(pageId);


    if (target) {

        target.classList.add(
            "active-page"
        );

    }


    const buttons =
        document.querySelectorAll(
            ".nav-btn"
        );


    buttons.forEach(
        button => {

            button.classList.remove(
                "active"
            );


            if (
                button.dataset.page ===
                pageId
            ) {

                button.classList.add(
                    "active"
                );

            }

        }
    );


    closeMobileSidebar();
}


/* =========================================================
   MOBILE SIDEBAR
   ========================================================= */

function toggleSidebar() {

    const sidebar =
        $("sidebar");


    if (!sidebar) {
        return;
    }


    sidebar.classList.toggle(
        "mobile-open"
    );
}


function closeMobileSidebar() {

    const sidebar =
        $("sidebar");


    if (!sidebar) {
        return;
    }


    sidebar.classList.remove(
        "mobile-open"
    );
}


/* =========================================================
   CHAT
   ========================================================= */

async function handleChatSubmit(event) {

    event.preventDefault();


    const input =
        $("chatInput");


    if (!input) {
        return;
    }


    const message =
        input.value.trim();


    if (!message) {
        return;
    }


    /*
     * Refresh plan before sending.
     * This prevents an outdated frontend state.
     */

    await refreshCurrentUser();


    /*
     * Client-side convenience check.
     *
     * IMPORTANT:
     * The server still performs the real security check.
     */

    if (
        state.user &&
        state.user.plan !== "pro" &&
        getRemainingMessages() <= 0
    ) {

        showFreeLimitUI();

        return;
    }


    input.value = "";

    input.style.height = "auto";


    removeWelcomeMessage();


    addUserMessage(message);


    const typingId =
        addTypingMessage();


    const sendButton =
        $("sendButton");


    if (sendButton) {
        sendButton.disabled = true;
    }


    try {

        const data =
            await api(
                "/api/chat",
                {
                    method: "POST",

                    body: JSON.stringify({
                        message
                    })
                }
            );


        removeMessage(
            typingId
        );


        addAssistantMessage(
            data.reply ||
            "I don't have a response yet."
        );


        /*
         * Update the local user usage immediately.
         */

        if (state.user) {

            state.user.plan =
                data.plan ||
                state.user.plan;


            if (
                typeof data.aiMessagesUsed ===
                "number"
            ) {

                state.user.aiMessagesUsed =
                    data.aiMessagesUsed;

            }


            if (
                data.aiMessagesRemaining !==
                undefined
            ) {

                state.user.aiMessagesRemaining =
                    data.aiMessagesRemaining;

            }

        }


        updateUserUI();


        /*
         * Ask server for the latest authoritative state.
         */

        await refreshCurrentUser();


        /*
         * Tell Free user that their one message
         * has now been consumed.
         */

        if (
            state.user &&
            state.user.plan !== "pro" &&
            getRemainingMessages() <= 0
        ) {

            showToast(
                "Your 1 free AI message has been used. Upgrade to Pro for unlimited messages.",
                "info"
            );

        }


    } catch (error) {

        removeMessage(
            typingId
        );


        /*
         * SPECIAL FREE LIMIT ERROR
         */

        if (
            error.code ===
            "FREE_LIMIT_REACHED"
            ||
            (
                error.status === 403 &&
                error.data &&
                error.data.code ===
                "FREE_LIMIT_REACHED"
            )
        ) {

            /*
             * Refresh latest account state.
             */

            await refreshCurrentUser();


            showFreeLimitUI();


            if (sendButton) {
                sendButton.disabled = false;
            }


            input.focus();

            return;
        }


        /*
         * Normal error.
         */

        addAssistantMessage(
            "⚠️ " +
            error.message
        );


        showToast(
            error.message,
            "error"
        );


    } finally {

        if (sendButton) {
            sendButton.disabled = false;
        }


        input.focus();

    }
}


/* =========================================================
   FREE LIMIT UI
   ========================================================= */

function showFreeLimitUI() {

    showToast(
        "Your 1 free AI message has been used. Upgrade to NEXA Pro for unlimited AI messages.",
        "info"
    );


    /*
     * Show a message inside chat.
     */

    addUpgradeMessage();
}


/* =========================================================
   UPGRADE MESSAGE
   ========================================================= */

function addUpgradeMessage() {

    const container =
        $("chatMessages");


    if (!container) {
        return;
    }


    /*
     * Prevent duplicate upgrade cards.
     */

    if (
        container.querySelector(
            ".nexa-upgrade-message"
        )
    ) {

        return;
    }


    const wrapper =
        document.createElement("div");


    wrapper.className =
        "message assistant-message nexa-upgrade-message";


    wrapper.innerHTML = `

        <div class="message-label">
            NEXA
        </div>

        <div class="message-bubble">

            <strong>
                🔒 Free message limit reached
            </strong>

            <br><br>

            You have used your
            <strong>1 free AI message</strong>.

            <br><br>

            Upgrade to
            <strong>NEXA PRO</strong>
            for unlimited AI messages.

            <br><br>

            <button
                type="button"
                class="pro-btn"
                onclick="openProPageFromChat()">

                💎 UPGRADE TO PRO — ₹99

            </button>

        </div>

    `;


    container.appendChild(
        wrapper
    );


    scrollChatToBottom();
}


/* =========================================================
   OPEN PRO PAGE
   ========================================================= */

function openProPageFromChat() {

    /*
     * Try common Pro page IDs.
     */

    const possiblePages = [
        "proPage",
        "upgradePage",
        "accountPage"
    ];


    for (
        const pageId of possiblePages
    ) {

        if ($(pageId)) {

            navigateTo(pageId);

            return;
        }

    }


    /*
     * If no dedicated Pro page exists,
     * show a toast instead.
     */

    showToast(
        "Open the Pro section to request NEXA Pro.",
        "info"
    );
}


/* =========================================================
   USER MESSAGE
   ========================================================= */

function addUserMessage(message) {

    const container =
        $("chatMessages");


    if (!container) {
        return;
    }


    const wrapper =
        document.createElement("div");


    wrapper.className =
        "message user-message";


    wrapper.innerHTML = `

        <div class="message-label">
            YOU
        </div>

        <div class="message-bubble">
            ${escapeHTML(message)}
        </div>

    `;


    container.appendChild(
        wrapper
    );


    scrollChatToBottom();
}


/* =========================================================
   ASSISTANT MESSAGE
   ========================================================= */

function addAssistantMessage(message) {

    const container =
        $("chatMessages");


    if (!container) {
        return;
    }


    const wrapper =
        document.createElement("div");


    wrapper.className =
        "message assistant-message";


    wrapper.innerHTML = `

        <div class="message-label">
            NEXA
        </div>

        <div class="message-bubble">
            ${formatAssistantText(message)}
        </div>

    `;


    container.appendChild(
        wrapper
    );


    scrollChatToBottom();
}


/* =========================================================
   TYPING MESSAGE
   ========================================================= */

function addTypingMessage() {

    const container =
        $("chatMessages");


    if (!container) {
        return null;
    }


    const id =
        "typing-" + Date.now();


    const wrapper =
        document.createElement("div");


    wrapper.id = id;


    wrapper.className =
        "message assistant-message";


    wrapper.innerHTML = `

        <div class="message-label">
            NEXA
        </div>

        <div class="message-bubble typing">

            <span></span>
            <span></span>
            <span></span>

        </div>

    `;


    container.appendChild(
        wrapper
    );


    scrollChatToBottom();


    return id;
}


/* =========================================================
   REMOVE MESSAGE
   ========================================================= */

function removeMessage(id) {

    if (!id) {
        return;
    }


    const element =
        $(id);


    if (element) {
        element.remove();
    }
}


/* =========================================================
   REMOVE WELCOME
   ========================================================= */

function removeWelcomeMessage() {

    const welcome =
        document.querySelector(
            ".welcome-message"
        );


    if (welcome) {
        welcome.remove();
    }
}


/* =========================================================
   CHAT SCROLL
   ========================================================= */

function scrollChatToBottom() {

    const container =
        $("chatMessages");


    if (!container) {
        return;
    }


    requestAnimationFrame(
        () => {

            container.scrollTop =
                container.scrollHeight;

        }
    );
}


/* =========================================================
   SUGGESTIONS
   ========================================================= */

function useSuggestion(text) {

    const input =
        $("chatInput");


    if (!input) {
        return;
    }


    input.value =
        text;


    input.focus();


    input.style.height =
        "auto";


    input.style.height =
        Math.min(
            input.scrollHeight,
            180
        ) + "px";
}


/* =========================================================
   FORMAT AI TEXT
   ========================================================= */

function formatAssistantText(text) {

    let safe =
        escapeHTML(
            String(text)
        );


    /*
     * Convert **text** to bold.
     */

    safe =
        safe.replace(
            /\*\*(.*?)\*\*/g,
            "<strong>$1</strong>"
        );


    /*
     * Convert new lines.
     */

    safe =
        safe.replace(
            /\n/g,
            "<br>"
        );


    return safe;
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {

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


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    try {

        if (state.token) {

            await fetch(
                "/api/logout",
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            "Bearer " +
                            state.token
                    }
                }
            );

        }

    } catch (error) {

        console.warn(error);

    }


    state.token = "";
    state.user = null;


    localStorage.removeItem(
        "nexa_token"
    );


    showAuthScreen();

    showAuth("login");


    showToast(
        "Logged out successfully.",
        "success"
    );
}


/* =========================================================
   TOAST
   ========================================================= */

let toastTimer = null;


function showToast(
    message,
    type = "info"
) {

    const toast =
        $("toast");


    if (!toast) {
        return;
    }


    toast.textContent =
        message;


    toast.className =
        "toast";


    toast.classList.add(
        `toast-${type}`
    );


    toast.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            3500
        );
}


/* =========================================================
   LOADING
   ========================================================= */

function setLoading(isLoading) {

    const overlay =
        $("loadingOverlay");


    if (!overlay) {
        return;
    }


    if (isLoading) {

        overlay.classList.remove(
            "hidden"
        );

    } else {

        overlay.classList.add(
            "hidden"
        );

    }
}


/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        const activeElement =
            document.activeElement;


        if (
            event.key === "/" &&
            activeElement &&
            activeElement.tagName !== "INPUT" &&
            activeElement.tagName !== "TEXTAREA"
        ) {

            event.preventDefault();


            const input =
                $("chatInput");


            if (input) {
                input.focus();
            }

        }

    }
);


/* =========================================================
   EXPOSE FUNCTIONS TO HTML
   ========================================================= */

window.showAuth =
    showAuth;

window.navigateTo =
    navigateTo;

window.toggleSidebar =
    toggleSidebar;

window.requestPro =
    requestPro;

window.cancelProRequest =
    cancelProRequest;

window.useSuggestion =
    useSuggestion;

window.logout =
    logout;

window.openProPageFromChat =
    openProPageFromChat;