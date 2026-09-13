const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

/* =========================================================
   NEXA AI SERVER
   FREE = 1 AI MESSAGE
   PRO  = UNLIMITED AI MESSAGES
   ========================================================= */

const ENV_PATH = path.join(__dirname, ".env");

const envResult = dotenv.config({
    path: ENV_PATH,
    override: true
});

const PORT = Number(process.env.PORT) || 3000;

const ADMIN_PASSWORD = String(
    process.env.ADMIN_PASSWORD || ""
).trim();

const GEMINI_API_KEY = String(
    process.env.GEMINI_API_KEY || ""
).trim();

console.log("");
console.log("==============================================");
console.log("              NEXA ENVIRONMENT");
console.log("==============================================");

console.log(
    ".env loaded:",
    !envResult.error
);

console.log(
    "Admin password configured:",
    ADMIN_PASSWORD.length > 0
);

console.log(
    "Admin password length:",
    ADMIN_PASSWORD.length
);

console.log(
    "Gemini API configured:",
    GEMINI_API_KEY.length > 0
);

console.log("==============================================");
console.log("");

const app = express();

/* =========================================================
   MIDDLEWARE
   ========================================================= */

app.use(
    express.json({
        limit: "2mb"
    })
);

/* =========================================================
   DIRECTORIES
   ========================================================= */

const DATA_DIR = path.join(
    __dirname,
    "data"
);

const DB_FILE = path.join(
    DATA_DIR,
    "users.json"
);

const PUBLIC_DIR = path.join(
    __dirname,
    "public"
);

const ADMIN_DIR = path.join(
    PUBLIC_DIR,
    "admin"
);

/* =========================================================
   DATABASE SETUP
   ========================================================= */

if (!fs.existsSync(DATA_DIR)) {

    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );
}

if (!fs.existsSync(DB_FILE)) {

    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(
            {
                users: []
            },
            null,
            2
        ),
        "utf8"
    );
}

/* =========================================================
   DATABASE FUNCTIONS
   ========================================================= */

function readDatabase() {

    try {

        const raw =
            fs.readFileSync(
                DB_FILE,
                "utf8"
            );

        const data =
            JSON.parse(raw);

        if (
            !data ||
            !Array.isArray(data.users)
        ) {

            return {
                users: []
            };
        }

        /*
         * Automatically add aiMessagesUsed
         * to older users created before
         * the Free-message system.
         */

        data.users.forEach(
            user => {

                if (
                    typeof user.aiMessagesUsed !==
                    "number"
                ) {

                    user.aiMessagesUsed = 0;
                }
            }
        );

        return data;

    } catch (error) {

        console.error(
            "Database read error:",
            error.message
        );

        return {
            users: []
        };
    }
}

function writeDatabase(data) {

    try {

        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(
                data,
                null,
                2
            ),
            "utf8"
        );

    } catch (error) {

        console.error(
            "Database write error:",
            error.message
        );

        throw error;
    }
}

/* =========================================================
   SESSIONS
   ========================================================= */

const sessions = new Map();

const adminSessions = new Set();

/* =========================================================
   TOKEN
   ========================================================= */

function createToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");
}

/* =========================================================
   PUBLIC USER
   ========================================================= */

function publicUser(user) {

    const used =
        Number(
            user.aiMessagesUsed || 0
        );

    return {

        id:
            user.id,

        username:
            user.username,

        plan:
            user.plan,

        proRequest:
            user.proRequest,

        createdAt:
            user.createdAt,

        aiMessagesUsed:
            used,

        aiMessagesRemaining:
            user.plan === "pro"
                ? null
                : Math.max(
                    0,
                    1 - used
                )
    };
}

/* =========================================================
   GET USER FROM REQUEST
   ========================================================= */

function getUserFromRequest(req) {

    const authorization =
        req.headers.authorization || "";

    if (
        !authorization.startsWith(
            "Bearer "
        )
    ) {

        return null;
    }

    const token =
        authorization.substring(7);

    const userId =
        sessions.get(token);

    if (!userId) {

        return null;
    }

    const db =
        readDatabase();

    return (
        db.users.find(
            user =>
                user.id === userId
        ) || null
    );
}

