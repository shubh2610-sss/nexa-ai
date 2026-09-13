require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_DIR = path.join(PUBLIC_DIR, "admin");
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash"
];

const sessions = new Map();
const adminSessions = new Map();


// ============================================================
// NEXA ENVIRONMENT
// ============================================================

console.log("");
console.log("==============================================");
console.log("              NEXA ENVIRONMENT");
console.log("==============================================");
console.log(".env loaded:", Boolean(process.env.GEMINI_API_KEY || process.env.ADMIN_PASSWORD));
console.log("Admin password configured:", Boolean(ADMIN_PASSWORD));
console.log("Admin password length:", ADMIN_PASSWORD.length);
console.log("Gemini API configured:", Boolean(GEMINI_API_KEY));
console.log("==============================================");
console.log("");


// ============================================================
// DATA SETUP
// ============================================================

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, "[]", "utf8");
    }
}

ensureDataFiles();


function readUsers() {
    try {
        const raw = fs.readFileSync(USERS_FILE, "utf8");

        if (!raw.trim()) {
            return [];
        }

        const users = JSON.parse(raw);

        return Array.isArray(users) ? users : [];
    } catch (error) {
        console.error("Failed to read users.json:", error);
        return [];
    }
}


function writeUsers(users) {
    fs.writeFileSync(
        USERS_FILE,
        JSON.stringify(users, null, 2),
        "utf8"
    );
}


// ============================================================
// HELPERS
// ============================================================

function generateId() {
    return crypto.randomUUID();
}


function normalizeUsername(username) {
    return String(username || "")
        .trim()
        .toLowerCase();
}


function publicUser(user) {
    if (!user) {
        return null;
    }

    const used = Number(user.aiMessagesUsed || 0);

    return {
        id: user.id,
        username: user.username,
        plan: user.plan || "free",
        proRequest: user.proRequest || null,
        createdAt: user.createdAt,
        aiMessagesUsed: used,
        aiMessagesRemaining:
            user.plan === "pro"
                ? null
                : Math.max(0, 1 - used)
    };
}


function sendError(res, status, error, extra = {}) {
    return res.status(status).json({
        error,
        ...extra
    });
}


function getSessionUser(req) {
    const sessionId = req.headers["x-session-id"];

    if (!sessionId) {
        return null;
    }

    const userId = sessions.get(sessionId);

    if (!userId) {
        return null;
    }

    const users = readUsers();

    return users.find(user => user.id === userId) || null;
}


function getAdminSession(req) {
    const sessionId = req.headers["x-admin-session"];

    if (!sessionId) {
        return false;
    }

    return adminSessions.has(sessionId);
}


function requireUser(req, res, next) {
    const user = getSessionUser(req);

    if (!user) {
        return sendError(res, 401, "Please login first.");
    }

    req.user = user;
    next();
}


function requireAdmin(req, res, next) {
    if (!getAdminSession(req)) {
        return sendError(res, 401, "Admin authentication required.");
    }

    next();
}


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));


// ============================================================
// HEALTH
// ============================================================

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        service: "NEXA AI",
        status: "online",
        time: new Date().toISOString()
    });
});


// ============================================================
// REGISTER
// ============================================================

