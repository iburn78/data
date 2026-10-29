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

// news and images pop-up
function openImagePopup(sourceImage) {
    const chromeWidth = Math.max(0, window.outerWidth - window.innerWidth);
    const chromeHeight = Math.max(0, window.outerHeight - window.innerHeight);
    const tempWidth = Math.min(sourceImage.naturalWidth, Math.max(1, screen.availWidth - chromeWidth));
    const tempHeight = Math.min(sourceImage.naturalHeight, Math.max(1, screen.availHeight - chromeHeight));
    const fittedHeight = sourceImage.naturalHeight * tempWidth / sourceImage.naturalWidth;
    const popupHeight = Math.round(Math.min(fittedHeight, tempHeight));
    const windowWidth = tempWidth + chromeWidth;
    const windowHeight = popupHeight + chromeHeight;
    const popup = window.open(
        "",
        "_blank",
        `width=${windowWidth},height=${windowHeight},scrollbars=yes,resizable=yes`
    );
    if (!popup) return;

    popup.document.title = "Image";
    popup.document.documentElement.style.cssText = "margin:0; padding:0; background:#fff;";
    popup.document.body.style.cssText = "margin:0; padding:0; overflow:auto; background:#fff;";
    const image = popup.document.createElement("img");
    image.alt = sourceImage.alt || "";
    image.style.cssText = `display:block; width:${tempWidth}px; max-width:100vw; height:auto;`;
    image.src = sourceImage.src;
    popup.document.body.appendChild(image);
}

function openPopup(url, fullWindow = false) {
    let targetUrl;

    if (/^https?:\/\//i.test(url)) {
        const parsed = new URL(url);

        parsed.pathname = parsed.pathname
            .split("/")
            .map(encodeURIComponent)
            .join("/");

        targetUrl = parsed.href;
    } else {
        targetUrl = url
            .split("/")
            .map(encodeURIComponent)
            .join("/");
    }

    if (!fullWindow) {
        const absoluteImageUrl = new URL(url, location.href).href;
        const sourceImage = [...document.querySelectorAll(".analysis-image")].find(
            image => image.src === absoluteImageUrl
        );
        if (sourceImage?.naturalWidth && sourceImage?.naturalHeight) {
            openImagePopup(sourceImage);
            return;
        }
    }

    const features = fullWindow
    ? `width=${screen.availWidth},height=${screen.availHeight},left=0,top=0,scrollbars=yes,resizable=yes`
    : "width=1200,height=800,scrollbars=yes,resizable=yes";

    window.open(targetUrl, "_blank", features);
}

async function loadRelationships() {
    const section = document.getElementById("relations-section");
    const content = document.getElementById("relations-content");

    // Standalone file://
    if (location.protocol === "file:") {
        section.style.display = "none";
        return;
    }
    // path structure dependent 
    const parts = location.pathname.split("/").filter(Boolean);

    if (parts.length < 3) {
        section.style.display = "none";
        return;
    }

    const type = parts[1];
    const filename = decodeURIComponent(parts[2]);

    try {
        let result;

        if (type === "profiles") {
            const segmentMatch = filename.match(/^([^_]+\([A-Za-z]\))_/);

            if (segmentMatch) {
                const key = segmentMatch[1];
                const response = await fetch(
                    `/api/segment/${encodeURIComponent(key)}`
                );

                if (!response.ok) {
                    throw new Error("API request failed");
                }

                result = await response.json();
                renderSegmentTableHeader(result, key);
                renderSegmentRelations(result, content);
                return;
            }

            const code = filename.split("_")[0];

            const response = await fetch(`/api/profile/${code}`);

            if (!response.ok) {
                throw new Error("API request failed");
            }

            result = await response.json();
            renderProfileRelations(result, content);

        } else if (type === "components") {
            const component = filename.replace(/\.html$/, "");

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

function renderSegmentTableHeader(data, currentKey) {
    const table = document.querySelector(".dict-table");
    const header = table?.querySelector("thead .header-row");
    if (!table || !header || table.querySelector(".segment-name-row")) {
        return;
    }

    const segmentNames = new Map(
        (data.segments ?? []).map(segment => [segment.key, segment.name])
    );
    if (!segmentNames.has(currentKey)) {
        return;
    }

    const row = document.createElement("tr");
    row.className = "segment-name-row";

    for (const [index, cell] of [...header.cells].entries()) {
        const nameCell = document.createElement("th");
        nameCell.className = index === 0 ? "label" : "value segment-name";

        if (index > 0) {
            const link = cell.querySelector("a");
            const filename = link?.getAttribute("href")?.split("/").pop() ?? "";
            const key = decodeURIComponent(filename).match(/^(.+\([A-Za-z]\))_/)?.[1];
            const fullName = segmentNames.get(key);
            if (fullName) {
                nameCell.textContent = fullName.length > 7
                    ? `${fullName.slice(0, 7)}…`
                    : fullName;
            }
        }
        row.appendChild(nameCell);
    }

    header.after(row);
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

    items.forEach(item => {
        const name = typeof item === "string" ? item : item.name;
        const filename = typeof item === "string" ? item : item.file;
        const link = document.createElement("a");

        link.href = `/build/${path}/${encodeURIComponent(filename)}.html`;
        link.textContent = name;
        if (item && typeof item === "object" && item.current) {
            link.classList.add("current-segment");
        }

        row.appendChild(link);
    });

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

function renderSegmentRelations(data, content) {
    const valuechains = data.valuechains ?? [];
    const segments = data.segments ?? [];
    const currentFilename = decodeURIComponent(
        location.pathname.split("/").filter(Boolean).at(-1) ?? ""
    ).replace(/\.html$/, "");
    const currentKey = currentFilename.match(/^(.+\([A-Za-z]\))_/)?.[1];

    if (
        !data.profile &&
        !data.components.length &&
        !valuechains.length &&
        !segments.length
    ) {
        document.getElementById("relations-section").style.display = "none";
        return;
    }

    if (data.profile) {
        const row = document.createElement("div");
        row.className = "relation-row";

        const label = document.createElement("span");
        label.className = "relation-label";
        label.textContent = "Profile:";
        row.appendChild(label);

        const link = document.createElement("a");
        link.href = `/build/profiles/${encodeURIComponent(data.profile.file)}.html`;
        link.textContent = data.profile.name;
        row.appendChild(link);
        content.appendChild(row);
    }

    renderRelations(content, "Components", data.components, "components");
    renderRelations(content, "Valuechains", valuechains, "valuechains");
    renderRelations(content, "Segments", segments.map(segment => ({
        ...segment,
        name: `(${segment.key.match(/\(([A-Za-z])\)$/)?.[1] ?? ""}) ${segment.name}`,
        current: segment.key === currentKey,
    })), "profiles");
}

function renderComponentRelations(valuechains, content) {
    if (!valuechains.length) {
        document.getElementById("relations-section").style.display = "none";
        return;
    }

    renderRelations(content, "Valuechains", valuechains, "valuechains");
}

// "/" → go to main page and focus search
document.addEventListener("keydown", event => {
    if (
        event.key === "/" &&
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA"
    ) {
        event.preventDefault();
        window.location.href = "/?focus=search";
    }
});

loadRelationships();