/* =========================================================
   REQUIRE USER
   ========================================================= */

function requireUser(
    req,
    res,
    next
) {

    const user =
        getUserFromRequest(req);

    if (!user) {

        return res.status(401).json({

            error:
                "Unauthorized. Please login."
        });
    }

    req.user =
        user;

    next();
}

/* =========================================================
   REQUIRE ADMIN
   ========================================================= */

function requireAdmin(
    req,
    res,
    next
) {

    const authorization =
        req.headers.authorization || "";

    if (
        !authorization.startsWith(
            "Bearer "
        )
    ) {

        return res.status(401).json({

            error:
                "Developer authentication required."
        });
    }

    const token =
        authorization.substring(7);

    if (
        !adminSessions.has(token)
    ) {

        return res.status(401).json({

            error:
                "Invalid developer session."
        });
    }

    next();
}

/* =========================================================
   HEALTH
   ========================================================= */

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            status:
                "online",

            name:
                "NEXA AI",

            port:
                PORT,

            adminConfigured:
                ADMIN_PASSWORD.length > 0,

            geminiConfigured:
                GEMINI_API_KEY.length > 0,

            freeMessages:
                1,

            proMessages:
                "unlimited",

            time:
                new Date().toISOString()
        });
    }
);

/* =========================================================
   REGISTER
   ========================================================= */

app.post(
    "/api/register",
    async (req, res) => {

        try {

            const username =
                String(
                    req.body?.username || ""
                ).trim();

            const password =
                String(
                    req.body?.password || ""
                );

            if (
                username.length < 3
            ) {

                return res.status(400).json({

                    error:
                        "Username must be at least 3 characters."
                });
            }

            if (
                username.length > 30
            ) {

                return res.status(400).json({

                    error:
                        "Username must be less than 30 characters."
                });
            }

            if (
                password.length < 6
            ) {

                return res.status(400).json({

                    error:
                        "Password must be at least 6 characters."
                });
            }

            const db =
                readDatabase();

            const exists =
                db.users.some(
                    user =>
                        String(
                            user.username
                        ).toLowerCase() ===
                        username.toLowerCase()
                );

            if (exists) {

                return res.status(409).json({

                    error:
                        "Username already exists."
                });
            }

            const passwordHash =
                await bcrypt.hash(
                    password,
                    10
                );

            const user = {

                id:
                    crypto.randomUUID(),

                username,

                passwordHash,

                plan:
                    "free",

                proRequest:
                    "none",

                aiMessagesUsed:
                    0,

                createdAt:
                    new Date().toISOString()
            };

            db.users.push(user);

            writeDatabase(db);

            const token =
                createToken();

            sessions.set(
                token,
                user.id
            );

            console.log(
                "New user registered:",
                username
            );

            res.json({

                message:
                    "Account created successfully.",

                token,

                user:
                    publicUser(user)
            });

        } catch (error) {

            console.error(
                "Register error:",
                error
            );

            res.status(500).json({

                error:
                    "Server error while creating account."
            });
        }
    }
);

/* =========================================================
   LOGIN
   ========================================================= */

app.post(
    "/api/login",
    async (req, res) => {

        try {

            const username =
                String(
                    req.body?.username || ""
                ).trim();

            const password =
                String(
                    req.body?.password || ""
                );

            const db =
                readDatabase();

            const user =
                db.users.find(
                    item =>
                        String(
                            item.username
                        ).toLowerCase() ===
                        username.toLowerCase()
                );

            if (!user) {

                return res.status(401).json({

                    error:
                        "Invalid username or password."
                });
            }

            const valid =
                await bcrypt.compare(
                    password,
                    user.passwordHash
                );

            if (!valid) {

                return res.status(401).json({

                    error:
                        "Invalid username or password."
                });
            }

            const token =
                createToken();

            sessions.set(
                token,
                user.id
            );

            console.log(
                "User login:",
                username
            );

            res.json({

                message:
                    "Login successful.",

                token,

                user:
                    publicUser(user)
            });

        } catch (error) {

            console.error(
                "Login error:",
                error
            );

            res.status(500).json({

                error:
                    "Server error while logging in."
            });
        }
    }
);

/* =========================================================
   CURRENT USER
   ========================================================= */

