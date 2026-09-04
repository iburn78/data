// loading all the JSON data once

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function loadJsonDir(name) {
    const dir = path.join(ROOT, name);

    return fs.readdirSync(dir)
        .filter(file => file.endsWith(".json"))
        .map(file => {
            const filepath = path.join(dir, file);
            return JSON.parse(fs.readFileSync(filepath, "utf8"));
        });
}

const components = loadJsonDir("components");
const valuechains = loadJsonDir("valuechains");

module.exports = {
    components,
    valuechains,
};