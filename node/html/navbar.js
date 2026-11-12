(() => {
    const nav = document.createElement("nav");
    nav.className = "navbar";
    nav.setAttribute("aria-label", "Main navigation");

    for (const [section, label, href] of [
        ["QP", "QP", "/"],
        ["profiles", "(P)rofiles", "/#profiles"],
        ["components", "(C)omponents", "/#components"],
        ["valuechains", "(V)aluechains", "/#valuechains"],
    ]) {
        const link = document.createElement("a");
        link.className = "nav-link";
        link.href = href;
        link.dataset.section = section;
        link.textContent = label;
        nav.appendChild(link);
    }

    const infoMenu = document.createElement("details");
    infoMenu.className = "nav-dropdown";
    const infoSummary = document.createElement("summary");
    infoSummary.className = "nav-link nav-dropdown-summary";
    infoSummary.textContent = "Info";
    infoMenu.appendChild(infoSummary);
    const infoItems = document.createElement("div");
    infoItems.className = "nav-dropdown-items";
    for (const [section, label, href] of [
        ["manual", "Manual", "/#manual"],
        ["sector-map", "Sector Map", "/#sector-map"],
    ]) {
        const link = document.createElement("a");
        link.className = "nav-link nav-dropdown-link";
        link.href = href;
        link.dataset.section = section;
        link.textContent = label;
        infoItems.appendChild(link);
    }
    infoMenu.appendChild(infoItems);
    nav.appendChild(infoMenu);

    document.addEventListener("keydown", event => {
        const target = event.target;
        const typing = target instanceof Element && (
            target.matches("input, textarea, select, [contenteditable='true']")
            || target.closest("[contenteditable='true']")
        );
        if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || typing) return;

        const section = {
            p: "profiles",
            c: "components",
            v: "valuechains",
        }[event.key.toLowerCase()];
        if (!section) return;

        const link = nav.querySelector(`.nav-link[data-section="${section}"]`);
        if (!link) return;
        event.preventDefault();
        link.click();
    });

    const search = document.createElement("input");
    search.id = "search";
    search.type = "text";
    search.placeholder = "(/) Search...";
    nav.appendChild(search);

    // Escape leaves the active text-editing field on every page.
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        const target = event.target;
        const isTextEditor = target.matches(
            "textarea, [contenteditable='true'], input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset'])"
        );

        if (isTextEditor) {
            event.preventDefault();
            target.blur();
        }
    });

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
