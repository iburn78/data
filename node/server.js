const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PYTHON = path.join(
    __dirname,
    "../../build/venv/bin/python"
);

const { loadData } = require("./data");
const { getComponents, getComponentsForMember, getValuechains } = require("./lookup");
const app = express();

app.use(express.json());
const editTokens = new Map();
const TOKEN_LIFETIME = 30 * 60 * 1000; // 30 minutes

const CONFIG_PATH =
    path.resolve(__dirname, "../../config/data.json");

const config =
    JSON.parse(
        fs.readFileSync(CONFIG_PATH, "utf8")
    );

const ROOT = path.join(__dirname, "..");

app.use(express.static(ROOT));

const DIRS = {
    profiles: path.join(ROOT, "build", "profiles"),
    components: path.join(ROOT, "build", "components"),
    valuechains: path.join(ROOT, "build", "valuechains"),
};

app.post("/api/check-password", (req, res) => {

    const { password } = req.body;

    if (
        typeof password !== "string" ||
        password !== config.edit_password
    ) {
        return res
            .status(401)
            .send("Incorrect password.");
    }

    const token = crypto.randomBytes(32).toString("hex");

    editTokens.set(token, Date.now() + TOKEN_LIFETIME);

    res.json({
        ok: true,
        token: token
    });
});

app.post("/api/update-instance", (req, res) => {
    const { objectType, objectId } = req.body;
    const allowedTypes = new Set(["Profile", "Segment", "Component", "ValueChain"]);

    if (!allowedTypes.has(objectType) || typeof objectId !== "string" || !objectId) {
        return res.status(400).json({ ok: false, error: "Invalid model type or identifier." });
    }

    const python = spawn(
        PYTHON,
        [path.join(__dirname, "../../build/tools/update_instance.py")]
    );
    let response = "";

    python.stdout.on("data", data => console.log("Python:", data.toString()));
    python.stderr.on("data", data => { response += data.toString(); });
    python.on("error", error => {
        console.error("Model update failed:", error);
        if (!res.headersSent) {
            res.status(500).json({ ok: false, error: "Could not start model update." });
        }
    });
    python.on("close", code => {
        if (res.headersSent) return;
        if (code !== 0) {
            try {
                const result = JSON.parse(response);
                return res.status(500).json(result);
            } catch {
                return res.status(500).json({ ok: false, error: "Model update failed." });
            }
        }
        try {
            res.json(JSON.parse(response));
        } catch {
            res.status(500).json({ ok: false, error: "Invalid response from model update." });
        }
    });

    python.stdin.end(JSON.stringify({ objectType, objectId }));
});

app.post("/api/update-info", (req, res) => {

    const {
        token,
        objectType,
        objectId,
        section,
        values
    } = req.body;

    // Check edit token
    const expires = editTokens.get(token);

    if (!expires || expires < Date.now()) {
        editTokens.delete(token);

        return res
            .status(401)
            .send("Edit session expired.");
    }

    // Single-use token
    editTokens.delete(token);

    const data = JSON.stringify({
        objectType,
        objectId,
        section,
        values
    });

    const python = spawn(
        PYTHON,
        [
            path.join(
                __dirname,
                "../../build/tools/update_info.py"
            )
        ],
        { stdio: ["pipe", "pipe", "pipe", "pipe"] }
    );

    let response = "";
    let logs = "";

    // Python stdout/stderr are log streams. fd 3 is reserved for the JSON response.
    python.stdout.on("data", data => process.stdout.write(data));
    python.stderr.on("data", data => process.stderr.write(data));
    python.stdio[3].on("data", data => {
        response += data.toString();
    });

    python.on("close", code => {
        if (code !== 0) {
            console.error("Information update failed:", logs);
            try {
                return res.status(500).json(JSON.parse(response));
            } catch {
                return res
                    .status(500)
                    .send("Failed to update information.");
            }
        }

        try {
            const result = JSON.parse(response);

            if (!result.ok) {
                return res
                    .status(400)
                    .send(result.error);
            }

            res.json(result);

        } catch (e) {
            console.error("Invalid Python response:", response);
            console.error("Python logs:", logs);
            res.status(500).send("Invalid response from Python.");
        }
    });

    python.stdin.write(data);
    python.stdin.end();
});

app.get("/api/:section", (req, res) => {
    const dir = DIRS[req.params.section];

    if (!dir) {
        return res.status(404).json({ error: "Unknown section" });
    }

    const files = fs.readdirSync(dir)
        .filter(file => file.endsWith(".html"))
        .sort();

    res.json(files);
});

// Profile → Components → Valuechains
app.get("/api/profile/:code", (req, res) => {
    const code = req.params.code;
    const { components, valuechains } = loadData();

    const profileComponents = getComponents(
        code,
        components
    );

    const profileValuechains = [
        ...new Set(
            profileComponents.flatMap(component =>
                getValuechains(component, valuechains)
            )
        )
    ];

    res.json({
        components: profileComponents,
        valuechains: profileValuechains,
    });
});

app.get("/api/segment/:key", (req, res) => {
    const key = req.params.key;
    const code = key.replace(/\([A-Za-z]\)$/, "");
    const { components, valuechains } = loadData();
    const segmentComponents = getComponentsForMember(key, components);
    const segmentValuechains = [
        ...new Set(
            segmentComponents.flatMap(component =>
                getValuechains(component, valuechains)
            )
        )
    ];

    let profile = null;
    for (const file of fs.readdirSync(DIRS.profiles)) {
        if (!file.endsWith(".json")) continue;

        const data = JSON.parse(
            fs.readFileSync(path.join(DIRS.profiles, file), "utf8")
        );
        if ((data.code ?? data.key) === code) {
            profile = {
                name: data.name ?? code,
                file: file.replace(/\.json$/, ""),
            };
            break;
        }
    }

    res.json({
        profile,
        components: segmentComponents,
        valuechains: segmentValuechains,
    });
});

app.get("/api/component/:name", (req, res) => {
    const name = req.params.name;
    const { valuechains } = loadData();

    const componentValuechains = getValuechains(name, valuechains);

    res.json(componentValuechains);
});

const server = app.listen(3000, () => {
    console.log("http://localhost:3000 running...");
});

server.on("error", error => {
    console.error("Server error:", error);
});