app.post("/api/register", async (req, res) => {
    try {
        const username = normalizeUsername(req.body.username);
        const password = String(req.body.password || "");

        if (!username || !password) {
            return sendError(
                res,
                400,
                "Username and password are required."
            );
        }

        if (username.length < 3) {
            return sendError(
                res,
                400,
                "Username must contain at least 3 characters."
            );
        }

        if (password.length < 4) {
            return sendError(
                res,
                400,
                "Password must contain at least 4 characters."
            );
        }

        const users = readUsers();

        const existing = users.find(
            user => normalizeUsername(user.username) === username
        );

        if (existing) {
            return sendError(
                res,
                409,
                "Username already exists."
            );
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = {
            id: generateId(),
            username,
            passwordHash,
            plan: "free",
            proRequest: null,
            aiMessagesUsed: 0,
            createdAt: new Date().toISOString()
        };

        users.push(user);

        writeUsers(users);

        const sessionId = generateId();

        sessions.set(sessionId, user.id);

        return res.status(201).json({
            ok: true,
            sessionId,
            user: publicUser(user)
        });

    } catch (error) {
        console.error("REGISTER ERROR:", error);

        return sendError(
            res,
            500,
            "Registration failed."
        );
    }
});


// ============================================================
// LOGIN
// ============================================================

app.post("/api/login", async (req, res) => {
    try {
        const username = normalizeUsername(req.body.username);
        const password = String(req.body.password || "");

        const users = readUsers();

        const user = users.find(
            item => normalizeUsername(item.username) === username
        );

        if (!user) {
            return sendError(
                res,
                401,
                "Invalid username or password."
            );
        }

        const validPassword = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!validPassword) {
            return sendError(
                res,
                401,
                "Invalid username or password."
            );
        }

        const sessionId = generateId();

        sessions.set(sessionId, user.id);

        return res.json({
            ok: true,
            sessionId,
            user: publicUser(user)
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);

        return sendError(
            res,
            500,
            "Login failed."
        );
    }
});


// ============================================================
// CURRENT USER
// ============================================================

app.get("/api/me", requireUser, (req, res) => {
    res.json({
        ok: true,
        user: publicUser(req.user)
    });
});


// ============================================================
// PRO REQUEST
// ============================================================

app.post("/api/pro/request", requireUser, (req, res) => {
    const users = readUsers();

    const index = users.findIndex(
        user => user.id === req.user.id
    );

    if (index === -1) {
        return sendError(res, 404, "User not found.");
    }

    const user = users[index];

    if (user.plan === "pro") {
        return sendError(
            res,
            400,
            "You are already a NEXA Pro user."
        );
    }

    if (user.proRequest && user.proRequest.status === "pending") {
        return res.json({
            ok: true,
            message: "Your Pro request is already pending.",
            user: publicUser(user)
        });
    }

    user.proRequest = {
        status: "pending",
        requestedAt: new Date().toISOString()
    };

    writeUsers(users);

    return res.json({
        ok: true,
        message: "Pro request submitted successfully.",
        user: publicUser(user)
    });
});


// ============================================================
// CANCEL PRO REQUEST
// ============================================================

app.post("/api/pro/cancel", requireUser, (req, res) => {
    const users = readUsers();

    const index = users.findIndex(
        user => user.id === req.user.id
    );

    if (index === -1) {
        return sendError(res, 404, "User not found.");
    }

    const user = users[index];

    if (
        !user.proRequest ||
        user.proRequest.status !== "pending"
    ) {
        return sendError(
            res,
            400,
            "No pending Pro request found."
        );
    }

    user.proRequest = {
        status: "cancelled",
        cancelledAt: new Date().toISOString()
    };

    writeUsers(users);

    return res.json({
        ok: true,
        message: "Pro request cancelled.",
        user: publicUser(user)
    });
});


// ============================================================
// ADMIN LOGIN
// ============================================================

app.post("/api/admin/login", (req, res) => {
    const password = String(req.body.password || "");

    if (!ADMIN_PASSWORD) {
        return sendError(
            res,
            500,
            "Admin password is not configured."
        );
    }

    if (password !== ADMIN_PASSWORD) {
        return sendError(
            res,
            401,
            "Invalid admin password."
        );
    }

    const sessionId = generateId();

    adminSessions.set(sessionId, true);

    return res.json({
        ok: true,
        sessionId
    });
});


// ============================================================
// ADMIN USERS
// ============================================================

app.get(
    "/api/admin/users",
    requireAdmin,
    (req, res) => {
        const users = readUsers();

        res.json({
            ok: true,
            users: users.map(publicUser)
        });
    }
);


// ============================================================
// ADMIN APPROVE PRO
// ============================================================

app.post(
    "/api/admin/pro/:userId/approve",
    requireAdmin,
    (req, res) => {
        const users = readUsers();

        const index = users.findIndex(
            user => user.id === req.params.userId
        );

        if (index === -1) {
            return sendError(
                res,
                404,
                "User not found."
            );
        }

        const user = users[index];

        user.plan = "pro";

        user.proRequest = {
            status: "approved",
            approvedAt: new Date().toISOString()
        };

        writeUsers(users);

        return res.json({
            ok: true,
            message: `${user.username} is now a NEXA Pro user.`,
            user: publicUser(user)
        });
    }
);


// ============================================================
// ADMIN REJECT PRO
// ============================================================

app.post(
    "/api/admin/pro/:userId/reject",
    requireAdmin,
    (req, res) => {
        const users = readUsers();

        const index = users.findIndex(
            user => user.id === req.params.userId
        );

        if (index === -1) {
            return sendError(
                res,
                404,
                "User not found."
            );
        }

        const user = users[index];

        user.plan = "free";

        user.proRequest = {
            status: "rejected",
            rejectedAt: new Date().toISOString()
        };

        writeUsers(users);

        return res.json({
            ok: true,
            message: `${user.username}'s Pro request was rejected.`,
            user: publicUser(user)
        });
    }
);


// ============================================================
// ADMIN REVOKE PRO
// ============================================================

app.post(
    "/api/admin/pro/:userId/revoke",
    requireAdmin,
    (req, res) => {
        const users = readUsers();

        const index = users.findIndex(
            user => user.id === req.params.userId
        );

        if (index === -1) {
            return sendError(
                res,
                404,
                "User not found."
            );
        }

        const user = users[index];

        user.plan = "free";

        user.proRequest = {
            status: "revoked",
            revokedAt: new Date().toISOString()
        };

        // IMPORTANT:
        // We intentionally DO NOT reset aiMessagesUsed.
        // A free user gets only ONE successful AI message total.

        writeUsers(users);

        return res.json({
            ok: true,
            message: `${user.username}'s Pro access was revoked.`,
            user: publicUser(user)
        });
    }
);


// ============================================================
// GEMINI
// ============================================================

async function askGemini(prompt) {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key is not configured.");
    }

    let lastError = null;

    for (const model of GEMINI_MODELS) {
        try {
            console.log(`Trying Gemini model: ${model}`);

            const url =
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: prompt
                                }
                            ]
                        }
                    ]
                })
            });

            const text = await response.text();

            let data;

            try {
                data = JSON.parse(text);
            } catch {
                data = null;
            }

            if (!response.ok) {
                const message =
                    data?.error?.message ||
                    text ||
                    `Gemini returned HTTP ${response.status}`;

                console.error(
                    `Gemini ${model} failed:`,
                    response.status,
                    message
                );

                lastError = new Error(message);

                continue;
            }

            const answer =
                data?.candidates?.[0]?.content?.parts
                    ?.map(part => part.text || "")
                    .join("")
                    .trim();

            if (!answer) {
                lastError = new Error(
                    "Gemini returned an empty response."
                );

                continue;
            }

            console.log(`Gemini model successful: ${model}`);

            return answer;

        } catch (error) {
            console.error(
                `Gemini ${model} request error:`,
                error.message
            );

            lastError = error;
        }
    }

    throw (
        lastError ||
        new Error("All Gemini models failed.")
    );
}


