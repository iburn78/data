let currentSection = "";
let currentItems = [];
let lastTagSearchQuery = "";

// Use Unicode NFC followed by JavaScript's locale-independent UTF-16 order,
// with the original spelling as a deterministic tie-breaker.
function compareText(a, b) {
    const normalizedA = a.normalize("NFC");
    const normalizedB = b.normalize("NFC");
    if (normalizedA < normalizedB) return -1;
    if (normalizedA > normalizedB) return 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

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

    const items = files.map(entry => {
        const { file, reviewed = false } = typeof entry === "string"
            ? { file: entry, reviewed: true }
            : entry;
        let text = file.replace(".html", "");

        if (section === "profiles") {
            const [code, ...name] = text.split("_");
            text = `${name.join(" ")} (${code})`;
        } else {
            text = text.replaceAll("_", " ");
        }

        return { file, text, reviewed };
    });

    if (section !== "profiles") {
        items.sort((a, b) => compareText(a.text, b.text));
        return items;
    }

    // Group profiles and their segments by code.
    const groups = new Map();

    for (const item of items) {
        const base = item.file.replace(".html", "");
        const [codePart, ...name] = base.split("_");

        // Most Korean listings use a six digit code, but some securities
        // (for example newly listed/prelisting instruments) use alphanumeric IDs.
        const match = codePart.match(/^([A-Za-z0-9]+)(?:\(([A-Z])\))?$/);
        if (!match) {
            // Keep an unexpected filename visible instead of failing the whole list.
            groups.set(base, {
                profile: item,
                segments: [],
            });
            continue;
        }
        const code = match[1];
        const segment = match[2] ?? null;
        item.isSegment = segment !== null;

        if (!groups.has(code)) {
            groups.set(code, {
                profile: null,
                segments: [],
            });
        }

        const group = groups.get(code);

        if (segment === null) {
            group.profile = item;
        } else {
            item.text = ` - ${item.text}`;
            group.segments.push({
                item,
                segment,
            });
        }
    }

    // Sort groups by the profile/company name.
    const sortedGroups = [...groups.values()].sort((a, b) => {
        const aName = a.profile?.text ?? a.segments[0]?.item.text ?? "";
        const bName = b.profile?.text ?? b.segments[0]?.item.text ?? "";
        return compareText(aName, bName);
    });

    // Within each group: profile first, then A, B, C...
    return sortedGroups.flatMap(group => {
        group.segments.sort((a, b) => compareText(a.segment, b.segment));

        return [
            ...(group.profile ? [group.profile] : []),
            ...group.segments.map(segment => segment.item),
        ];
    });
}

// async function getItems(section) {
//     const response = await fetch(`/api/${section}`);

//     if (!response.ok) {
//         throw new Error(`Failed to load ${section}`);
//     }

//     const files = await response.json();

//     const items = files.map(file => {
//         let text = file.replace(".html", "");

//         if (section === "profiles") {
//             const [code, ...name] = text.split("_");
//             text = `${name.join(" ")} (${code})`;
//         } else {
//             text = text.replaceAll("_", " ");
//         }

//         return { file, text };
//     });

//     items.sort((a, b) => compareText(a.text, b.text));

//     return items;
// }


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
        if (!item.text.toLowerCase().normalize("NFC").includes(search)) {
            continue;
        }

        list.appendChild(createModelLink(currentSection, item));
    }
}

function createModelLink(section, item) {
    const link = document.createElement("a");
    link.href = `/build/${section}/${item.file}`;
    link.textContent = item.text;
    if (!item.reviewed) {
        link.classList.add("unreviewed-model");
        if (item.isSegment) link.classList.add("unreviewed-segment");
    }
    return link;
}

// Show a non-interactive page preview beside hovered search results.
const preview = document.createElement("div");
preview.className = "result-preview";
preview.setAttribute("aria-hidden", "true");
preview.innerHTML = '<iframe title="Page preview" tabindex="-1" sandbox=""></iframe>';
document.body.appendChild(preview);
const previewFrame = preview.querySelector("iframe");
let previewLink = null;

function hidePreview() {
    previewLink = null;
    preview.classList.remove("visible");
}

document.addEventListener("pointerover", event => {
    if (document.activeElement === document.getElementById("search")) return;
    const link = event.target.closest("#file-list a");
    if (!link || link === previewLink || event.pointerType === "touch") return;
    previewLink = link;
    previewFrame.src = link.href;
    preview.classList.add("visible");
});

document.addEventListener("pointerout", event => {
    const link = event.target.closest("#file-list a");
    if (link && !link.contains(event.relatedTarget)) {
        hidePreview();
    }
});

// The preview can cover the search box while the pointer stays over a result.
document.getElementById("search").addEventListener("focus", hidePreview);


