const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { runPython, getPythonProgress } = require("./python_runner");

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

// Use Unicode NFC followed by JavaScript's locale-independent UTF-16 order,
// with the original spelling as a deterministic tie-breaker.
function compareText(a, b) {
    const normalizedA = a.normalize("NFC");
    const normalizedB = b.normalize("NFC");
    if (normalizedA < normalizedB) return -1;
    if (normalizedA > normalizedB) return 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

app.use(express.json());
const editTokens = new Map();
const TOKEN_LIFETIME = 30 * 60 * 1000; // 30 minutes

function consumeEditToken(token) {
    const expires = editTokens.get(token);
    if (!token || !expires || expires < Date.now()) {
        if (token) editTokens.delete(token);
        return false;
    }
    editTokens.delete(token);
    return true;
}

const CONFIG_PATH =
    path.resolve(__dirname, "../../config/data.json");

const config =
    JSON.parse(
        fs.readFileSync(CONFIG_PATH, "utf8")
    );

const ROOT = path.join(__dirname, "..");

app.use(express.static(ROOT));

// Serve the Plotly bundle from the build project's existing Python environment.
app.get("/plotly.min.js", (req, res) => {
    const libraryRoot = path.join(__dirname, "../../build/venv/lib");
    let bundlePath = null;
    try {
        const pythonDirectory = fs.readdirSync(libraryRoot)
            .find(name => /^python\d/.test(name));
        if (pythonDirectory) {
            const candidate = path.join(
                libraryRoot,
                pythonDirectory,
                "site-packages/plotly/package_data/plotly.min.js"
            );
            if (fs.existsSync(candidate)) bundlePath = candidate;
        }
    } catch (error) {
        console.error("Could not locate the Plotly browser bundle:", error);
    }
    if (!bundlePath) {
        return res.status(404).send("Plotly browser bundle is unavailable.");
    }
    res.sendFile(bundlePath);
});

const DIRS = {
    profiles: path.join(ROOT, "build", "profiles"),
    components: path.join(ROOT, "build", "components"),
    valuechains: path.join(ROOT, "build", "valuechains"),
};

let profilePlotCache = { signature: null, payload: null };
let profilePlotRequest = null;

function profileJsonSignature() {
    return fs.readdirSync(DIRS.profiles)
        .filter(file => file.endsWith(".json"))
        .sort()
        .map(file => {
            const jsonStat = fs.statSync(path.join(DIRS.profiles, file));
            const htmlPath = path.join(DIRS.profiles, file.replace(/\.json$/, ".html"));
            let htmlState = "missing";
            try {
                const htmlStat = fs.statSync(htmlPath);
                htmlState = `${htmlStat.size}:${htmlStat.mtimeMs}`;
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }
            return `${file}:${jsonStat.size}:${jsonStat.mtimeMs}:${htmlState}`;
        })
        .join("|");
}

function loadProfilePlotData() {
    const signature = profileJsonSignature();
    if (profilePlotCache.signature === signature && profilePlotCache.payload) {
        return Promise.resolve(profilePlotCache.payload);
    }
    if (profilePlotRequest?.signature === signature) {
        return profilePlotRequest.promise;
    }

    const script = path.join(__dirname, "../../build/analysis/mp_plot.py");
    const promise = new Promise((resolve, reject) => {
        execFile(PYTHON, [script, "--json"], {
            encoding: "utf8",
            maxBuffer: 4 * 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            try {
                const payload = JSON.parse(stdout);
                profilePlotCache = { signature, payload };
                resolve(payload);
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
    profilePlotRequest = { signature, promise };
    promise.finally(() => {
        if (profilePlotRequest?.promise === promise) profilePlotRequest = null;
    }).catch(() => {});
    return promise;
}

function uniqueRelationTargets(items) {
    return [...new Map(items.map(item => [item.file, item])).values()];
}

function runPythonRequest(req, script, input, label) {
    return runPython(
        PYTHON,
        script,
        { ...input, progressId: req.body?.progressId },
        label
    );
}

app.get("/api/python-progress/:id", (req, res) => {
    const after = Number.parseInt(req.query.after, 10) || 0;
    const progress = getPythonProgress(req.params.id, after);
    if (!progress) {
        return res.json({ lines: [], next: after, done: false });
    }
    res.json(progress);
});

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
        const { code, result } = await runPythonRequest(
            req,
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
    const { objectType, objectId, token } = req.body;
    const allowedTypes = new Set(["Profile", "Segment", "Component", "ValueChain"]);

    if (!allowedTypes.has(objectType) || typeof objectId !== "string" || !objectId) {
        return res.status(400).json({ ok: false, error: "Invalid model type or identifier." });
    }
    if (!consumeEditToken(token)) {
        return res.status(401).json({
            ok: false,
            error: "Enter the info-section password to confirm deletion.",
        });
    }

    try {
        const { code, result } = await runPythonRequest(
            req,
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
        const { code, result } = await runPythonRequest(
            req,
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
        || (kind === "news_article" && (typeof markdownName !== "string" || typeof markdownPath !== "string"))) {
        return res.status(400).json({ ok: false, error: "Invalid model or Markdown file." });
    }

    try {
        const { code, result } = await runPythonRequest(
            req,
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
    if (!consumeEditToken(token)) {
        return res
            .status(401)
            .send("Edit session expired.");
    }

    const data = {
        objectType,
        objectId,
        section,
        values
    };

    try {
        const { code, result } = await runPythonRequest(
            req,
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
        const { code, result } = await runPythonRequest(
            req,
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

app.get("/api/profile-plot", async (req, res) => {
    try {
        res.json(await loadProfilePlotData());
    } catch (error) {
        console.error("Could not prepare profile plot data:", error);
        res.status(500).json({ error: "Could not prepare profile plot data." });
    }
});

app.get("/api/mp-plot", (req, res) => {
    const { type, key } = req.query;
    if (!['Component', 'ValueChain'].includes(type) || typeof key !== "string" || !key) {
        return res.status(400).json({ error: "A Component or ValueChain type and key are required." });
    }

    const script = path.join(__dirname, "../../build/analysis/mp_plot.py");
    execFile(PYTHON, [script, "--figure", type, key], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
        if (error) {
            console.error("Could not create MP plot:", stderr || error);
            return res.status(500).json({ error: "Could not create MP plot." });
        }
        try {
            res.json({ figure: JSON.parse(stdout) });
        } catch (parseError) {
            console.error("Could not read MP plot output:", parseError);
            res.status(500).json({ error: "Could not read MP plot output." });
        }
    });
});

app.get("/api/:section", (req, res) => {
    const dir = DIRS[req.params.section];

    if (!dir) {
        return res.status(404).json({ error: "Unknown section" });
    }

    const files = fs.readdirSync(dir)
        .filter(file => file.endsWith(".html"))
        .sort()
        .map(file => {
            let reviewed = false;
            try {
                const jsonFile = path.join(dir, file.replace(/\.html$/, ".json"));
                const data = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
                reviewed = data.info_section?.reviewed === true;
            } catch (error) {
                console.error(`Could not read review status for ${file}:`, error);
            }
            return { file, reviewed };
        });

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
        segments: segments.sort((a, b) => compareText(a.file, b.file)),
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
