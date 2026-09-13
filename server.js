require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const app = express();

/* =========================================================
   NEXA ENVIRONMENT
========================================================= */

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

console.log(`
==============================================
              NEXA ENVIRONMENT
==============================================

.env loaded: ${Boolean(process.env.ADMIN_PASSWORD || process.env.GEMINI_API_KEY)}
Admin password configured: ${Boolean(ADMIN_PASSWORD)}
Admin password length: ${ADMIN_PASSWORD.length}
Gemini API configured: ${Boolean(GEMINI_API_KEY)}

==============================================
`);

/* =========================================================
   DATA SETUP
========================================================= */

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]", "utf8");
}

/* =========================================================
   APP SETUP
========================================================= */

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   IN-MEMORY SESSIONS
========================================================= */

const sessions = new Map();
const adminSessions = new Map();

/* =========================================================
   USER DATABASE HELPERS
========================================================= */

function readUsers() {
    try {
        const raw = fs.readFileSync(USERS_FILE, "utf8");

        if (!raw.trim()) {
            return [];
        }

        const users = JSON.parse(raw);

        if (!Array.isArray(users)) {
            return [];
        }

        return users;
    } catch (error) {
        console.error("Could not read users.json:", error.message);
        return [];
    }
}

function writeUsers(users) {
    try {
        fs.writeFileSync(
            USERS_FILE,
            JSON.stringify(users, null, 2),
            "utf8"
        );

        return true;
    } catch (error) {
        console.error("Could not write users.json:", error.message);
        return false;
    }
}

/* =========================================================
   GENERAL HELPERS
========================================================= */

function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

function normalizeUsername(username) {
    return String(username || "").trim().toLowerCase();
}

function publicUser(user) {
    const used = Number(user.aiMessagesUsed || 0);

    return {
        id: user.id,
        username: user.username,
        plan: user.plan || "free",
        proRequest: user.proRequest || "none",
        createdAt: user.createdAt,
        aiMessagesUsed: used,

        aiMessagesRemaining:
            user.plan === "pro"
                ? null
                : Math.max(0, 1 - used)
    };
}

function findUserById(id) {
    const users = readUsers();
    return users.find(user => user.id === id);
}

function saveUser(updatedUser) {
    const users = readUsers();

    const index = users.findIndex(
        user => user.id === updatedUser.id
    );

    if (index === -1) {
        return false;
    }

    users[index] = updatedUser;

    return writeUsers(users);
}

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

function requireUser(req, res, next) {
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Authentication required."
        });
    }

    const token = auth.slice(7);
    const userId = sessions.get(token);

    if (!userId) {
        return res.status(401).json({
            error: "Session expired. Please login again."
        });
    }

    const user = findUserById(userId);

    if (!user) {
        sessions.delete(token);

        return res.status(401).json({
            error: "User account not found."
        });
    }

    req.user = user;
    req.token = token;

    next();
}

function requireAdmin(req, res, next) {
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Admin authentication required."
        });
    }

    const token = auth.slice(7);

    if (!adminSessions.has(token)) {
        return res.status(401).json({
            error: "Admin session expired."
        });
    }

    req.adminToken = token;

    next();
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        service: "NEXA AI",
        status: "online",
        timestamp: new Date().toISOString()
    });
});

/* =========================================================
   REGISTER
========================================================= */

