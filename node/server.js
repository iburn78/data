const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

const ROOT = path.join(__dirname, "..");

app.use(express.static(ROOT));

const DIRS = {
    profiles: path.join(ROOT, "profiles"),
    components: path.join(ROOT, "components"),
    valuechains: path.join(ROOT, "valuechains"),
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

app.listen(3000, () => {
    console.log("http://localhost:3000");
});