const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { runPython } = require("./python_runner");

const PYTHON = path.join(
    __dirname,
    "../../build/venv",
    process.platform === "win32"
        ? "Scripts/python.exe"
        : "bin/python"
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

function uniqueRelationTargets(items) {
    return [...new Map(items.map(item => [item.file, item])).values()];
}

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

app.post("/api/update-instance", async (req, res) => {
    const { objectType, objectId } = req.body;
    const allowedTypes = new Set(["Profile", "Segment", "Component", "ValueChain"]);

    if (!allowedTypes.has(objectType) || typeof objectId !== "string" || !objectId) {
        return res.status(400).json({ ok: false, error: "Invalid model type or identifier." });
    }

    try {
        const { code, result } = await runPython(
            PYTHON,
            path.join(__dirname, "../../build/tools/update_instance.py"),
            { objectType, objectId },
            "model update"
        );
        if (code !== 0 || !result.ok) {
            return res.status(500).json(result);
        }
        res.json(result);
    } catch (error) {
        console.error("Model update failed:", error);
        const message = error.kind === "spawn"
            ? "Could not start model update."
            : error.kind === "stdin"
                ? "Could not send model update request."
                : "Invalid response from model update.";
        res.status(500).json({ ok: false, error: message });
    }
});

app.post("/api/delete-instance", async (req, res) => {
    const { objectType, objectId } = req.body;
    const allowedTypes = new Set(["Profile", "Segment", "Component", "ValueChain"]);

    if (!allowedTypes.has(objectType) || typeof objectId !== "string" || !objectId) {
        return res.status(400).json({ ok: false, error: "Invalid model type or identifier." });
    }

    try {
        const { code, result } = await runPython(
            PYTHON,
            path.join(__dirname, "../../build/tools/delete_instance.py"),
            { objectType, objectId },
            "model deletion"
        );
        if (code !== 0 || !result.ok) {
            return res.status(500).json(result);
        }
        res.json(result);
    } catch (error) {
        console.error("Model deletion failed:", error);
        const message = error.kind === "spawn"
            ? "Could not start model deletion."
            : error.kind === "stdin"
                ? "Could not send model deletion request."
                : "Model deletion failed.";
        res.status(500).json({ ok: false, error: message });
    }
});

app.post("/api/update-news", async (req, res) => {
    const { objectType, objectId } = req.body;
    const allowedTypes = new Set(["Profile", "Segment", "Component", "ValueChain"]);
    if (!allowedTypes.has(objectType) || typeof objectId !== "string" || !objectId) {
        return res.status(400).json({ ok: false, error: "Invalid model type or identifier." });
    }

    try {
        const { code, result } = await runPython(
            PYTHON,
            path.join(__dirname, "../../build/tools/refresh_news.py"),
            { objectType, objectId },
            "news refresh"
        );
        if (code !== 0 || !result.ok) {
            return res.status(500).json(result);
        }
        res.json(result);
    } catch (error) {
        console.error("News refresh failed:", error);
        res.status(500).json({
            ok: false,
            error: error.kind === "spawn"
                ? "Could not start news refresh."
                : "News refresh failed.",
        });
    }
});

app.post("/api/delete-markdown", async (req, res) => {
    const {
        objectType,
        objectId,
        markdownName,
        markdownPath,
        htmlPath,
        kind = "news_article",
    } = req.body;
    const allowedTypes = new Set(["Profile", "Segment", "Component", "ValueChain"]);
    if (!allowedTypes.has(objectType) || typeof objectId !== "string" || !objectId
        || !["news_article", "llm_research"].includes(kind)
        || typeof htmlPath !== "string"
        || (kind === "news_article" && (typeof markdownName !== "string" || typeof markdownPath !== "string"))
        || (kind === "llm_research" && objectType !== "Profile")) {
        return res.status(400).json({ ok: false, error: "Invalid model or Markdown file." });
    }

    try {
        const { code, result } = await runPython(
            PYTHON,
            path.join(__dirname, "../../build/tools/delete_markdown.py"),
            { objectType, objectId, markdownName, markdownPath, htmlPath, kind },
            kind === "llm_research" ? "LLM research deletion" : "Markdown deletion"
        );
        if (code !== 0 || !result.ok) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (error) {
        console.error("Markdown deletion failed:", error);
        res.status(500).json({
            ok: false,
            error: error.kind === "spawn"
                ? "Could not start Markdown file deletion."
                : "Markdown deletion failed.",
        });
    }
});

app.post("/api/update-info", async (req, res) => {

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

    const data = {
        objectType,
        objectId,
        section,
        values
    };

    try {
        const { code, result } = await runPython(
            PYTHON,
            path.join(__dirname, "../../build/tools/update_info.py"),
            data,
            "information update"
        );
        if (code !== 0) {
            return res.status(500).json(result);
        }
        if (!result.ok) {
            return res.status(400).send(result.error);
        }
        res.json(result);
    } catch (error) {
        console.error("Information update failed:", error);
        const message = error.kind === "spawn"
            ? "Could not start information update."
            : error.kind === "stdin"
                ? "Could not send information update request."
                : "Invalid response from Python.";
        res.status(500).send(message);
    }
});

app.post("/api/get-item", async (req, res) => {
    const query = req.body?.query;
    if (typeof query !== "string" || !query.trim()) {
        return res.status(400).json({ ok: false, error: "Enter a company name or code." });
    }

    try {
        const { code, result } = await runPython(
            PYTHON,
            path.join(__dirname, "../../build/tools/get_profile.py"),
            { query: query.trim() },
            "profile creation"
        );
        if (code !== 0 || !result.ok) {
            return res.status(422).json(result);
        }
        res.json(result);
    } catch (error) {
        console.error("Profile creation failed:", error);
        const message = error.kind === "spawn"
            ? "Could not start profile creation."
            : error.kind === "stdin"
                ? "Could not send profile creation request."
                : "Profile creation failed.";
        res.status(500).json({ ok: false, error: message });
    }
});

app.get("/api/tag-index", (req, res) => {
    const entries = [];

    for (const section of Object.keys(DIRS)) {
        const dir = DIRS[section];
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith(".json")) continue;

            try {
                const data = JSON.parse(
                    fs.readFileSync(path.join(dir, file), "utf8")
                );
                entries.push({
                    section,
                    file: file.replace(/\.json$/, ".html"),
                    tags: data.info_section?.tags ?? "",
                });
            } catch (error) {
                console.error(`Could not read tags from ${file}:`, error);
            }
        }
    }

    res.json(entries);
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

    const profileValuechains = uniqueRelationTargets(
        profileComponents.flatMap(component =>
            getValuechains(component.name, valuechains)
        )
    );

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
    const segmentValuechains = uniqueRelationTargets(
        segmentComponents.flatMap(component =>
            getValuechains(component.name, valuechains)
        )
    );

    let profile = null;
    const segments = [];
    for (const file of fs.readdirSync(DIRS.profiles)) {
        if (!file.endsWith(".json")) continue;

        const data = JSON.parse(
            fs.readFileSync(path.join(DIRS.profiles, file), "utf8")
        );
        if (data.key && data.key.startsWith(`${code}(`) && data.segment_name) {
            segments.push({
                name: data.segment_name,
                file: data.filename ?? file.replace(/\.json$/, ""),
                key: data.key,
            });
        }
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
        segments: segments.sort((a, b) => a.file.localeCompare(b.file)),
        components: segmentComponents,
        valuechains: segmentValuechains,
    });
});

app.get("/api/component/:name", (req, res) => {
    const name = req.params.name;
    const { components, valuechains } = loadData();
    const component = components.find(item =>
        item.filename === name || (item.key ?? item.name) === name
    );

    const componentValuechains = component
        ? getValuechains(component.key ?? component.name, valuechains)
        : [];

    res.json(componentValuechains);
});

const server = app.listen(3000, "127.0.0.1", () => {
    console.log("http://localhost:3000 running...");
});

server.on("error", error => {
    console.error("Server error:", error);
});