app.post("/api/register", async (req, res) => {
    try {
        const username = normalizeUsername(req.body.username);
        const password = String(req.body.password || "");

        if (!username || !password) {
            return res.status(400).json({
                error: "Username and password are required."
            });
        }

        if (username.length < 3) {
            return res.status(400).json({
                error: "Username must be at least 3 characters."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: "Password must be at least 6 characters."
            });
        }

        const users = readUsers();

        const existingUser = users.find(
            user => normalizeUsername(user.username) === username
        );

        if (existingUser) {
            return res.status(409).json({
                error: "Username already exists."
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = {
            id: crypto.randomUUID(),
            username,
            passwordHash,
            plan: "free",
            proRequest: "none",
            aiMessagesUsed: 0,
            createdAt: new Date().toISOString()
        };

        users.push(user);

        if (!writeUsers(users)) {
            return res.status(500).json({
                error: "Could not create account."
            });
        }

        const token = createToken();
        sessions.set(token, user.id);

        return res.status(201).json({
            message: "Account created successfully.",
            token,
            user: publicUser(user)
        });

    } catch (error) {
        console.error("Register error:", error);

        return res.status(500).json({
            error: "Registration failed."
        });
    }
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/api/login", async (req, res) => {
    try {
        const username = normalizeUsername(req.body.username);
        const password = String(req.body.password || "");

        if (!username || !password) {
            return res.status(400).json({
                error: "Username and password are required."
            });
        }

        const users = readUsers();

        const user = users.find(
            item => normalizeUsername(item.username) === username
        );

        if (!user) {
            return res.status(401).json({
                error: "Invalid username or password."
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!validPassword) {
            return res.status(401).json({
                error: "Invalid username or password."
            });
        }

        const token = createToken();

        sessions.set(token, user.id);

        return res.json({
            message: "Login successful.",
            token,
            user: publicUser(user)
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            error: "Login failed."
        });
    }
});

/* =========================================================
   CURRENT USER
========================================================= */

app.get("/api/me", requireUser, (req, res) => {
    res.json({
        user: publicUser(req.user)
    });
});

/* =========================================================
   PRO REQUEST
========================================================= */

app.post("/api/pro/request", requireUser, (req, res) => {
    const user = req.user;

    if (user.plan === "pro") {
        return res.status(400).json({
            error: "You already have NEXA Pro.",
            user: publicUser(user)
        });
    }

    if (user.proRequest === "pending") {
        return res.status(400).json({
            error: "Your Pro request is already pending.",
            user: publicUser(user)
        });
    }

    user.proRequest = "pending";

    if (!saveUser(user)) {
        return res.status(500).json({
            error: "Could not submit Pro request."
        });
    }

    res.json({
        message: "Pro request submitted successfully.",
        user: publicUser(user)
    });
});

/* =========================================================
   CANCEL PRO REQUEST
========================================================= */

app.post("/api/pro/cancel", requireUser, (req, res) => {
    const user = req.user;

    if (user.proRequest !== "pending") {
        return res.status(400).json({
            error: "There is no pending Pro request."
        });
    }

    user.proRequest = "none";

    if (!saveUser(user)) {
        return res.status(500).json({
            error: "Could not cancel Pro request."
        });
    }

    res.json({
        message: "Pro request cancelled.",
        user: publicUser(user)
    });
});

/* =========================================================
   ADMIN LOGIN
========================================================= */

app.post("/api/admin/login", (req, res) => {
    const password = String(req.body.password || "");

    if (!ADMIN_PASSWORD) {
        return res.status(500).json({
            error: "Admin password is not configured."
        });
    }

    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({
            error: "Invalid developer password."
        });
    }

    const token = createToken();

    adminSessions.set(token, {
        createdAt: Date.now()
    });

    res.json({
        message: "Developer login successful.",
        token
    });
});

/* =========================================================
   ADMIN USERS
========================================================= */

app.get("/api/admin/users", requireAdmin, (req, res) => {
    const users = readUsers();

    res.json({
        users: users.map(publicUser)
    });
});

/* =========================================================
   ADMIN APPROVE PRO
========================================================= */

app.post(
    "/api/admin/pro/:userId/approve",
    requireAdmin,
    (req, res) => {
        const user = findUserById(req.params.userId);

        if (!user) {
            return res.status(404).json({
                error: "User not found."
            });
        }

        user.plan = "pro";
        user.proRequest = "none";

        if (!saveUser(user)) {
            return res.status(500).json({
                error: "Could not approve Pro access."
            });
        }

        res.json({
            message: `${user.username} is now a NEXA Pro user.`,
            user: publicUser(user)
        });
    }
);

/* =========================================================
   ADMIN REJECT PRO
========================================================= */

app.post(
    "/api/admin/pro/:userId/reject",
    requireAdmin,
    (req, res) => {
        const user = findUserById(req.params.userId);

        if (!user) {
            return res.status(404).json({
                error: "User not found."
            });
        }

        user.proRequest = "rejected";

        if (!saveUser(user)) {
            return res.status(500).json({
                error: "Could not reject Pro request."
            });
        }

        res.json({
            message: `${user.username}'s Pro request was rejected.`,
            user: publicUser(user)
        });
    }
);

/* =========================================================
   ADMIN REVOKE PRO
========================================================= */

app.post(
    "/api/admin/pro/:userId/revoke",
    requireAdmin,
    (req, res) => {
        const user = findUserById(req.params.userId);

        if (!user) {
            return res.status(404).json({
                error: "User not found."
            });
        }

        user.plan = "free";
        user.proRequest = "none";

        /*
          IMPORTANT:
          aiMessagesUsed is NOT reset.

          This preserves the rule:
          FREE USERS GET 1 AI MESSAGE TOTAL.
        */

        if (!saveUser(user)) {
            return res.status(500).json({
                error: "Could not revoke Pro access."
            });
        }

        res.json({
            message: `${user.username}'s Pro access was revoked.`,
            user: publicUser(user)
        });
    }
);

/* =========================================================
   GEMINI HELPERS
========================================================= */

const GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash"
];

function extractGeminiText(data) {
    if (!data) {
        return "";
    }

    if (typeof data.text === "string") {
        return data.text.trim();
    }

    if (Array.isArray(data.candidates)) {
        for (const candidate of data.candidates) {
            const parts = candidate?.content?.parts;

            if (Array.isArray(parts)) {
                const text = parts
                    .map(part => part?.text || "")
                    .join("")
                    .trim();

                if (text) {
                    return text;
                }
            }
        }
    }

    return "";
}

async function askGemini(prompt) {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key is not configured.");
    }

    let lastError = null;

    for (const model of GEMINI_MODELS) {
        try {
            const url =
                `https://generativelanguage.googleapis.com/v1beta/models/` +
                `${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

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

            const rawText = await response.text();

            let data = {};

            try {
                data = rawText ? JSON.parse(rawText) : {};
            } catch {
                data = {};
            }

            if (!response.ok) {
                const errorMessage =
                    data?.error?.message ||
                    `Gemini request failed with status ${response.status}`;

                lastError = new Error(
                    `${model}: ${errorMessage}`
                );

                console.error(
                    `Gemini model ${model} failed:`,
                    errorMessage
                );

                continue;
            }

            const reply = extractGeminiText(data);

            if (!reply) {
                lastError = new Error(
                    `${model}: Gemini returned an empty response.`
                );

                console.error(
                    `Gemini model ${model} returned empty response.`
                );

                continue;
            }

            return {
                reply,
                model
            };

        } catch (error) {
            lastError = error;

            console.error(
                `Gemini model ${model} error:`,
                error.message
            );
        }
    }

    throw lastError || new Error("All Gemini models failed.");
}

/* =========================================================
   CHAT
========================================================= */

app.post("/api/chat", requireUser, async (req, res) => {
    const user = req.user;

    const prompt = String(req.body.prompt || "").trim();

    if (!prompt) {
        return res.status(400).json({
            error: "Please enter a message."
        });
    }

    /*
      FREE PLAN:
      Exactly 1 successful AI message total.
    */

    if (
        user.plan !== "pro" &&
        Number(user.aiMessagesUsed || 0) >= 1
    ) {
        return res.status(403).json({
            code: "FREE_LIMIT_REACHED",
            error: "You have used your 1 free AI message.",
            message:
                "Upgrade to NEXA Pro for unlimited AI messages.",
            plan: "free",
            aiMessagesUsed: 1,
            aiMessagesRemaining: 0
        });
    }

    try {
        const result = await askGemini(prompt);

        /*
          IMPORTANT:
          Free message is consumed ONLY after
          Gemini successfully returns a non-empty response.
        */

        if (user.plan !== "pro") {
            user.aiMessagesUsed =
                Number(user.aiMessagesUsed || 0) + 1;

            saveUser(user);
        }

        const used = Number(user.aiMessagesUsed || 0);

        res.json({
            reply: result.reply,
            model: result.model,
            plan: user.plan,
            aiMessagesUsed: used,

            aiMessagesRemaining:
                user.plan === "pro"
                    ? null
                    : Math.max(0, 1 - used)
        });

    } catch (error) {
        console.error("Chat error:", error.message);

        /*
          DO NOT increment aiMessagesUsed here.
          Failed AI requests don't consume the Free message.
        */

        res.status(502).json({
            code: "AI_REQUEST_FAILED",
            error: "NEXA could not get a response from the AI right now.",
            details: error.message
        });
    }
});

/* =========================================================
   USER LOGOUT
========================================================= */

app.post("/api/logout", requireUser, (req, res) => {
    sessions.delete(req.token);

    res.json({
        message: "Logged out successfully."
    });
});

/* =========================================================
   ADMIN LOGOUT
========================================================= */

app.post("/api/admin/logout", requireAdmin, (req, res) => {
    adminSessions.delete(req.adminToken);

    res.json({
        message: "Developer logged out successfully."
    });
});

/* =========================================================
   ADMIN ROUTE
========================================================= */

app.get("/admin", (req, res) => {
    res.sendFile(
        path.join(PUBLIC_DIR, "admin", "index.html")
    );
});

app.get("/admin/", (req, res) => {
    res.sendFile(
        path.join(PUBLIC_DIR, "admin", "index.html")
    );
});

/* =========================================================
   STATIC FILES
========================================================= */

app.use(express.static(PUBLIC_DIR));

/* =========================================================
   FRONTEND FALLBACK
========================================================= */

app.get("*", (req, res, next) => {
    if (
        req.path.startsWith("/api/") ||
        req.path.startsWith("/admin")
    ) {
        return next();
    }

    res.sendFile(
        path.join(PUBLIC_DIR, "index.html")
    );
});

/* =========================================================
   404
========================================================= */

app.use((req, res) => {
    res.status(404).json({
        error: "Route not found."
    });
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
    console.error("Server error:", err);

    res.status(500).json({
        error: "Internal server error."
    });
});

/* =========================================================
   START SERVER
========================================================= */

const server = app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(`
==============================================

             NEXA AI SERVER ONLINE

==============================================

PORT:     ${PORT}

USER APP:
http://0.0.0.0:${PORT}/

ADMIN:
http://0.0.0.0:${PORT}/admin/

HEALTH:
http://0.0.0.0:${PORT}/api/health

==============================================

FREE PLAN: 1 AI MESSAGE
PRO PLAN: UNLIMITED AI MESSAGES

==============================================

Gemini: ${GEMINI_API_KEY ? "KEY FOUND" : "KEY MISSING"}

==============================================

SERVER IS RUNNING
==============================================
`);
    }
);

/* =========================================================
   HEARTBEAT
========================================================= */

setInterval(() => {
    console.log(
        `[NEXA] Server heartbeat ${new Date().toISOString()}`
    );
}, 60000);

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

function shutdown(signal) {
    console.log(`\n[NEXA] ${signal} received. Shutting down...`);

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