app.get(
    "/api/me",
    requireUser,
    (req, res) => {

        res.json({

            user:
                publicUser(
                    req.user
                )
        });
    }
);

/* =========================================================
   REQUEST PRO
   ========================================================= */

app.post(
    "/api/pro/request",
    requireUser,
    (req, res) => {

        const db =
            readDatabase();

        const user =
            db.users.find(
                item =>
                    item.id ===
                    req.user.id
            );

        if (!user) {

            return res.status(404).json({

                error:
                    "User not found."
            });
        }

        if (
            user.plan ===
            "pro"
        ) {

            return res.status(400).json({

                error:
                    "You already have Pro access."
            });
        }

        if (
            user.proRequest ===
            "pending"
        ) {

            return res.status(400).json({

                error:
                    "Your Pro request is already pending."
            });
        }

        user.proRequest =
            "pending";

        user.proRequestedAt =
            new Date().toISOString();

        writeDatabase(db);

        console.log(
            "Pro request:",
            user.username
        );

        res.json({

            message:
                "Pro request sent to developer.",

            user:
                publicUser(user)
        });
    }
);

/* =========================================================
   CANCEL PRO REQUEST
   ========================================================= */

app.post(
    "/api/pro/cancel",
    requireUser,
    (req, res) => {

        const db =
            readDatabase();

        const user =
            db.users.find(
                item =>
                    item.id ===
                    req.user.id
            );

        if (!user) {

            return res.status(404).json({

                error:
                    "User not found."
            });
        }

        if (
            user.proRequest !==
            "pending"
        ) {

            return res.status(400).json({

                error:
                    "There is no pending Pro request."
            });
        }

        user.proRequest =
            "none";

        delete user.proRequestedAt;

        writeDatabase(db);

        res.json({

            message:
                "Pro request cancelled.",

            user:
                publicUser(user)
        });
    }
);

/* =========================================================
   ADMIN LOGIN
   ========================================================= */

app.post(
    "/api/admin/login",
    (req, res) => {

        const password =
            String(
                req.body?.password || ""
            ).trim();

        console.log("");
        console.log(
            "ADMIN LOGIN ATTEMPT"
        );

        console.log(
            "Received password length:",
            password.length
        );

        console.log(
            "Configured password length:",
            ADMIN_PASSWORD.length
        );

        if (
            !ADMIN_PASSWORD
        ) {

            console.error(
                "ADMIN PASSWORD IS NOT CONFIGURED!"
            );

            return res.status(500).json({

                error:
                    "Admin password is not configured on the server."
            });
        }

        if (
            password !==
            ADMIN_PASSWORD
        ) {

            console.log(
                "Admin login FAILED."
            );

            return res.status(401).json({

                error:
                    "Incorrect developer password."
            });
        }

        const token =
            createToken();

        adminSessions.add(
            token
        );

        console.log(
            "Admin login SUCCESSFUL."
        );

        res.json({

            message:
                "Developer login successful.",

            token
        });
    }
);

/* =========================================================
   ADMIN USERS
   ========================================================= */

app.get(
    "/api/admin/users",
    requireAdmin,
    (req, res) => {

        const db =
            readDatabase();

        res.json({

            users:
                db.users.map(
                    publicUser
                )
        });
    }
);

/* =========================================================
   ADMIN APPROVE PRO
   ========================================================= */