// ============================================================
// CHAT
// ============================================================

app.post("/api/chat", requireUser, async (req, res) => {
    try {
        const prompt = String(req.body.prompt || "").trim();

        if (!prompt) {
            return sendError(
                res,
                400,
                "Please enter a message."
            );
        }

        const users = readUsers();

        const index = users.findIndex(
            user => user.id === req.user.id
        );

        if (index === -1) {
            return sendError(
                res,
                404,
                "User not found."
            );
        }

        const user = users[index];

        // ====================================================
        // FREE LIMIT
        // ====================================================

        if (
            user.plan !== "pro" &&
            Number(user.aiMessagesUsed || 0) >= 1
        ) {
            return res.status(403).json({
                code: "FREE_LIMIT_REACHED",
                error: "You have used your 1 free AI message.",
                message: "Upgrade to NEXA Pro for unlimited AI messages.",
                plan: "free",
                aiMessagesUsed: Number(
                    user.aiMessagesUsed || 0
                ),
                aiMessagesRemaining: 0
            });
        }

        // ====================================================
        // ASK GEMINI FIRST
        // ====================================================

        let answer;

        try {
            answer = await askGemini(prompt);
        } catch (error) {
            console.error("GEMINI FINAL ERROR:", error);

            return sendError(
                res,
                502,
                "NEXA could not get a response from Gemini.",
                {
                    details: error.message
                }
            );
        }

        // ====================================================
        // CONSUME FREE MESSAGE ONLY AFTER SUCCESS
        // ====================================================

        if (user.plan !== "pro") {
            user.aiMessagesUsed =
                Number(user.aiMessagesUsed || 0) + 1;

            writeUsers(users);
        }

        return res.json({
            ok: true,
            answer,
            user: publicUser(user)
        });

    } catch (error) {
        console.error("CHAT ERROR:", error);

        return sendError(
            res,
            500,
            "NEXA encountered an unexpected error."
        );
    }
});


