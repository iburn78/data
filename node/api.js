function setupApi(app, data) {

    app.get("/api/components/:profile", (req, res) => {
        const result = data.components
            .filter(c => c.companies.includes(req.params.profile))
            .map(c => c.name);

        res.json(result);
    });

}