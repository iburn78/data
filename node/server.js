const express = require("express");
const fs = require("fs");
const path = require("path");

const { components, valuechains } = require("./data");
const { getComponents, getValuechains } = require("./lookup");

const app = express();

const ROOT = path.join(__dirname, "..");

app.use(express.static(ROOT));

const DIRS = {
    profiles: path.join(ROOT, "build", "profiles"),
    components: path.join(ROOT, "build", "components"),
    valuechains: path.join(ROOT, "build", "valuechains"),
};

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
    console.log("http://localhost:3000");
});

server.on("error", error => {
    console.error("Server error:", error);
});