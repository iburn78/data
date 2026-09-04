let currentSection = "";
let currentItems = [];

const sections = {
    profiles: "Profiles",
    components: "Components",
    valuechains: "Valuechains"
};


async function getItems(section) {
    const response = await fetch(`/api/${section}`);

    if (!response.ok) {
        throw new Error(`Failed to load ${section}`);
    }

    const files = await response.json();

    const items = files.map(file => {
        let text = file.replace(".html", "");

        if (section === "profiles") {
            const [code, ...name] = text.split("_");
            text = `${name.join(" ")} (${code})`;
        } else {
            text = text.replaceAll("_", " ");
        }

        return { file, text };
    });

    items.sort((a, b) => a.text.localeCompare(b.text));

    return items;
}


async function showFiles(section) {
    currentSection = section;
    currentItems = await getItems(section);

    renderSection();
}


function renderSection() {
    const search = document.getElementById("search").value.trim().toLowerCase();
    const list = document.getElementById("file-list");

    list.replaceChildren();

    for (const item of currentItems) {
        if (!item.text.toLowerCase().includes(search)) {
            continue;
        }

        const link = document.createElement("a");

        link.href = `/${currentSection}/${item.file}`;
        link.textContent = item.text;

        list.appendChild(link);
    }
}


async function showMainSearch() {
    const search = document.getElementById("search").value.trim().toLowerCase();
    const list = document.getElementById("file-list");

    list.replaceChildren();

    if (!search) {
        return;
    }

    for (const [section, title] of Object.entries(sections)) {
        const items = await getItems(section);

        const matches = items.filter(item =>
            item.text.toLowerCase().includes(search)
        );

        if (matches.length === 0) {
            continue;
        }

        const heading = document.createElement("div");
        heading.className = "search-section";
        heading.textContent = `${title}:`;

        list.appendChild(heading);

        for (const item of matches) {
            const link = document.createElement("a");

            link.href = `/${section}/${item.file}`;
            link.textContent = item.text;

            list.appendChild(link);
        }
    }
}


// Navigation
document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", event => {
        const section = link.dataset.section;

        if (section === "main") {
            // Go to root page
            window.location.href = "/";
            return;
        }

        event.preventDefault();

        // Change URL
        history.pushState(null, "", `/#${section}`);
        document.getElementById("search").value = "";

        // Show section
        showFiles(section);
    });
});


// Search box
document.getElementById("search").addEventListener("input", () => {
    if (location.hash) {
        renderSection();
    } else {
        showMainSearch();
    }
});


// Enter → open the only visible result
document.getElementById("search").addEventListener("keydown", event => {
    if (event.key !== "Enter") {
        return;
    }

    const links = document.querySelectorAll("#file-list a");

    if (links.length === 1) {
        links[0].click();
    }
});


// "/" → focus search
document.addEventListener("keydown", event => {
    if (
        event.key === "/" &&
        document.activeElement !== document.getElementById("search")
    ) {
        event.preventDefault();
        document.getElementById("search").focus();
    }
});


// Initial page
const section = location.hash.slice(1);

if (section && sections[section]) {
    showFiles(section);
}