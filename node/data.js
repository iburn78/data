function loadData() {
    return {
        components: loadJsonDir("components"),
        valuechains: loadJsonDir("valuechains"),
    };
}

module.exports = { loadData };
