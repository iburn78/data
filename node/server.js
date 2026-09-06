const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PYTHON = path.join(
    __dirname,
    "../../build/venv/bin/python"
);

const { components, valuechains } = require("./data");
const { getComponents, getValuechains } = require("./lookup");
const app = express();

app.use(express.json());
const editTokens = new Map();
const TOKEN_LIFETIME = 5 * 60 * 1000; // 5 minutes

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
        ]
    );

    let output = "";
    let error = "";

    python.stdout.on("data", data => {
        output += data.toString();
    });

    python.stderr.on("data", data => {
        error += data.toString();
        console.error("Python:", data.toString());
    });

    python.on("close", code => {

        // to prove python code success/failure
        // console.log("Python exit code:", code);

        if (code !== 0) {
            console.error("Python error:", error);

            return res
                .status(500)
                .send("Failed to update information.");
        }

        try {
            const result = JSON.parse(output);

            if (!result.ok) {
                return res
                    .status(400)
                    .send(result.error);
            }

            // JSON and HTML are next to each other
            const htmlPath =
                result.json_path.replace(/\.json$/, ".html");

            let html =
                fs.readFileSync(htmlPath, "utf8");

            const startMarker =
                `<!-- QUALITATIVE:${objectType}:${objectId}:${section} -->`;

            const endMarker =
                `<!-- /QUALITATIVE:${objectType}:${objectId}:${section} -->`;

            const start = html.indexOf(startMarker);
            const end = html.indexOf(endMarker);

            if (start === -1 || end === -1) {
                return res
                    .status(500)
                    .send("Qualitative section not found.");
            }

            html =
                html.slice(0, start) +
                result.html +
                html.slice(end + endMarker.length);

            fs.writeFileSync(htmlPath, html, "utf8");

            res.json(result);

        } catch (e) {
            console.error(
                "Invalid Python response:",
                output
            );

            res
                .status(500)
                .send("Invalid response from Python.");
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

app.get("/api/component/:name", (req, res) => {
    const name = req.params.name;

    const componentValuechains = getValuechains(name, valuechains);

    res.json(componentValuechains);
});

const server = app.listen(3000, () => {
    console.log("http://localhost:3000 running...");
});

server.on("error", error => {
    console.error("Server error:", error);
});