let searchRequest = 0;
async function showMainSearch(queryOverride = null) {
    const request = ++searchRequest;
    const search = (queryOverride ?? document.getElementById("search").value)
        .trim().toLowerCase().normalize("NFC");
    const list = document.getElementById("file-list");

    list.replaceChildren();

    if (!search) {
        return 0;
    }

    const isTagQuery = search.startsWith("#");
    const tagQuery = search.slice(1).match(/^[\p{L}\p{N}_]+/u)?.[0] ?? "";
    if (isTagQuery) {
        if (!tagQuery) return 0;
        const response = await fetch("/api/tag-index");
        if (!response.ok) {
            throw new Error("Failed to load tags");
        }
        const tagIndex = await response.json();
        const sectionMatches = [];

        for (const [section, title] of Object.entries(sections)) {
            const items = await getItems(section);
            if (request !== searchRequest) return -1;

            const tagsByFile = new Map(
                tagIndex
                    .filter(entry => entry.section === section)
                    .map(entry => [entry.file, entry.tags])
            );
            const matches = items.filter(item => {
                const tags = (tagsByFile.get(item.file) ?? "")
                    .match(/#[\p{L}\p{N}_]+/gu) ?? [];
                const normalizedTags = tags.map(tag =>
                    tag.slice(1).toLowerCase().normalize("NFC")
                );
                return normalizedTags.includes(tagQuery.toLowerCase().normalize("NFC"));
            });

            if (matches.length > 0) sectionMatches.push({ section, title, matches });
        }

        if (request === searchRequest) {
            lastTagSearchQuery = search;
            const message = document.createElement("div");
            message.className = "search-message";
            message.textContent = sectionMatches.length > 0
                ? `tag search result of #${tagQuery}:`
                : `tag search result of #${tagQuery}: none found`;
            list.appendChild(message);

            for (const { section, title, matches } of sectionMatches) {
                const heading = document.createElement("div");
                heading.className = "search-section";
                heading.textContent = `${section === "profiles" ? "Profile" : section === "valuechains" ? "Valuechain" : title}:`;
                list.appendChild(heading);

                for (const item of matches) {
                    list.appendChild(createModelLink(section, item));
                }
            }
            return sectionMatches.reduce((total, section) => total + section.matches.length, 0);
        }
        return -1;
    }

    let matchCount = 0;
    for (const [section, title] of Object.entries(sections)) {
        const items = await getItems(section);
        // A newer search has started
        if (request !== searchRequest) {
            return -1;
        }
        const matches = items.filter(item =>
            item.text.toLowerCase().normalize("NFC").includes(search)
        );

        if (matches.length === 0) {
            continue;
        }
        matchCount += matches.length;

        const heading = document.createElement("div");
        heading.className = "search-section";
        heading.textContent = `${title}:`;

        list.appendChild(heading);

        for (const item of matches) {
            list.appendChild(createModelLink(section, item));
        }
    }
    return matchCount;
}

async function getPublicCompanyProfile(query) {
    const list = document.getElementById("file-list");
    const hideProgress = window.showPythonProgress("Checking public company and creating profile…");
    try {
        const response = await fetch("/api/get-item", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, progressId: hideProgress.progressId }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
            throw new Error(result.error || "No matching item or public company found.");
        }
        window.location.href = `/build/profiles/${encodeURIComponent(result.file)}`;
    } catch (error) {
        list.replaceChildren();
        const message = document.createElement("div");
        message.className = "search-message";
        message.textContent = error.message || "Could not get item.";
        list.appendChild(message);
    } finally {
        hideProgress();
    }
}

// Navigation is supplied by the shared navbar.js. Delegate clicks so the
// handler also works when the shared menu is added after this script loads.
document.addEventListener("click", event => {
    const link = event.target.closest(".nav-link");
    if (!link) return;

    const section = link.dataset.section;
    if (section === "QP" || !sections[section]) return;

    event.preventDefault();
    history.pushState(null, "", "/#" + section);
    document.getElementById("search").value = "";
    showFiles(section);
});


// Search box
document.getElementById("search").addEventListener("input", () => {
    const query = document.getElementById("search").value.trim();
    if (query.startsWith("#")) {
        lastTagSearchQuery = "";
        document.getElementById("file-list").replaceChildren();
        return;
    }

    if (location.hash) {
        renderSection();
    } else {
        showMainSearch();
    }
});


// Enter searches the query, then tries the public-company lookup if no item matched.
document.getElementById("search").addEventListener("keydown", event => {
    // Korean IMEs use Enter to commit the current syllable. Do not treat that
    // composition keystroke as a search submission.
    if (event.isComposing || event.keyCode === 229) {
        return;
    }
    if (event.key !== "Enter") {
        return;
    }
    event.preventDefault();

    const query = document.getElementById("search").value.trim();
    if (!query) {
        const links = document.querySelectorAll("#file-list a");
        if (links.length === 1) links[0].click();
        return;
    }

    if (query.startsWith("#") && lastTagSearchQuery !== query) {
        document.getElementById("search").value = "";
        showMainSearch(query);
        return;
    }

    if (query.startsWith("#")) return;

    showMainSearch(query).then(matches => {
        if (matches === 1) {
            document.querySelector("#file-list a")?.click();
        } else if (matches === 0) {
            getPublicCompanyProfile(query);
        }
    });
});

// "/" → focus search
document.addEventListener("keydown", event => {
    if (
        event.key === "/" &&
        document.activeElement !== document.getElementById("search") &&
        !event.target.matches("input, textarea, [contenteditable='true']")
    ) {
        event.preventDefault();
        document.getElementById("search").focus();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    if (new URLSearchParams(location.search).get("focus") === "search") {
        document.getElementById("search").focus();
    }
});

// Initial page
const section = location.hash.slice(1);

if (section && sections[section]) {
    showFiles(section);
}
const initialQuery = new URLSearchParams(location.search).get("q");
if (initialQuery) {
    const search = document.getElementById("search");
    search.value = initialQuery;
    showMainSearch();
    search.focus();
}
