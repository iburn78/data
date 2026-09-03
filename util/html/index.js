async function showFiles(section) {
    const response = await fetch(`/api/${section}`);

    if (!response.ok) {
        throw new Error(`Failed to load ${section}`);
    }

    const files = await response.json();

    const list = document.getElementById("file-list");
    list.replaceChildren();

    for (const file of files) {
        const link = document.createElement("a");

        link.href = `/${section}/${file}`;

        let text = file.replace(".html", "");

        if (section === "profiles") {
            const [code, ...name] = text.split("_");
            text = `${name.join(" ")} (${code})`;
        } else {
            text = text.replaceAll("_", " ");
        }

        link.textContent = text;

        list.appendChild(link);
    }
}

document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();

        const section = link.dataset.section;

        if (section === "main") {
            return;
        }

        showFiles(section);
    });
});