// ============================================================
// USER LOGOUT
// ============================================================

app.post("/api/logout", (req, res) => {
    const sessionId = req.headers["x-session-id"];

    if (sessionId) {
        sessions.delete(sessionId);
    }

    res.json({
        ok: true
    });
});


// ============================================================
// ADMIN LOGOUT
// ============================================================

app.post("/api/admin/logout", (req, res) => {
    const sessionId = req.headers["x-admin-session"];

    if (sessionId) {
        adminSessions.delete(sessionId);
    }

    res.json({
        ok: true
    });
});


// ============================================================
// STATIC ADMIN FILES
// ============================================================

app.use(
    "/admin",
    express.static(ADMIN_DIR)
);


// ============================================================
// STATIC USER APP
// ============================================================

app.use(
    express.static(PUBLIC_DIR)
);


// ============================================================
// EXPRESS 5 FRONTEND FALLBACK
// ============================================================
//
// IMPORTANT:
// Do NOT use:
//
// app.get("*", ...)
//
// Express 5 throws:
//
// PathError: Missing parameter name at index 1: *
//
// So we use a normal middleware instead.
// ============================================================

app.use((req, res, next) => {
    if (
        req.method === "GET" &&
        !req.path.startsWith("/api/")
    ) {
        return res.sendFile(
            path.join(PUBLIC_DIR, "index.html")
        );
    }

    next();
});


// ============================================================
// 404
// ============================================================

app.use((req, res) => {
    res.status(404).json({
        error: "Not found"
    });
});


// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error("SERVER ERROR:", err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        error: "Internal server error."
    });
});


// ============================================================
// START SERVER
// ============================================================

const server = app.listen(
    PORT,
    HOST,
    () => {
        console.log("");
        console.log("==============================================");
        console.log("             NEXA SERVER ONLINE");
        console.log("==============================================");
        console.log(`PORT: ${PORT}`);
        console.log(`HOST: ${HOST}`);
        console.log(`USER APP: http://${HOST}:${PORT}/`);
        console.log(`ADMIN: http://${HOST}:${PORT}/admin/`);
        console.log(`HEALTH: http://${HOST}:${PORT}/api/health`);
        console.log("Gemini: " + (GEMINI_API_KEY ? "KEY FOUND" : "KEY MISSING"));
        console.log("==============================================");
        console.log("SERVER IS RUNNING...");
        console.log("");
    }
);


// ============================================================
// KEEP SERVER ALIVE / HEARTBEAT
// ============================================================

const heartbeat = setInterval(() => {
    console.log(
        `[NEXA] Server heartbeat ${new Date().toISOString()}`
    );
}, 5 * 60 * 1000);


// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

function shutdown(signal) {
    console.log(`\n[NEXA] ${signal} received. Shutting down...`);

    clearInterval(heartbeat);

    server.close(() => {
        console.log("[NEXA] Server closed.");
        process.exit(0);
    });

    setTimeout(() => {
        console.log("[NEXA] Forced shutdown.");
        process.exit(1);
    }, 10000);
}


process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));