app.post(
    "/api/admin/pro/:userId/approve",
    requireAdmin,
    (req, res) => {

        const db =
            readDatabase();

        const user =
            db.users.find(
                item =>
                    item.id ===
                    req.params.userId
            );

        if (!user) {

            return res.status(404).json({

                error:
                    "User not found."
            });
        }

        user.plan =
            "pro";

        user.proRequest =
            "approved";

        user.proApprovedAt =
            new Date().toISOString();

        writeDatabase(db);

        console.log(
            "Pro approved:",
            user.username
        );

        res.json({

            message:
                "Pro access approved.",

            user:
                publicUser(user)
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

        const db =
            readDatabase();

        const user =
            db.users.find(
                item =>
                    item.id ===
                    req.params.userId
            );

        if (!user) {

            return res.status(404).json({

                error:
                    "User not found."
            });
        }

        user.proRequest =
            "rejected";

        user.proRejectedAt =
            new Date().toISOString();

        writeDatabase(db);

        console.log(
            "Pro rejected:",
            user.username
        );

        res.json({

            message:
                "Pro request rejected.",

            user:
                publicUser(user)
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

        const db =
            readDatabase();

        const user =
            db.users.find(
                item =>
                    item.id ===
                    req.params.userId
            );

        if (!user) {

            return res.status(404).json({

                error:
                    "User not found."
            });
        }

        user.plan =
            "free";

        user.proRequest =
            "none";

        user.proRevokedAt =
            new Date().toISOString();

        /*
         * IMPORTANT:
         *
         * We do NOT reset aiMessagesUsed.
         *
         * If someone used their free message
         * before getting Pro, then after Pro
         * is revoked they remain at 0 messages.
         */

        writeDatabase(db);

        console.log(
            "Pro revoked:",
            user.username
        );

        res.json({

            message:
                "Pro access revoked.",

            user:
                publicUser(user)
        });
    }
);

/* =========================================================
   REAL GEMINI AI
   FREE = 1 MESSAGE
   PRO = UNLIMITED
   ========================================================= */

app.post(
    "/api/chat",
    requireUser,
    async (req, res) => {

        try {

            const message =
                String(
                    req.body?.message || ""
                ).trim();

            if (!message) {

                return res.status(400).json({

                    error:
                        "Message cannot be empty."
                });
            }

            /*
             * ALWAYS READ FRESH DATABASE
             * BEFORE CHECKING THE LIMIT.
             */

            let db =
                readDatabase();

            let user =
                db.users.find(
                    item =>
                        item.id ===
                        req.user.id
                );

            if (!user) {

                return res.status(404).json({

                    error:
                        "User not found."
                });
            }

            /*
             * Make sure old accounts
             * have the counter.
             */

            if (
                typeof user.aiMessagesUsed !==
                "number"
            ) {

                user.aiMessagesUsed =
                    0;
            }

            /* =================================================
               FREE USER LIMIT
               ================================================= */

            if (
                user.plan !== "pro" &&
                user.aiMessagesUsed >= 1
            ) {

                return res.status(403).json({

                    code:
                        "FREE_LIMIT_REACHED",

                    error:
                        "You have used your 1 free AI message.",

                    message:
                        "Upgrade to NEXA Pro for unlimited AI messages.",

                    plan:
                        "free",

                    aiMessagesUsed:
                        user.aiMessagesUsed,

                    aiMessagesRemaining:
                        0
                });
            }

            /* =================================================
               GEMINI KEY CHECK
               ================================================= */

            const apiKey =
                String(
                    process.env.GEMINI_API_KEY || ""
                ).trim();

            if (!apiKey) {

                console.error(
                    "GEMINI_API_KEY is missing."
                );

                return res.status(500).json({

                    error:
                        "Gemini API key is not configured on the server."
                });
            }

            /* =================================================
               NEXA SYSTEM INSTRUCTION
               ================================================= */

            const systemInstruction = `
You are NEXA, a powerful general-purpose AI assistant.

You are NOT an education-only assistant.

You can help with:

- General questions
- Coding
- Programming
- Mathematics
- Science
- Technology
- Writing
- Ideas
- Problem solving
- Productivity
- Research-style explanations
- Everyday questions
- Creative tasks

Important behavior:

1. Give useful and accurate answers.
2. Be clear and natural.
3. If the user asks for code, provide working code.
4. If the user asks for a complete file, provide the complete file.
5. If the user asks for step-by-step help, give numbered steps.
6. Do not unnecessarily repeat the user's question.
7. Do not reveal API keys.
8. Do not reveal server secrets.
9. You are NEXA AI.
10. The current user is ${user.username}.
11. Answer naturally like a modern AI assistant.
12. If you do not know something, say so instead of inventing facts.
`;

            /* =================================================
               GEMINI MODELS
               ================================================= */

            const models = [

                "gemini-3.6-flash",

                "gemini-3.5-flash",

                "gemini-3.5-flash-lite",

                "gemini-3.1-flash-lite",

                "gemini-2.5-flash"

            ];

            let lastError =
                null;

            let finalResponse =
                null;

            let usedModel =
                null;

            /* =================================================
               TRY GEMINI MODELS
               ================================================= */

            for (
                const model of models
            ) {

                try {

                    console.log(
                        `NEXA → Gemini request: ${model}`
                    );

                    const response =
                        await fetch(

                            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,

                            {

                                method:
                                    "POST",

                                headers: {

                                    "Content-Type":
                                        "application/json",

                                    "x-goog-api-key":
                                        apiKey
                                },

                                body:
                                    JSON.stringify({

                                        system_instruction: {

                                            parts: [

                                                {
                                                    text:
                                                        systemInstruction
                                                }

                                            ]
                                        },

                                        contents: [

                                            {

                                                role:
                                                    "user",

                                                parts: [

                                                    {
                                                        text:
                                                            message
                                                    }

                                                ]
                                            }

                                        ],

                                        generationConfig: {

                                            temperature:
                                                0.7,

                                            maxOutputTokens:
                                                4096
                                        }
                                    })
                            }
                        );

                    const data =
                        await response.json();

                    if (!response.ok) {

                        const errorMessage =
                            data?.error?.message ||
                            `HTTP ${response.status}`;

                        console.error(
                            `${model} failed:`,
                            errorMessage
                        );

                        lastError =
                            errorMessage;

                        continue;
                    }

                    finalResponse =
                        data;

                    usedModel =
                        model;

                    break;

                } catch (error) {

                    console.error(
                        `${model} connection error:`,
                        error.message
                    );

                    lastError =
                        error.message;
                }
            }

            /* =================================================
               GEMINI FAILED
               ================================================= */

            if (!finalResponse) {

                console.error(
                    "All Gemini models failed."
                );

                /*
                 * IMPORTANT:
                 *
                 * The Free message is NOT consumed
                 * because Gemini did not successfully
                 * answer.
                 */

                return res.status(502).json({

                    error:
                        "NEXA could not connect to Gemini.",

                    details:
                        lastError ||
                        "All Gemini models failed."
                });
            }

            /* =================================================
               EXTRACT GEMINI TEXT
               ================================================= */

            const candidates =
                finalResponse.candidates || [];

            const firstCandidate =
                candidates[0];

            const parts =
                firstCandidate
                    ?.content
                    ?.parts || [];

            const reply =
                parts
                    .map(
                        part =>
                            part.text || ""
                    )
                    .join("")
                    .trim();

            if (!reply) {

                console.error(
                    "Gemini returned no text."
                );

                console.error(
                    JSON.stringify(
                        finalResponse,
                        null,
                        2
                    )
                );

                /*
                 * Again:
                 * no Free message is consumed.
                 */

                return res.status(502).json({

                    error:
                        "Gemini returned an empty response."
                });
            }

            /* =================================================
               SUCCESSFUL RESPONSE
               NOW CONSUME FREE MESSAGE
               ================================================= */

            if (
                user.plan !== "pro"
            ) {

                user.aiMessagesUsed +=
                    1;

                writeDatabase(db);

                console.log(
                    `Free message used by ${user.username}: ${user.aiMessagesUsed}/1`
                );
            }

            /* =================================================
               RESPONSE
               ================================================= */

            console.log(
                "NEXA response generated using:",
                usedModel
            );

            const remaining =
                user.plan === "pro"
                    ? null
                    : Math.max(
                        0,
                        1 -
                        user.aiMessagesUsed
                    );

            res.json({

                reply,

                model:
                    usedModel,

                plan:
                    user.plan,

                aiMessagesUsed:
                    user.aiMessagesUsed,

                aiMessagesRemaining:
                    remaining
            });

        } catch (error) {

            console.error(
                "NEXA AI ERROR:",
                error
            );

            res.status(500).json({

                error:
                    "NEXA AI could not process your message."
            });
        }
    }
);

/* =========================================================
   USER LOGOUT
   ========================================================= */

app.post(
    "/api/logout",
    (req, res) => {

        const authorization =
            req.headers.authorization ||
            "";

        if (
            authorization.startsWith(
                "Bearer "
            )
        ) {

            sessions.delete(
                authorization.substring(7)
            );
        }

        res.json({

            message:
                "Logged out successfully."
        });
    }
);

/* =========================================================
   ADMIN LOGOUT
   ========================================================= */

app.post(
    "/api/admin/logout",
    (req, res) => {

        const authorization =
            req.headers.authorization ||
            "";

        if (
            authorization.startsWith(
                "Bearer "
            )
        ) {

            adminSessions.delete(
                authorization.substring(7)
            );
        }

        res.json({

            message:
                "Developer logged out successfully."
        });
    }
);

/* =========================================================
   ADMIN PAGE
   ========================================================= */

app.get(
    "/admin",
    (req, res) => {

        res.sendFile(
            path.join(
                ADMIN_DIR,
                "index.html"
            )
        );
    }
);

app.get(
    "/admin/",
    (req, res) => {

        res.sendFile(
            path.join(
                ADMIN_DIR,
                "index.html"
            )
        );
    }
);

/* =========================================================
   STATIC FILES
   ========================================================= */

app.use(
    express.static(
        PUBLIC_DIR
    )
);

/* =========================================================
   FRONTEND FALLBACK
   ========================================================= */

app.use(
    (req, res, next) => {

        if (
            req.method === "GET" &&
            !req.path.startsWith(
                "/api/"
            ) &&
            !req.path.startsWith(
                "/admin"
            )
        ) {

            return res.sendFile(
                path.join(
                    PUBLIC_DIR,
                    "index.html"
                )
            );
        }

        next();
    }
);

/* =========================================================
   404
   ========================================================= */

app.use(
    (req, res) => {

        res.status(404).json({

            error:
                "Page or API endpoint not found."
        });
    }
);

/* =========================================================
   START SERVER
   ========================================================= */

const server =
    app.listen(
        PORT,
        "127.0.0.1",
        () => {

            console.log("");

            console.log(
                "=============================================="
            );

            console.log(
                "           NEXA AI SERVER ONLINE"
            );

            console.log(
                "=============================================="
            );

            console.log(
                `USER APP: http://localhost:${PORT}/`
            );

            console.log(
                `ADMIN:    http://localhost:${PORT}/admin/`
            );

            console.log(
                `HEALTH:   http://localhost:${PORT}/api/health`
            );

            console.log(
                "=============================================="
            );

            console.log(
                "FREE PLAN: 1 AI MESSAGE"
            );

            console.log(
                "PRO PLAN: UNLIMITED AI MESSAGES"
            );

            console.log(
                "=============================================="
            );

            console.log(
                "Gemini:",
                GEMINI_API_KEY
                    ? "KEY FOUND"
                    : "NOT CONFIGURED"
            );

            console.log(
                "=============================================="
            );

            console.log(
                "SERVER IS RUNNING - DO NOT CLOSE THIS WINDOW"
            );

            console.log(
                "Waiting for requests..."
            );

            console.log("");
        }
    );

/* =========================================================
   SERVER ERROR
   ========================================================= */

server.on(
    "error",
    error => {

        console.error("");

        console.error(
            "=============================================="
        );

        console.error(
            "              NEXA SERVER ERROR"
        );

        console.error(
            "=============================================="
        );

        console.error(
            error
        );

        console.error(
            "=============================================="
        );
    }
);

/* =========================================================
   UNCAUGHT EXCEPTION
   ========================================================= */

process.on(
    "uncaughtException",
    error => {

        console.error(
            "UNCAUGHT EXCEPTION:",
            error
        );
    }
);

/* =========================================================
   UNHANDLED REJECTION
   ========================================================= */

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "UNHANDLED REJECTION:",
            error
        );
    }
);

/* =========================================================
   HEARTBEAT
   ========================================================= */

setInterval(
    () => {
        // NEXA heartbeat
    },
    30000
);

/* =========================================================
   GRACEFUL SHUTDOWN
   ========================================================= */

process.on(
    "SIGINT",
    () => {

        console.log("");

        console.log(
            "Stopping NEXA AI server..."
        );

        server.close(
            () => {

                console.log(
                    "NEXA AI server stopped."
                );

                process.exit(0);
            }
        );
    }
);

process.on(
    "SIGTERM",
    () => {

        server.close(
            () => {

                process.exit(0);
            }
        );
    }
);