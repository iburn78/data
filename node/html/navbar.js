(() => {
    const nav = document.createElement("nav");
    nav.className = "navbar";
    nav.setAttribute("aria-label", "Main navigation");

    for (const [section, label, href] of [
        ["main", "main", "/"],
        ["profiles", "profiles", "/#profiles"],
        ["components", "components", "/#components"],
        ["valuechains", "valuechains", "/#valuechains"],
    ]) {
        const link = document.createElement("a");
        link.className = "nav-link";
        link.href = href;
        link.dataset.section = section;
        link.textContent = label;
        nav.appendChild(link);
    }

    const search = document.createElement("input");
    search.id = "search";
    search.type = "text";
    search.placeholder = "(/) Search...";
    nav.appendChild(search);

    const isLandingPage =
        location.pathname === "/" || location.pathname.endsWith("/index.html");
    if (!isLandingPage) {
        search.addEventListener("keydown", event => {
            if (event.key !== "Enter" || !search.value.trim()) return;
            const params = new URLSearchParams({ q: search.value.trim() });
            window.location.href = "/?" + params.toString();
        });
    }

    document.body.prepend(nav);
})();
