function getLevel(row) {
    const levelClass = [...row.classList]
        .find(c => c.startsWith("level-"));

    return levelClass
        ? Number(levelClass.replace("level-", ""))
        : null;
}

function updateVisibility() {
    const rows = document.querySelectorAll(".dict-table tr");

    // Stack of collapsed section levels.
    const collapsedLevels = [];

    rows.forEach(row => {
        const level = getLevel(row);

        if (level === null) return;

        // Remove collapsed levels that are no longer ancestors.
        while (
            collapsedLevels.length &&
            collapsedLevels[collapsedLevels.length - 1] >= level
        ) {
            collapsedLevels.pop();
        }

        // Hide if any ancestor section is collapsed.
        row.hidden = collapsedLevels.length > 0;

        // If this is a collapsed section, its descendants are hidden.
        if (
            row.classList.contains("section-row") &&
            row.classList.contains("collapsed")
        ) {
            collapsedLevels.push(level);
        }
    });
}

function toggleSection(section) {
    section.classList.toggle("collapsed");
    updateVisibility();
}

function expandAll() {
    document.querySelectorAll(".section-row")
        .forEach(section => {
            section.classList.remove("collapsed");
        });

    updateVisibility();
}

function collapseAll() {
    document.querySelectorAll(".section-row")
        .forEach(section => {
            section.classList.add("collapsed");
        });

    updateVisibility();
}

// Attach click handlers
document.querySelectorAll(".dict-table .section-row")
    .forEach(section => {
        section.addEventListener("click", () => {
            toggleSection(section);
        });
    });

// Initial state
updateVisibility();

// news pop-up
function openPopup(url) {
    window.open(
        url,
        "_blank",
        "width=1200,height=800,scrollbars=yes,resizable=yes"
    );
}

async function loadRelationships() {
    const section = document.getElementById("relations-section");
    const content = document.getElementById("relations-content");

    // Standalone file://
    if (location.protocol === "file:") {
        section.style.display = "none";
        return;
    }

    const parts = location.pathname.split("/").filter(Boolean);

    if (parts.length < 2) {
        section.style.display = "none";
        return;
    }

    const type = parts[0];
    const filename = decodeURIComponent(parts[1]);

    try {
        let result;

        if (type === "profiles") {
            const code = filename.split("_")[0];

            const response = await fetch(`/api/profile/${code}`);

            if (!response.ok) {
                throw new Error("API request failed");
            }

            result = await response.json();

            renderProfileRelations(result, content);

        } else if (type === "components") {
            const component = filename.replace(".html", "");

            const response = await fetch(
                `/api/component/${encodeURIComponent(component)}`
            );

            if (!response.ok) {
                throw new Error("API request failed");
            }

            result = await response.json();

            renderComponentRelations(result, content);

        } else {
            section.style.display = "none";
        }

    } catch (error) {
        section.style.display = "none";
    }
}

function renderRelations(content, title, items, path) {
    if (!items.length) {
        return;
    }

    const row = document.createElement("div");
    row.className = "relation-row";

    const label = document.createElement("span");
    label.className = "relation-label";
    label.textContent = `${title}:`;

    row.appendChild(label);

    for (const item of items) {
        const link = document.createElement("a");

        link.href = `/build/${path}/${item}.html`;
        link.textContent = item;

        row.appendChild(link);
    }

    content.appendChild(row);
}

function renderProfileRelations(data, content) {
    if (!data.components.length && !data.valuechains.length) {
        document.getElementById("relations-section").style.display = "none";
        return;
    }

    renderRelations(content, "Components", data.components, "components");
    renderRelations(content, "Valuechains", data.valuechains, "valuechains");
}

function renderComponentRelations(valuechains, content) {
    if (!valuechains.length) {
        document.getElementById("relations-section").style.display = "none";
        return;
    }

    renderRelations(content, "Valuechains", valuechains, "valuechains");
}


loadRelationships();